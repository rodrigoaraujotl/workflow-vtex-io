import { Logger } from '../utils/logger'
import { VTEXClient } from '../core/vtex-client'
import { GitOperations } from '../core/git-operations'
import { ConfigManager } from '../core/config-manager'
import { NotificationService } from '../utils/notification-service'
import { exec } from 'child_process'
import { promisify } from 'util'
import axios from 'axios'
import * as fs from 'fs/promises'
import * as path from 'path'

const execAsync = promisify(exec)

export interface HealthCheckResult {
  service: string
  status: 'healthy' | 'warning' | 'critical'
  message: string
  details?: Record<string, any>
  timestamp: Date
  responseTime?: number
}

export interface HealthCheckSummary {
  overall: 'healthy' | 'warning' | 'critical'
  services: HealthCheckResult[]
  timestamp: Date
  recommendations?: string[]
}

export interface HealthCheckConfig {
  enabled: boolean
  interval: number // in milliseconds
  timeout: number // in milliseconds
  retries: number
  services: {
    vtex: boolean
    git: boolean
    config: boolean
    system: boolean
    network: boolean
  }
  thresholds: {
    responseTime: number // in milliseconds
    diskSpace: number // in percentage
    memory: number // in percentage
  }
  notifications: {
    onCritical: boolean
    onWarning: boolean
    onRecovery: boolean
  }
}

export class HealthCheckService {
  private intervalId?: NodeJS.Timeout
  private lastResults: Map<string, HealthCheckResult> = new Map()

  constructor(
    private logger: Logger,
    private config: HealthCheckConfig,
    private vtexClient: VTEXClient,
    private gitOperations: GitOperations,
    private configManager: ConfigManager,
    private notificationService?: NotificationService
  ) {}

  async runHealthCheck(services?: string[]): Promise<HealthCheckSummary> {
    this.logger.info('Running health check...')
    const startTime = Date.now()

    const servicesToCheck = services || Object.keys(this.config.services).filter(
      service => this.config.services[service as keyof typeof this.config.services]
    )

    const results: HealthCheckResult[] = []

    // Run health checks in parallel
    const promises = servicesToCheck.map(async (service) => {
      try {
        const result = await this.runServiceHealthCheck(service)
        results.push(result)
        return result
      } catch (error) {
        const errorResult: HealthCheckResult = {
          service,
          status: 'critical',
          message: `Health check failed: ${(error as Error).message}`,
          timestamp: new Date()
        }
        results.push(errorResult)
        return errorResult
      }
    })

    await Promise.allSettled(promises)

    // Determine overall status
    const overall = this.determineOverallStatus(results)

    // Generate recommendations
    const recommendations = this.generateRecommendations(results)

    const summary: HealthCheckSummary = {
      overall,
      services: results,
      timestamp: new Date(),
      recommendations
    }

    // Send notifications if needed
    await this.handleNotifications(summary)

    // Store results for comparison
    results.forEach(result => {
      this.lastResults.set(result.service, result)
    })

    const duration = Date.now() - startTime
    this.logger.info(`Health check completed in ${duration}ms. Overall status: ${overall}`)

    return summary
  }

  private async runServiceHealthCheck(service: string): Promise<HealthCheckResult> {
    const startTime = Date.now()

    try {
      let result: HealthCheckResult

      switch (service) {
        case 'vtex':
          result = await this.checkVTEXHealth()
          break
        case 'git':
          result = await this.checkGitHealth()
          break
        case 'config':
          result = await this.checkConfigHealth()
          break
        case 'system':
          result = await this.checkSystemHealth()
          break
        case 'network':
          result = await this.checkNetworkHealth()
          break
        default:
          throw new Error(`Unknown service: ${service}`)
      }

      result.responseTime = Date.now() - startTime
      return result
    } catch (error) {
      return {
        service,
        status: 'critical',
        message: `Health check failed: ${(error as Error).message}`,
        timestamp: new Date(),
        responseTime: Date.now() - startTime
      }
    }
  }

  async checkVTEXHealth(): Promise<HealthCheckResult> {
    const details: Record<string, any> = {}

    try {
      // Check VTEX CLI availability
      await this.vtexClient.validateCLI()
      details.cliAvailable = true

      // Check account access
      const currentAccount = this.vtexClient.getCurrentAccount()
      if (currentAccount) {
        await this.vtexClient.validateAccount(currentAccount)
        details.account = currentAccount
      }

      // Check current workspace
      try {
        const workspaceInfo = await this.vtexClient.getWorkspaceInfo()
        details.workspace = workspaceInfo
      } catch (error) {
        details.workspaceError = (error as Error).message
      }

      // Check if any apps are installed
      try {
        const apps = await this.vtexClient.listApps()
        details.installedApps = apps.length
      } catch (error) {
        details.appsError = (error as Error).message
      }

      return {
        service: 'vtex',
        status: 'healthy',
        message: 'VTEX services are operational',
        details,
        timestamp: new Date()
      }
    } catch (error) {
      return {
        service: 'vtex',
        status: 'critical',
        message: `VTEX health check failed: ${(error as Error).message}`,
        details,
        timestamp: new Date()
      }
    }
  }

  async checkGitHealth(): Promise<HealthCheckResult> {
    const details: Record<string, any> = {}

    try {
      // Check if we're in a git repository
      const isRepo = await this.gitOperations.isGitRepository()
      if (!isRepo) {
        return {
          service: 'git',
          status: 'warning',
          message: 'Not in a Git repository',
          details: { isRepository: false },
          timestamp: new Date()
        }
      }

      // Check current branch
      const currentBranch = await this.gitOperations.getCurrentBranch()
      details.currentBranch = currentBranch

      // Check repository status
      const status = await this.gitOperations.getStatus()
      details.status = status

      // Check if repository is clean
      const isClean = await this.gitOperations.isClean()
      details.isClean = isClean

      // Check remote information
      try {
        const remotes = await this.gitOperations.getRemoteInfo()
        details.remotes = remotes
      } catch (error) {
        details.remotesError = (error as Error).message
      }

      let status_result: 'healthy' | 'warning' | 'critical' = 'healthy'
      let message = 'Git repository is healthy'

      if (!isClean) {
        status_result = 'warning'
        message = 'Git repository has uncommitted changes'
      }

      return {
        service: 'git',
        status: status_result,
        message,
        details,
        timestamp: new Date()
      }
    } catch (error) {
      return {
        service: 'git',
        status: 'critical',
        message: `Git health check failed: ${(error as Error).message}`,
        details,
        timestamp: new Date()
      }
    }
  }

  async checkConfigHealth(): Promise<HealthCheckResult> {
    const details: Record<string, any> = {}

    try {
      // Check if config file exists
      const configExists = await this.configManager.configExists()
      details.configExists = configExists

      if (!configExists) {
        return {
          service: 'config',
          status: 'warning',
          message: 'Configuration file not found',
          details,
          timestamp: new Date()
        }
      }

      // Load and validate configuration
      const config = await this.configManager.loadConfig()
      details.configLoaded = true

      // Check required fields
      const requiredFields = ['vtex.account', 'vtex.workspace']
      const missingFields: string[] = []

      for (const field of requiredFields) {
        const keys = field.split('.')
        let value = config
        for (const key of keys) {
          value = value?.[key]
        }
        if (!value) {
          missingFields.push(field)
        }
      }

      details.missingFields = missingFields

      if (missingFields.length > 0) {
        return {
          service: 'config',
          status: 'warning',
          message: `Missing required configuration fields: ${missingFields.join(', ')}`,
          details,
          timestamp: new Date()
        }
      }

      return {
        service: 'config',
        status: 'healthy',
        message: 'Configuration is valid',
        details,
        timestamp: new Date()
      }
    } catch (error) {
      return {
        service: 'config',
        status: 'critical',
        message: `Configuration health check failed: ${(error as Error).message}`,
        details,
        timestamp: new Date()
      }
    }
  }

  async checkSystemHealth(): Promise<HealthCheckResult> {
    const details: Record<string, any> = {}

    try {
      // Check Node.js version
      details.nodeVersion = process.version

      // Check memory usage
      const memUsage = process.memoryUsage()
      const totalMem = require('os').totalmem()
      const freeMem = require('os').freemem()
      const memoryUsagePercent = ((totalMem - freeMem) / totalMem) * 100

      details.memory = {
        usage: memUsage,
        total: totalMem,
        free: freeMem,
        usagePercent: Math.round(memoryUsagePercent * 100) / 100
      }

      // Check disk space (current directory)
      try {
        const { stdout } = await execAsync('df -h .')
        const lines = stdout.trim().split('\n')
        if (lines.length > 1) {
          const diskInfo = lines[1].split(/\s+/)
          const usagePercent = parseInt(diskInfo[4]?.replace('%', '') || '0')
          details.disk = {
            usage: diskInfo[4],
            available: diskInfo[3],
            usagePercent
          }
        }
      } catch (error) {
        details.diskError = (error as Error).message
      }

      // Check platform and architecture
      details.platform = process.platform
      details.arch = process.arch

      // Determine status based on thresholds
      let status: 'healthy' | 'warning' | 'critical' = 'healthy'
      let message = 'System resources are healthy'

      if (memoryUsagePercent > this.config.thresholds.memory) {
        status = 'warning'
        message = `High memory usage: ${memoryUsagePercent.toFixed(1)}%`
      }

      if (details.disk?.usagePercent && details.disk.usagePercent > this.config.thresholds.diskSpace) {
        status = 'warning'
        message = `High disk usage: ${details.disk.usagePercent}%`
      }

      return {
        service: 'system',
        status,
        message,
        details,
        timestamp: new Date()
      }
    } catch (error) {
      return {
        service: 'system',
        status: 'critical',
        message: `System health check failed: ${(error as Error).message}`,
        details,
        timestamp: new Date()
      }
    }
  }

  async checkNetworkHealth(): Promise<HealthCheckResult> {
    const details: Record<string, any> = {}

    try {
      // Check internet connectivity
      const connectivityTests = [
        { name: 'VTEX API', url: 'https://api.vtex.com' },
        { name: 'GitHub', url: 'https://api.github.com' },
        { name: 'NPM Registry', url: 'https://registry.npmjs.org' }
      ]

      const results = await Promise.allSettled(
        connectivityTests.map(async (test) => {
          const startTime = Date.now()
          try {
            const response = await axios.get(test.url, { timeout: 5000 })
            const responseTime = Date.now() - startTime
            return {
              name: test.name,
              status: 'success',
              responseTime,
              statusCode: response.status
            }
          } catch (error) {
            const responseTime = Date.now() - startTime
            return {
              name: test.name,
              status: 'failed',
              responseTime,
              error: (error as Error).message
            }
          }
        })
      )

      details.connectivity = results.map((result, index) => ({
        ...connectivityTests[index],
        ...(result.status === 'fulfilled' ? result.value : { status: 'failed', error: result.reason })
      }))

      // Check DNS resolution
      try {
        const { stdout } = await execAsync('nslookup vtex.com')
        details.dns = { status: 'working', output: stdout.trim() }
      } catch (error) {
        details.dns = { status: 'failed', error: (error as Error).message }
      }

      // Determine overall network status
      const failedTests = details.connectivity.filter((test: any) => test.status === 'failed')
      const slowTests = details.connectivity.filter((test: any) => 
        test.responseTime && test.responseTime > this.config.thresholds.responseTime
      )

      let status: 'healthy' | 'warning' | 'critical' = 'healthy'
      let message = 'Network connectivity is healthy'

      if (failedTests.length > 0) {
        status = failedTests.length === connectivityTests.length ? 'critical' : 'warning'
        message = `${failedTests.length} connectivity test(s) failed`
      } else if (slowTests.length > 0) {
        status = 'warning'
        message = `${slowTests.length} service(s) responding slowly`
      }

      return {
        service: 'network',
        status,
        message,
        details,
        timestamp: new Date()
      }
    } catch (error) {
      return {
        service: 'network',
        status: 'critical',
        message: `Network health check failed: ${(error as Error).message}`,
        details,
        timestamp: new Date()
      }
    }
  }

  private determineOverallStatus(results: HealthCheckResult[]): 'healthy' | 'warning' | 'critical' {
    const criticalCount = results.filter(r => r.status === 'critical').length
    const warningCount = results.filter(r => r.status === 'warning').length

    if (criticalCount > 0) {
      return 'critical'
    } else if (warningCount > 0) {
      return 'warning'
    } else {
      return 'healthy'
    }
  }

  private generateRecommendations(results: HealthCheckResult[]): string[] {
    const recommendations: string[] = []

    results.forEach(result => {
      switch (result.service) {
        case 'vtex':
          if (result.status === 'critical') {
            recommendations.push('Check VTEX CLI installation and account configuration')
            recommendations.push('Verify network connectivity to VTEX services')
          }
          break

        case 'git':
          if (result.status === 'warning' && result.details?.isClean === false) {
            recommendations.push('Commit or stash uncommitted changes before deployment')
          }
          if (result.status === 'critical') {
            recommendations.push('Initialize Git repository or check Git installation')
          }
          break

        case 'config':
          if (result.status === 'warning') {
            recommendations.push('Run "vtex-deploy config init" to create configuration')
            recommendations.push('Verify all required configuration fields are set')
          }
          break

        case 'system':
          if (result.details?.memory?.usagePercent > this.config.thresholds.memory) {
            recommendations.push('Consider closing unnecessary applications to free memory')
          }
          if (result.details?.disk?.usagePercent > this.config.thresholds.diskSpace) {
            recommendations.push('Free up disk space before running deployments')
          }
          break

        case 'network':
          if (result.status !== 'healthy') {
            recommendations.push('Check internet connection and firewall settings')
            recommendations.push('Verify DNS configuration')
          }
          break
      }
    })

    return recommendations
  }

  private async handleNotifications(summary: HealthCheckSummary): Promise<void> {
    if (!this.notificationService) {
      return
    }

    const previousOverallStatus = this.getPreviousOverallStatus()
    const currentStatus = summary.overall

    // Check if we should send notifications
    const shouldNotify = 
      (currentStatus === 'critical' && this.config.notifications.onCritical) ||
      (currentStatus === 'warning' && this.config.notifications.onWarning) ||
      (previousOverallStatus !== 'healthy' && currentStatus === 'healthy' && this.config.notifications.onRecovery)

    if (!shouldNotify) {
      return
    }

    // Prepare notification data
    const criticalServices = summary.services.filter(s => s.status === 'critical')
    const warningServices = summary.services.filter(s => s.status === 'warning')

    let title = ''
    let message = ''
    let type: 'success' | 'error' | 'warning' | 'info' = 'info'

    if (currentStatus === 'healthy') {
      title = 'Health Check - All Services Recovered'
      message = 'All services have recovered and are now healthy'
      type = 'success'
    } else if (currentStatus === 'critical') {
      title = 'Health Check - Critical Issues Detected'
      const issues: string[] = []
      if (criticalServices.length > 0) {
        issues.push(`${criticalServices.length} critical issue(s)`)
      }
      if (warningServices.length > 0) {
        issues.push(`${warningServices.length} warning(s)`)
      }
      message = `Health check detected ${issues.join(' and ')}\n\n`
      message += `Critical Services: ${criticalServices.map(s => s.service).join(', ')}\n`
      if (warningServices.length > 0) {
        message += `Warning Services: ${warningServices.map(s => s.service).join(', ')}\n`
      }
      if (summary.recommendations && summary.recommendations.length > 0) {
        message += `\nRecommendations:\n${summary.recommendations.join('\n')}`
      }
      type = 'error'
    } else {
      title = 'Health Check - Warnings Detected'
      message = `Health check detected ${warningServices.length} warning(s)\n\n`
      message += `Warning Services: ${warningServices.map(s => s.service).join(', ')}\n`
      if (summary.recommendations && summary.recommendations.length > 0) {
        message += `\nRecommendations:\n${summary.recommendations.join('\n')}`
      }
      type = 'warning'
    }

    try {
      await this.notificationService.sendCustomNotification(title, message, type)
    } catch (error) {
      this.logger.error('Failed to send health check notification', error as Error)
    }
  }

  private getPreviousOverallStatus(): 'healthy' | 'warning' | 'critical' {
    const results = Array.from(this.lastResults.values())
    if (results.length === 0) {
      return 'healthy'
    }
    return this.determineOverallStatus(results)
  }

  startContinuousMonitoring(): void {
    if (this.intervalId) {
      this.stopContinuousMonitoring()
    }

    this.logger.info(`Starting continuous health monitoring (interval: ${this.config.interval}ms)`)

    this.intervalId = setInterval(async () => {
      try {
        await this.runHealthCheck()
      } catch (error) {
        this.logger.error('Error during continuous health check', error as Error)
      }
    }, this.config.interval)
  }

  stopContinuousMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
      this.logger.info('Stopped continuous health monitoring')
    }
  }

  isMonitoring(): boolean {
    return this.intervalId !== undefined
  }

  getLastResults(): HealthCheckResult[] {
    return Array.from(this.lastResults.values())
  }

  /**
   * Perform health check (alias for runHealthCheck)
   */
  async performHealthCheck(services?: string[]): Promise<HealthCheckSummary> {
    return this.runHealthCheck(services)
  }

  async validateConfiguration(): Promise<{
    isValid: boolean
    errors: string[]
    warnings: string[]
  }> {
    const errors: string[] = []
    const warnings: string[] = []

    if (this.config.interval < 30000) {
      warnings.push('Health check interval is less than 30 seconds, which may impact performance')
    }

    if (this.config.timeout > this.config.interval) {
      errors.push('Health check timeout cannot be greater than interval')
    }

    if (this.config.retries < 0) {
      errors.push('Health check retries cannot be negative')
    }

    if (this.config.thresholds.responseTime < 1000) {
      warnings.push('Response time threshold is very low (< 1s)')
    }

    if (this.config.thresholds.diskSpace > 95) {
      warnings.push('Disk space threshold is very high (> 95%)')
    }

    if (this.config.thresholds.memory > 90) {
      warnings.push('Memory threshold is very high (> 90%)')
    }

    const enabledServices = Object.values(this.config.services).filter(Boolean)
    if (enabledServices.length === 0) {
      errors.push('At least one service must be enabled for health checks')
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }
}
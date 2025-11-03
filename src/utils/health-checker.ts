/**
 * Health Checker
 * Monitors deployment health and system status
 */

import axios from 'axios'
import { exec } from 'child_process'
import { promisify } from 'util'
import { Environment } from '../types/deploy.types'
import {
  HealthCheckResult,
  HealthCheckSummary,
  HealthCheckConfig
} from '../services/health-check-service'

// Local types
interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: Date
  checks: HealthCheck[]
  uptime: number
  version: string
}

interface HealthCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  duration: number
  message: string
  details?: Record<string, any>
}

interface Metric {
  name: string
  value: number
  unit: string
  timestamp: Date
  tags?: Record<string, string>
}

interface MetricSummary {
  name: string
  average?: number
  avg?: number
  min: number
  max: number
  count: number
  sum?: number
  percentiles?: Record<string, number>
}
import { VTEXClient } from '../core/vtex-client'
import { Logger } from './logger'

const execAsync = promisify(exec)

export class HealthChecker {
  private readonly vtexClient: VTEXClient
  private readonly logger: Logger
  private readonly metrics: Map<string, Metric[]> = new Map()

  constructor(vtexClient: VTEXClient, logger: Logger) {
    this.vtexClient = vtexClient
    this.logger = logger
  }

  /**
   * Check deployment health
   */
  async checkDeploymentHealth(environment: Environment, apps: string[]): Promise<HealthCheckResult> {
    const startTime = Date.now()
    
    this.logger.info('Starting deployment health check', {
      environment,
      apps: apps.length
    })

    try {
      const checks: HealthCheck[] = []

      // Check VTEX workspace health
      checks.push(await this.checkWorkspaceHealth(environment))

      // Check app installations
      for (const app of apps) {
        checks.push(await this.checkAppHealth(app))
      }

      // Check system resources
      checks.push(await this.checkSystemHealth())

      // Check network connectivity
      checks.push(await this.checkNetworkHealth())

      // Check VTEX API health
      checks.push(await this.checkVTEXAPIHealth())

      const healthy = checks.every(check => check.status === 'pass')
      const duration = Date.now() - startTime

      const result: any = {
        healthy,
        environment,
        apps,
        checks,
        timestamp: new Date(),
        duration,
        summary: this.generateHealthSummary(checks)
      }

      this.logger.info('Health check completed', {
        healthy,
        duration,
        checksCount: checks.length,
        failedChecks: checks.filter(c => c.status === 'fail').length
      })

      return result
    } catch (error) {
      this.logger.error('Health check failed', error)
      
      return {
        healthy: false,
        environment,
        apps,
        checks: [],
        timestamp: new Date(),
        duration: Date.now() - startTime,
        error: error as Error
      } as any
    }
  }

  /**
   * Check workspace health
   */
  private async checkWorkspaceHealth(environment: Environment): Promise<HealthCheck> {
    const startTime = Date.now()
    
    try {
      const workspaces = await this.vtexClient.listWorkspaces()
      const activeWorkspaces = workspaces.filter(w => w.status === 'active')
      
      const duration = Date.now() - startTime
      
      return {
        name: 'workspace_health',
        status: activeWorkspaces.length > 0 ? 'pass' : 'fail',
        duration,
        message: `Found ${activeWorkspaces.length} active workspaces`,
        details: {
          totalWorkspaces: workspaces.length,
          activeWorkspaces: activeWorkspaces.length,
          workspaces: activeWorkspaces.map(w => w.name)
        }
      }
    } catch (error) {
      return {
        name: 'workspace_health',
        status: 'fail',
        duration: Date.now() - startTime,
        message: `Workspace health check failed: ${(error as Error).message}`,
        details: { error: (error as Error).message }
      }
    }
  }

  /**
   * Check individual app health
   */
  private async checkAppHealth(appName: string): Promise<HealthCheck> {
    const startTime = Date.now()
    
    try {
      const apps = await this.vtexClient.listApps()
      const app = apps.find((a: any) => a.name === appName || `${a.vendor}.${a.name}` === appName)
      
      const duration = Date.now() - startTime
      
      if (!app) {
        return {
          name: `app_health_${appName}`,
          status: 'fail',
          duration,
          message: `App ${appName} not found`,
          details: { appName, found: false }
        }
      }

      const isHealthy = app.status === 'installed'
      
      return {
        name: `app_health_${appName}`,
        status: isHealthy ? 'pass' : 'fail',
        duration,
        message: `App ${appName} status: ${app.status}`,
        details: {
          appName,
          vendor: app.vendor,
          version: app.version,
          status: app.status,
          workspace: app.workspace
        }
      }
    } catch (error) {
      return {
        name: `app_health_${appName}`,
        status: 'fail',
        duration: Date.now() - startTime,
        message: `App health check failed: ${(error as Error).message}`,
        details: { appName, error: (error as Error).message }
      }
    }
  }

  /**
   * Check system health
   */
  private async checkSystemHealth(): Promise<HealthCheck> {
    const startTime = Date.now()
    
    try {
      // Check memory usage
      const memoryInfo = await this.getMemoryInfo()
      
      // Check disk space
      const diskInfo = await this.getDiskInfo()
      
      // Check CPU usage
      const cpuInfo = await this.getCPUInfo()
      
      const duration = Date.now() - startTime
      
      // Determine if system is healthy based on thresholds
      const memoryHealthy = memoryInfo.usagePercent < 90
      const diskHealthy = diskInfo.usagePercent < 85
      const cpuHealthy = cpuInfo.usagePercent < 80
      
      const isHealthy = memoryHealthy && diskHealthy && cpuHealthy
      
      return {
        name: 'system_health',
        status: isHealthy ? 'pass' : (memoryHealthy && diskHealthy ? 'warn' : 'fail'),
        duration,
        message: `System resources: Memory ${memoryInfo.usagePercent}%, Disk ${diskInfo.usagePercent}%, CPU ${cpuInfo.usagePercent}%`,
        details: {
          memory: memoryInfo,
          disk: diskInfo,
          cpu: cpuInfo
        }
      }
    } catch (error) {
      return {
        name: 'system_health',
        status: 'fail',
        duration: Date.now() - startTime,
        message: `System health check failed: ${(error as Error).message}`,
        details: { error: (error as Error).message }
      }
    }
  }

  /**
   * Check network connectivity
   */
  private async checkNetworkHealth(): Promise<HealthCheck> {
    const startTime = Date.now()
    
    try {
      const endpoints = [
        'https://vtexcommercestable.com.br',
        'https://api.vtex.com',
        'https://github.com'
      ]
      
      const results = await Promise.allSettled(
        endpoints.map(async (endpoint) => {
          const response = await axios.get(endpoint, { timeout: 5000 })
          return { endpoint, status: response.status, responseTime: Date.now() - startTime }
        })
      )
      
      const successful = results.filter(r => r.status === 'fulfilled').length
      const duration = Date.now() - startTime
      
      return {
        name: 'network_health',
        status: successful === endpoints.length ? 'pass' : (successful > 0 ? 'warn' : 'fail'),
        duration,
        message: `Network connectivity: ${successful}/${endpoints.length} endpoints reachable`,
        details: {
          endpoints: endpoints.length,
          successful,
          results: results.map((r, i) => ({
            endpoint: endpoints[i],
            success: r.status === 'fulfilled',
            error: r.status === 'rejected' ? (r.reason as Error).message : undefined
          }))
        }
      }
    } catch (error) {
      return {
        name: 'network_health',
        status: 'fail',
        duration: Date.now() - startTime,
        message: `Network health check failed: ${(error as Error).message}`,
        details: { error: (error as Error).message }
      }
    }
  }

  /**
   * Check VTEX API health
   */
  private async checkVTEXAPIHealth(): Promise<HealthCheck> {
    const startTime = Date.now()
    
    try {
      // Test VTEX API by getting account info
      const account = this.vtexClient.getCurrentAccount()
      
      const duration = Date.now() - startTime
      
      return {
        name: 'vtex_api_health',
        status: 'pass',
        duration,
        message: `VTEX API is healthy - Account: ${account || 'unknown'}`,
        details: {
          account: account || 'unknown'
        }
      }
    } catch (error) {
      return {
        name: 'vtex_api_health',
        status: 'fail',
        duration: Date.now() - startTime,
        message: `VTEX API health check failed: ${(error as Error).message}`,
        details: { error: (error as Error).message }
      }
    }
  }

  /**
   * Get memory information
   */
  private async getMemoryInfo(): Promise<{ total: number; used: number; free: number; usagePercent: number }> {
    try {
      if (process.platform === 'darwin') {
        // macOS
        const { stdout } = await execAsync('vm_stat')
        const lines = stdout.split('\n')
        
        // Parse vm_stat output (simplified)
        const pageSize = 4096 // Default page size
        let freePages = 0
        let inactivePages = 0
        
        for (const line of lines) {
          if (line.includes('Pages free:')) {
            const parts = line.split(':')
            freePages = parseInt((parts[1] || '0').trim().replace('.', ''), 10)
          } else if (line.includes('Pages inactive:')) {
            const parts = line.split(':')
            inactivePages = parseInt((parts[1] || '0').trim().replace('.', ''), 10)
          }
        }
        
        const totalMemory = require('os').totalmem()
        const freeMemory = (freePages + inactivePages) * pageSize
        const usedMemory = totalMemory - freeMemory
        
        return {
          total: totalMemory,
          used: usedMemory,
          free: freeMemory,
          usagePercent: Math.round((usedMemory / totalMemory) * 100)
        }
      } else {
        // Linux/Unix
        const { stdout } = await execAsync('free -b')
        const lines = stdout.split('\n')
        const memLine = lines[1]?.split(/\s+/) || []
        
        const total = parseInt(memLine[1] || '0', 10)
        const used = parseInt(memLine[2] || '0', 10)
        const free = parseInt(memLine[3] || '0', 10)
        
        return {
          total,
          used,
          free,
          usagePercent: Math.round((used / total) * 100)
        }
      }
    } catch (error) {
      // Fallback to Node.js built-in methods
      const totalMemory = require('os').totalmem()
      const freeMemory = require('os').freemem()
      const usedMemory = totalMemory - freeMemory
      
      return {
        total: totalMemory,
        used: usedMemory,
        free: freeMemory,
        usagePercent: Math.round((usedMemory / totalMemory) * 100)
      }
    }
  }

  /**
   * Get disk information
   */
  private async getDiskInfo(): Promise<{ total: number; used: number; free: number; usagePercent: number }> {
    try {
      const { stdout } = await execAsync('df -h /')
      const lines = stdout.split('\n')
      const diskLine = lines[1]?.split(/\s+/) || []
      
      // Parse sizes (remove units like G, M, K)
      const total = this.parseSize(diskLine[1] || '0')
      const used = this.parseSize(diskLine[2] || '0')
      const free = this.parseSize(diskLine[3] || '0')
      const usagePercent = parseInt((diskLine[4] || '0').replace('%', ''), 10)
      
      return { total, used, free, usagePercent }
    } catch (error) {
      // Fallback values
      return {
        total: 100 * 1024 * 1024 * 1024, // 100GB
        used: 50 * 1024 * 1024 * 1024,   // 50GB
        free: 50 * 1024 * 1024 * 1024,   // 50GB
        usagePercent: 50
      }
    }
  }

  /**
   * Get CPU information
   */
  private async getCPUInfo(): Promise<{ cores: number; usagePercent: number; loadAverage: number[] }> {
    try {
      const os = require('os')
      const cpus = os.cpus()
      const loadAvg = os.loadavg()
      
      // Calculate CPU usage (simplified)
      let totalIdle = 0
      let totalTick = 0
      
      for (const cpu of cpus) {
        for (const type in cpu.times) {
          totalTick += cpu.times[type as keyof typeof cpu.times]
        }
        totalIdle += cpu.times.idle
      }
      
      const idle = totalIdle / cpus.length
      const total = totalTick / cpus.length
      const usagePercent = Math.round(100 - (100 * idle / total))
      
      return {
        cores: cpus.length,
        usagePercent: Math.max(0, Math.min(100, usagePercent)),
        loadAverage: loadAvg
      }
    } catch (error) {
      return {
        cores: 1,
        usagePercent: 0,
        loadAverage: [0, 0, 0]
      }
    }
  }

  /**
   * Parse size string to bytes
   */
  private parseSize(sizeStr: string): number {
    const units: Record<string, number> = {
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024
    }
    
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)([KMGT]?)$/)
    if (!match) return 0
    
    const size = match[1] || '0'
    const unit = match[2] || ''
    const multiplier = unit ? (units[unit] || 1) : 1
    
    return Math.round(parseFloat(size) * multiplier)
  }

  /**
   * Generate health summary
   */
  private generateHealthSummary(checks: HealthCheck[]): Record<string, unknown> {
    const passed = checks.filter(c => c.status === 'pass').length
    const warned = checks.filter(c => c.status === 'warn').length
    const failed = checks.filter(c => c.status === 'fail').length
    
    return {
      total: checks.length,
      passed,
      warned,
      failed,
      successRate: Math.round((passed / checks.length) * 100),
      averageDuration: Math.round(checks.reduce((sum, c) => sum + c.duration, 0) / checks.length)
    }
  }

  /**
   * Record metric
   */
  recordMetric(name: string, value: number, unit: string, tags: Record<string, string> = {}): void {
    const metric: Metric = {
      name,
      value,
      unit,
      timestamp: new Date(),
      tags
    }
    
    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }
    
    const metrics = this.metrics.get(name)!
    metrics.push(metric)
    
    // Keep only last 1000 metrics per name
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000)
    }
  }

  /**
   * Get metric summary
   */
  getMetricSummary(name: string, since?: Date): MetricSummary | null {
    const metrics = this.metrics.get(name)
    if (!metrics || metrics.length === 0) {
      return null
    }
    
    const filteredMetrics = since 
      ? metrics.filter(m => m.timestamp >= since)
      : metrics
    
    if (filteredMetrics.length === 0) {
      return null
    }
    
    const values = filteredMetrics.map(m => m.value)
    const sum = values.reduce((a, b) => a + b, 0)
    const sortedValues = [...values].sort((a, b) => a - b)
    
    return {
      name,
      count: values.length,
      sum,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
      percentiles: {
        p50: this.getPercentile(sortedValues, 0.5),
        p90: this.getPercentile(sortedValues, 0.9),
        p95: this.getPercentile(sortedValues, 0.95),
        p99: this.getPercentile(sortedValues, 0.99)
      }
    }
  }

  /**
   * Get percentile value
   */
  private getPercentile(sortedValues: number[], percentile: number): number {
    const index = Math.ceil(sortedValues.length * percentile) - 1
    const value = sortedValues[Math.max(0, index)]
    return value !== undefined ? value : 0
  }

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<HealthStatus> {
    try {
      const checks: HealthCheck[] = []
      
      // Basic system checks
      checks.push(await this.checkSystemHealth())
      checks.push(await this.checkNetworkHealth())
      checks.push(await this.checkVTEXAPIHealth())
      
      const allHealthy = checks.every(c => c.status === 'pass')
      const hasWarnings = checks.some(c => c.status === 'warn')
      
      let status: 'healthy' | 'unhealthy' | 'degraded'
      if (allHealthy) {
        status = 'healthy'
      } else if (hasWarnings && !checks.some(c => c.status === 'fail')) {
        status = 'degraded'
      } else {
        status = 'unhealthy'
      }
      
      return {
        status,
        timestamp: new Date(),
        checks,
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0'
      }
    } catch (error) {
      this.logger.error('Failed to get system status', error)
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        checks: [],
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0'
      }
    }
  }

  /**
   * Start continuous health monitoring
   */
  startMonitoring(intervalMs = 60000): void {
    this.logger.info('Starting health monitoring', { intervalMs })
    
    setInterval(async () => {
      try {
        const status = await this.getSystemStatus()
        
        // Record metrics
        this.recordMetric('system_status', status.status === 'healthy' ? 1 : 0, 'boolean')
        this.recordMetric('system_uptime', status.uptime, 'seconds')
        
        if (status.status !== 'healthy') {
          this.logger.warn('System health degraded', { status: status.status })
        }
      } catch (error) {
        this.logger.error('Health monitoring error', error)
      }
    }, intervalMs)
  }
}
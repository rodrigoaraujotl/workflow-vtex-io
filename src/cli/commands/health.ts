import { Command } from 'commander'
import chalk from 'chalk'
import * as ora from 'ora'
import Table from 'cli-table3'
import { Logger } from '../../utils/logger'
import { ConfigManager } from '../../core/config-manager'
import { VTEXClient } from '../../core/vtex-client'
import { GitOperations } from '../../core/git-operations'
import { HealthCheckService } from '../../services/health-check-service'
import { NotificationService } from '../../utils/notification-service'

const logger = new Logger({
  level: 'info',
  format: 'text',
  auditEnabled: false,
  retentionDays: 7,
  maxFileSize: '10MB',
  maxFiles: 5
})

export const healthCommand = new Command('health')
  .description('Check system and service health')
  .option('--service <service>', 'Check specific service (vtex|git|config|all)', 'all')
  .option('--timeout <ms>', 'Health check timeout in milliseconds', '30000')
  .option('--detailed', 'Show detailed health information')
  .option('--json', 'Output results in JSON format')
  .option('--watch', 'Continuously monitor health (every 30 seconds)')
  .option('--interval <seconds>', 'Watch interval in seconds', '30')
  .action(async (options) => {
    const spinner = ora.default()
    
    try {
      logger.info('Starting health check')
      
      // Initialize services
      const configManager = new ConfigManager()
      await configManager.getConfig()
      
      const vtexClient = new VTEXClient(logger)
      const gitOperations = new GitOperations(logger)
      const notificationService = new NotificationService({
        enabled: false,
        slack: undefined,
        email: undefined,
        teams: undefined
      }, logger)
      
      const healthCheckService = new HealthCheckService(
        logger,
        {
          enabled: true,
          interval: 30000,
          timeout: 30000,
          retries: 3,
          services: {
            vtex: true,
            git: true,
            config: true,
            system: true,
            network: true
          },
          thresholds: {
            responseTime: 5000,
            diskSpace: 80,
            memory: 80
          },
          notifications: {
            onCritical: true,
            onWarning: true,
            onRecovery: true
          }
        },
        vtexClient,
        gitOperations,
        configManager,
        notificationService
      )
      
      if (options.watch) {
        await runContinuousHealthCheck(healthCheckService, options)
      } else {
        await runSingleHealthCheck(healthCheckService, options, spinner)
      }
      
    } catch (error) {
      spinner.fail(chalk.red('Health check failed'))
      logger.error('Health check error', error as Error)
      
      console.log(chalk.red('\n💥 Health Check Error:'))
      console.log(`   ${(error as Error).message}`)
      
      process.exit(1)
    }
  })

async function runSingleHealthCheck(
  healthCheckService: HealthCheckService,
  options: any,
  spinner: ora.Ora
): Promise<void> {
  spinner.start('Performing health check...')
  
  const results = await performHealthCheck(healthCheckService, options)
  
  const overallStatus = determineOverallStatus(results)
  
  if (overallStatus === 'healthy') {
    spinner.succeed('System is healthy')
  } else if (overallStatus === 'warning') {
    spinner.warn('System has warnings')
  } else {
    spinner.fail('System has critical issues')
  }
  
  // Output results
  if (options.json) {
    console.log(JSON.stringify(results, null, 2))
  } else {
    displayHealthResults(results, options)
  }
  
  // Exit with appropriate code
  if (overallStatus === 'critical') {
    process.exit(1)
  }
}

async function runContinuousHealthCheck(
  healthCheckService: HealthCheckService,
  options: any
): Promise<void> {
  const interval = parseInt(options.interval) * 1000
  
  console.log(chalk.blue('\n🔄 Continuous Health Monitoring'))
  console.log(chalk.blue('==============================='))
  console.log(`Checking every ${options.interval} seconds. Press Ctrl+C to stop.\n`)
  
  let iteration = 0
  
  const runCheck = async () => {
    iteration++
    const timestamp = new Date().toLocaleString()
    
    console.log(chalk.gray(`\n[${timestamp}] Health Check #${iteration}`))
    console.log(chalk.gray('─'.repeat(50)))
    
    try {
      const results = await performHealthCheck(healthCheckService, options)
      const overallStatus = determineOverallStatus(results)
      
      // Show compact results for continuous monitoring
      displayCompactHealthResults(results, overallStatus)
      
      // Alert on status changes or critical issues
      if (overallStatus === 'critical') {
        console.log(chalk.red('\n🚨 CRITICAL ISSUES DETECTED!'))
        displayCriticalIssues(results)
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ Health check failed: ${(error as Error).message}`))
    }
  }
  
  // Run initial check
  await runCheck()
  
  // Set up interval
  const intervalId = setInterval(runCheck, interval)
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(intervalId)
    console.log(chalk.yellow('\n\n👋 Health monitoring stopped'))
    process.exit(0)
  })
}

async function performHealthCheck(
  healthCheckService: HealthCheckService,
  options: any
): Promise<any> {
  const timeout = parseInt(options.timeout)
  const service = options.service
  
  const results = {
    timestamp: new Date().toISOString(),
    service,
    timeout,
    checks: {} as any,
    summary: {
      total: 0,
      healthy: 0,
      warning: 0,
      critical: 0
    },
    overall: 'unknown' as string
  }
  
  // Determine which checks to run
  const checksToRun = service === 'all' 
    ? ['vtex', 'git', 'config', 'system', 'network']
    : [service]
  
  // Run health checks
  for (const checkType of checksToRun) {
    try {
      const checkResult = await runHealthCheck(checkType, healthCheckService, timeout)
      results.checks[checkType] = checkResult
      results.summary.total++
      
      switch (checkResult.status) {
        case 'healthy':
          results.summary.healthy++
          break
        case 'warning':
          results.summary.warning++
          break
        case 'critical':
          results.summary.critical++
          break
      }
    } catch (error) {
      results.checks[checkType] = {
        status: 'critical',
        message: (error as Error).message,
        responseTime: null,
        details: []
      }
      results.summary.total++
      results.summary.critical++
    }
  }
  
  results.overall = determineOverallStatus(results)
  
  return results
}

async function runHealthCheck(
  type: string,
  healthCheckService: HealthCheckService,
  timeout: number
): Promise<any> {
  const startTime = Date.now()
  
  try {
    let result: any
    
    switch (type) {
      case 'vtex':
        result = await healthCheckService.checkVTEXHealth()
        break
      case 'git':
        result = await healthCheckService.checkGitHealth()
        break
      case 'config':
        result = await healthCheckService.checkConfigHealth()
        break
      case 'system':
        result = await healthCheckService.checkSystemHealth()
        break
      case 'network':
        result = await healthCheckService.checkNetworkHealth()
        break
      default:
        throw new Error(`Unknown health check type: ${type}`)
    }
    
    const responseTime = Date.now() - startTime
    
    return {
      ...result,
      responseTime
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    
    return {
      status: 'critical',
      message: (error as Error).message,
      responseTime,
      details: []
    }
  }
}

function determineOverallStatus(results: any): string {
  if (results.summary.critical > 0) {
    return 'critical'
  } else if (results.summary.warning > 0) {
    return 'warning'
  } else if (results.summary.healthy > 0) {
    return 'healthy'
  } else {
    return 'unknown'
  }
}

function displayHealthResults(results: any, options: any): void {
  console.log(chalk.blue('\n🏥 Health Check Results'))
  console.log(chalk.blue('======================'))
  console.log(`Generated: ${new Date(results.timestamp).toLocaleString()}`)
  console.log(`Service: ${results.service}`)
  console.log(`Timeout: ${results.timeout}ms`)
  
  // Overall status
  displayOverallStatus(results.overall, results.summary)
  
  // Detailed results
  if (options.detailed) {
    displayDetailedHealthResults(results.checks)
  } else {
    displayCompactHealthTable(results.checks)
  }
  
  // Recommendations
  displayHealthRecommendations(results)
}

function displayOverallStatus(overall: string, summary: any): void {
  console.log(chalk.cyan('\n📊 Overall Status:'))
  
  const statusColor = overall === 'healthy' ? chalk.green : 
                     overall === 'warning' ? chalk.yellow : 
                     chalk.red
  
  console.log(`   Status: ${statusColor(overall.toUpperCase())}`)
  
  const table = new Table({
    head: ['Total', 'Healthy', 'Warning', 'Critical'].map(h => chalk.white(h)),
    colWidths: [10, 10, 12, 12],
    style: { head: [], border: [] }
  })
  
  table.push([
    summary.total.toString(),
    chalk.green(summary.healthy.toString()),
    chalk.yellow(summary.warning.toString()),
    chalk.red(summary.critical.toString())
  ])
  
  console.log(table.toString())
}

function displayCompactHealthTable(checks: any): void {
  console.log(chalk.cyan('\n🔍 Service Health:'))
  
  const table = new Table({
    head: ['Service', 'Status', 'Response Time', 'Message'].map(h => chalk.white(h)),
    colWidths: [15, 12, 15, 40],
    style: { head: [], border: [] }
  })
  
  Object.entries(checks).forEach(([service, check]: [string, any]) => {
    table.push([
      service.toUpperCase(),
      getHealthStatusColor(check.status),
      check.responseTime ? `${check.responseTime}ms` : 'N/A',
      check.message || 'OK'
    ])
  })
  
  console.log(table.toString())
}

function displayDetailedHealthResults(checks: any): void {
  console.log(chalk.cyan('\n🔍 Detailed Health Results:'))
  
  Object.entries(checks).forEach(([service, check]: [string, any]) => {
    console.log(`\n${chalk.cyan(service.toUpperCase())}:`)
    console.log(`  Status: ${getHealthStatusColor(check.status)}`)
    console.log(`  Message: ${check.message || 'OK'}`)
    console.log(`  Response Time: ${check.responseTime ? `${check.responseTime}ms` : 'N/A'}`)
    
    if (check.details && check.details.length > 0) {
      console.log('  Details:')
      check.details.forEach((detail: any) => {
        const icon = detail.level === 'error' ? '❌' : 
                    detail.level === 'warning' ? '⚠️' : 'ℹ️'
        console.log(`    ${icon} ${detail.message}`)
      })
    }
    
    if (check.metrics) {
      console.log('  Metrics:')
      Object.entries(check.metrics).forEach(([key, value]) => {
        console.log(`    ${key}: ${value}`)
      })
    }
  })
}

function displayCompactHealthResults(results: any, overallStatus: string): void {
  const statusIcon = overallStatus === 'healthy' ? '✅' : 
                    overallStatus === 'warning' ? '⚠️' : '❌'
  
  const statusColor = overallStatus === 'healthy' ? chalk.green : 
                     overallStatus === 'warning' ? chalk.yellow : 
                     chalk.red
  
  console.log(`${statusIcon} Overall: ${statusColor(overallStatus.toUpperCase())} | ` +
             `Healthy: ${chalk.green(results.summary.healthy)} | ` +
             `Warning: ${chalk.yellow(results.summary.warning)} | ` +
             `Critical: ${chalk.red(results.summary.critical)}`)
  
  // Show service statuses in one line
  const serviceStatuses = Object.entries(results.checks).map(([service, check]: [string, any]) => {
    const icon = check.status === 'healthy' ? '✅' : 
                check.status === 'warning' ? '⚠️' : '❌'
    return `${service}: ${icon}`
  }).join(' | ')
  
  console.log(`   ${serviceStatuses}`)
}

function displayCriticalIssues(results: any): void {
  const criticalChecks = Object.entries(results.checks).filter(
    ([_, check]: [string, any]) => check.status === 'critical'
  )
  
  if (criticalChecks.length === 0) return
  
  criticalChecks.forEach(([service, check]: [string, any]) => {
    console.log(`   ❌ ${service.toUpperCase()}: ${check.message}`)
  })
}

function displayHealthRecommendations(results: any): void {
  const recommendations = []
  
  // Generate recommendations based on results
  if (results.summary.critical > 0) {
    recommendations.push('🚨 Address critical issues immediately')
  }
  
  if (results.summary.warning > 0) {
    recommendations.push('⚠️  Review and resolve warnings when possible')
  }
  
  if (results.checks.vtex?.status === 'critical') {
    recommendations.push('🔧 Check VTEX CLI installation and authentication')
  }
  
  if (results.checks.git?.status === 'critical') {
    recommendations.push('🔧 Verify Git repository configuration')
  }
  
  if (results.checks.config?.status === 'critical') {
    recommendations.push('🔧 Run configuration validation and fix issues')
  }
  
  if (results.checks.network?.status === 'critical') {
    recommendations.push('🔧 Check network connectivity and firewall settings')
  }
  
  // Add performance recommendations
  const slowChecks = Object.entries(results.checks).filter(
    ([_, check]: [string, any]) => check.responseTime && check.responseTime > 5000
  )
  
  if (slowChecks.length > 0) {
    recommendations.push('⏱️  Some services are responding slowly - check network conditions')
  }
  
  if (recommendations.length > 0) {
    console.log(chalk.cyan('\n💡 Recommendations:'))
    recommendations.forEach(rec => {
      console.log(`   ${rec}`)
    })
  }
}

function getHealthStatusColor(status: string): string {
  switch (status) {
    case 'healthy':
      return chalk.green(status)
    case 'warning':
      return chalk.yellow(status)
    case 'critical':
      return chalk.red(status)
    default:
      return chalk.gray(status)
  }
}
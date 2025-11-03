import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import Table from 'cli-table3'
import { Logger } from '../../utils/logger'
import { ConfigManager } from '../../core/config-manager'
import { DeployManager } from '../../core/deploy-manager'
import { GitOperations } from '../../core/git-operations'
import { VTEXClient } from '../../core/vtex-client'
import { ValidationEngine } from '../../core/validation-engine'
import { NotificationService } from '../../utils/notification-service'
import { HealthCheckService } from '../../services/health-check-service'

const logger = new Logger({
  level: 'info',
  format: 'text',
  auditEnabled: false,
  retentionDays: 7,
  maxFileSize: '10MB',
  maxFiles: 5
})

export const statusCommand = new Command('status')
  .description('Show deployment status and system health')
  .option('-e, --environment <env>', 'Filter by environment (qa|production)')
  .option('-w, --workspace <workspace>', 'Filter by workspace')
  .option('-d, --deployment-id <id>', 'Show specific deployment status')
  .option('--history <count>', 'Number of recent deployments to show', '10')
  .option('--health', 'Include health check information')
  .option('--detailed', 'Show detailed information')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    const spinner = ora()
    
    try {
      logger.info('Fetching deployment status')
      
      // Initialize services
      const configManager = new ConfigManager()
      const gitOperations = new GitOperations(logger)
      const vtexClient = new VTEXClient(logger)
      const validationEngine = new ValidationEngine(logger)
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
      const deployManager = new DeployManager(
        vtexClient,
        validationEngine,
        gitOperations,
        logger,
        notificationService,
        configManager
      )

      spinner.start('Fetching deployment status...')
      
      // Gather status information
      const statusData = await gatherStatusData(
        options,
        deployManager,
        gitOperations,
        vtexClient,
        healthCheckService
      )
      
      spinner.succeed('Status information retrieved')
      
      // Output results
      if (options.json) {
        console.log(JSON.stringify(statusData, null, 2))
      } else {
        await displayStatusInformation(statusData, options)
      }
      
    } catch (error) {
      spinner.fail(chalk.red('Failed to fetch status'))
      logger.error('Status command error', error as Error)
      
      console.log(chalk.red('\n💥 Status Error:'))
      console.log(`   ${(error as Error).message}`)
      
      process.exit(1)
    }
  })

async function gatherStatusData(
  options: any,
  deployManager: DeployManager,
  gitOps: GitOperations,
  vtexClient: VTEXClient,
  healthCheckService: HealthCheckService
) {
  const statusData: any = {
    timestamp: new Date().toISOString(),
    git: {},
    deployments: {},
    vtex: {},
    health: {}
  }
  
  // Git information
  try {
    statusData.git = {
      currentBranch: await gitOps.getCurrentBranch(),
      status: await gitOps.getStatus(),
      latestCommit: await gitOps.getCommitInfo(),
      latestTag: await gitOps.getLatestTag()
    }
  } catch (error) {
    statusData.git.error = (error as Error).message
  }
  
  // Deployment information
  if (options.deploymentId) {
    // Specific deployment status
    try {
      statusData.deployments.specific = await deployManager.getDeployStatus(options.deploymentId)
    } catch (error) {
      statusData.deployments.error = (error as Error).message
    }
  } else {
    // Recent deployments
    const historyCount = parseInt(options.history) || 10
    const environments = options.environment ? [options.environment] : ['qa', 'production']
    
    for (const env of environments) {
      try {
        statusData.deployments[env] = await deployManager.getDeploymentHistory(env, historyCount)
      } catch (error) {
        statusData.deployments[env] = { error: (error as Error).message }
      }
    }
  }
  
  // VTEX information
  try {
    statusData.vtex = {
      account: await vtexClient.getCurrentAccount(),
      workspaces: await vtexClient.listWorkspaces(),
      apps: await vtexClient.listApps()
    }
    
    if (options.workspace) {
      statusData.vtex.workspaceInfo = await vtexClient.getWorkspaceInfo(options.workspace)
    }
  } catch (error) {
    statusData.vtex.error = (error as Error).message
  }
  
  // Health check information
  if (options.health) {
    try {
      statusData.health = await healthCheckService.performHealthCheck()
    } catch (error) {
      statusData.health.error = (error as Error).message
    }
  }
  
  return statusData
}

async function displayStatusInformation(statusData: any, options: any): Promise<void> {
  console.log(chalk.blue('\n📊 VTEX IO Deployment Status'))
  console.log(chalk.blue('============================'))
  console.log(`Generated: ${new Date(statusData.timestamp).toLocaleString()}`)
  
  // Git Status
  displayGitStatus(statusData.git)
  
  // Deployment Status
  displayDeploymentStatus(statusData.deployments, options)
  
  // VTEX Status
  displayVTEXStatus(statusData.vtex, options)
  
  // Health Status
  if (options.health && statusData.health) {
    displayHealthStatus(statusData.health)
  }
}

function displayGitStatus(gitData: any): void {
  console.log(chalk.cyan('\n🔧 Git Status:'))
  
  if (gitData.error) {
    console.log(chalk.red(`   Error: ${gitData.error}`))
    return
  }
  
  console.log(`   Current Branch: ${chalk.yellow(gitData.currentBranch)}`)
  console.log(`   Repository Clean: ${gitData.status.clean ? chalk.green('Yes') : chalk.red('No')}`)
  
  if (!gitData.status.clean) {
    if (gitData.status.staged.length > 0) {
      console.log(`   Staged Files: ${chalk.yellow(gitData.status.staged.length)}`)
    }
    if (gitData.status.unstaged.length > 0) {
      console.log(`   Unstaged Files: ${chalk.yellow(gitData.status.unstaged.length)}`)
    }
    if (gitData.status.untracked.length > 0) {
      console.log(`   Untracked Files: ${chalk.yellow(gitData.status.untracked.length)}`)
    }
  }
  
  if (gitData.latestCommit) {
    console.log(`   Latest Commit: ${chalk.gray(gitData.latestCommit.shortHash)} - ${gitData.latestCommit.message.subject}`)
    console.log(`   Author: ${gitData.latestCommit.author.name} (${new Date(gitData.latestCommit.date).toLocaleString()})`)
  }
  
  if (gitData.latestTag) {
    console.log(`   Latest Tag: ${chalk.green(gitData.latestTag.name)}`)
  }
}

function displayDeploymentStatus(deploymentsData: any, options: any): void {
  console.log(chalk.cyan('\n🚀 Deployment Status:'))
  
  if (deploymentsData.specific) {
    // Show specific deployment
    const deployment = deploymentsData.specific
    console.log(`   Deployment ID: ${chalk.yellow(deployment.deploymentId)}`)
    console.log(`   Status: ${getStatusColor(deployment.status)}`)
    console.log(`   Environment: ${chalk.cyan(deployment.environment)}`)
    console.log(`   Version: ${chalk.cyan(deployment.version)}`)
    console.log(`   Started: ${new Date(deployment.startTime).toLocaleString()}`)
    
    if (deployment.endTime) {
      console.log(`   Completed: ${new Date(deployment.endTime).toLocaleString()}`)
      console.log(`   Duration: ${deployment.duration}ms`)
    }
    
    if (deployment.error) {
      console.log(`   Error: ${chalk.red(deployment.error)}`)
    }
    
    return
  }
  
  // Show recent deployments
  for (const [env, deployments] of Object.entries(deploymentsData)) {
    if (env === 'error') continue
    
    const envData = deployments as any
    if (envData.error) {
      console.log(`   ${env.toUpperCase()}: ${chalk.red(envData.error)}`)
      continue
    }
    
    if (!Array.isArray(envData) || envData.length === 0) {
      console.log(`   ${env.toUpperCase()}: ${chalk.gray('No deployments found')}`)
      continue
    }
    
    console.log(`\n   ${env.toUpperCase()} Recent Deployments:`)
    
    const table = new Table({
      head: ['Version', 'Status', 'Started', 'Duration', 'Workspace'].map(h => chalk.white(h)),
      colWidths: [12, 12, 20, 12, 15],
      style: { head: [], border: [] }
    })
    
    envData.slice(0, options.detailed ? 10 : 5).forEach((deployment: any) => {
      table.push([
        deployment.version || 'N/A',
        getStatusColor(deployment.status),
        new Date(deployment.startTime).toLocaleString(),
        deployment.duration ? `${deployment.duration}ms` : 'N/A',
        deployment.workspace || 'N/A'
      ])
    })
    
    console.log(table.toString())
  }
}

function displayVTEXStatus(vtexData: any, options: any): void {
  console.log(chalk.cyan('\n🏪 VTEX Status:'))
  
  if (vtexData.error) {
    console.log(chalk.red(`   Error: ${vtexData.error}`))
    return
  }
  
  if (vtexData.account) {
    console.log(`   Account: ${chalk.yellow(vtexData.account)}`)
  }
  
  if (vtexData.workspaces && Array.isArray(vtexData.workspaces)) {
    console.log(`   Workspaces: ${chalk.yellow(vtexData.workspaces.length)} found`)
    
    if (options.detailed && vtexData.workspaces.length > 0) {
      const workspaceTable = new Table({
        head: ['Name', 'Status', 'Production', 'Last Modified'].map(h => chalk.white(h)),
        colWidths: [20, 12, 12, 20],
        style: { head: [], border: [] }
      })
      
      vtexData.workspaces.slice(0, 10).forEach((workspace: any) => {
        workspaceTable.push([
          workspace.name,
          workspace.status || 'Unknown',
          workspace.production ? chalk.green('Yes') : chalk.gray('No'),
          workspace.lastModified ? new Date(workspace.lastModified).toLocaleString() : 'N/A'
        ])
      })
      
      console.log(workspaceTable.toString())
    }
  }
  
  if (vtexData.apps && Array.isArray(vtexData.apps)) {
    console.log(`   Installed Apps: ${chalk.yellow(vtexData.apps.length)}`)
    
    if (options.detailed && vtexData.apps.length > 0) {
      const appTable = new Table({
        head: ['Name', 'Version', 'Status'].map(h => chalk.white(h)),
        colWidths: [30, 15, 12],
        style: { head: [], border: [] }
      })
      
      vtexData.apps.slice(0, 10).forEach((app: any) => {
        appTable.push([
          app.name,
          app.version,
          app.status || 'Unknown'
        ])
      })
      
      console.log(appTable.toString())
    }
  }
  
  if (vtexData.workspaceInfo) {
    console.log(`\n   Workspace '${options.workspace}' Details:`)
    console.log(`     Status: ${getStatusColor(vtexData.workspaceInfo.status)}`)
    console.log(`     Production: ${vtexData.workspaceInfo.production ? chalk.green('Yes') : chalk.gray('No')}`)
    console.log(`     Last Modified: ${new Date(vtexData.workspaceInfo.lastModified).toLocaleString()}`)
  }
}

function displayHealthStatus(healthData: any): void {
  console.log(chalk.cyan('\n🏥 Health Status:'))
  
  if (healthData.error) {
    console.log(chalk.red(`   Error: ${healthData.error}`))
    return
  }
  
  console.log(`   Overall Status: ${getHealthColor(healthData.overall)}`)
  
  if (healthData.checks) {
    const healthTable = new Table({
      head: ['Service', 'Status', 'Response Time', 'Message'].map(h => chalk.white(h)),
      colWidths: [20, 12, 15, 30],
      style: { head: [], border: [] }
    })
    
    Object.entries(healthData.checks).forEach(([service, check]: [string, any]) => {
      healthTable.push([
        service,
        getHealthColor(check.status),
        check.responseTime ? `${check.responseTime}ms` : 'N/A',
        check.message || 'OK'
      ])
    })
    
    console.log(healthTable.toString())
  }
  
  if (healthData.summary) {
    console.log(`\n   Summary:`)
    console.log(`     Healthy Services: ${chalk.green(healthData.summary.healthy)}`)
    console.log(`     Warning Services: ${chalk.yellow(healthData.summary.warning)}`)
    console.log(`     Critical Services: ${chalk.red(healthData.summary.critical)}`)
  }
}

function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'success':
    case 'completed':
    case 'deployed':
      return chalk.green(status)
    case 'pending':
    case 'running':
    case 'deploying':
      return chalk.yellow(status)
    case 'failed':
    case 'error':
    case 'cancelled':
      return chalk.red(status)
    default:
      return chalk.gray(status || 'Unknown')
  }
}

function getHealthColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'healthy':
    case 'ok':
    case 'up':
      return chalk.green(status)
    case 'warning':
    case 'degraded':
      return chalk.yellow(status)
    case 'critical':
    case 'down':
    case 'error':
      return chalk.red(status)
    default:
      return chalk.gray(status || 'Unknown')
  }
}
import { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import ora from 'ora'
import { Logger } from '../../utils/logger'
import { ConfigManager } from '../../core/config-manager'
import { DeployManager } from '../../core/deploy-manager'
import { GitOperations } from '../../core/git-operations'
import { VTEXClient } from '../../core/vtex-client'
import { ValidationEngine } from '../../core/validation-engine'
import { NotificationService } from '../../utils/notification-service'
import { RollbackConfig, Environment } from '../../types/deploy.types'

const logger = new Logger({
  level: 'info',
  format: 'text',
  auditEnabled: false,
  retentionDays: 7,
  maxFileSize: '10MB',
  maxFiles: 5
})

export const rollbackCommand = new Command('rollback')
  .description('Rollback deployment to a previous version')
  .option('-e, --environment <env>', 'Target environment (qa|production)', 'qa')
  .option('-v, --version <version>', 'Target version to rollback to')
  .option('-d, --deployment-id <id>', 'Deployment ID to rollback')
  .option('-w, --workspace <workspace>', 'Target workspace (for QA rollbacks)')
  .option('-f, --force', 'Force rollback without confirmation')
  .option('-n, --no-notifications', 'Disable notifications')
  .option('--auto-approve', 'Skip confirmation prompts')
  .option('--emergency', 'Emergency rollback mode (fastest possible)')
  .action(async (options) => {
    const spinner = ora()
    
    try {
      logger.info('Starting rollback process', { environment: options.environment })
      
      // Validate environment
      if (!['qa', 'production'].includes(options.environment)) {
        throw new Error('Environment must be either "qa" or "production"')
      }
      
      // Initialize services
      const configManager = new ConfigManager()
      const _config = await configManager.getConfig()
      
      const gitOps = new GitOperations(logger)
      const vtexClient = new VTEXClient(logger)
      const validationEngine = new ValidationEngine(logger)
      const notificationService = new NotificationService(
        {
          enabled: true,
          slack: { enabled: false, webhookUrl: '', channel: '' },
          email: { enabled: false, smtpHost: '', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPassword: '', from: '', to: [] },
          teams: { enabled: false, webhookUrl: '' }
        },
        logger
      )
      const deployManager = new DeployManager(
        vtexClient,
        validationEngine,
        gitOps,
        logger,
        notificationService,
        configManager
      )

      // Get rollback configuration
      const rollbackConfig = await getRollbackConfig(options, deployManager)
      
      // Show rollback summary
      await showRollbackSummary(rollbackConfig, options)
      
      // Confirm rollback if not auto-approved
      if (!options.autoApprove) {
        await confirmRollback(rollbackConfig, options)
      }

      // Execute rollback
      const environment = options.environment as Environment
      spinner.start(`Rolling back ${environment} deployment...`)
      
      const result = await deployManager.rollback(rollbackConfig.targetVersion, rollbackConfig.environment)
      
      if (result.success) {
        spinner.succeed(chalk.green(`${environment} rollback completed successfully!`))
        
        console.log(chalk.green(`\n✅ Rollback Summary:`))
        console.log(`   Environment: ${chalk.cyan(environment)}`)
        console.log(`   Rollback Time: ${chalk.cyan(result.rollbackTime.toISOString())}`)
        console.log(`   Current Version: ${result.currentVersion}`)
        console.log(`   Previous Version: ${result.previousVersion}`)
        console.log(`   Duration: ${result.duration}ms`)
        console.log(`   Affected Workspaces: ${result.affectedWorkspaces.join(', ')}`)
        
        if (result.logs && result.logs.length > 0) {
          console.log(chalk.yellow('\n📋 Rollback Logs:'))
          result.logs.slice(-5).forEach(log => {
            console.log(`   - ${log}`)
          })
        }
        
        console.log(chalk.green(`\n🎉 ${environment} rollback completed successfully!`))
        
        if (environment === 'production') {
          console.log(chalk.blue('📊 Monitor the application closely after rollback.'))
        }
        
      } else {
        spinner.fail(chalk.red(`${environment} rollback failed!`))
        
        console.log(chalk.red(`\n❌ Rollback Failed:`))
        console.log(`   Error: ${result.error}`)
        
        if (result.logs && result.logs.length > 0) {
          console.log(chalk.yellow('\n📋 Rollback Logs:'))
          result.logs.forEach(log => {
            console.log(`   ${log}`)
          })
        }
        
        process.exit(1)
      }
      
    } catch (error) {
      spinner.fail(chalk.red('Rollback process failed'))
      logger.error('Rollback error', error as Error)
      
      console.log(chalk.red('\n💥 Rollback Error:'))
      console.log(`   ${(error as Error).message}`)
      
      process.exit(1)
    }
  })

async function getRollbackConfig(options: any, deployManager: DeployManager): Promise<RollbackConfig> {
  const environment = options.environment as Environment
  
  // Get available deployments for rollback
  const deployments = await deployManager.getDeploymentHistory(environment, 10)
  
  if (deployments.length === 0) {
    throw new Error(`No deployments found for ${environment} environment`)
  }
  
  let targetDeployment
  
  // If specific version or deployment ID provided
  if (options.version) {
    targetDeployment = deployments.find(d => d.version === options.version)
    if (!targetDeployment) {
      throw new Error(`Version ${options.version} not found in deployment history`)
    }
  } else if (options.deploymentId) {
    targetDeployment = deployments.find(d => d.id === options.deploymentId)
    if (!targetDeployment) {
      throw new Error(`Deployment ID ${options.deploymentId} not found`)
    }
  } else {
    // Interactive selection
    const choices = deployments.map(deployment => ({
      name: `${deployment.version} - ${deployment.startTime.toLocaleString()} (${deployment.status})`,
      value: deployment,
      short: deployment.version
    }))
    
    const { selectedDeployment } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedDeployment',
        message: `Select deployment to rollback to:`,
        choices,
        pageSize: 10
      }
    ])
    
    targetDeployment = selectedDeployment
  }
  
  // Get workspace for QA rollbacks
  let workspace = options.workspace
  if (environment === 'qa' && !workspace) {
    if (targetDeployment.workspace) {
      workspace = targetDeployment.workspace
    } else {
      const { workspaceName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'workspaceName',
          message: 'Enter target workspace for QA rollback:',
          validate: (input: string) => {
            if (!input.trim()) {
              return 'Workspace name is required for QA rollbacks'
            }
            return true
          }
        }
      ])
      workspace = workspaceName
    }
  }
  
  return {
    environment,
    account: 'default', // Will be set from config
    workspace: workspace,
    appName: 'default', // Will be set from config
    targetVersion: targetDeployment.version,
    timeout: environment === 'production' ? 900000 : 300000 // 15min prod, 5min qa
  }
}

async function showRollbackSummary(rollbackConfig: RollbackConfig, options: any): Promise<void> {
  const envColor = rollbackConfig.environment === 'production' ? chalk.red : chalk.yellow
  
  console.log(envColor(`\n🔄 ${rollbackConfig.environment.toUpperCase()} ROLLBACK CONFIGURATION:`))
  console.log(envColor('====================================='))
  console.log(`   Environment: ${envColor.bold(rollbackConfig.environment.toUpperCase())}`)
  console.log(`   Target Version: ${chalk.cyan(rollbackConfig.targetVersion)}`)
  
  if (rollbackConfig.workspace) {
    console.log(`   Workspace: ${chalk.cyan(rollbackConfig.workspace)}`)
  }
  
  console.log(`   Force Rollback: ${options.force ? chalk.red.bold('YES') : chalk.green('No')}`)
  console.log(`   Emergency Mode: ${options.emergency ? chalk.red.bold('YES (FAST TRACK)') : chalk.green('No')}`)
  console.log(`   Notifications: ${!options.noNotifications ? chalk.green('Enabled') : chalk.yellow('Disabled')}`)
  console.log(`   Timeout: ${chalk.cyan((rollbackConfig.timeout / 1000 / 60).toString())} minutes`)
  console.log(envColor('====================================='))
  
  if (rollbackConfig.environment === 'production') {
    console.log(chalk.red.bold('\n⚠️  WARNING: This will rollback PRODUCTION to a previous version!'))
  }
  
  if (options.emergency) {
    console.log(chalk.red.bold('\n🚨 EMERGENCY MODE: Fast-track rollback with minimal checks!'))
  }
}

async function confirmRollback(rollbackConfig: RollbackConfig, options: any): Promise<void> {
  const environment = rollbackConfig.environment
  const isProduction = environment === 'production'
  
  // Get rollback reason
  const { reason } = await inquirer.prompt([
    {
      type: 'input',
      name: 'reason',
      message: 'Enter reason for rollback:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Rollback reason is required'
        }
        if (input.length < 10) {
          return 'Please provide a more detailed reason (at least 10 characters)'
        }
        return true
      }
    }
  ])
  
  rollbackConfig.reason = reason
  
  // First confirmation
  const { firstConfirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'firstConfirm',
      message: isProduction 
        ? chalk.red(`This will rollback PRODUCTION to version ${rollbackConfig.targetVersion}. Are you sure?`)
        : chalk.yellow(`This will rollback QA to version ${rollbackConfig.targetVersion}. Are you sure?`),
      default: false
    }
  ])
  
  if (!firstConfirm) {
    logger.info('Rollback cancelled by user')
    process.exit(0)
  }
  
  // Additional confirmation for production
  if (isProduction) {
    const { _typeConfirm } = await inquirer.prompt([
      {
        type: 'input',
        name: '_typeConfirm',
        message: chalk.red('Type "ROLLBACK PRODUCTION" to confirm:'),
        validate: (input: string) => {
          if (input !== 'ROLLBACK PRODUCTION') {
            return 'You must type exactly "ROLLBACK PRODUCTION" to confirm'
          }
          return true
        }
      }
    ])
    
    // Final confirmation for emergency mode
    if (options.emergency) {
      const { emergencyConfirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'emergencyConfirm',
          message: chalk.red.bold('Emergency rollback will bypass safety checks. Proceed?'),
          default: false
        }
      ])
      
      if (!emergencyConfirm) {
        logger.info('Emergency rollback cancelled')
        process.exit(0)
      }
    }
  }
}
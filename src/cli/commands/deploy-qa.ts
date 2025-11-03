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
import { DeployConfig } from '../../types/deploy.types'

const logger = new Logger({
  level: 'info',
  format: 'text',
  auditEnabled: false,
  retentionDays: 7,
  maxFileSize: '10MB',
  maxFiles: 5
})

export const deployQACommand = new Command('deploy:qa')
  .description('Deploy application to QA environment')
  .option('-b, --branch <branch>', 'Source branch to deploy from')
  .option('-w, --workspace <workspace>', 'Target VTEX workspace')
  .option('-f, --force', 'Force deployment even if validation fails')
  .option('-s, --skip-tests', 'Skip running tests')
  .option('-n, --no-notifications', 'Disable notifications')
  .option('--auto-approve', 'Skip confirmation prompts')
  .action(async (options) => {
    const spinner = ora()
    
    try {
      logger.info('Starting QA deployment process')
      
      // Initialize services
      const configManager = new ConfigManager()
      const config = await configManager.getConfig()
      
      const gitOps = new GitOperations(logger)
      const vtexClient = new VTEXClient(logger)
      const validationEngine = new ValidationEngine(logger)
      const notificationService = new NotificationService({
        enabled: config.notifications?.enabled || false,
        slack: config.notifications?.slack ? {
          enabled: config.notifications.slack.enabled || false,
          webhookUrl: config.notifications.slack.webhookUrl || '',
          channel: config.notifications.slack.channel || '#deployments',
          username: config.notifications.slack.username
        } : undefined,
        email: config.notifications?.email ? {
          enabled: config.notifications.email.enabled || false,
          smtpHost: config.notifications.email.smtpHost || '',
          smtpPort: config.notifications.email.smtpPort || 587,
          smtpSecure: config.notifications.email.smtpSecure || false,
          smtpUser: config.notifications.email.smtpUser || '',
          smtpPassword: config.notifications.email.smtpPassword || '',
          from: config.notifications.email.from || '',
          to: config.notifications.email.to || []
        } : undefined,
        teams: config.notifications?.teams ? {
          enabled: config.notifications.teams.enabled || false,
          webhookUrl: config.notifications.teams.webhookUrl || ''
        } : undefined
      }, logger)
      const deployManager = new DeployManager(
        vtexClient,
        validationEngine,
        gitOps,
        logger,
        notificationService,
        configManager
      )

      // Get deployment configuration
      const deployConfig = await getDeploymentConfig(options, config)
      
      // Show deployment summary
      await showDeploymentSummary(deployConfig)
      
      // Confirm deployment if not auto-approved
      if (!options.autoApprove) {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: 'Do you want to proceed with the QA deployment?',
            default: false
          }
        ])
        
        if (!confirmed) {
          logger.info('Deployment cancelled by user')
          return
        }
      }

      // Execute deployment
      spinner.start('Deploying to QA environment...')
      
      const result = await deployManager.deployToQA(options.branch || 'develop')
      
      if (result.status === 'success') {
        spinner.succeed(chalk.green('QA deployment completed successfully!'))
        
        console.log(chalk.green('\n✅ Deployment Summary:'))
        console.log(`   Deployment ID: ${chalk.cyan(result.id)}`)
        console.log(`   Version: ${chalk.cyan(result.version)}`)
        console.log(`   Workspace: ${chalk.cyan(result.workspace)}`)
        console.log(`   Environment: ${chalk.cyan(result.environment)}`)
        console.log(`   End Time: ${chalk.cyan(result.endTime?.toISOString() || 'N/A')}`)
        
        // Show recent logs if any
        if (result.logs && result.logs.length > 0) {
          console.log(chalk.blue('\n📋 Recent Logs:'))
          result.logs.slice(-5).forEach((log: string) => {
            console.log(`   ${chalk.blue('•')} ${log}`)
          })
        }
        
      } else {
        spinner.fail(chalk.red('QA deployment failed!'))
        
        console.log(chalk.red('\n❌ Deployment Failed:'))
        console.log(`   Error: ${result.error?.message || 'Unknown error'}`)
        
        if (result.logs && result.logs.length > 0) {
          console.log(chalk.yellow('\n📋 Deployment Logs:'))
          result.logs.slice(-5).forEach((log: string) => {
            console.log(`   ${log}`)
          })
        }
        
        process.exit(1)
      }
      
    } catch (error) {
      spinner.fail(chalk.red('Deployment process failed'))
      logger.error('QA deployment error', error as Error)
      
      console.log(chalk.red('\n💥 Unexpected Error:'))
      console.log(`   ${(error as Error).message}`)
      
      process.exit(1)
    }
  })

async function getDeploymentConfig(options: any, config: any): Promise<DeployConfig> {
  const gitOps = new GitOperations(logger)
  
  // Get current branch if not specified
  let sourceBranch = options.branch
  if (!sourceBranch) {
    sourceBranch = await gitOps.getCurrentBranch()
  }
  
  // Get workspace name
  let workspace = options.workspace
  if (!workspace) {
    const { workspaceName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'workspaceName',
        message: 'Enter QA workspace name:',
        default: `qa-${Date.now()}`,
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Workspace name is required'
          }
          if (!/^[a-z0-9-]+$/.test(input)) {
            return 'Workspace name must contain only lowercase letters, numbers, and hyphens'
          }
          return true
        }
      }
    ])
    workspace = workspaceName
  }
  
  return {
    environment: 'qa',
    account: config.vtex.account,
    workspace: workspace,
    appName: config.app.name,
    sourceBranch,
    autoInstall: config.app.autoInstall,
    skipTests: options.skipTests || false,
    timeout: config.deployment?.timeout || 600000, // 10 minutes
    rollbackOnFailure: config.deployment.rollbackOnFailure
  }
}

async function showDeploymentSummary(deployConfig: DeployConfig): Promise<void> {
  console.log(chalk.blue('\n🚀 QA Deployment Configuration:'))
  console.log(`   Environment: ${chalk.cyan(deployConfig.environment)}`)
  console.log(`   Account: ${chalk.cyan(deployConfig.account)}`)
  console.log(`   Workspace: ${chalk.cyan(deployConfig.workspace)}`)
  console.log(`   App Name: ${chalk.cyan(deployConfig.appName)}`)
  console.log(`   Skip Tests: ${deployConfig.skipTests ? chalk.yellow('Yes') : chalk.green('No')}`)
  console.log(`   Auto Install: ${deployConfig.autoInstall ? chalk.green('Yes') : chalk.yellow('No')}`)
  console.log(`   Timeout: ${chalk.cyan((deployConfig.timeout / 1000).toString())}s`)
}
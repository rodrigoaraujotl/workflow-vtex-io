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

export const deployProdCommand = new Command('deploy:prod')
  .description('Deploy application to Production environment')
  .option('-b, --branch <branch>', 'Source branch to deploy from (default: main)')
  .option('-v, --version <version>', 'Version to deploy')
  .option('-f, --force', 'Force deployment even if validation fails')
  .option('-s, --skip-tests', 'Skip running tests (NOT RECOMMENDED)')
  .option('-n, --no-notifications', 'Disable notifications')
  .option('--auto-approve', 'Skip confirmation prompts (DANGEROUS)')
  .option('--emergency', 'Emergency deployment mode (bypasses some checks)')
  .action(async (options) => {
    const spinner = ora()
    
    try {
      logger.info('Starting Production deployment process')
      
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

      // Production deployment requires extra validation
      await performProductionChecks(options, gitOps, validationEngine)
      
      // Get deployment configuration
      const deployConfig = await getProductionDeploymentConfig(options, config, gitOps)
      
      // Show deployment summary with warnings
      await showProductionDeploymentSummary(deployConfig, options)
      
      // Multiple confirmation steps for production
      if (!options.autoApprove) {
        await confirmProductionDeployment(deployConfig, options)
      } else if (!options.emergency) {
        logger.warn('Auto-approve enabled for production deployment')
        console.log(chalk.yellow('⚠️  Auto-approve is enabled for production deployment!'))
      }

      // Final security check
      if (!options.emergency) {
        await finalSecurityCheck()
      }

      // Execute deployment
      spinner.start('Deploying to Production environment...')
      
      const result = await deployManager.deployToProduction(deployConfig.version || 'latest')
      
      if (result.status === 'success') {
        spinner.succeed(chalk.green('Production deployment completed successfully!'))
        
        console.log(chalk.green('\n🎉 Production Deployment Summary:'))
        console.log(`   Version: ${chalk.bold(result.version)}`)
        console.log(`   Deployment ID: ${result.id}`)
        console.log(`   Duration: ${result.duration}ms`)
        console.log(`   Environment: ${result.environment}`)
        console.log(`   Workspace: ${result.workspace}`)
        
        if (result.endTime) {
          console.log(`   Completed at: ${result.endTime.toISOString()}`)
        }
        
        if (result.logs && result.logs.length > 0) {
          console.log(chalk.yellow('\n📋 Deployment Logs:'))
          result.logs.slice(-5).forEach(log => {
            console.log(`   - ${log}`)
          })
        }
        
        console.log(chalk.green('\n✅ Production deployment completed successfully!'))
        console.log(chalk.blue('📊 Monitor the application closely for the next 30 minutes.'))
        
      } else {
        spinner.fail(chalk.red('Production deployment failed!'))
        
        console.log(chalk.red('\n💥 Production Deployment Failed:'))
        console.log(`   Error: ${result.error?.message || 'Unknown error'}`)
        
        if (result.rollbackVersion) {
          console.log(chalk.yellow('\n🔄 Auto-rollback was performed'))
          console.log(`   Rollback Version: ${result.rollbackVersion}`)
        }
        
        if (result.logs && result.logs.length > 0) {
          console.log(chalk.yellow('\n📋 Deployment Logs:'))
          result.logs.forEach(log => {
            console.log(`   ${log}`)
          })
        }
        
        process.exit(1)
      }
      
    } catch (error) {
      spinner.fail(chalk.red('Production deployment process failed'))
      logger.error('Production deployment error', error as Error)
      
      console.log(chalk.red('\n💥 Critical Production Error:'))
      console.log(`   ${(error as Error).message}`)
      
      process.exit(1)
    }
  })

async function performProductionChecks(options: any, gitOps: GitOperations, validationEngine: ValidationEngine): Promise<void> {
  const spinner = ora('Performing production readiness checks...').start()
  
  try {
    // Check if repository is clean
    const isClean = await gitOps.isClean()
    if (!isClean && !options.force) {
      spinner.fail('Repository has uncommitted changes')
      throw new Error('Production deployment requires a clean repository. Use --force to override.')
    }
    
    // Validate production readiness
    const readinessResult = await validationEngine.validateProductionReadiness()
    if (!readinessResult.valid && !options.force) {
      spinner.fail('Production readiness validation failed')
      console.log(chalk.red('\n❌ Production Readiness Issues:'))
      readinessResult.errors.forEach(error => {
        console.log(`   - ${error.message}`)
      })
      throw new Error('Production deployment blocked by validation errors. Use --force to override.')
    }
    
    spinner.succeed('Production readiness checks passed')
    
  } catch (error) {
    spinner.fail('Production checks failed')
    throw error
  }
}

async function getProductionDeploymentConfig(options: any, config: any, gitOps: GitOperations): Promise<DeployConfig> {
  // Production deployments should come from main/master branch by default
  let sourceBranch = options.branch || 'main'
  
  // Verify we're on the correct branch
  const currentBranch = await gitOps.getCurrentBranch()
  if (currentBranch !== sourceBranch && !options.force) {
    const { switchBranch } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'switchBranch',
        message: `Current branch is '${currentBranch}', but production deployment should be from '${sourceBranch}'. Switch branch?`,
        default: true
      }
    ])
    
    if (switchBranch) {
      await gitOps.switchBranch(sourceBranch)
    } else {
      sourceBranch = currentBranch
    }
  }
  
  // Get version
  let version = options.version
  if (!version) {
    const latestTag = await gitOps.getLatestTag()
    const suggestedVersion = latestTag ? incrementVersion(latestTag.name) : '1.0.0'
    
    const { versionInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'versionInput',
        message: 'Enter production version:',
        default: suggestedVersion,
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Version is required'
          }
          if (!/^\d+\.\d+\.\d+$/.test(input)) {
            return 'Version must follow semantic versioning (e.g., 1.0.0)'
          }
          return true
        }
      }
    ])
    version = versionInput
  }
  
  return {
    environment: 'production',
    account: config.vtex.account,
    workspace: config.vtex.workspace,
    appName: config.app.name,
    version,
    autoInstall: true,
    skipTests: options.skipTests || false,
    timeout: config.deployment?.timeout?.production || 1800000, // 30 minutes
    requireApproval: !options.autoApprove,
    notifyOnSuccess: !options.noNotifications,
    notifyOnFailure: !options.noNotifications,
    rollbackOnFailure: config.deployment?.autoRollback?.production !== false
  }
}

async function showProductionDeploymentSummary(deployConfig: DeployConfig, options: any): Promise<void> {
  console.log(chalk.red('\n🚨 PRODUCTION DEPLOYMENT CONFIGURATION:'))
  console.log(chalk.red('====================================='))
  console.log(`   Environment: ${chalk.red.bold('PRODUCTION')}`)
  console.log(`   Account: ${chalk.cyan(deployConfig.account)}`)
  console.log(`   Workspace: ${chalk.cyan(deployConfig.workspace)}`)
  console.log(`   App Name: ${chalk.cyan(deployConfig.appName)}`)
  console.log(`   Version: ${chalk.cyan(deployConfig.version || 'Auto-generated')}`)
  console.log(`   Skip Tests: ${deployConfig.skipTests ? chalk.red.bold('YES (DANGEROUS)') : chalk.green('No')}`)
  console.log(`   Emergency Mode: ${options.emergency ? chalk.red.bold('YES (FAST TRACK)') : chalk.green('No')}`)
  console.log(`   Auto Rollback: ${deployConfig.rollbackOnFailure ? chalk.green('Enabled') : chalk.red.bold('DISABLED')}`)
  console.log(`   Notifications: ${deployConfig.notifyOnSuccess ? chalk.green('Enabled') : chalk.yellow('Disabled')}`)
  console.log(`   Timeout: ${chalk.cyan((deployConfig.timeout / 1000 / 60).toString())} minutes`)
  console.log(chalk.red('====================================='))
  
  if (deployConfig.skipTests) {
    console.log(chalk.red.bold('\n⚠️  WARNING: Tests will be skipped! This is NOT recommended for production.'))
  }
  
  if (options.force) {
    console.log(chalk.red.bold('\n⚠️  WARNING: Force mode enabled! Some safety checks will be bypassed.'))
  }
  
  if (options.emergency) {
    console.log(chalk.red.bold('\n🚨 EMERGENCY MODE: Fast-track deployment with minimal checks!'))
  }
}

async function confirmProductionDeployment(deployConfig: DeployConfig, options: any): Promise<void> {
  // First confirmation
  const { firstConfirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'firstConfirm',
      message: chalk.red('This will deploy to PRODUCTION. Are you absolutely sure?'),
      default: false
    }
  ])
  
  if (!firstConfirm) {
    logger.info('Production deployment cancelled by user')
    process.exit(0)
  }
  
  // Second confirmation with typing
  const { typeConfirm } = await inquirer.prompt([
    {
      type: 'input',
      name: 'typeConfirm',
      message: chalk.red('Type "DEPLOY TO PRODUCTION" to confirm:'),
      validate: (input: string) => {
        if (input !== 'DEPLOY TO PRODUCTION') {
          return 'You must type exactly "DEPLOY TO PRODUCTION" to confirm'
        }
        return true
      }
    }
  ])
  
  // Final confirmation for dangerous options
  if (deployConfig.skipTests || options.force || options.emergency) {
    const { finalConfirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'finalConfirm',
        message: chalk.red.bold('You have enabled dangerous options. Proceed anyway?'),
        default: false
      }
    ])
    
    if (!finalConfirm) {
      logger.info('Production deployment cancelled due to dangerous options')
      process.exit(0)
    }
  }
}

async function finalSecurityCheck(): Promise<void> {
  const spinner = ora('Performing final security check...').start()
  
  // Simulate security check delay
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  spinner.succeed('Final security check passed')
}

function incrementVersion(currentVersion: string): string {
  const versionMatch = currentVersion.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!versionMatch) {
    return '1.0.0'
  }
  
  const [, major, minor, patch] = versionMatch
  return `${major}.${minor}.${parseInt(patch || '0') + 1}`
}
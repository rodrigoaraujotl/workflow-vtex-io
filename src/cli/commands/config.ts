import { Command } from 'commander'
import chalk from 'chalk'
import inquirer from 'inquirer'
import ora from 'ora'
import fs from 'fs/promises'
import { Logger } from '../../utils/logger'
import { ConfigManager } from '../../core/config-manager'

const logger = new Logger({
  level: 'info',
  format: 'text',
  auditEnabled: false,
  retentionDays: 7,
  maxFileSize: '10MB',
  maxFiles: 5
})

export const configCommand = new Command('config')
  .description('Manage configuration settings')
  .addCommand(createShowCommand())
  .addCommand(createSetCommand())
  .addCommand(createInitCommand())
  .addCommand(createValidateCommand())
  .addCommand(createExportCommand())
  .addCommand(createImportCommand())

function createShowCommand(): Command {
  return new Command('show')
    .description('Show current configuration')
    .option('--section <section>', 'Show specific section (vtex|notifications|deployment)')
    .option('--json', 'Output in JSON format')
    .option('--no-sensitive', 'Hide sensitive information')
    .action(async (options) => {
      try {
        const configManager = new ConfigManager()
        const config = await configManager.getConfig()
        
        let displayConfig: any = config
        
        if (options.section) {
          if (!(options.section in config)) {
            console.log(chalk.red(`Section '${options.section}' not found`))
            process.exit(1)
          }
          displayConfig = { [options.section]: config[options.section as keyof typeof config] }
        }
        
        if (!options.sensitive) {
          displayConfig = hideSensitiveData(displayConfig)
        }
        
        if (options.json) {
          console.log(JSON.stringify(displayConfig, null, 2))
        } else {
          displayConfigFormatted(displayConfig)
        }
        
      } catch (error) {
        logger.error('Failed to show configuration', error as Error)
        console.log(chalk.red(`Error: ${(error as Error).message}`))
        process.exit(1)
      }
    })
}

function createSetCommand(): Command {
  return new Command('set')
    .description('Set configuration values')
    .argument('<key>', 'Configuration key (e.g., vtex.account, notifications.slack.webhook)')
    .argument('<value>', 'Configuration value')
    .option('--type <type>', 'Value type (string|number|boolean|json)', 'string')
    .action(async (key, value, options) => {
      try {
        const configManager = new ConfigManager()
        
        // Parse value based on type
        let parsedValue: any = value
        switch (options.type) {
          case 'number':
            parsedValue = parseFloat(value)
            if (isNaN(parsedValue)) {
              throw new Error(`Invalid number value: ${value}`)
            }
            break
          case 'boolean':
            parsedValue = value.toLowerCase() === 'true'
            break
          case 'json':
            try {
              parsedValue = JSON.parse(value)
            } catch {
              throw new Error(`Invalid JSON value: ${value}`)
            }
            break
        }
        
        configManager.setValue(key, parsedValue)
        
        console.log(chalk.green(`✅ Configuration updated: ${key} = ${value}`))
        
      } catch (error) {
        logger.error('Failed to set configuration', error as Error)
        console.log(chalk.red(`Error: ${(error as Error).message}`))
        process.exit(1)
      }
    })
}

function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize configuration interactively')
    .option('--force', 'Overwrite existing configuration')
    .option('--template <template>', 'Use configuration template (basic|full|production)')
    .action(async (options) => {
      const spinner = ora()
      
      try {
        const configManager = new ConfigManager()
        
        // Check if config already exists
        const configExists = configManager.hasConfig()
        if (configExists && !options.force) {
          const { overwrite } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'overwrite',
              message: 'Configuration already exists. Do you want to overwrite it?',
              default: false
            }
          ])
          
          if (!overwrite) {
            console.log(chalk.yellow('Configuration initialization cancelled'))
            return
          }
        }
        
        console.log(chalk.blue('\n🔧 VTEX IO Configuration Setup'))
        console.log(chalk.blue('==============================='))
        
        let config: any
        
        if (options.template) {
          config = await createFromTemplate(options.template)
        } else {
          config = await createInteractiveConfig()
        }
        
        spinner.start('Saving configuration...')
        configManager.setConfig(config)
        spinner.succeed('Configuration saved successfully')
        
        // Validate configuration
        spinner.start('Validating configuration...')
        const validation = configManager.validate()
        
        if (validation.valid) {
          spinner.succeed('Configuration is valid')
        } else {
          spinner.warn('Configuration has warnings')
          console.log(chalk.yellow('\nWarnings:'))
          validation.warnings.forEach((warning: any) => {
            console.log(`  - ${warning.message}`)
          })
        }
        
        console.log(chalk.green('\n✅ Configuration initialized successfully!'))
        console.log(chalk.gray('You can now use the deployment commands.'))
        
      } catch (error) {
        spinner.fail('Configuration initialization failed')
        logger.error('Failed to initialize configuration', error as Error)
        console.log(chalk.red(`Error: ${(error as Error).message}`))
        process.exit(1)
      }
    })
}

function createValidateCommand(): Command {
  return new Command('validate')
    .description('Validate current configuration')
    .option('--fix', 'Attempt to fix validation issues')
    .action(async (options) => {
      const spinner = ora('Validating configuration...')
      
      try {
        const configManager = new ConfigManager()
        const validation = configManager.validate()
        
        if (validation.valid) {
          spinner.succeed('Configuration is valid')
          console.log(chalk.green('✅ All configuration checks passed'))
        } else {
          spinner.fail('Configuration validation failed')
          
          if (validation.errors.length > 0) {
            console.log(chalk.red('\nErrors:'))
            validation.errors.forEach((error: any) => {
              console.log(`  ❌ ${error.message}`)
            })
          }
          
          if (validation.warnings.length > 0) {
            console.log(chalk.yellow('\nWarnings:'))
            validation.warnings.forEach((warning: any) => {
              console.log(`  ⚠️  ${warning.message}`)
            })
          }
          
          if (options.fix) {
            console.log(chalk.blue('\nAttempting to fix issues...'))
            // Implementation for auto-fix would go here
            console.log(chalk.yellow('Auto-fix not implemented yet'))
          }
          
          process.exit(1)
        }
        
      } catch (error) {
        spinner.fail('Validation failed')
        logger.error('Failed to validate configuration', error as Error)
        console.log(chalk.red(`Error: ${(error as Error).message}`))
        process.exit(1)
      }
    })
}

function createExportCommand(): Command {
  return new Command('export')
    .description('Export configuration to file')
    .argument('[file]', 'Output file path', 'vtex-config-export.json')
    .option('--no-sensitive', 'Exclude sensitive information')
    .option('--format <format>', 'Output format (json|yaml)', 'json')
    .action(async (file, options) => {
      try {
        const configManager = new ConfigManager()
        let config = configManager.getConfig()
        
        if (!options.sensitive) {
          config = hideSensitiveData(config)
        }
        
        let content: string
        if (options.format === 'yaml') {
          // Simple YAML export (would need yaml library for full support)
          content = JSON.stringify(config, null, 2)
          console.log(chalk.yellow('Note: YAML format not fully implemented, using JSON'))
        } else {
          content = JSON.stringify(config, null, 2)
        }
        
        await fs.writeFile(file, content, 'utf8')
        
        console.log(chalk.green(`✅ Configuration exported to: ${file}`))
        
      } catch (error) {
        logger.error('Failed to export configuration', error as Error)
        console.log(chalk.red(`Error: ${(error as Error).message}`))
        process.exit(1)
      }
    })
}

function createImportCommand(): Command {
  return new Command('import')
    .description('Import configuration from file')
    .argument('<file>', 'Input file path')
    .option('--merge', 'Merge with existing configuration')
    .option('--validate', 'Validate before importing')
    .action(async (file, options) => {
      const spinner = ora()
      
      try {
        // Check if file exists
        try {
          await fs.access(file)
        } catch {
          throw new Error(`Configuration file not found: ${file}`)
        }
        
        spinner.start('Reading configuration file...')
        const content = await fs.readFile(file, 'utf8')
        
        let importedConfig: any
        try {
          importedConfig = JSON.parse(content)
        } catch {
          throw new Error('Invalid JSON format in configuration file')
        }
        
        spinner.text = 'Processing configuration...'
        
        const configManager = new ConfigManager()
        
        if (options.merge) {
          const existingConfig = await configManager.getConfig()
          importedConfig = { ...existingConfig, ...importedConfig }
        }
        
        if (options.validate) {
          spinner.text = 'Validating configuration...'
          // Create temporary config manager to validate
          const tempConfigManager = new ConfigManager()
          tempConfigManager.setConfig(importedConfig)
          const validation = tempConfigManager.validate()
          
          if (!validation.valid) {
            spinner.fail('Configuration validation failed')
            console.log(chalk.red('\nValidation errors:'))
            validation.errors.forEach((error: any) => {
              console.log(`  ❌ ${error.message}`)
            })
            process.exit(1)
          }
        }
        
        spinner.text = 'Saving configuration...'
        configManager.setConfig(importedConfig)
        
        spinner.succeed('Configuration imported successfully')
        console.log(chalk.green(`✅ Configuration imported from: ${file}`))
        
      } catch (error) {
        spinner.fail('Configuration import failed')
        logger.error('Failed to import configuration', error as Error)
        console.log(chalk.red(`Error: ${(error as Error).message}`))
        process.exit(1)
      }
    })
}

async function createInteractiveConfig(): Promise<any> {
  console.log(chalk.cyan('\nVTEX Configuration:'))
  
  const vtexConfig = await inquirer.prompt([
    {
      type: 'input',
      name: 'account',
      message: 'VTEX Account:',
      validate: (input) => input.length > 0 || 'Account is required'
    },
    {
      type: 'input',
      name: 'workspace',
      message: 'Default Workspace:',
      default: 'master'
    },
    {
      type: 'input',
      name: 'userEmail',
      message: 'User Email:',
      validate: (input) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(input) || 'Please enter a valid email'
      }
    },
    {
      type: 'input',
      name: 'authToken',
      message: 'Auth Token (optional):',
      default: ''
    },
    {
      type: 'number',
      name: 'timeout',
      message: 'Request Timeout (ms):',
      default: 30000
    },
    {
      type: 'number',
      name: 'retryAttempts',
      message: 'Retry Attempts:',
      default: 3
    },
    {
      type: 'input',
      name: 'apiVersion',
      message: 'API Version:',
      default: 'v1'
    },
    {
      type: 'input',
      name: 'region',
      message: 'Region:',
      default: 'aws-us-east-1'
    }
  ])
  
  console.log(chalk.cyan('\nNotification Configuration:'))
  
  const { enableNotifications } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enableNotifications',
      message: 'Enable notifications?',
      default: true
    }
  ])
  
  let notificationsConfig: any = { enabled: enableNotifications }
  
  if (enableNotifications) {
    const { notificationTypes } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'notificationTypes',
        message: 'Select notification types:',
        choices: [
          { name: 'Slack', value: 'slack' },
          { name: 'Email', value: 'email' },
          { name: 'Teams', value: 'teams' }
        ]
      }
    ])
    
    if (notificationTypes.includes('slack')) {
      const slackConfig = await inquirer.prompt([
        {
          type: 'input',
          name: 'webhook',
          message: 'Slack Webhook URL:',
          validate: (input) => input.startsWith('https://hooks.slack.com/') || 'Please enter a valid Slack webhook URL'
        },
        {
          type: 'input',
          name: 'channel',
          message: 'Default Channel:',
          default: '#deployments'
        }
      ])
      notificationsConfig.slack = slackConfig
    }
    
    if (notificationTypes.includes('email')) {
      const emailConfig = await inquirer.prompt([
        {
          type: 'input',
          name: 'smtpHost',
          message: 'SMTP Host:',
          default: 'smtp.gmail.com'
        },
        {
          type: 'number',
          name: 'smtpPort',
          message: 'SMTP Port:',
          default: 587
        },
        {
          type: 'input',
          name: 'smtpUser',
          message: 'SMTP Username:'
        },
        {
          type: 'password',
          name: 'smtpPassword',
          message: 'SMTP Password:'
        },
        {
          type: 'input',
          name: 'from',
          message: 'From Email:'
        },
        {
          type: 'input',
          name: 'to',
          message: 'Default Recipients (comma-separated):'
        }
      ])
      
      emailConfig.to = emailConfig.to.split(',').map((email: string) => email.trim())
      notificationsConfig.email = emailConfig
    }
  }
  
  console.log(chalk.cyan('\nDeployment Configuration:'))
  
  const deploymentConfig = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'autoRollback',
      message: 'Enable auto-rollback on failure?',
      default: true
    },
    {
      type: 'number',
      name: 'rollbackTimeout',
      message: 'Rollback Timeout (minutes):',
      default: 5
    },
    {
      type: 'confirm',
      name: 'requireApproval',
      message: 'Require approval for production deployments?',
      default: true
    },
    {
      type: 'number',
      name: 'maxConcurrentDeployments',
      message: 'Max Concurrent Deployments:',
      default: 1
    },
    {
      type: 'input',
      name: 'defaultBranch',
      message: 'Default Branch:',
      default: 'main'
    }
  ])
  
  return {
    vtex: vtexConfig,
    notifications: notificationsConfig,
    deployment: deploymentConfig
  }
}

async function createFromTemplate(template: string): Promise<any> {
  const templates = {
    basic: {
      vtex: {
        account: '',
        workspace: 'master',
        userEmail: '',
        authToken: '',
        timeout: 30000,
        retryAttempts: 3,
        apiVersion: 'v1',
        region: 'aws-us-east-1'
      },
      notifications: {
        enabled: false
      },
      deployment: {
        autoRollback: true,
        rollbackTimeout: 5,
        requireApproval: false,
        maxConcurrentDeployments: 1,
        defaultBranch: 'main'
      }
    },
    full: {
      vtex: {
        account: '',
        workspace: 'master',
        userEmail: '',
        authToken: '',
        timeout: 30000,
        retryAttempts: 3,
        apiVersion: 'v1',
        region: 'aws-us-east-1'
      },
      notifications: {
        enabled: true,
        slack: {
          webhook: '',
          channel: '#deployments'
        },
        email: {
          smtpHost: 'smtp.gmail.com',
          smtpPort: 587,
          smtpUser: '',
          smtpPassword: '',
          from: '',
          to: []
        }
      },
      deployment: {
        autoRollback: true,
        rollbackTimeout: 5,
        requireApproval: true,
        maxConcurrentDeployments: 1,
        defaultBranch: 'main'
      }
    },
    production: {
      vtex: {
        account: '',
        workspace: 'master',
        userEmail: '',
        authToken: '',
        timeout: 60000,
        retryAttempts: 5,
        apiVersion: 'v1',
        region: 'aws-us-east-1'
      },
      notifications: {
        enabled: true,
        slack: {
          webhook: '',
          channel: '#production-deployments'
        },
        email: {
          smtpHost: 'smtp.gmail.com',
          smtpPort: 587,
          smtpUser: '',
          smtpPassword: '',
          from: '',
          to: []
        }
      },
      deployment: {
        autoRollback: true,
        rollbackTimeout: 10,
        requireApproval: true,
        maxConcurrentDeployments: 1,
        defaultBranch: 'main'
      }
    }
  }
  
  if (!(template in templates)) {
    throw new Error(`Unknown template: ${template}. Available templates: ${Object.keys(templates).join(', ')}`)
  }
  
  return templates[template as keyof typeof templates]
}

function displayConfigFormatted(config: any): void {
  console.log(chalk.blue('\n📋 Current Configuration'))
  console.log(chalk.blue('========================'))
  
  displaySection('VTEX', config.vtex)
  displaySection('Notifications', config.notifications)
  displaySection('Deployment', config.deployment)
}

function displaySection(title: string, section: any): void {
  if (!section) return
  
  console.log(chalk.cyan(`\n${title}:`))
  
  Object.entries(section).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null) {
      console.log(`  ${key}:`)
      Object.entries(value).forEach(([subKey, subValue]) => {
        console.log(`    ${subKey}: ${chalk.yellow(String(subValue))}`)
      })
    } else {
      console.log(`  ${key}: ${chalk.yellow(String(value))}`)
    }
  })
}

function hideSensitiveData(config: any): any {
  const sensitiveKeys = ['authToken', 'password', 'webhook', 'smtpPassword', 'token', 'secret', 'key']
  
  function hideSensitive(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj
    }
    
    if (Array.isArray(obj)) {
      return obj.map(hideSensitive)
    }
    
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()))) {
        result[key] = value ? '***HIDDEN***' : value
      } else {
        result[key] = hideSensitive(value)
      }
    }
    
    return result
  }
  
  return hideSensitive(config)
}
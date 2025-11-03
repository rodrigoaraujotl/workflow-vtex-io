#!/usr/bin/env node

/**
 * VTEX IO Deployment CLI
 * Main entry point for the command line interface
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { Logger } from '../utils/logger'
import { ConfigManager } from '../core/config-manager'

// Import commands
import { deployQACommand } from './commands/deploy-qa'
import { deployProdCommand } from './commands/deploy-prod'
import { rollbackCommand } from './commands/rollback'
import { statusCommand } from './commands/status'
import { configCommand } from './commands/config'
import { initCommand } from './commands/init'
import { validateCommand } from './commands/validate'
import { healthCommand } from './commands/health'

const logger = Logger.createModuleLogger('CLI')

// Create the main program
const program = new Command()

program
  .name('vtex-deploy')
  .description('VTEX IO Automated Deployment System')
  .version('1.0.0')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--dry-run', 'Show what would be done without executing')

// Global error handler
program.configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => cmd.name() + ' ' + cmd.usage()
})

// Add global options handler
program.hook('preAction', async (thisCommand) => {
  const options = thisCommand.opts()
  
  // Set up verbose logging
  if (options.verbose) {
    logger.setLevel('debug')
  }
  
  // Set custom config path
  if (options.config) {
    // ConfigManager will be initialized per command as needed
    process.env['VTEX_CONFIG_PATH'] = options.config
  }
  
  // Set dry-run mode
  if (options.dryRun) {
    logger.info('Running in dry-run mode - no changes will be made')
    process.env.DRY_RUN = 'true'
  }
})

// Register commands
program.addCommand(deployQACommand)
program.addCommand(deployProdCommand)
program.addCommand(rollbackCommand)
program.addCommand(statusCommand)
program.addCommand(configCommand)
program.addCommand(initCommand)
program.addCommand(validateCommand)
program.addCommand(healthCommand)

// Add help examples
program.addHelpText('after', `
Examples:
  $ vtex-deploy init                    Initialize project
  $ vtex-deploy config init             Setup configuration
  $ vtex-deploy deploy:qa               Deploy to QA environment
  $ vtex-deploy deploy:prod             Deploy to production
  $ vtex-deploy status                  Check deployment status
  $ vtex-deploy rollback                Rollback deployment
  $ vtex-deploy validate                Validate project
  $ vtex-deploy health                  Check system health

For more information on a specific command:
  $ vtex-deploy <command> --help
`)

// Error handling
program.exitOverride()

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error)
  console.log(chalk.red('\n💥 Unexpected error occurred'))
  console.log(chalk.red(`   ${error.message}`))
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason as Error)
  console.log(chalk.red('\n💥 Unhandled promise rejection'))
  console.log(chalk.red(`   ${reason}`))
  process.exit(1)
})

// Parse arguments and execute
if (require.main === module) {
  program.parse()
}

export { program }
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import Table from 'cli-table3'
import { Logger } from '../../utils/logger'
import { ConfigManager } from '../../core/config-manager'
import { ValidationEngine } from '../../core/validation-engine'
import { GitOperations } from '../../core/git-operations'
import { VTEXClient } from '../../core/vtex-client'

const logger = new Logger({
  level: 'info',
  format: 'text',
  auditEnabled: false,
  retentionDays: 7,
  maxFileSize: '10MB',
  maxFiles: 5
})

export const validateCommand = new Command('validate')
  .description('Validate project and deployment readiness')
  .option('--type <type>', 'Validation type (manifest|dependencies|security|tests|production)', 'all')
  .option('--fix', 'Attempt to fix validation issues automatically')
  .option('--strict', 'Use strict validation rules')
  .option('--json', 'Output results in JSON format')
  .option('--detailed', 'Show detailed validation information')
  .action(async (options) => {
    const spinner = ora()
    
    try {
      logger.info('Starting validation process')
      
      // Initialize services
      const configManager = new ConfigManager()
      const config = await configManager.getConfig()
      
      const gitOps = new GitOperations(logger)
      const vtexClient = new VTEXClient(logger)
      const validationEngine = new ValidationEngine(logger)
      
      spinner.start('Running validations...')
      
      // Run validations based on type
      const results = await runValidations(
        options.type,
        validationEngine,
        gitOps,
        vtexClient,
        configManager,
        options
      )
      
      spinner.succeed('Validation completed')
      
      // Output results
      if (options.json) {
        console.log(JSON.stringify(results, null, 2))
      } else {
        await displayValidationResults(results, options)
      }
      
      // Apply fixes if requested
      if (options.fix && results.fixableIssues.length > 0) {
        await applyFixes(results.fixableIssues, validationEngine, options)
      }
      
      // Exit with appropriate code
      const hasErrors = results.validations.some(v => v.status === 'error')
      if (hasErrors) {
        process.exit(1)
      }
      
    } catch (error) {
      spinner.fail(chalk.red('Validation failed'))
      logger.error('Validation error', error as Error)
      
      console.log(chalk.red('\n💥 Validation Error:'))
      console.log(`   ${(error as Error).message}`)
      
      process.exit(1)
    }
  })

async function runValidations(
  type: string,
  validationEngine: ValidationEngine,
  gitOps: GitOperations,
  vtexClient: VTEXClient,
  configManager: ConfigManager,
  options: any
): Promise<any> {
  const results = {
    timestamp: new Date().toISOString(),
    type,
    validations: [] as any[],
    summary: {
      total: 0,
      passed: 0,
      warnings: 0,
      errors: 0
    },
    fixableIssues: [] as any[]
  }
  
  const validationTypes = type === 'all' 
    ? ['config', 'manifest', 'dependencies', 'security', 'git', 'vtex', 'tests']
    : [type]
  
  for (const validationType of validationTypes) {
    try {
      const validation = await runSingleValidation(
        validationType,
        validationEngine,
        gitOps,
        vtexClient,
        configManager,
        options
      )
      
      results.validations.push(validation)
      results.summary.total++
      
      switch (validation.status) {
        case 'passed':
          results.summary.passed++
          break
        case 'warning':
          results.summary.warnings++
          break
        case 'error':
          results.summary.errors++
          break
      }
      
      // Collect fixable issues
      if (validation.fixable && validation.status !== 'passed') {
        results.fixableIssues.push({
          type: validationType,
          issue: validation.message,
          fix: validation.suggestedFix
        })
      }
      
    } catch (error) {
      results.validations.push({
        type: validationType,
        status: 'error',
        message: (error as Error).message,
        details: [],
        fixable: false
      })
      results.summary.total++
      results.summary.errors++
    }
  }
  
  return results
}

async function runSingleValidation(
  type: string,
  validationEngine: ValidationEngine,
  gitOps: GitOperations,
  vtexClient: VTEXClient,
  configManager: ConfigManager,
  options: any
): Promise<any> {
  switch (type) {
    case 'config':
      return await validateConfiguration(configManager, options)
    
    case 'manifest':
      return await validateManifest(validationEngine, options)
    
    case 'dependencies':
      return await validateDependencies(validationEngine, options)
    
    case 'security':
      return await validateSecurity(validationEngine, options)
    
    case 'git':
      return await validateGit(gitOps, options)
    
    case 'vtex':
      return await validateVTEX(vtexClient, options)
    
    case 'tests':
      return await validateTests(validationEngine, options)
    
    case 'production':
      return await validateProductionReadiness(validationEngine, options)
    
    default:
      throw new Error(`Unknown validation type: ${type}`)
  }
}

async function validateConfiguration(configManager: ConfigManager, _options: any): Promise<any> {
  const validation = await configManager.validateConfig()
  
  return {
    type: 'config',
    status: validation.valid ? 'passed' : (validation.errors.length > 0 ? 'error' : 'warning'),
    message: validation.valid ? 'Configuration is valid' : 'Configuration has issues',
    details: [
      ...validation.errors.map((e: any) => ({ level: 'error', message: typeof e === 'string' ? e : e.message })),
      ...validation.warnings.map((w: any) => ({ level: 'warning', message: typeof w === 'string' ? w : w.message }))
    ],
    fixable: validation.errors.length === 0 && validation.warnings.length > 0,
    suggestedFix: validation.warnings.length > 0 ? 'Run config init to fix warnings' : undefined
  }
}

async function validateManifest(validationEngine: ValidationEngine, _options: any): Promise<any> {
  try {
    const result = await validationEngine.validateManifest()
    
    return {
      type: 'manifest',
      status: result.valid ? 'passed' : 'error',
      message: result.valid ? 'Manifest is valid' : 'Manifest validation failed',
      details: result.errors.map((error: any) => ({ level: 'error', message: typeof error === 'string' ? error : error.message })),
      fixable: false
    }
  } catch (error) {
    return {
      type: 'manifest',
      status: 'error',
      message: 'Failed to validate manifest',
      details: [{ level: 'error', message: (error as Error).message }],
      fixable: false
    }
  }
}

async function validateDependencies(validationEngine: ValidationEngine, _options: any): Promise<any> {
  try {
    const result = await validationEngine.checkDependencies()
    
    const hasErrors = result.issues.length > 0
    const hasWarnings = result.warnings.length > 0
    const hasIncompatible = result.checkedDependencies.some((dep: any) => dep.status === 'incompatible')
    const hasWarningDeps = result.checkedDependencies.some((dep: any) => dep.status === 'warning')
    
    return {
      type: 'dependencies',
      status: (hasErrors || hasIncompatible) ? 'error' : ((hasWarnings || hasWarningDeps) ? 'warning' : 'passed'),
      message: (hasErrors || hasIncompatible) ? 'Dependency issues found' : ((hasWarnings || hasWarningDeps) ? 'Dependency warnings' : 'Dependencies are valid'),
      details: [
        ...result.issues.map((issue: string) => ({ level: 'error', message: issue })),
        ...result.warnings.map((warning: string) => ({ level: 'warning', message: warning })),
        ...result.checkedDependencies.map((dep: any) => ({
          level: dep.status === 'incompatible' ? 'error' : (dep.status === 'warning' ? 'warning' : 'info'),
          message: `${dep.name}@${dep.version}: ${dep.status}`
        }))
      ],
      fixable: hasErrors || hasIncompatible,
      suggestedFix: 'Run npm audit fix or update dependencies'
    }
  } catch (error) {
    return {
      type: 'dependencies',
      status: 'error',
      message: 'Failed to validate dependencies',
      details: [{ level: 'error', message: (error as Error).message }],
      fixable: false
    }
  }
}

async function validateSecurity(validationEngine: ValidationEngine, _options: any): Promise<any> {
  try {
    const result = await validationEngine.securityScan()
    
    const hasHighSeverity = result.vulnerabilities.some((v: any) => v.severity === 'high' || v.severity === 'critical')
    const hasMediumSeverity = result.vulnerabilities.some((v: any) => v.severity === 'medium')
    
    // Calculate summary from vulnerabilities
    const summary = {
      critical: result.vulnerabilities.filter((v: any) => v.severity === 'critical').length,
      high: result.vulnerabilities.filter((v: any) => v.severity === 'high').length,
      medium: result.vulnerabilities.filter((v: any) => v.severity === 'medium').length,
      low: result.vulnerabilities.filter((v: any) => v.severity === 'low').length
    }
    
    return {
      type: 'security',
      status: hasHighSeverity ? 'error' : (hasMediumSeverity ? 'warning' : 'passed'),
      message: hasHighSeverity ? 'Critical security issues found' : 
               (hasMediumSeverity ? 'Security warnings found' : 'No security issues found'),
      details: [
        { level: 'info', message: `Total vulnerabilities: ${result.vulnerabilities.length}` },
        { level: 'info', message: `Critical: ${summary.critical}` },
        { level: 'info', message: `High: ${summary.high}` },
        { level: 'info', message: `Medium: ${summary.medium}` },
        { level: 'info', message: `Low: ${summary.low}` },
        ...result.vulnerabilities.slice(0, 5).map((v: any) => ({
          level: v.severity === 'critical' || v.severity === 'high' ? 'error' : 'warning',
          message: `${v.package}@${v.version}: ${v.title} (${v.severity})`
        }))
      ],
      fixable: result.vulnerabilities.some((v: any) => v.fixedIn),
      suggestedFix: 'Run npm audit fix'
    }
  } catch (error) {
    return {
      type: 'security',
      status: 'error',
      message: 'Failed to run security scan',
      details: [{ level: 'error', message: (error as Error).message }],
      fixable: false
    }
  }
}

async function validateGit(gitOps: GitOperations, _options: any): Promise<any> {
  try {
    const status = await gitOps.getStatus()
    const currentBranch = await gitOps.getCurrentBranch()
    const remoteInfo = await gitOps.getRemoteInfo()
    
    const issues = []
    
    if (!status.clean) {
      issues.push({
        level: 'warning',
        message: `Repository has uncommitted changes (${status.staged.length + status.unstaged.length + status.untracked.length} files)`
      })
    }
    
    if (!remoteInfo || remoteInfo.length === 0) {
      issues.push({
        level: 'warning',
        message: 'No remote repository configured'
      })
    }
    
    if (currentBranch === 'main' || currentBranch === 'master') {
      issues.push({
        level: 'info',
        message: 'Working on main branch - consider using feature branches'
      })
    }
    
    return {
      type: 'git',
      status: issues.some(i => i.level === 'error') ? 'error' : 
              (issues.some(i => i.level === 'warning') ? 'warning' : 'passed'),
      message: issues.length === 0 ? 'Git repository is clean' : 'Git repository has issues',
      details: [
        { level: 'info', message: `Current branch: ${currentBranch}` },
        { level: 'info', message: `Repository clean: ${status.clean}` },
        { level: 'info', message: `Remote configured: ${remoteInfo && remoteInfo.length > 0}` },
        ...issues
      ],
      fixable: !status.clean,
      suggestedFix: 'Commit or stash changes before deployment'
    }
  } catch (error) {
    return {
      type: 'git',
      status: 'error',
      message: 'Failed to validate Git repository',
      details: [{ level: 'error', message: (error as Error).message }],
      fixable: false
    }
  }
}

async function validateVTEX(vtexClient: VTEXClient, _options: any): Promise<any> {
  try {
    const issues = []
    
    // Validate CLI
    try {
      await vtexClient.validateCLI()
      issues.push({
        level: 'info',
        message: 'VTEX CLI is installed and available'
      })
    } catch (error) {
      issues.push({
        level: 'error',
        message: 'VTEX CLI not found or invalid version'
      })
    }
    
    // Validate account access
    try {
      const account = await vtexClient.getCurrentAccount()
      issues.push({
        level: 'info',
        message: `Connected to account: ${account}`
      })
    } catch (error) {
      issues.push({
        level: 'error',
        message: 'Cannot access VTEX account - check authentication'
      })
    }
    
    // Validate workspace access
    try {
      const workspaces = await vtexClient.listWorkspaces()
      issues.push({
        level: 'info',
        message: `Available workspaces: ${workspaces.length}`
      })
    } catch (error) {
      issues.push({
        level: 'warning',
        message: 'Cannot list workspaces - limited access'
      })
    }
    
    const hasErrors = issues.some(i => i.level === 'error')
    const hasWarnings = issues.some(i => i.level === 'warning')
    
    return {
      type: 'vtex',
      status: hasErrors ? 'error' : (hasWarnings ? 'warning' : 'passed'),
      message: hasErrors ? 'VTEX connection issues' : 
               (hasWarnings ? 'VTEX connection warnings' : 'VTEX connection is valid'),
      details: issues,
      fixable: hasErrors,
      suggestedFix: 'Run vtex login or check authentication token'
    }
  } catch (error) {
    return {
      type: 'vtex',
      status: 'error',
      message: 'Failed to validate VTEX connection',
      details: [{ level: 'error', message: (error as Error).message }],
      fixable: true,
      suggestedFix: 'Check VTEX CLI installation and authentication'
    }
  }
}

async function validateTests(validationEngine: ValidationEngine, _options: any): Promise<any> {
  try {
    const result = await validationEngine.runTests('all')
    
    const passed = result.status === 'passed'
    const failed = result.status === 'failed'
    
    return {
      type: 'tests',
      status: passed ? 'passed' : (failed ? 'error' : 'warning'),
      message: passed ? 'All tests passed' : (failed ? 'Tests failed' : 'Tests skipped'),
      details: [
        { level: 'info', message: `Test: ${result.name}` },
        { level: 'info', message: `Status: ${result.status}` },
        { level: 'info', message: `Duration: ${result.duration}ms` },
        { level: 'info', message: `Assertions: ${result.assertions}` },
        ...(result.error ? [{
          level: 'error',
          message: `Error: ${result.error}`
        }] : [])
      ],
      fixable: false
    }
  } catch (error) {
    return {
      type: 'tests',
      status: 'warning',
      message: 'Could not run tests',
      details: [{ level: 'warning', message: (error as Error).message }],
      fixable: false
    }
  }
}

async function validateProductionReadiness(validationEngine: ValidationEngine, _options: any): Promise<any> {
  try {
    const result = await validationEngine.validateProductionReadiness()
    
    const criticalErrors = result.errors.filter(e => e.severity === 'critical')
    const hasBlockers = criticalErrors.length > 0
    const hasWarnings = result.warnings.length > 0
    
    return {
      type: 'production',
      status: hasBlockers ? 'error' : (hasWarnings ? 'warning' : 'passed'),
      message: hasBlockers ? 'Production deployment blocked' : 
               (hasWarnings ? 'Production deployment warnings' : 'Ready for production'),
      details: [
        ...criticalErrors.map(e => ({ level: 'error', message: e.message })),
        ...result.warnings.map(w => ({ level: 'warning', message: w.message })),
        ...result.info.map(i => ({ level: 'info', message: i.message }))
      ],
      fixable: hasWarnings && !hasBlockers,
      suggestedFix: hasBlockers ? 'Fix blocking issues before production deployment' : undefined
    }
  } catch (error) {
    return {
      type: 'production',
      status: 'error',
      message: 'Failed to validate production readiness',
      details: [{ level: 'error', message: (error as Error).message }],
      fixable: false
    }
  }
}

async function displayValidationResults(results: any, options: any): Promise<void> {
  console.log(chalk.blue('\n🔍 Validation Results'))
  console.log(chalk.blue('===================='))
  console.log(`Generated: ${new Date(results.timestamp).toLocaleString()}`)
  console.log(`Type: ${results.type}`)
  
  // Summary
  displaySummary(results.summary)
  
  // Detailed results
  if (options.detailed) {
    displayDetailedResults(results.validations)
  } else {
    displayCompactResults(results.validations)
  }
  
  // Fixable issues
  if (results.fixableIssues.length > 0) {
    displayFixableIssues(results.fixableIssues)
  }
}

function displaySummary(summary: any): void {
  console.log(chalk.cyan('\n📊 Summary:'))
  
  const table = new Table({
    head: ['Total', 'Passed', 'Warnings', 'Errors'].map(h => chalk.white(h)),
    colWidths: [10, 10, 12, 10],
    style: { head: [], border: [] }
  })
  
  table.push([
    summary.total.toString(),
    chalk.green(summary.passed.toString()),
    chalk.yellow(summary.warnings.toString()),
    chalk.red(summary.errors.toString())
  ])
  
  console.log(table.toString())
}

function displayCompactResults(validations: any[]): void {
  console.log(chalk.cyan('\n📋 Validation Results:'))
  
  const table = new Table({
    head: ['Type', 'Status', 'Message'].map(h => chalk.white(h)),
    colWidths: [15, 12, 50],
    style: { head: [], border: [] }
  })
  
  validations.forEach(validation => {
    table.push([
      validation.type,
      getStatusColor(validation.status),
      validation.message
    ])
  })
  
  console.log(table.toString())
}

function displayDetailedResults(validations: any[]): void {
  console.log(chalk.cyan('\n📋 Detailed Validation Results:'))
  
  validations.forEach(validation => {
    console.log(`\n${chalk.cyan(validation.type.toUpperCase())}:`)
    console.log(`  Status: ${getStatusColor(validation.status)}`)
    console.log(`  Message: ${validation.message}`)
    
    if (validation.details && validation.details.length > 0) {
      console.log('  Details:')
      validation.details.forEach((detail: any) => {
        const icon = detail.level === 'error' ? '❌' : 
                    detail.level === 'warning' ? '⚠️' : 'ℹ️'
        console.log(`    ${icon} ${detail.message}`)
      })
    }
    
    if (validation.fixable) {
      console.log(`  ${chalk.blue('🔧 Fixable:')} ${validation.suggestedFix || 'Auto-fix available'}`)
    }
  })
}

function displayFixableIssues(fixableIssues: any[]): void {
  console.log(chalk.cyan('\n🔧 Fixable Issues:'))
  
  fixableIssues.forEach((issue, index) => {
    console.log(`  ${index + 1}. ${chalk.yellow(issue.type)}: ${issue.issue}`)
    if (issue.fix) {
      console.log(`     Fix: ${chalk.blue(issue.fix)}`)
    }
  })
  
  console.log(chalk.gray('\nRun with --fix to attempt automatic fixes'))
}

async function applyFixes(fixableIssues: any[], validationEngine: ValidationEngine, _options: any): Promise<void> {
  console.log(chalk.blue('\n🔧 Applying Fixes...'))
  
  for (const issue of fixableIssues) {
    const spinner = ora(`Fixing ${issue.type}...`).start()
    
    try {
      // Apply fix based on issue type
      await applySpecificFix(issue, validationEngine)
      spinner.succeed(`Fixed ${issue.type}`)
    } catch (error) {
      spinner.fail(`Failed to fix ${issue.type}: ${(error as Error).message}`)
    }
  }
}

async function applySpecificFix(issue: any, validationEngine: ValidationEngine): Promise<void> {
  switch (issue.type) {
    case 'dependencies':
      // Run npm audit fix
      const { execSync } = require('child_process')
      execSync('npm audit fix', { stdio: 'inherit' })
      break
    
    case 'security':
      // Run npm audit fix
      execSync('npm audit fix --force', { stdio: 'inherit' })
      break
    
    default:
      throw new Error(`No automatic fix available for ${issue.type}`)
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'passed':
      return chalk.green(status)
    case 'warning':
      return chalk.yellow(status)
    case 'error':
      return chalk.red(status)
    default:
      return chalk.gray(status)
  }
}
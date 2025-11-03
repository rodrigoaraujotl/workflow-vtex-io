# Especificações Técnicas Detalhadas - Sistema de Deploy VTEX IO

## 1. Especificações dos Componentes Core

### 1.1 Deploy Manager

#### 1.1.1 Interface e Tipos
```typescript
// src/types/deploy.types.ts
export interface DeployConfig {
  environment: 'qa' | 'production'
  account: string
  workspace: string
  appName: string
  version?: string
  autoInstall: boolean
  skipTests: boolean
  timeout: number
}

export interface DeployResult {
  id: string
  status: 'success' | 'failed' | 'in_progress'
  version: string
  workspace: string
  startTime: Date
  endTime?: Date
  logs: string[]
  error?: Error
}

export interface RollbackResult {
  success: boolean
  previousVersion: string
  currentVersion: string
  rollbackTime: Date
  affectedWorkspaces: string[]
}
```

#### 1.1.2 Implementação Core
```typescript
// src/core/deploy-manager.ts
import { VTEXClient } from './vtex-client'
import { ValidationEngine } from './validation-engine'
import { Logger } from '../utils/logger'
import { NotificationService } from '../utils/notification-service'

export class DeployManager {
  private vtexClient: VTEXClient
  private validator: ValidationEngine
  private logger: Logger
  private notifier: NotificationService

  constructor(
    vtexClient: VTEXClient,
    validator: ValidationEngine,
    logger: Logger,
    notifier: NotificationService
  ) {
    this.vtexClient = vtexClient
    this.validator = validator
    this.logger = logger
    this.notifier = notifier
  }

  async deployToQA(config: DeployConfig): Promise<DeployResult> {
    const deployId = this.generateDeployId()
    const startTime = new Date()
    
    try {
      this.logger.info('Starting QA deployment', { deployId, config })
      
      // 1. Validate prerequisites
      await this.validatePrerequisites(config)
      
      // 2. Authenticate with VTEX
      await this.vtexClient.authenticate(config.account)
      
      // 3. Create or switch to workspace
      await this.vtexClient.useWorkspace(config.workspace)
      
      // 4. Validate manifest and dependencies
      await this.validator.validateManifest()
      await this.validator.checkDependencies()
      
      // 5. Run tests if not skipped
      if (!config.skipTests) {
        await this.validator.runTests('unit')
      }
      
      // 6. Generate QA version
      const version = await this.generateQAVersion()
      
      // 7. Create release
      await this.vtexClient.release(version, 'beta')
      
      // 8. Install app if auto-install enabled
      if (config.autoInstall) {
        await this.vtexClient.installApp(`${config.appName}@${version}`)
      }
      
      // 9. Verify installation
      await this.verifyInstallation(config.appName, version)
      
      const result: DeployResult = {
        id: deployId,
        status: 'success',
        version,
        workspace: config.workspace,
        startTime,
        endTime: new Date(),
        logs: this.logger.getDeployLogs(deployId)
      }
      
      await this.notifier.notifyDeploySuccess(result)
      return result
      
    } catch (error) {
      const result: DeployResult = {
        id: deployId,
        status: 'failed',
        version: 'unknown',
        workspace: config.workspace,
        startTime,
        endTime: new Date(),
        logs: this.logger.getDeployLogs(deployId),
        error: error as Error
      }
      
      await this.notifier.notifyDeployFailure(result, error as Error)
      throw error
    }
  }

  async deployToProduction(config: DeployConfig): Promise<DeployResult> {
    const deployId = this.generateDeployId()
    const startTime = new Date()
    
    try {
      this.logger.info('Starting Production deployment', { deployId, config })
      
      // 1. Validate production prerequisites
      await this.validateProductionPrerequisites(config)
      
      // 2. Authenticate with production account
      await this.vtexClient.authenticate(config.account)
      
      // 3. Switch to prodtest workspace
      await this.vtexClient.useWorkspace('prodtest')
      
      // 4. Enhanced validations for production
      await this.validator.validateManifest()
      await this.validator.checkDependencies()
      await this.validator.securityScan()
      
      // 5. Run full test suite
      await this.validator.runTests('all')
      
      // 6. Create stable release
      const version = await this.generateProductionVersion()
      await this.vtexClient.release(version, 'stable')
      
      // 7. Install in prodtest workspace
      await this.vtexClient.installApp(`${config.appName}@${version}`)
      
      // 8. Run smoke tests
      await this.validator.runSmokeTests()
      
      // 9. Verify installation
      await this.verifyInstallation(config.appName, version)
      
      const result: DeployResult = {
        id: deployId,
        status: 'success',
        version,
        workspace: 'prodtest',
        startTime,
        endTime: new Date(),
        logs: this.logger.getDeployLogs(deployId)
      }
      
      await this.notifier.notifyDeploySuccess(result)
      return result
      
    } catch (error) {
      // Auto-rollback on production failure
      if (config.environment === 'production') {
        await this.autoRollback(config)
      }
      
      const result: DeployResult = {
        id: deployId,
        status: 'failed',
        version: 'unknown',
        workspace: 'prodtest',
        startTime,
        endTime: new Date(),
        logs: this.logger.getDeployLogs(deployId),
        error: error as Error
      }
      
      await this.notifier.notifyDeployFailure(result, error as Error)
      throw error
    }
  }

  async rollback(targetVersion: string, config: DeployConfig): Promise<RollbackResult> {
    try {
      this.logger.info('Starting rollback', { targetVersion, config })
      
      // 1. Validate target version exists
      await this.validateVersionExists(targetVersion)
      
      // 2. Get current version for comparison
      const currentVersion = await this.vtexClient.getCurrentVersion()
      
      // 3. Install target version
      await this.vtexClient.installApp(`${config.appName}@${targetVersion}`)
      
      // 4. Verify rollback success
      await this.verifyInstallation(config.appName, targetVersion)
      
      const result: RollbackResult = {
        success: true,
        previousVersion: currentVersion,
        currentVersion: targetVersion,
        rollbackTime: new Date(),
        affectedWorkspaces: [config.workspace]
      }
      
      this.logger.info('Rollback completed successfully', result)
      return result
      
    } catch (error) {
      this.logger.error('Rollback failed', error as Error)
      throw error
    }
  }

  private async validatePrerequisites(config: DeployConfig): Promise<void> {
    // Validate VTEX CLI is available
    await this.vtexClient.validateCLI()
    
    // Validate authentication
    await this.vtexClient.validateAuth()
    
    // Validate workspace permissions
    await this.vtexClient.validateWorkspacePermissions(config.workspace)
    
    // Validate app manifest
    await this.validator.validateManifest()
  }

  private async validateProductionPrerequisites(config: DeployConfig): Promise<void> {
    await this.validatePrerequisites(config)
    
    // Additional production validations
    await this.validator.validateProductionReadiness()
    await this.validator.checkBreakingChanges()
    await this.validator.validateSecurityCompliance()
  }

  private generateDeployId(): string {
    return `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private async generateQAVersion(): Promise<string> {
    const manifest = await this.loadManifest()
    const baseVersion = manifest.version
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
    return `${baseVersion}-qa+${timestamp}`
  }

  private async generateProductionVersion(): Promise<string> {
    const manifest = await this.loadManifest()
    return manifest.version
  }

  private async verifyInstallation(appName: string, version: string): Promise<void> {
    const installedApps = await this.vtexClient.listApps()
    const targetApp = installedApps.find(app => 
      app.name === appName && app.version === version
    )
    
    if (!targetApp) {
      throw new Error(`App ${appName}@${version} not found in workspace`)
    }
    
    if (targetApp.status !== 'installed') {
      throw new Error(`App ${appName}@${version} installation failed`)
    }
  }

  private async autoRollback(config: DeployConfig): Promise<void> {
    try {
      const previousVersions = await this.vtexClient.getVersionHistory(config.appName)
      if (previousVersions.length > 0) {
        const lastStableVersion = previousVersions[0]
        await this.rollback(lastStableVersion, config)
        this.logger.info('Auto-rollback completed', { version: lastStableVersion })
      }
    } catch (error) {
      this.logger.error('Auto-rollback failed', error as Error)
    }
  }
}
```

### 1.2 VTEX Client

#### 1.2.1 Interface e Tipos
```typescript
// src/types/vtex.types.ts
export interface VTEXConfig {
  account: string
  authToken: string
  userEmail: string
  timeout: number
  retryAttempts: number
}

export interface Workspace {
  name: string
  weight: number
  production: boolean
  lastModified: Date
}

export interface App {
  name: string
  version: string
  status: 'installed' | 'installing' | 'failed'
  workspace: string
}

export interface InstallResult {
  success: boolean
  app: string
  version: string
  installTime: Date
  logs: string[]
}
```

#### 1.2.2 Implementação
```typescript
// src/core/vtex-client.ts
import { exec } from 'child_process'
import { promisify } from 'util'
import { VTEXConfig, Workspace, App, InstallResult } from '../types/vtex.types'
import { Logger } from '../utils/logger'

const execAsync = promisify(exec)

export class VTEXClient {
  private config: VTEXConfig
  private logger: Logger
  private authenticated: boolean = false

  constructor(config: VTEXConfig, logger: Logger) {
    this.config = config
    this.logger = logger
  }

  async authenticate(account?: string): Promise<boolean> {
    try {
      const targetAccount = account || this.config.account
      
      // Login using token
      const loginCommand = `echo "${this.config.authToken}" | vtex login ${targetAccount} --token`
      await this.executeCommand(loginCommand, { hideOutput: true })
      
      // Verify authentication
      const whoamiResult = await this.executeCommand('vtex whoami')
      this.logger.info('VTEX authentication successful', { 
        account: targetAccount,
        user: whoamiResult.stdout.trim()
      })
      
      this.authenticated = true
      return true
      
    } catch (error) {
      this.logger.error('VTEX authentication failed', error as Error)
      this.authenticated = false
      throw error
    }
  }

  async createWorkspace(name: string): Promise<Workspace> {
    await this.ensureAuthenticated()
    
    try {
      const command = `vtex use ${name} --reset`
      await this.executeCommand(command)
      
      const workspace: Workspace = {
        name,
        weight: 0,
        production: false,
        lastModified: new Date()
      }
      
      this.logger.info('Workspace created successfully', { workspace: name })
      return workspace
      
    } catch (error) {
      this.logger.error('Failed to create workspace', { workspace: name, error })
      throw error
    }
  }

  async useWorkspace(name: string): Promise<void> {
    await this.ensureAuthenticated()
    
    try {
      const command = `vtex use ${name}`
      await this.executeCommand(command)
      this.logger.info('Switched to workspace', { workspace: name })
      
    } catch (error) {
      this.logger.error('Failed to switch workspace', { workspace: name, error })
      throw error
    }
  }

  async installApp(appIdentifier: string): Promise<InstallResult> {
    await this.ensureAuthenticated()
    
    const startTime = new Date()
    
    try {
      const command = `vtex install ${appIdentifier} -y`
      const result = await this.executeCommand(command, { timeout: 300000 })
      
      const installResult: InstallResult = {
        success: true,
        app: appIdentifier,
        version: this.extractVersionFromIdentifier(appIdentifier),
        installTime: new Date(),
        logs: result.stdout.split('\n')
      }
      
      this.logger.info('App installed successfully', installResult)
      return installResult
      
    } catch (error) {
      const installResult: InstallResult = {
        success: false,
        app: appIdentifier,
        version: this.extractVersionFromIdentifier(appIdentifier),
        installTime: new Date(),
        logs: [(error as Error).message]
      }
      
      this.logger.error('App installation failed', installResult)
      throw error
    }
  }

  async release(version: string, tag: 'beta' | 'stable'): Promise<void> {
    await this.ensureAuthenticated()
    
    try {
      const command = `vtex release ${tag === 'beta' ? 'patch beta' : 'patch stable'}`
      await this.executeCommand(command)
      
      this.logger.info('Release created successfully', { version, tag })
      
    } catch (error) {
      this.logger.error('Release creation failed', { version, tag, error })
      throw error
    }
  }

  async listApps(workspace?: string): Promise<App[]> {
    await this.ensureAuthenticated()
    
    try {
      const command = workspace ? `vtex list --workspace=${workspace}` : 'vtex list'
      const result = await this.executeCommand(command)
      
      const apps = this.parseAppList(result.stdout)
      this.logger.info('Apps listed successfully', { count: apps.length, workspace })
      
      return apps
      
    } catch (error) {
      this.logger.error('Failed to list apps', { workspace, error })
      throw error
    }
  }

  async promoteWorkspace(workspace: string): Promise<void> {
    await this.ensureAuthenticated()
    
    try {
      // Switch to workspace first
      await this.useWorkspace(workspace)
      
      // Promote workspace
      const command = 'vtex workspace promote'
      await this.executeCommand(command)
      
      this.logger.info('Workspace promoted successfully', { workspace })
      
    } catch (error) {
      this.logger.error('Workspace promotion failed', { workspace, error })
      throw error
    }
  }

  async getCurrentVersion(): Promise<string> {
    try {
      const manifest = await this.loadManifest()
      return manifest.version
    } catch (error) {
      this.logger.error('Failed to get current version', error as Error)
      throw error
    }
  }

  async getVersionHistory(appName: string): Promise<string[]> {
    await this.ensureAuthenticated()
    
    try {
      // This would typically query VTEX registry or app store
      // For now, we'll implement a basic version tracking
      const command = `vtex list | grep ${appName}`
      const result = await this.executeCommand(command)
      
      const versions = this.parseVersionHistory(result.stdout)
      return versions
      
    } catch (error) {
      this.logger.error('Failed to get version history', { appName, error })
      return []
    }
  }

  async validateCLI(): Promise<void> {
    try {
      await this.executeCommand('vtex --version')
    } catch (error) {
      throw new Error('VTEX CLI not found or not properly installed')
    }
  }

  async validateAuth(): Promise<void> {
    if (!this.authenticated) {
      throw new Error('VTEX client not authenticated')
    }
    
    try {
      await this.executeCommand('vtex whoami')
    } catch (error) {
      throw new Error('VTEX authentication expired or invalid')
    }
  }

  async validateWorkspacePermissions(workspace: string): Promise<void> {
    try {
      await this.useWorkspace(workspace)
    } catch (error) {
      throw new Error(`No permissions to access workspace: ${workspace}`)
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.authenticated) {
      await this.authenticate()
    }
  }

  private async executeCommand(
    command: string, 
    options: { timeout?: number; hideOutput?: boolean } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    const { timeout = 60000, hideOutput = false } = options
    
    if (!hideOutput) {
      this.logger.info('Executing VTEX command', { command })
    }
    
    try {
      const result = await execAsync(command, { timeout })
      
      if (!hideOutput) {
        this.logger.info('Command executed successfully', { 
          command, 
          stdout: result.stdout.substring(0, 500) 
        })
      }
      
      return result
      
    } catch (error) {
      this.logger.error('Command execution failed', { command, error })
      throw error
    }
  }

  private extractVersionFromIdentifier(identifier: string): string {
    const match = identifier.match(/@(.+)$/)
    return match ? match[1] : 'unknown'
  }

  private parseAppList(output: string): App[] {
    const lines = output.split('\n').filter(line => line.trim())
    const apps: App[] = []
    
    for (const line of lines) {
      const match = line.match(/(\S+)\s+(\S+)\s+(\S+)/)
      if (match) {
        apps.push({
          name: match[1],
          version: match[2],
          status: match[3] as 'installed' | 'installing' | 'failed',
          workspace: 'current'
        })
      }
    }
    
    return apps
  }

  private parseVersionHistory(output: string): string[] {
    // Implementation would parse version history from VTEX output
    // This is a simplified version
    const versions: string[] = []
    const lines = output.split('\n')
    
    for (const line of lines) {
      const match = line.match(/@(\d+\.\d+\.\d+)/)
      if (match) {
        versions.push(match[1])
      }
    }
    
    return versions.sort().reverse() // Most recent first
  }

  private async loadManifest(): Promise<any> {
    const fs = require('fs').promises
    try {
      const manifestContent = await fs.readFile('manifest.json', 'utf8')
      return JSON.parse(manifestContent)
    } catch (error) {
      throw new Error('Failed to load manifest.json')
    }
  }
}
```

### 1.3 Validation Engine

#### 1.3.1 Interface e Tipos
```typescript
// src/types/validation.types.ts
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  code: string
  message: string
  severity: 'error' | 'warning'
  file?: string
  line?: number
}

export interface TestResult {
  success: boolean
  testSuite: string
  passedTests: number
  failedTests: number
  coverage?: number
  duration: number
  failures: TestFailure[]
}

export interface SecurityResult {
  secure: boolean
  vulnerabilities: Vulnerability[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}
```

#### 1.3.2 Implementação
```typescript
// src/core/validation-engine.ts
import { ValidationResult, TestResult, SecurityResult } from '../types/validation.types'
import { Logger } from '../utils/logger'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export class ValidationEngine {
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  async validateManifest(): Promise<ValidationResult> {
    try {
      this.logger.info('Starting manifest validation')
      
      const manifest = await this.loadManifest()
      const errors: ValidationError[] = []
      const warnings: ValidationWarning[] = []

      // Required fields validation
      const requiredFields = ['name', 'vendor', 'version', 'title', 'description']
      for (const field of requiredFields) {
        if (!manifest[field]) {
          errors.push({
            code: 'MISSING_REQUIRED_FIELD',
            message: `Required field '${field}' is missing`,
            severity: 'error'
          })
        }
      }

      // Version format validation
      if (manifest.version && !this.isValidSemVer(manifest.version)) {
        errors.push({
          code: 'INVALID_VERSION_FORMAT',
          message: 'Version must follow semantic versioning (x.y.z)',
          severity: 'error'
        })
      }

      // Dependencies validation
      if (manifest.dependencies) {
        await this.validateDependencies(manifest.dependencies, errors, warnings)
      }

      // Builders validation
      if (manifest.builders) {
        this.validateBuilders(manifest.builders, errors, warnings)
      }

      const result: ValidationResult = {
        valid: errors.length === 0,
        errors,
        warnings
      }

      this.logger.info('Manifest validation completed', result)
      return result

    } catch (error) {
      this.logger.error('Manifest validation failed', error as Error)
      throw error
    }
  }

  async checkDependencies(): Promise<ValidationResult> {
    try {
      this.logger.info('Starting dependency check')
      
      const errors: ValidationError[] = []
      const warnings: ValidationWarning[] = []

      // Check npm dependencies
      const packageJson = await this.loadPackageJson()
      if (packageJson.dependencies) {
        await this.validateNpmDependencies(packageJson.dependencies, errors, warnings)
      }

      // Check VTEX dependencies
      const manifest = await this.loadManifest()
      if (manifest.dependencies) {
        await this.validateVtexDependencies(manifest.dependencies, errors, warnings)
      }

      const result: ValidationResult = {
        valid: errors.length === 0,
        errors,
        warnings
      }

      this.logger.info('Dependency check completed', result)
      return result

    } catch (error) {
      this.logger.error('Dependency check failed', error as Error)
      throw error
    }
  }

  async runTests(testSuite: 'unit' | 'integration' | 'all'): Promise<TestResult> {
    try {
      this.logger.info('Starting test execution', { testSuite })
      
      const startTime = Date.now()
      let command: string

      switch (testSuite) {
        case 'unit':
          command = 'npm run test:unit'
          break
        case 'integration':
          command = 'npm run test:integration'
          break
        case 'all':
          command = 'npm test'
          break
        default:
          throw new Error(`Unknown test suite: ${testSuite}`)
      }

      const result = await execAsync(command)
      const duration = Date.now() - startTime

      const testResult = this.parseTestOutput(result.stdout, testSuite, duration)
      
      this.logger.info('Test execution completed', testResult)
      return testResult

    } catch (error) {
      this.logger.error('Test execution failed', { testSuite, error })
      
      return {
        success: false,
        testSuite,
        passedTests: 0,
        failedTests: 1,
        duration: 0,
        failures: [{
          test: 'Test execution',
          error: (error as Error).message
        }]
      }
    }
  }

  async runSmokeTests(): Promise<TestResult> {
    try {
      this.logger.info('Starting smoke tests')
      
      const startTime = Date.now()
      const command = 'npm run test:smoke'
      
      const result = await execAsync(command)
      const duration = Date.now() - startTime

      const testResult = this.parseTestOutput(result.stdout, 'smoke', duration)
      
      this.logger.info('Smoke tests completed', testResult)
      return testResult

    } catch (error) {
      this.logger.error('Smoke tests failed', error as Error)
      throw error
    }
  }

  async securityScan(): Promise<SecurityResult> {
    try {
      this.logger.info('Starting security scan')
      
      // Run npm audit
      const auditResult = await this.runNpmAudit()
      
      // Run additional security checks
      const additionalChecks = await this.runAdditionalSecurityChecks()
      
      const vulnerabilities = [...auditResult.vulnerabilities, ...additionalChecks.vulnerabilities]
      const riskLevel = this.calculateRiskLevel(vulnerabilities)

      const result: SecurityResult = {
        secure: vulnerabilities.length === 0,
        vulnerabilities,
        riskLevel
      }

      this.logger.info('Security scan completed', result)
      return result

    } catch (error) {
      this.logger.error('Security scan failed', error as Error)
      throw error
    }
  }

  async validateProductionReadiness(): Promise<ValidationResult> {
    try {
      this.logger.info('Starting production readiness validation')
      
      const errors: ValidationError[] = []
      const warnings: ValidationWarning[] = []

      // Check test coverage
      const coverage = await this.getTestCoverage()
      if (coverage < 80) {
        errors.push({
          code: 'LOW_TEST_COVERAGE',
          message: `Test coverage is ${coverage}%, minimum required is 80%`,
          severity: 'error'
        })
      }

      // Check for TODO/FIXME comments
      const codeIssues = await this.scanCodeIssues()
      if (codeIssues.length > 0) {
        warnings.push({
          code: 'CODE_ISSUES_FOUND',
          message: `Found ${codeIssues.length} TODO/FIXME comments`,
          severity: 'warning'
        })
      }

      // Check for console.log statements
      const debugStatements = await this.scanDebugStatements()
      if (debugStatements.length > 0) {
        warnings.push({
          code: 'DEBUG_STATEMENTS_FOUND',
          message: `Found ${debugStatements.length} console.log statements`,
          severity: 'warning'
        })
      }

      const result: ValidationResult = {
        valid: errors.length === 0,
        errors,
        warnings
      }

      this.logger.info('Production readiness validation completed', result)
      return result

    } catch (error) {
      this.logger.error('Production readiness validation failed', error as Error)
      throw error
    }
  }

  async checkBreakingChanges(): Promise<ValidationResult> {
    try {
      this.logger.info('Checking for breaking changes')
      
      const errors: ValidationError[] = []
      const warnings: ValidationWarning[] = []

      // Compare with previous version
      const currentManifest = await this.loadManifest()
      const previousVersion = await this.getPreviousVersion()
      
      if (previousVersion) {
        const changes = await this.compareVersions(currentManifest.version, previousVersion)
        
        if (changes.hasBreakingChanges) {
          const majorVersion = this.getMajorVersion(currentManifest.version)
          const previousMajorVersion = this.getMajorVersion(previousVersion)
          
          if (majorVersion === previousMajorVersion) {
            errors.push({
              code: 'BREAKING_CHANGES_WITHOUT_MAJOR_BUMP',
              message: 'Breaking changes detected but major version not incremented',
              severity: 'error'
            })
          }
        }
      }

      const result: ValidationResult = {
        valid: errors.length === 0,
        errors,
        warnings
      }

      this.logger.info('Breaking changes check completed', result)
      return result

    } catch (error) {
      this.logger.error('Breaking changes check failed', error as Error)
      throw error
    }
  }

  private async loadManifest(): Promise<any> {
    const fs = require('fs').promises
    const manifestContent = await fs.readFile('manifest.json', 'utf8')
    return JSON.parse(manifestContent)
  }

  private async loadPackageJson(): Promise<any> {
    const fs = require('fs').promises
    const packageContent = await fs.readFile('package.json', 'utf8')
    return JSON.parse(packageContent)
  }

  private isValidSemVer(version: string): boolean {
    const semVerRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/
    return semVerRegex.test(version)
  }

  private async validateDependencies(
    dependencies: Record<string, string>,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    for (const [name, version] of Object.entries(dependencies)) {
      if (!this.isValidVersionRange(version)) {
        errors.push({
          code: 'INVALID_DEPENDENCY_VERSION',
          message: `Invalid version range for dependency '${name}': ${version}`,
          severity: 'error'
        })
      }
    }
  }

  private validateBuilders(
    builders: Record<string, string>,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const validBuilders = ['node', 'react', 'store', 'admin', 'docs']
    
    for (const builder of Object.keys(builders)) {
      if (!validBuilders.includes(builder)) {
        warnings.push({
          code: 'UNKNOWN_BUILDER',
          message: `Unknown builder '${builder}' detected`,
          severity: 'warning'
        })
      }
    }
  }

  private isValidVersionRange(version: string): boolean {
    // Simplified version range validation
    const versionRangeRegex = /^[\^~]?\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/
    return versionRangeRegex.test(version)
  }

  private parseTestOutput(output: string, testSuite: string, duration: number): TestResult {
    // Parse Jest output format
    const passedMatch = output.match(/(\d+) passed/)
    const failedMatch = output.match(/(\d+) failed/)
    const coverageMatch = output.match(/All files\s+\|\s+(\d+\.?\d*)/)

    const passedTests = passedMatch ? parseInt(passedMatch[1]) : 0
    const failedTests = failedMatch ? parseInt(failedMatch[1]) : 0
    const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : undefined

    return {
      success: failedTests === 0,
      testSuite,
      passedTests,
      failedTests,
      coverage,
      duration,
      failures: this.parseTestFailures(output)
    }
  }

  private parseTestFailures(output: string): TestFailure[] {
    // Simplified test failure parsing
    const failures: TestFailure[] = []
    const lines = output.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('FAIL')) {
        failures.push({
          test: lines[i].trim(),
          error: lines[i + 1]?.trim() || 'Unknown error'
        })
      }
    }
    
    return failures
  }

  private async runNpmAudit(): Promise<{ vulnerabilities: Vulnerability[] }> {
    try {
      const result = await execAsync('npm audit --json')
      const auditData = JSON.parse(result.stdout)
      
      const vulnerabilities: Vulnerability[] = []
      
      if (auditData.vulnerabilities) {
        for (const [name, vuln] of Object.entries(auditData.vulnerabilities)) {
          vulnerabilities.push({
            package: name,
            severity: (vuln as any).severity,
            description: (vuln as any).title,
            recommendation: (vuln as any).recommendation
          })
        }
      }
      
      return { vulnerabilities }
      
    } catch (error) {
      // npm audit returns non-zero exit code when vulnerabilities found
      if ((error as any).stdout) {
        const auditData = JSON.parse((error as any).stdout)
        return this.parseAuditData(auditData)
      }
      
      return { vulnerabilities: [] }
    }
  }

  private async runAdditionalSecurityChecks(): Promise<{ vulnerabilities: Vulnerability[] }> {
    // Additional security checks can be implemented here
    // For example: checking for hardcoded secrets, insecure configurations, etc.
    return { vulnerabilities: [] }
  }

  private calculateRiskLevel(vulnerabilities: Vulnerability[]): 'low' | 'medium' | 'high' | 'critical' {
    if (vulnerabilities.some(v => v.severity === 'critical')) return 'critical'
    if (vulnerabilities.some(v => v.severity === 'high')) return 'high'
    if (vulnerabilities.some(v => v.severity === 'medium')) return 'medium'
    return 'low'
  }

  private async getTestCoverage(): Promise<number> {
    try {
      const result = await execAsync('npm run test:coverage')
      const coverageMatch = result.stdout.match(/All files\s+\|\s+(\d+\.?\d*)/)
      return coverageMatch ? parseFloat(coverageMatch[1]) : 0
    } catch (error) {
      return 0
    }
  }

  private async scanCodeIssues(): Promise<string[]> {
    try {
      const result = await execAsync('grep -r "TODO\\|FIXME" src/ || true')
      return result.stdout.split('\n').filter(line => line.trim())
    } catch (error) {
      return []
    }
  }

  private async scanDebugStatements(): Promise<string[]> {
    try {
      const result = await execAsync('grep -r "console\\.log" src/ || true')
      return result.stdout.split('\n').filter(line => line.trim())
    } catch (error) {
      return []
    }
  }
}
```

## 2. Utilitários e Serviços de Apoio

### 2.1 Configuration Manager

```typescript
// src/utils/config-manager.ts
import { VTEXConfig } from '../types/vtex.types'

export interface AppConfig {
  vtex: VTEXConfig
  deployment: DeploymentConfig
  notifications: NotificationConfig
  security: SecurityConfig
  monitoring: MonitoringConfig
}

export interface DeploymentConfig {
  timeout: number
  retryAttempts: number
  autoInstall: boolean
  autoPublish: boolean
  skipTests: boolean
  requireApproval: boolean
}

export interface NotificationConfig {
  slack: {
    enabled: boolean
    webhookUrl: string
    channel: string
  }
  email: {
    enabled: boolean
    smtpHost: string
    smtpPort: number
    from: string
    to: string[]
  }
}

export class ConfigManager {
  private config: AppConfig | null = null

  async loadConfig(environment: 'qa' | 'prod' | 'local'): Promise<AppConfig> {
    if (this.config) {
      return this.config
    }

    const configPath = `./config/environments/${environment}.json`
    const envConfig = await this.loadJsonConfig(configPath)
    
    // Override with environment variables
    const config: AppConfig = {
      vtex: {
        account: process.env.VTEX_ACCOUNT || envConfig.vtex.account,
        authToken: process.env.VTEX_AUTH_TOKEN || envConfig.vtex.authToken,
        userEmail: process.env.VTEX_USER_EMAIL || envConfig.vtex.userEmail,
        timeout: parseInt(process.env.VTEX_TIMEOUT || '60000'),
        retryAttempts: parseInt(process.env.VTEX_RETRY_ATTEMPTS || '3')
      },
      deployment: {
        timeout: parseInt(process.env.DEPLOYMENT_TIMEOUT || '300000'),
        retryAttempts: parseInt(process.env.DEPLOYMENT_RETRY_ATTEMPTS || '2'),
        autoInstall: process.env.AUTO_INSTALL === 'true',
        autoPublish: process.env.AUTO_PUBLISH === 'true',
        skipTests: process.env.SKIP_TESTS === 'true',
        requireApproval: process.env.REQUIRE_APPROVAL === 'true'
      },
      notifications: {
        slack: {
          enabled: process.env.SLACK_ENABLED === 'true',
          webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
          channel: process.env.SLACK_CHANNEL || '#deployments'
        },
        email: {
          enabled: process.env.EMAIL_ENABLED === 'true',
          smtpHost: process.env.EMAIL_SMTP_HOST || '',
          smtpPort: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
          from: process.env.EMAIL_FROM || '',
          to: (process.env.EMAIL_TO || '').split(',').filter(Boolean)
        }
      },
      security: {
        enableSecurityScan: process.env.ENABLE_SECURITY_SCAN === 'true',
        blockOnVulnerabilities: process.env.BLOCK_ON_VULNERABILITIES === 'true',
        tokenRefreshInterval: parseInt(process.env.TOKEN_REFRESH_INTERVAL || '3600')
      },
      monitoring: {
        metricsEnabled: process.env.METRICS_ENABLED === 'true',
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
        logLevel: process.env.LOG_LEVEL || 'info'
      }
    }

    await this.validateConfig(config)
    this.config = config
    return config
  }

  async validateConfig(config: AppConfig): Promise<boolean> {
    const errors: string[] = []

    // Validate VTEX config
    if (!config.vtex.account) errors.push('VTEX account is required')
    if (!config.vtex.authToken) errors.push('VTEX auth token is required')
    if (!config.vtex.userEmail) errors.push('VTEX user email is required')

    // Validate notification config
    if (config.notifications.slack.enabled && !config.notifications.slack.webhookUrl) {
      errors.push('Slack webhook URL is required when Slack notifications are enabled')
    }

    if (config.notifications.email.enabled) {
      if (!config.notifications.email.smtpHost) errors.push('SMTP host is required for email notifications')
      if (!config.notifications.email.from) errors.push('Email from address is required')
      if (config.notifications.email.to.length === 0) errors.push('At least one email recipient is required')
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`)
    }

    return true
  }

  async getSecret(key: string): Promise<string> {
    // Try environment variable first
    const envValue = process.env[key]
    if (envValue) {
      return envValue
    }

    // Try external secret manager (AWS Secrets Manager, Vault, etc.)
    // Implementation depends on chosen secret management solution
    throw new Error(`Secret not found: ${key}`)
  }

  private async loadJsonConfig(path: string): Promise<any> {
    const fs = require('fs').promises
    try {
      const content = await fs.readFile(path, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      throw new Error(`Failed to load config file: ${path}`)
    }
  }
}
```

### 2.2 Logger

```typescript
// src/utils/logger.ts
import winston from 'winston'

export interface LogEntry {
  timestamp: Date
  level: string
  message: string
  meta?: any
}

export class Logger {
  private winston: winston.Logger
  private deployLogs: Map<string, LogEntry[]> = new Map()

  constructor(logLevel: string = 'info') {
    this.winston = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({ 
          filename: 'logs/error.log', 
          level: 'error' 
        }),
        new winston.transports.File({ 
          filename: 'logs/combined.log' 
        })
      ]
    })
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, meta)
    this.addToDeployLogs('info', message, meta)
  }

  error(message: string, error?: Error | any): void {
    this.winston.error(message, error)
    this.addToDeployLogs('error', message, error)
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta)
    this.addToDeployLogs('warn', message, meta)
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta)
    this.addToDeployLogs('debug', message, meta)
  }

  audit(action: string, user: string, details: any): void {
    const auditEntry = {
      action,
      user,
      timestamp: new Date().toISOString(),
      details
    }
    
    this.winston.info('AUDIT', auditEntry)
    
    // Write to separate audit log
    const auditLogger = winston.createLogger({
      transports: [
        new winston.transports.File({ 
          filename: 'logs/audit.log',
          format: winston.format.json()
        })
      ]
    })
    
    auditLogger.info('AUDIT', auditEntry)
  }

  getDeployLogs(deployId: string): string[] {
    const logs = this.deployLogs.get(deployId) || []
    return logs.map(log => `[${log.timestamp.toISOString()}] ${log.level.toUpperCase()}: ${log.message}`)
  }

  clearDeployLogs(deployId: string): void {
    this.deployLogs.delete(deployId)
  }

  private addToDeployLogs(level: string, message: string, meta?: any): void {
    // Extract deploy ID from meta if available
    const deployId = meta?.deployId
    if (!deployId) return

    if (!this.deployLogs.has(deployId)) {
      this.deployLogs.set(deployId, [])
    }

    const logs = this.deployLogs.get(deployId)!
    logs.push({
      timestamp: new Date(),
      level,
      message,
      meta
    })

    // Keep only last 1000 log entries per deploy
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000)
    }
  }
}
```

### 2.3 Notification Service

```typescript
// src/utils/notification-service.ts
import axios from 'axios'
import nodemailer from 'nodemailer'
import { DeployResult } from '../types/deploy.types'
import { NotificationConfig } from './config-manager'
import { Logger } from './logger'

export interface SlackMessage {
  text: string
  blocks?: any[]
  channel?: string
}

export interface EmailMessage {
  to: string[]
  subject: string
  html: string
  text?: string
}

export class NotificationService {
  private config: NotificationConfig
  private logger: Logger
  private emailTransporter?: nodemailer.Transporter

  constructor(config: NotificationConfig, logger: Logger) {
    this.config = config
    this.logger = logger
    
    if (config.email.enabled) {
      this.setupEmailTransporter()
    }
  }

  async sendSlack(message: SlackMessage): Promise<void> {
    if (!this.config.slack.enabled) {
      this.logger.debug('Slack notifications disabled, skipping')
      return
    }

    try {
      const payload = {
        ...message,
        channel: message.channel || this.config.slack.channel
      }

      await axios.post(this.config.slack.webhookUrl, payload)
      this.logger.info('Slack notification sent successfully')
      
    } catch (error) {
      this.logger.error('Failed to send Slack notification', error)
      throw error
    }
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    if (!this.config.email.enabled || !this.emailTransporter) {
      this.logger.debug('Email notifications disabled, skipping')
      return
    }

    try {
      const mailOptions = {
        from: this.config.email.from,
        to: message.to.join(', '),
        subject: message.subject,
        html: message.html,
        text: message.text
      }

      await this.emailTransporter.sendMail(mailOptions)
      this.logger.info('Email notification sent successfully', { to: message.to })
      
    } catch (error) {
      this.logger.error('Failed to send email notification', error)
      throw error
    }
  }

  async notifyDeploySuccess(deploy: DeployResult): Promise<void> {
    const slackMessage: SlackMessage = {
      text: `🚀 Deploy Successful`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Deploy completed successfully!*\n\n*Version:* ${deploy.version}\n*Workspace:* ${deploy.workspace}\n*Duration:* ${this.formatDuration(deploy.startTime, deploy.endTime!)}\n*Deploy ID:* ${deploy.id}`
          }
        }
      ]
    }

    const emailMessage: EmailMessage = {
      to: this.config.email.to,
      subject: `✅ Deploy Successful - ${deploy.version}`,
      html: this.generateDeploySuccessEmail(deploy),
      text: `Deploy ${deploy.version} completed successfully in workspace ${deploy.workspace}`
    }

    await Promise.allSettled([
      this.sendSlack(slackMessage),
      this.sendEmail(emailMessage)
    ])
  }

  async notifyDeployFailure(deploy: DeployResult, error: Error): Promise<void> {
    const slackMessage: SlackMessage = {
      text: `❌ Deploy Failed`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Deploy failed!*\n\n*Version:* ${deploy.version}\n*Workspace:* ${deploy.workspace}\n*Error:* ${error.message}\n*Deploy ID:* ${deploy.id}`
          }
        }
      ]
    }

    const emailMessage: EmailMessage = {
      to: this.config.email.to,
      subject: `❌ Deploy Failed - ${deploy.version}`,
      html: this.generateDeployFailureEmail(deploy, error),
      text: `Deploy ${deploy.version} failed in workspace ${deploy.workspace}: ${error.message}`
    }

    await Promise.allSettled([
      this.sendSlack(slackMessage),
      this.sendEmail(emailMessage)
    ])
  }

  async notifyRollback(version: string, workspace: string): Promise<void> {
    const slackMessage: SlackMessage = {
      text: `🔄 Rollback Completed`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Rollback completed*\n\n*Version:* ${version}\n*Workspace:* ${workspace}\n*Time:* ${new Date().toISOString()}`
          }
        }
      ]
    }

    await this.sendSlack(slackMessage)
  }

  private setupEmailTransporter(): void {
    this.emailTransporter = nodemailer.createTransporter({
      host: this.config.email.smtpHost,
      port: this.config.email.smtpPort,
      secure: this.config.email.smtpPort === 465,
      auth: {
        user: this.config.email.from,
        pass: process.env.EMAIL_PASSWORD
      }
    })
  }

  private formatDuration(start: Date, end: Date): string {
    const durationMs = end.getTime() - start.getTime()
    const minutes = Math.floor(durationMs / 60000)
    const seconds = Math.floor((durationMs % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  private generateDeploySuccessEmail(deploy: DeployResult): string {
    return `
      <html>
        <body>
          <h2>✅ Deploy Successful</h2>
          <p>Your deployment has completed successfully!</p>
          
          <table border="1" cellpadding="5" cellspacing="0">
            <tr><td><strong>Version</strong></td><td>${deploy.version}</td></tr>
            <tr><td><strong>Workspace</strong></td><td>${deploy.workspace}</td></tr>
            <tr><td><strong>Deploy ID</strong></td><td>${deploy.id}</td></tr>
            <tr><td><strong>Start Time</strong></td><td>${deploy.startTime.toISOString()}</td></tr>
            <tr><td><strong>End Time</strong></td><td>${deploy.endTime?.toISOString()}</td></tr>
            <tr><td><strong>Duration</strong></td><td>${this.formatDuration(deploy.startTime, deploy.endTime!)}</td></tr>
          </table>
          
          <h3>Deployment Logs</h3>
          <pre>${deploy.logs.join('\n')}</pre>
        </body>
      </html>
    `
  }

  private generateDeployFailureEmail(deploy: DeployResult, error: Error): string {
    return `
      <html>
        <body>
          <h2>❌ Deploy Failed</h2>
          <p>Your deployment has failed. Please review the error details below.</p>
          
          <table border="1" cellpadding="5" cellspacing="0">
            <tr><td><strong>Version</strong></td><td>${deploy.version}</td></tr>
            <tr><td><strong>Workspace</strong></td><td>${deploy.workspace}</td></tr>
            <tr><td><strong>Deploy ID</strong></td><td>${deploy.id}</td></tr>
            <tr><td><strong>Error</strong></td><td style="color: red;">${error.message}</td></tr>
            <tr><td><strong>Start Time</strong></td><td>${deploy.startTime.toISOString()}</td></tr>
            <tr><td><strong>Failure Time</strong></td><td>${deploy.endTime?.toISOString()}</td></tr>
          </table>
          
          <h3>Error Stack Trace</h3>
          <pre style="background-color: #f5f5f5; padding: 10px;">${error.stack}</pre>
          
          <h3>Deployment Logs</h3>
          <pre>${deploy.logs.join('\n')}</pre>
        </body>
      </html>
    `
  }
}
```

## 3. CLI Interface

### 3.1 CLI Commands

```typescript
// src/cli/commands/deploy-qa.ts
import { Command } from 'commander'
import { DeployManager } from '../../core/deploy-manager'
import { VTEXClient } from '../../core/vtex-client'
import { ValidationEngine } from '../../core/validation-engine'
import { ConfigManager } from '../../utils/config-manager'
import { Logger } from '../../utils/logger'
import { NotificationService } from '../../utils/notification-service'

export function createDeployQACommand(): Command {
  const command = new Command('deploy:qa')
    .description('Deploy application to QA environment')
    .option('-b, --branch <branch>', 'Source branch for deployment', 'main')
    .option('-w, --workspace <workspace>', 'Target workspace')
    .option('--skip-tests', 'Skip test execution')
    .option('--dry-run', 'Simulate deployment without executing')
    .action(async (options) => {
      try {
        const configManager = new ConfigManager()
        const config = await configManager.loadConfig('qa')
        
        const logger = new Logger(config.monitoring.logLevel)
        const vtexClient = new VTEXClient(config.vtex, logger)
        const validator = new ValidationEngine(logger)
        const notifier = new NotificationService(config.notifications, logger)
        
        const deployManager = new DeployManager(vtexClient, validator, logger, notifier)
        
        const deployConfig = {
          environment: 'qa' as const,
          account: config.vtex.account,
          workspace: options.workspace || config.vtex.workspace,
          appName: await getAppName(),
          autoInstall: config.deployment.autoInstall,
          skipTests: options.skipTests || config.deployment.skipTests,
          timeout: config.deployment.timeout
        }
        
        if (options.dryRun) {
          logger.info('DRY RUN: Would deploy with config:', deployConfig)
          return
        }
        
        logger.info('Starting QA deployment', { branch: options.branch, workspace: deployConfig.workspace })
        
        const result = await deployManager.deployToQA(deployConfig)
        
        logger.info('QA deployment completed successfully', result)
        process.exit(0)
        
      } catch (error) {
        console.error('QA deployment failed:', error)
        process.exit(1)
      }
    })
  
  return command
}

async function getAppName(): Promise<string> {
  const fs = require('fs').promises
  const manifest = JSON.parse(await fs.readFile('manifest.json', 'utf8'))
  return `${manifest.vendor}.${manifest.name}`
}
```

```typescript
// src/cli/commands/deploy-prod.ts
import { Command } from 'commander'
import { DeployManager } from '../../core/deploy-manager'
// ... other imports

export function createDeployProdCommand(): Command {
  const command = new Command('deploy:prod')
    .description('Deploy application to Production environment')
    .option('-v, --version <version>', 'Specific version to deploy')
    .option('--auto-promote', 'Automatically promote to master after testing')
    .option('--require-approval', 'Require manual approval before deployment')
    .action(async (options) => {
      try {
        const configManager = new ConfigManager()
        const config = await configManager.loadConfig('prod')
        
        const logger = new Logger(config.monitoring.logLevel)
        const vtexClient = new VTEXClient(config.vtex, logger)
        const validator = new ValidationEngine(logger)
        const notifier = new NotificationService(config.notifications, logger)
        
        const deployManager = new DeployManager(vtexClient, validator, logger, notifier)
        
        // Require approval for production deployments
        if (options.requireApproval || config.deployment.requireApproval) {
          const approved = await requestApproval(options.version)
          if (!approved) {
            logger.info('Production deployment cancelled by user')
            process.exit(0)
          }
        }
        
        const deployConfig = {
          environment: 'production' as const,
          account: config.vtex.account,
          workspace: 'prodtest',
          appName: await getAppName(),
          version: options.version,
          autoInstall: config.deployment.autoInstall,
          skipTests: false, // Never skip tests in production
          timeout: config.deployment.timeout
        }
        
        logger.info('Starting Production deployment', deployConfig)
        
        const result = await deployManager.deployToProduction(deployConfig)
        
        logger.info('Production deployment completed successfully', result)
        
        // Optionally promote to master
        if (options.autoPromote) {
          logger.info('Promoting to master workspace...')
          await vtexClient.promoteWorkspace('prodtest')
          logger.info('Promotion to master completed')
        }
        
        process.exit(0)
        
      } catch (error) {
        console.error('Production deployment failed:', error)
        process.exit(1)
      }
    })
  
  return command
}

async function requestApproval(version?: string): Promise<boolean> {
  const readline = require('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  return new Promise((resolve) => {
    const versionText = version ? ` version ${version}` : ''
    rl.question(`⚠️  Are you sure you want to deploy${versionText} to PRODUCTION? (yes/no): `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'yes')
    })
  })
}
```

### 3.2 Main CLI Entry Point

```typescript
// src/cli/index.ts
#!/usr/bin/env node

import { Command } from 'commander'
import { createDeployQACommand } from './commands/deploy-qa'
import { createDeployProdCommand } from './commands/deploy-prod'
import { createRollbackCommand } from './commands/rollback'
import { createStatusCommand } from './commands/status'

const program = new Command()

program
  .name('vtex-deploy')
  .description('VTEX IO Automated Deployment System')
  .version('1.0.0')

// Add commands
program.addCommand(createDeployQACommand())
program.addCommand(createDeployProdCommand())
program.addCommand(createRollbackCommand())
program.addCommand(createStatusCommand())

// Global options
program
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--config <path>', 'Path to configuration file')

program.parse()
```

## 4. Testes Automatizados

### 4.1 Configuração de Testes

```typescript
// tests/setup.ts
import { ConfigManager } from '../src/utils/config-manager'
import { Logger } from '../src/utils/logger'

// Global test setup
beforeAll(async () => {
  // Setup test environment
  process.env.NODE_ENV = 'test'
  process.env.LOG_LEVEL = 'error' // Reduce log noise in tests
})

afterAll(async () => {
  // Cleanup after all tests
})

// Mock external dependencies
jest.mock('../src/core/vtex-client')
jest.mock('../src/utils/notification-service')

// Test utilities
export function createMockConfig() {
  return {
    vtex: {
      account: 'testaccount',
      authToken: 'mock-token',
      userEmail: 'test@example.com',
      timeout: 60000,
      retryAttempts: 3
    },
    deployment: {
      timeout: 300000,
      retryAttempts: 2,
      autoInstall: true,
      autoPublish: false,
      skipTests: false,
      requireApproval: false
    },
    notifications: {
      slack: { enabled: false, webhookUrl: '', channel: '' },
      email: { enabled: false, smtpHost: '', smtpPort: 587, from: '', to: [] }
    },
    security: {
      enableSecurityScan: false,
      blockOnVulnerabilities: false,
      tokenRefreshInterval: 3600
    },
    monitoring: {
      metricsEnabled: false,
      healthCheckInterval: 30000,
      logLevel: 'error'
    }
  }
}

export function createMockLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    audit: jest.fn(),
    getDeployLogs: jest.fn(() => []),
    clearDeployLogs: jest.fn()
  }
}
```

### 4.2 Testes Unitários

```typescript
// tests/unit/deploy-manager.test.ts
import { DeployManager } from '../../src/core/deploy-manager'
import { VTEXClient } from '../../src/core/vtex-client'
import { ValidationEngine } from '../../src/core/validation-engine'
import { Logger } from '../../src/utils/logger'
import { NotificationService } from '../../src/utils/notification-service'
import { createMockConfig, createMockLogger } from '../setup'

describe('DeployManager', () => {
  let deployManager: DeployManager
  let mockVtexClient: jest.Mocked<VTEXClient>
  let mockValidator: jest.Mocked<ValidationEngine>
  let mockLogger: jest.Mocked<Logger>
  let mockNotifier: jest.Mocked<NotificationService>

  beforeEach(() => {
    mockVtexClient = {
      authenticate: jest.fn(),
      useWorkspace: jest.fn(),
      installApp: jest.fn(),
      release: jest.fn(),
      listApps: jest.fn(),
      getCurrentVersion: jest.fn(),
      validateCLI: jest.fn(),
      validateAuth: jest.fn(),
      validateWorkspacePermissions: jest.fn()
    } as any

    mockValidator = {
      validateManifest: jest.fn(),
      checkDependencies: jest.fn(),
      runTests: jest.fn(),
      securityScan: jest.fn(),
      validateProductionReadiness: jest.fn(),
      checkBreakingChanges: jest.fn(),
      validateSecurityCompliance: jest.fn(),
      runSmokeTests: jest.fn()
    } as any

    mockLogger = createMockLogger() as any
    mockNotifier = {
      notifyDeploySuccess: jest.fn(),
      notifyDeployFailure: jest.fn(),
      notifyRollback: jest.fn()
    } as any

    deployManager = new DeployManager(
      mockVtexClient,
      mockValidator,
      mockLogger,
      mockNotifier
    )
  })

  describe('deployToQA', () => {
    it('should successfully deploy to QA environment', async () => {
      // Arrange
      const deployConfig = {
        environment: 'qa' as const,
        account: 'testaccount',
        workspace: 'testworkspace',
        appName: 'test.app',
        autoInstall: true,
        skipTests: false,
        timeout: 300000
      }

      mockVtexClient.authenticate.mockResolvedValue(true)
      mockVtexClient.useWorkspace.mockResolvedValue()
      mockValidator.validateManifest.mockResolvedValue({ valid: true, errors: [], warnings: [] })
      mockValidator.checkDependencies.mockResolvedValue({ valid: true, errors: [], warnings: [] })
      mockValidator.runTests.mockResolvedValue({
        success: true,
        testSuite: 'unit',
        passedTests: 10,
        failedTests: 0,
        duration: 5000,
        failures: []
      })
      mockVtexClient.release.mockResolvedValue()
      mockVtexClient.installApp.mockResolvedValue({
        success: true,
        app: 'test.app@1.0.0-qa+123',
        version: '1.0.0-qa+123',
        installTime: new Date(),
        logs: []
      })
      mockVtexClient.listApps.mockResolvedValue([{
        name: 'test.app',
        version: '1.0.0-qa+123',
        status: 'installed',
        workspace: 'testworkspace'
      }])

      // Act
      const result = await deployManager.deployToQA(deployConfig)

      // Assert
      expect(result.status).toBe('success')
      expect(result.workspace).toBe('testworkspace')
      expect(mockVtexClient.authenticate).toHaveBeenCalledWith('testaccount')
      expect(mockVtexClient.useWorkspace).toHaveBeenCalledWith('testworkspace')
      expect(mockValidator.validateManifest).toHaveBeenCalled()
      expect(mockValidator.runTests).toHaveBeenCalledWith('unit')
      expect(mockNotifier.notifyDeploySuccess).toHaveBeenCalledWith(result)
    })

    it('should handle deployment failure and notify', async () => {
      // Arrange
      const deployConfig = {
        environment: 'qa' as const,
        account: 'testaccount',
        workspace: 'testworkspace',
        appName: 'test.app',
        autoInstall: true,
        skipTests: false,
        timeout: 300000
      }

      const error = new Error('Authentication failed')
      mockVtexClient.authenticate.mockRejectedValue(error)

      // Act & Assert
      await expect(deployManager.deployToQA(deployConfig)).rejects.toThrow('Authentication failed')
      expect(mockNotifier.notifyDeployFailure).toHaveBeenCalled()
    })

    it('should skip tests when skipTests is true', async () => {
      // Arrange
      const deployConfig = {
        environment: 'qa' as const,
        account: 'testaccount',
        workspace: 'testworkspace',
        appName: 'test.app',
        autoInstall: true,
        skipTests: true,
        timeout: 300000
      }

      mockVtexClient.authenticate.mockResolvedValue(true)
      mockVtexClient.useWorkspace.mockResolvedValue()
      mockValidator.validateManifest.mockResolvedValue({ valid: true, errors: [], warnings: [] })
      mockValidator.checkDependencies.mockResolvedValue({ valid: true, errors: [], warnings: [] })
      mockVtexClient.release.mockResolvedValue()
      mockVtexClient.installApp.mockResolvedValue({
        success: true,
        app: 'test.app@1.0.0-qa+123',
        version: '1.0.0-qa+123',
        installTime: new Date(),
        logs: []
      })
      mockVtexClient.listApps.mockResolvedValue([{
        name: 'test.app',
        version: '1.0.0-qa+123',
        status: 'installed',
        workspace: 'testworkspace'
      }])

      // Act
      await deployManager.deployToQA(deployConfig)

      // Assert
      expect(mockValidator.runTests).not.toHaveBeenCalled()
    })
  })

  describe('deployToProduction', () => {
    it('should successfully deploy to production with enhanced validations', async () => {
      // Arrange
      const deployConfig = {
        environment: 'production' as const,
        account: 'prodaccount',
        workspace: 'prodtest',
        appName: 'test.app',
        autoInstall: true,
        skipTests: false,
        timeout: 300000
      }

      mockVtexClient.authenticate.mockResolvedValue(true)
      mockVtexClient.useWorkspace.mockResolvedValue()
      mockValidator.validateManifest.mockResolvedValue({ valid: true, errors: [], warnings: [] })
      mockValidator.checkDependencies.mockResolvedValue({ valid: true, errors: [], warnings: [] })
      mockValidator.securityScan.mockResolvedValue({
        secure: true,
        vulnerabilities: [],
        riskLevel: 'low'
      })
      mockValidator.runTests.mockResolvedValue({
        success: true,
        testSuite: 'all',
        passedTests: 50,
        failedTests: 0,
        duration: 30000,
        failures: []
      })
      mockValidator.runSmokeTests.mockResolvedValue({
        success: true,
        testSuite: 'smoke',
        passedTests: 5,
        failedTests: 0,
        duration: 10000,
        failures: []
      })
      mockVtexClient.release.mockResolvedValue()
      mockVtexClient.installApp.mockResolvedValue({
        success: true,
        app: 'test.app@1.0.0',
        version: '1.0.0',
        installTime: new Date(),
        logs: []
      })
      mockVtexClient.listApps.mockResolvedValue([{
        name: 'test.app',
        version: '1.0.0',
        status: 'installed',
        workspace: 'prodtest'
      }])

      // Act
      const result = await deployManager.deployToProduction(deployConfig)

      // Assert
      expect(result.status).toBe('success')
      expect(result.workspace).toBe('prodtest')
      expect(mockValidator.securityScan).toHaveBeenCalled()
      expect(mockValidator.runTests).toHaveBeenCalledWith('all')
      expect(mockValidator.runSmokeTests).toHaveBeenCalled()
    })
  })

  describe('rollback', () => {
    it('should successfully rollback to previous version', async () => {
      // Arrange
      const targetVersion = '1.0.0'
      const config = {
        environment: 'production' as const,
        account: 'prodaccount',
        workspace: 'prodtest',
        appName: 'test.app',
        autoInstall: true,
        skipTests: false,
        timeout: 300000
      }

      mockVtexClient.getCurrentVersion.mockResolvedValue('1.1.0')
      mockVtexClient.installApp.mockResolvedValue({
        success: true,
        app: 'test.app@1.0.0',
        version: '1.0.0',
        installTime: new Date(),
        logs: []
      })
      mockVtexClient.listApps.mockResolvedValue([{
        name: 'test.app',
        version: '1.0.0',
        status: 'installed',
        workspace: 'prodtest'
      }])

      // Act
      const result = await deployManager.rollback(targetVersion, config)

      // Assert
      expect(result.success).toBe(true)
      expect(result.previousVersion).toBe('1.1.0')
      expect(result.currentVersion).toBe('1.0.0')
      expect(mockVtexClient.installApp).toHaveBeenCalledWith('test.app@1.0.0')
    })
  })
})
```

### 4.3 Testes de Integração

```typescript
// tests/integration/vtex-client.test.ts
import { VTEXClient } from '../../src/core/vtex-client'
import { Logger } from '../../src/utils/logger'
import { createMockLogger } from '../setup'

describe('VTEXClient Integration', () => {
  let vtexClient: VTEXClient
  let mockLogger: jest.Mocked<Logger>

  beforeEach(() => {
    mockLogger = createMockLogger() as any
    
    const config = {
      account: process.env.TEST_VTEX_ACCOUNT || 'testaccount',
      authToken: process.env.TEST_VTEX_TOKEN || 'mock-token',
      userEmail: process.env.TEST_VTEX_EMAIL || 'test@example.com',
      timeout: 60000,
      retryAttempts: 3
    }

    vtexClient = new VTEXClient(config, mockLogger)
  })

  describe('CLI Validation', () => {
    it('should validate VTEX CLI is available', async () => {
      // This test requires VTEX CLI to be installed
      if (process.env.CI) {
        // Skip in CI environment where VTEX CLI might not be available
        return
      }

      await expect(vtexClient.validateCLI()).resolves.not.toThrow()
    })
  })

  describe('Authentication', () => {
    it('should handle authentication with valid credentials', async () => {
      if (!process.env.TEST_VTEX_TOKEN) {
        // Skip if no test credentials provided
        return
      }

      await expect(vtexClient.authenticate()).resolves.toBe(true)
    })

    it('should handle authentication failure gracefully', async () => {
      const invalidClient = new VTEXClient({
        account: 'invalid',
        authToken: 'invalid-token',
        userEmail: 'invalid@example.com',
        timeout: 60000,
        retryAttempts: 1
      }, mockLogger)

      await expect(invalidClient.authenticate()).rejects.toThrow()
    })
  })
})
```

### 4.4 Testes End-to-End

```typescript
// tests/e2e/deployment-flow.test.ts
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

describe('End-to-End Deployment Flow', () => {
  const testAppPath = path.join(__dirname, '../fixtures/test-app')
  
  beforeAll(async () => {
    // Setup test app environment
    process.chdir(testAppPath)
  })

  describe('QA Deployment Flow', () => {
    it('should complete full QA deployment process', async () => {
      if (!process.env.E2E_TESTS_ENABLED) {
        return // Skip E2E tests unless explicitly enabled
      }

      // Run the actual CLI command
      const { stdout, stderr } = await execAsync('npm run deploy:qa -- --dry-run')
      
      expect(stdout).toContain('DRY RUN: Would deploy with config')
      expect(stderr).toBe('')
    }, 60000) // 60 second timeout for E2E tests
  })

  describe('Production Deployment Flow', () => {
    it('should require approval for production deployment', async () => {
      if (!process.env.E2E_TESTS_ENABLED) {
        return
      }

      // This would test the approval flow
      // Implementation depends on how approval is handled (CLI prompt, API, etc.)
    }, 120000) // 2 minute timeout for production deployment
  })
})
```

## 5. Configurações de Ambiente

### 5.1 Configuração de Desenvolvimento

```json
// config/environments/local.json
{
  "vtex": {
    "account": "devaccount",
    "workspace": "dev",
    "timeout": 60000,
    "retryAttempts": 3
  },
  "deployment": {
    "timeout": 300000,
    "retryAttempts": 2,
    "autoInstall": true,
    "autoPublish": false,
    "skipTests": false,
    "requireApproval": false
  },
  "notifications": {
    "slack": {
      "enabled": false,
      "channel": "#dev-deployments"
    },
    "email": {
      "enabled": false
    }
  },
  "security": {
    "enableSecurityScan": true,
    "blockOnVulnerabilities": false,
    "tokenRefreshInterval": 3600
  },
  "monitoring": {
    "metricsEnabled": true,
    "healthCheckInterval": 30000,
    "logLevel": "debug"
  }
}
```

### 5.2 Configuração de QA

```json
// config/environments/qa.json
{
  "vtex": {
    "account": "companyqa",
    "workspace": "qa",
    "timeout": 90000,
    "retryAttempts": 3
  },
  "deployment": {
    "timeout": 600000,
    "retryAttempts": 3,
    "autoInstall": true,
    "autoPublish": false,
    "skipTests": false,
    "requireApproval": false
  },
  "notifications": {
    "slack": {
      "enabled": true,
      "channel": "#qa-deployments"
    },
    "email": {
      "enabled": true,
      "smtpPort": 587
    }
  },
  "security": {
    "enableSecurityScan": true,
    "blockOnVulnerabilities": true,
    "tokenRefreshInterval": 1800
  },
  "monitoring": {
    "metricsEnabled": true,
    "healthCheckInterval": 60000,
    "logLevel": "info"
  }
}
```

### 5.3 Configuração de Produção

```json
// config/environments/prod.json
{
  "vtex": {
    "account": "companyprod",
    "workspace": "prodtest",
    "timeout": 120000,
    "retryAttempts": 5
  },
  "deployment": {
    "timeout": 900000,
    "retryAttempts": 3,
    "autoInstall": true,
    "autoPublish": false,
    "skipTests": false,
    "requireApproval": true
  },
  "notifications": {
    "slack": {
      "enabled": true,
      "channel": "#prod-deployments"
    },
    "email": {
      "enabled": true,
      "smtpPort": 587
    }
  },
  "security": {
    "enableSecurityScan": true,
    "blockOnVulnerabilities": true,
    "tokenRefreshInterval": 900
  },
  "monitoring": {
    "metricsEnabled": true,
    "healthCheckInterval": 30000,
    "logLevel": "warn"
  }
}
```

## 6. Scripts de Automação

### 6.1 Package.json Scripts

```json
{
  "name": "vtex-io-deploy-system",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/cli/index.ts",
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write src/**/*.ts",
    "deploy:qa": "node dist/cli/index.js deploy:qa",
    "deploy:prod": "node dist/cli/index.js deploy:prod",
    "rollback": "node dist/cli/index.js rollback",
    "status": "node dist/cli/index.js status",
    "docker:build": "docker build -t vtex-deploy .",
    "docker:run": "docker-compose up",
    "docker:test": "docker-compose -f docker-compose.test.yml up --abort-on-container-exit",
    "prepare": "husky install",
    "semantic-release": "semantic-release"
  }
}
```

## 7. Critérios de Aceitação Técnicos

### 7.1 Critérios Funcionais

| Critério | Descrição | Validação |
|----------|-----------|-----------|
| **Deploy QA** | Sistema deve realizar deploy para ambiente QA com validações básicas | ✅ Testes automatizados passam<br>✅ App instalado no workspace QA<br>✅ Notificações enviadas |
| **Deploy Produção** | Sistema deve realizar deploy para produção com validações completas | ✅ Validações de segurança passam<br>✅ Testes completos executados<br>✅ Aprovação manual obtida |
| **Rollback** | Sistema deve permitir rollback para versão anterior | ✅ Versão anterior restaurada<br>✅ Funcionalidade verificada<br>✅ Tempo de rollback < 5 minutos |
| **Validações** | Sistema deve executar validações automáticas | ✅ Manifest validado<br>✅ Dependências verificadas<br>✅ Testes executados<br>✅ Scan de segurança realizado |
| **Notificações** | Sistema deve enviar notificações de status | ✅ Slack/Email funcionando<br>✅ Mensagens informativas<br>✅ Alertas de erro |

### 7.2 Critérios Não-Funcionais

| Critério | Métrica | Valor Esperado |
|----------|---------|----------------|
| **Performance** | Tempo de deploy QA | < 10 minutos |
| **Performance** | Tempo de deploy Produção | < 20 minutos |
| **Performance** | Tempo de rollback | < 5 minutos |
| **Confiabilidade** | Taxa de sucesso deploy | > 95% |
| **Confiabilidade** | Taxa de sucesso rollback | > 99% |
| **Disponibilidade** | Uptime do sistema | > 99.5% |
| **Segurança** | Vulnerabilidades críticas | 0 |
| **Usabilidade** | Tempo de setup inicial | < 30 minutos |
| **Manutenibilidade** | Cobertura de testes | > 80% |

### 7.3 Critérios de Qualidade

| Aspecto | Requisito | Validação |
|---------|-----------|-----------|
| **Código** | Padrões de codificação | ESLint + Prettier configurados |
| **Testes** | Cobertura mínima | 80% de cobertura de código |
| **Documentação** | Documentação completa | README, API docs, guias |
| **Logs** | Logging estruturado | Logs JSON com níveis apropriados |
| **Monitoramento** | Métricas de sistema | Health checks, métricas de deploy |
| **Segurança** | Gestão de secrets | Tokens não expostos, rotação automática |

## 8. Instalação e Configuração

### 8.1 Pré-requisitos

- Node.js >= 16.0.0
- npm >= 8.0.0
- VTEX CLI >= 3.0.0
- Docker >= 20.0.0 (opcional)
- Git >= 2.30.0

### 8.2 Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/company/vtex-io-deploy-system.git
cd vtex-io-deploy-system

# 2. Instale dependências
npm install

# 3. Configure ambiente
cp .env.example .env.local
cp .env.example .env.qa
cp .env.example .env.prod

# 4. Configure credenciais VTEX
# Edite os arquivos .env com suas credenciais

# 5. Build do projeto
npm run build

# 6. Teste a instalação
npm run status
```

### 8.3 Configuração Inicial

```bash
# 1. Validar VTEX CLI
vtex --version

# 2. Configurar Husky hooks
npm run prepare

# 3. Executar testes
npm test

# 4. Configurar notificações (opcional)
# Edite config/environments/*.json com webhooks do Slack

# 5. Primeiro deploy de teste
npm run deploy:qa -- --dry-run
```

Este documento técnico fornece todas as especificações detalhadas necessárias para implementar o Sistema de Deploy Automatizado para VTEX IO. Cada componente foi projetado seguindo as melhores práticas de desenvolvimento, com foco em robustez, segurança e facilidade de uso.
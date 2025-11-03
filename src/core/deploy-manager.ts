import { VTEXClient } from './vtex-client'
import { ValidationEngine } from './validation-engine'
import { GitOperations } from './git-operations'
import { Logger } from '../utils/logger'
import { NotificationService } from '../utils/notification-service'
import { ConfigManager } from './config-manager'
import { 
  DeployConfig, 
  DeployResult, 
  RollbackResult, 
  DeployStatus,
  Environment 
} from '../types/deploy.types'
import { v4 as uuidv4 } from 'uuid'
import * as semver from 'semver'

export class DeployManager {
  private vtexClient: VTEXClient
  private validator: ValidationEngine
  private gitOps: GitOperations
  private logger: Logger
  private notifier: NotificationService
  private configManager: ConfigManager
  private activeDeployments: Map<string, DeployResult> = new Map()

  constructor(
    vtexClient: VTEXClient,
    validator: ValidationEngine,
    gitOps: GitOperations,
    logger: Logger,
    notifier: NotificationService,
    configManager: ConfigManager
  ) {
    this.vtexClient = vtexClient
    this.validator = validator
    this.gitOps = gitOps
    this.logger = logger
    this.notifier = notifier
    this.configManager = configManager
  }

  /**
   * Deploy to QA environment
   */
  async deployToQA(branch: string = 'develop'): Promise<DeployResult> {
    const deployId = this.generateDeployId()
    const startTime = new Date()
    
    try {
      this.logger.info('Starting QA deployment', { deployId, branch })
      
      const config = await this.configManager.getVTEXConfig('qa')
      const deployConfig: DeployConfig = {
        environment: 'qa',
        account: config.account,
        workspace: config.workspace,
        appName: await this.getAppName(),
        autoInstall: true,
        skipTests: false,
        timeout: 600000 // 10 minutes
      }

      // Initialize deployment tracking
      const deployment: DeployResult = {
        id: deployId,
        status: 'in_progress',
        version: 'pending',
        workspace: deployConfig.workspace,
        startTime,
        logs: [],
        environment: 'qa'
      }
      this.activeDeployments.set(deployId, deployment)

      // 1. Validate prerequisites
      await this.validatePrerequisites(deployConfig)
      this.addLog(deployId, 'Prerequisites validated successfully')

      // 2. Authenticate with VTEX
      await this.vtexClient.authenticate(config.authToken)
      this.addLog(deployId, `Authenticated with VTEX account: ${config.account}`)

      // 3. Switch to QA workspace
      await this.vtexClient.useWorkspace(config.workspace)
      this.addLog(deployId, `Switched to workspace: ${config.workspace}`)

      // 4. Validate manifest and dependencies
      await this.validator.validateManifest()
      await this.validator.checkDependencies()
      this.addLog(deployId, 'Manifest and dependencies validated')

      // 5. Run tests
      if (!deployConfig.skipTests) {
        await this.validator.runTests('unit')
        this.addLog(deployId, 'Unit tests passed')
      }

      // 6. Generate QA version
      const version = await this.generateQAVersion()
      deployment.version = version
      this.addLog(deployId, `Generated QA version: ${version}`)

      // 7. Create release
      await this.vtexClient.release(version, 'beta')
      this.addLog(deployId, `Created beta release: ${version}`)

      // 8. Install app
      if (deployConfig.autoInstall) {
        await this.vtexClient.installApp(`${deployConfig.appName}@${version}`)
        this.addLog(deployId, `Installed app: ${deployConfig.appName}@${version}`)
      }

      // 9. Verify installation
      await this.verifyInstallation(deployConfig.appName, version)
      this.addLog(deployId, 'Installation verified successfully')

      // Update deployment result
      deployment.status = 'success'
      deployment.endTime = new Date()
      this.activeDeployments.set(deployId, deployment)

      await this.notifier.sendDeploymentNotification(deployment)
      this.logger.info('QA deployment completed successfully', { deployId, version })

      return deployment

    } catch (error) {
      const deployment = this.activeDeployments.get(deployId)!
      deployment.status = 'failed'
      deployment.endTime = new Date()
      deployment.error = error as Error
      this.addLog(deployId, `Deployment failed: ${(error as Error).message}`)

      await this.notifier.sendDeploymentNotification(deployment)
      this.logger.error('QA deployment failed', error as Error)
      
      throw error
    }
  }

  /**
   * Deploy to Production environment
   */
  async deployToProduction(version: string): Promise<DeployResult> {
    const deployId = this.generateDeployId()
    const startTime = new Date()
    
    try {
      this.logger.info('Starting Production deployment', { deployId, version })
      
      const config = await this.configManager.getVTEXConfig('production')
      const deployConfig: DeployConfig = {
        environment: 'production',
        account: config.account,
        workspace: 'prodtest',
        appName: await this.getAppName(),
        version,
        autoInstall: true,
        skipTests: false,
        timeout: 1200000 // 20 minutes
      }

      // Initialize deployment tracking
      const deployment: DeployResult = {
        id: deployId,
        status: 'in_progress',
        version,
        workspace: deployConfig.workspace,
        startTime,
        logs: [],
        environment: 'production'
      }
      this.activeDeployments.set(deployId, deployment)

      // 1. Validate production prerequisites
      await this.validateProductionPrerequisites(deployConfig)
      this.addLog(deployId, 'Production prerequisites validated')

      // 2. Authenticate with production account
      await this.vtexClient.authenticate(config.authToken)
      this.addLog(deployId, `Authenticated with production account: ${config.account}`)

      // 3. Switch to prodtest workspace
      await this.vtexClient.useWorkspace('prodtest')
      this.addLog(deployId, 'Switched to prodtest workspace')

      // 4. Enhanced validations for production
      await this.validator.validateManifest()
      await this.validator.checkDependencies()
      await this.validator.securityScan()
      this.addLog(deployId, 'Enhanced production validations completed')

      // 5. Run full test suite
      await this.validator.runTests('all')
      this.addLog(deployId, 'Full test suite passed')

      // 6. Create stable release
      const stableVersion = await this.generateProductionVersion(version)
      await this.vtexClient.release(stableVersion, 'stable')
      deployment.version = stableVersion
      this.addLog(deployId, `Created stable release: ${stableVersion}`)

      // 7. Install in prodtest workspace
      await this.vtexClient.installApp(`${deployConfig.appName}@${stableVersion}`)
      this.addLog(deployId, `Installed in prodtest: ${deployConfig.appName}@${stableVersion}`)

      // 8. Run smoke tests
      await this.validator.runSmokeTests()
      this.addLog(deployId, 'Smoke tests passed')

      // 9. Verify installation
      await this.verifyInstallation(deployConfig.appName, stableVersion)
      this.addLog(deployId, 'Production installation verified')

      // Update deployment result
      deployment.status = 'success'
      deployment.endTime = new Date()
      this.activeDeployments.set(deployId, deployment)

      await this.notifier.sendDeploymentNotification(deployment)
      this.logger.info('Production deployment completed successfully', { deployId, version: stableVersion })

      return deployment

    } catch (error) {
      const deployment = this.activeDeployments.get(deployId)!
      deployment.status = 'failed'
      deployment.endTime = new Date()
      deployment.error = error as Error
      this.addLog(deployId, `Production deployment failed: ${(error as Error).message}`)

      // Auto-rollback on production failure
      try {
        const deployment = this.activeDeployments.get(deployId)
        if (deployment) {
          const appName = await this.getAppName()
          const vtexConfig = await this.configManager.getVTEXConfig('production')
          await this.autoRollback({
            environment: 'production',
            account: vtexConfig.account,
            workspace: deployment.workspace,
            appName: appName,
            autoInstall: true,
            skipTests: false,
            timeout: 600000
          })
        }
        this.addLog(deployId, 'Auto-rollback completed')
      } catch (rollbackError) {
        this.addLog(deployId, `Auto-rollback failed: ${(rollbackError as Error).message}`)
      }

      await this.notifier.sendDeploymentNotification(deployment)
      this.logger.error('Production deployment failed', error as Error)
      
      throw error
    }
  }

  /**
   * Rollback to previous version
   */
  async rollback(targetVersion: string, environment: Environment = 'qa'): Promise<RollbackResult> {
    const startTime = new Date()
    const rollbackId = this.generateDeployId()
    
    try {
      this.logger.info('Starting rollback', { targetVersion, environment })
      
      const config = await this.configManager.getVTEXConfig(environment)
      const appName = await this.getAppName()

      // Authenticate and switch workspace
      await this.vtexClient.authenticate(config.authToken)
      await this.vtexClient.useWorkspace(config.workspace)

      // Get current version
      const currentVersion = await this.vtexClient.getCurrentVersion(appName)
      
      // Validate target version exists
      await this.validateRollbackVersion(targetVersion)

      // Backup current version
      await this.createVersionBackup(currentVersion, environment)

      // Install target version
      await this.vtexClient.installApp(`${appName}@${targetVersion}`)

      // Verify rollback
      await this.verifyInstallation(appName, targetVersion)

      const endTime = new Date()
      const result: RollbackResult = {
        success: true,
        previousVersion: currentVersion,
        currentVersion: targetVersion,
        rollbackTime: endTime,
        duration: endTime.getTime() - startTime.getTime(),
        affectedWorkspaces: [config.workspace],
        environment,
        logs: [`Rollback from ${currentVersion} to ${targetVersion}`]
      }

      await this.notifier.sendRollbackNotification({
        success: true,
        previousVersion: result.previousVersion,
        currentVersion: result.currentVersion,
        environment: environment === 'qa' ? 'qa' : 'production',
        rollbackTime: new Date(),
        duration: result.duration,
        affectedWorkspaces: [config.workspace],
        logs: result.logs
      })
      this.logger.info('Rollback completed successfully', {
        success: result.success,
        previousVersion: result.previousVersion,
        currentVersion: result.currentVersion
      })

      return result

    } catch (error) {
      const endTime = new Date()
      const result: RollbackResult = {
        success: false,
        previousVersion: 'unknown',
        currentVersion: 'unknown',
        rollbackTime: endTime,
        duration: endTime.getTime() - startTime.getTime(),
        affectedWorkspaces: [],
        environment,
        error: error as Error,
        logs: [`Rollback failed: ${(error as Error).message}`]
      }

      const vtexConfig = await this.configManager.getVTEXConfig(environment)
      await this.notifier.sendRollbackNotification({
        success: false,
        previousVersion: targetVersion,
        currentVersion: '',
        environment: environment === 'qa' ? 'qa' : 'production',
        rollbackTime: endTime,
        duration: endTime.getTime() - startTime.getTime(),
        affectedWorkspaces: [vtexConfig.workspace],
        error: error as Error,
        logs: result.logs
      })
      this.logger.error('Rollback failed', error as Error)
      
      throw error
    }
  }

  /**
   * Get deployment status
   */
  async getDeployStatus(deployId: string): Promise<DeployStatus> {
    const deployment = this.activeDeployments.get(deployId)
    
    if (!deployment) {
      throw new Error(`Deployment ${deployId} not found`)
    }

    const duration = deployment.endTime 
      ? deployment.endTime.getTime() - deployment.startTime.getTime()
      : Date.now() - deployment.startTime.getTime()

    return {
      id: deployId,
      status: deployment.status,
      version: deployment.version,
      workspace: deployment.workspace,
      environment: deployment.environment,
      startTime: deployment.startTime,
      endTime: deployment.endTime,
      duration,
      logs: deployment.logs,
      error: deployment.error
    } as unknown as DeployStatus & { id: string; version: string; workspace: string; environment: Environment; startTime: Date; endTime?: Date; duration: number; logs: string[]; error?: Error }
  }

  /**
   * Get deployment history for an environment
   */
  async getDeploymentHistory(environment: Environment, limit: number = 10): Promise<DeployResult[]> {
    try {
      // Get deployment history from active deployments
      const deployments = Array.from(this.activeDeployments.values())
        .filter(deployment => deployment.environment === environment)
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        .slice(0, limit)

      this.logger.info('Retrieved deployment history', { 
        environment, 
        count: deployments.length,
        limit 
      })

      return deployments
    } catch (error) {
      this.logger.error('Failed to get deployment history', error as Error)
      throw error
    }
  }

  // Private helper methods

  private generateDeployId(): string {
    return `deploy_${Date.now()}_${uuidv4().substring(0, 8)}`
  }

  private async getAppName(): Promise<string> {
    const manifest = await this.validator.getManifest()
    return manifest.name || 'unknown'
  }

  private async generateQAVersion(): Promise<string> {
    const currentVersion = await this.getCurrentVersion()
    const prerelease = `qa.${Date.now()}`
    const incVersion = semver.inc(currentVersion, 'prerelease', prerelease)
    return incVersion || `${currentVersion}-${prerelease}`
  }

  private async generateProductionVersion(qaVersion: string): Promise<string> {
    // Remove prerelease identifier for production
    const cleanVersion = semver.clean(qaVersion)
    return cleanVersion || qaVersion.split('-')[0] || '0.1.0'
  }

  private async getCurrentVersion(): Promise<string> {
    const manifest = await this.validator.getManifest()
    return manifest.version || '0.1.0'
  }

  private async getPreviousVersion(appName: string): Promise<string> {
    const versions = await this.vtexClient.getAppVersions(appName)
    if (versions.length < 2) {
      throw new Error('No previous version available for rollback')
    }
    const version = versions[1] || versions[0]
    if (!version) {
      throw new Error('No version available for rollback')
    }
    return version // Second most recent version or first
  }

  private async validatePrerequisites(config: DeployConfig): Promise<void> {
    // Validate VTEX CLI is available
    await this.vtexClient.validateCLI()
    
    // Validate account access
    await this.vtexClient.validateAccount(config.account)
    
    // Validate workspace exists or can be created
    await this.vtexClient.validateWorkspace(config.workspace)
  }

  private async validateProductionPrerequisites(config: DeployConfig): Promise<void> {
    await this.validatePrerequisites(config)
    
    // Additional production validations
    await this.validator.validateProductionReadiness()
    await this.validator.checkSecurityCompliance()
  }

  private async verifyInstallation(appName: string, version: string): Promise<void> {
    const installedApps = await this.vtexClient.listInstalledApps()
    const targetApp = installedApps.find(app => app.name === appName && app.version === version)
    
    if (!targetApp) {
      throw new Error(`App ${appName}@${version} not found in installed apps`)
    }

    if (targetApp.status !== 'installed') {
      throw new Error(`App ${appName}@${version} installation failed: ${targetApp.status}`)
    }
  }

  private async autoRollback(config: DeployConfig): Promise<void> {
    this.logger.info('Initiating auto-rollback')
    
    try {
      const previousVersion = await this.getPreviousVersion(config.appName)
      await this.rollback(previousVersion, config.environment)
    } catch (error) {
      this.logger.error('Auto-rollback failed', error as Error)
      throw error
    }
  }

  private async validateRollbackVersion(version: string): Promise<void> {
    const appName = await this.getAppName()
    const availableVersions = await this.vtexClient.getAppVersions(appName)
    
    if (!availableVersions.includes(version)) {
      throw new Error(`Version ${version} not found in available versions`)
    }
  }

  private async createVersionBackup(version: string, environment: Environment): Promise<void> {
    this.logger.info('Creating version backup', { version, environment })
    // Implementation would depend on backup strategy
    // Could involve creating a snapshot or storing version metadata
  }

  private addLog(deployId: string, message: string): void {
    const deployment = this.activeDeployments.get(deployId)
    if (deployment) {
      deployment.logs.push(`${new Date().toISOString()}: ${message}`)
      this.activeDeployments.set(deployId, deployment)
    }
    this.logger.info(message, { deployId })
  }
}
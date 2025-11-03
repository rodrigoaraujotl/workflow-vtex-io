import * as fs from 'fs'
import { promises as fsPromises } from 'fs'
import * as path from 'path'
import { Logger } from '../utils/logger'
import { AppConfig, NotificationSettings, ValidationResult, ValidationError, ValidationWarning, LoggingSettings } from '../types'
import { VTEXConfig } from '../types/vtex.types'

export interface ConfigManagerOptions {
  configPath?: string
  logger?: Logger
}

export class ConfigManager {
  private config: AppConfig
  private configPath: string
  private logger: Logger

  constructor(options: ConfigManagerOptions = {}) {
    this.configPath = options.configPath || this.getDefaultConfigPath()
    this.logger = options.logger || new Logger({ 
      level: 'info',
      format: 'text',
      auditEnabled: false,
      retentionDays: 7,
      maxFileSize: '10MB',
      maxFiles: 5
    })
    this.config = this.loadConfigSync()
  }

  /**
   * Get current configuration
   */
  getConfig(): AppConfig {
    return JSON.parse(JSON.stringify(this.config)) // Deep copy
  }

  /**
   * Check if configuration file exists
   */
  hasConfig(): boolean {
    return fs.existsSync(this.configPath)
  }

  /**
   * Set entire configuration
   */
  setConfig(config: AppConfig): void {
    this.config = config
  }

  /**
   * Validate current configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    // Basic validation
    if (!this.config.vtex?.account) {
      errors.push({ 
        code: 'MISSING_VTEX_ACCOUNT',
        message: 'VTEX account is required',
        severity: 'critical',
        field: 'vtex.account'
      })
    }

    if (!this.config.vtex?.workspace) {
      errors.push({ 
        code: 'MISSING_VTEX_WORKSPACE',
        message: 'VTEX workspace is required',
        severity: 'critical',
        field: 'vtex.workspace'
      })
    }

    return {
      valid: errors.length === 0,
      score: errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5)),
      errors,
      warnings,
      info: [],
      executionTime: 0,
      timestamp: new Date(),
      validatedBy: 'ConfigManager'
    }
  }

  /**
   * Update configuration with partial updates
   */
  async updateConfig(updates: Partial<AppConfig>): Promise<void> {
    this.config = this.mergeConfig(this.config, updates)
    const validation = await this.validateConfiguration()
    
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`)
    }

    await this.saveConfigInternal()
    this.logger.info('Configuration updated successfully')
  }

  /**
   * Set a configuration value using dot notation
   */
  setValue(key: string, value: any): void {
    const keys = key.split('.').filter(k => k.length > 0)
    let current = this.config as any

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      if (!k) continue
      if (!(k in current) || typeof current[k] !== 'object' || current[k] === null) {
        current[k] = {}
      }
      current = current[k]
    }

    const lastKey = keys[keys.length - 1]
    if (lastKey) {
      current[lastKey] = value
    }
  }

  /**
   * Get a configuration value using dot notation
   */
  getValue(key: string, defaultValue?: any): any {
    const keys = key.split('.')
    let current = this.config as any

    for (const k of keys) {
      if (current === null || current === undefined || !(k in current)) {
        return defaultValue
      }
      current = current[k]
    }

    return current
  }

  /**
   * Validate current configuration
   */
  async validateConfiguration(): Promise<ValidationResult> {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    // Validate required fields
    if (!this.config.vtex?.account) {
      errors.push({
        code: 'MISSING_VTEX_ACCOUNT',
        message: 'VTEX account is required',
        severity: 'critical'
      })
    }

    if (!this.config.vtex?.workspace) {
      errors.push({
        code: 'MISSING_VTEX_WORKSPACE',
        message: 'VTEX workspace is required',
        severity: 'critical'
      })
    }

    // Validate notification configuration
    if (this.config.notifications?.enabled) {
      const notificationValidation = this.validateNotificationConfig(this.config.notifications)
      errors.push(...notificationValidation.errors)
      warnings.push(...notificationValidation.warnings)
    }

    // Validate deployment settings
    if (this.config.deployment?.timeout && this.config.deployment.timeout < 60000) {
      warnings.push({
        code: 'LOW_DEPLOYMENT_TIMEOUT',
        message: 'Deployment timeout is less than 1 minute, this might cause issues',
        impact: 'medium'
      })
    }

    return {
      valid: errors.length === 0,
      score: errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5)),
      errors,
      warnings,
      info: [],
      executionTime: 0,
      timestamp: new Date(),
      validatedBy: 'ConfigManager'
    }
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(): void {
    this.config = this.createDefaultConfig()
    this.logger.info('Configuration reset to defaults')
  }

  /**
   * Export configuration to file
   */
  async exportConfig(filePath: string, includeSensitive: boolean = false): Promise<void> {
    const configToExport = includeSensitive ? this.config : this.maskSensitiveValues(this.config)
    
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(configToExport, null, 2),
      'utf8'
    )
    
    this.logger.info(`Configuration exported to ${filePath}`)
  }

  /**
   * Import configuration from file
   */
  async importConfig(filePath: string, merge: boolean = true): Promise<void> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Configuration file not found: ${filePath}`)
    }

    const fileContent = await fs.promises.readFile(filePath, 'utf8')
    const importedConfig = JSON.parse(fileContent)

    if (merge) {
      this.config = this.mergeConfig(this.config, importedConfig)
    } else {
      this.config = importedConfig
    }

    const validation = await this.validateConfiguration()
    if (!validation.valid) {
      const errorMessages = validation.errors.map(error => error.message).join(', ')
      throw new Error(`Imported configuration is invalid: ${errorMessages}`)
    }

    await this.saveConfigInternal()
    this.logger.info(`Configuration imported from ${filePath}`)
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.configPath
  }

  /**
   * Load configuration from file
   */
  async loadConfig(): Promise<AppConfig> {
    if (this.config) {
      return this.config
    }
    this.config = this.loadConfigSync()
    return this.config
  }

  /**
   * Load configuration from file (synchronous version)
   */
  private loadConfigSync(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const fileContent = fs.readFileSync(this.configPath, 'utf8')
        const config = JSON.parse(fileContent)
        return this.mergeConfig(this.createDefaultConfig(), config)
      }
    } catch (error) {
      this.logger.warn(`Failed to load config from ${this.configPath}: ${(error as Error).message}`)
    }

    return this.createDefaultConfig()
  }

  /**
   * Save configuration to file
   */
  private async saveConfigInternal(): Promise<void> {
    const configDir = path.dirname(this.configPath)
    
    if (!fs.existsSync(configDir)) {
      await fs.promises.mkdir(configDir, { recursive: true })
    }

    await fs.promises.writeFile(
      this.configPath,
      JSON.stringify(this.config, null, 2),
      'utf8'
    )
  }

  /**
   * Create default configuration
   */
  private createDefaultConfig(): AppConfig {
    return {
      environment: 'qa',
      vtex: {
        account: process.env['VTEX_ACCOUNT'] || '',
        workspace: process.env['VTEX_WORKSPACE'] || 'master',
        authToken: process.env['VTEX_AUTH_TOKEN'] || '',
        userEmail: process.env['VTEX_USER_EMAIL'] || '',
        timeout: 300000,
        retryAttempts: 3,
        apiVersion: 'v1',
        region: 'aws-us-east-1'
      },
      app: {
        vendor: process.env['APP_VENDOR'] || '',
        name: process.env['APP_NAME'] || '',
        versionPrefix: process.env['APP_VERSION_PREFIX'] || 'v',
        autoInstall: false,
        autoPublish: false,
        skipTests: false,
        requireApproval: true
      },
      deployment: {
        timeout: 600000,
        maxRetries: 3,
        rollbackOnFailure: true,
        healthCheckTimeout: 30000,
        healthCheckRetries: 3,
        parallelDeployments: false,
        maxParallelJobs: 1
      },
      workspace: {
        createWorkspace: true,
        workspacePrefix: 'deploy-',
        workspaceCleanup: true,
        workspaceTTL: '24h',
        promoteRequiresApproval: true,
        autoPromoteToMaster: false
      },
      notifications: {
        enabled: false,
        slack: {
          enabled: false,
          webhookUrl: '',
          channel: '#deployments',
          username: 'VTEX Deploy Bot'
        },
        email: {
          enabled: false,
          smtpHost: '',
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: '',
          smtpPassword: '',
          from: '',
          to: []
        },
        teams: {
          enabled: false,
          webhookUrl: ''
        }
      },
      git: {
        mainBranch: 'main',
        productionBranch: 'production',
        allowedBranchPrefixes: ['feature/', 'hotfix/', 'release/'],
        requirePullRequest: true,
        requireCodeReview: true,
        autoMerge: false,
        deleteFeatureBranches: true
      },
      docker: {
        enabled: false,
        registry: '',
        tagPrefix: 'v',
        securityScan: true,
        pushOnSuccess: true
      },
      security: {
        enableSecurityScan: true,
        blockOnVulnerabilities: true,
        tokenRefreshInterval: 3600000,
        securityScanTimeout: 300000,
        allowedVulnerabilityLevels: ['low', 'medium'],
        encryptSecrets: true
      },
      monitoring: {
        enabled: true,
        metricsEndpoint: '/metrics',
        healthCheckInterval: 300000,
        performanceMonitoring: true,
        alertThresholds: {
          deploymentFailureRate: 0.1,
          deploymentDuration: 600000,
          errorRate: 0.05,
          responseTime: 5000
        }
      },
      logging: {
        level: 'info',
        format: 'text',
        auditEnabled: false,
        retentionDays: 7,
        maxFileSize: '10MB',
        maxFiles: 5
      }
    }
  }

  /**
   * Merge configurations deeply
   */
  private mergeConfig(target: any, source: any): any {
    const result = { ...target }

    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeConfig(target[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }

    return result
  }

  /**
   * Mask sensitive values in configuration
   */
  private maskSensitiveValues(config: any): any {
    const masked = JSON.parse(JSON.stringify(config))
    const sensitiveKeys = ['password', 'pass', 'token', 'key', 'secret', 'webhook']

    const maskRecursive = (obj: any) => {
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          maskRecursive(obj[key])
        } else if (typeof obj[key] === 'string' && sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
          obj[key] = '***MASKED***'
        }
      }
    }

    maskRecursive(masked)
    return masked
  }

  /**
   * Validate notification configuration
   */
  private validateNotificationConfig(config: NotificationSettings): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    if (config.slack?.enabled && !config.slack.webhookUrl) {
      errors.push({
        code: 'MISSING_SLACK_WEBHOOK',
        message: 'Slack webhook URL is required when Slack notifications are enabled',
        severity: 'high',
        field: 'notifications.slack.webhookUrl'
      })
    }

    if (config.email?.enabled) {
      if (!config.email.smtpHost) {
        errors.push({
          code: 'MISSING_SMTP_HOST',
          message: 'SMTP host is required when email notifications are enabled',
          severity: 'high',
          field: 'notifications.email.smtpHost'
        })
      }
      if (!config.email.from) {
        errors.push({
          code: 'MISSING_EMAIL_FROM',
          message: 'From email address is required when email notifications are enabled',
          severity: 'high',
          field: 'notifications.email.from'
        })
      }
      if (!config.email.to || config.email.to.length === 0) {
        errors.push({
          code: 'MISSING_EMAIL_TO',
          message: 'At least one recipient email is required when email notifications are enabled',
          severity: 'high',
          field: 'notifications.email.to'
        })
      }
    }

    return {
      valid: errors.length === 0,
      score: errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5)),
      errors,
      warnings,
      info: [],
      executionTime: 0,
      timestamp: new Date(),
      validatedBy: 'ConfigManager'
    }
  }

  /**
   * Get VTEX configuration for specific environment
   */
  async getVTEXConfig(environment: string): Promise<VTEXConfig> {
    const config = this.getConfig()
    const envConfig = (config as any).environments?.[environment] || {}
    
    return {
      account: envConfig.account || config.vtex?.account || '',
      workspace: envConfig.workspace || config.vtex?.workspace || 'master',
      authToken: envConfig.authToken || config.vtex?.authToken || '',
      region: envConfig.region || config.vtex?.region || 'aws-us-east-1'
    }
  }

  async saveConfig(config: any): Promise<void> {
    try {
      await fsPromises.writeFile(this.configPath, JSON.stringify(config, null, 2))
      this.logger.info('Configuration saved successfully')
    } catch (error) {
      this.logger.error('Failed to save configuration', { error })
      throw error
    }
  }

  configExists(): boolean {
    try {
      return fs.existsSync(this.configPath)
    } catch {
      return false
    }
  }

  async validateConfig(): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    try {
      const validation = await this.validateConfiguration()
      return {
        valid: validation.valid,
        errors: validation.errors.map(e => e.message),
        warnings: validation.warnings.map(w => w.message)
      }
    } catch (error) {
      return {
        valid: false,
        errors: [`Configuration validation failed: ${(error as Error).message}`],
        warnings: []
      }
    }
  }

  /**
   * Get default configuration file path
   */
  private getDefaultConfigPath(): string {
    return path.join(process.cwd(), 'vtex-deploy.config.json')
  }
}
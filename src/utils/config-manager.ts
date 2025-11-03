/**
 * Configuration Manager
 * Handles application configuration loading, validation, and management
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'
import { config as loadEnv } from 'dotenv'
import {
  AppConfig,
  VTEXEnvironmentConfig,
  ConfigValidationResult,
  ConfigError,
  ConfigWarning,
  Environment,
  SecretConfig
} from '../types'
import { Logger } from './logger'

export class ConfigManager {
  private readonly logger: Logger
  private config: AppConfig | null = null
  private readonly configPath: string
  private readonly secretsPath: string

  constructor(logger: Logger, configDir = 'config') {
    this.logger = logger
    this.configPath = resolve(process.cwd(), configDir)
    this.secretsPath = resolve(process.cwd(), '.secrets')
  }

  /**
   * Load configuration
   */
  async loadConfig(environment?: Environment): Promise<AppConfig> {
    const env = environment || this.detectEnvironment()
    
    this.logger.info('Loading configuration', { environment: env })

    try {
      // Load environment variables
      this.loadEnvironmentVariables(env)

      // Load base configuration
      const baseConfig = this.loadConfigFile('base.json')
      
      // Load environment-specific configuration
      const envConfig = this.loadConfigFile(`${env}.json`)
      
      // Load secrets
      // Load secrets if needed
      this.loadSecrets()
      
      // Merge configurations
      this.config = this.mergeConfigurations(baseConfig, envConfig, env)
      
      // Validate configuration
      const validation = await this.validateConfig(this.config)
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`)
      }

      this.logger.info('Configuration loaded successfully', {
        environment: env,
        warnings: validation.warnings.length
      })

      if (validation.warnings.length > 0) {
        validation.warnings.forEach(warning => {
          this.logger.warn('Configuration warning', { message: warning.message, field: warning.field })
        })
      }

      return this.config
    } catch (error) {
      this.logger.error('Failed to load configuration', error)
      throw error
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AppConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.')
    }
    return this.config
  }

  /**
   * Get VTEX environment configuration
   */
  getVTEXConfig(environment: Environment): VTEXEnvironmentConfig {
    const config = this.getConfig()
    const vtexConfig = config.vtex
    
    if (!vtexConfig) {
      throw new Error(`VTEX configuration not found for environment: ${environment}`)
    }
    
    return vtexConfig
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<AppConfig>): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded')
    }

    this.logger.info('Updating configuration', { updates: Object.keys(updates) })

    try {
      // Merge updates
      this.config = { ...this.config, ...updates }
      
      // Validate updated configuration
      const validation = await this.validateConfig(this.config)
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`)
      }

      this.logger.info('Configuration updated successfully')
    } catch (error) {
      this.logger.error('Failed to update configuration', error)
      throw error
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(environment: Environment, config: Partial<AppConfig>): Promise<void> {
    const configDir = join(this.configPath, 'environments')
    const configFile = join(configDir, `${environment}.json`)
    
    this.logger.info('Saving configuration', { environment, file: configFile })

    try {
      // Ensure directory exists
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true })
      }
      
      writeFileSync(configFile, JSON.stringify(config, null, 2))
      this.logger.info('Configuration saved successfully')
    } catch (error) {
      this.logger.error('Failed to save configuration', error)
      throw error
    }
  }

  /**
   * Load environment variables
   */
  private loadEnvironmentVariables(environment: Environment): void {
    const envFiles = [
      '.env',
      `.env.${environment}`,
      '.env.local'
    ]

    for (const envFile of envFiles) {
      const envPath = resolve(process.cwd(), envFile)
      if (existsSync(envPath)) {
        loadEnv({ path: envPath })
        this.logger.debug('Loaded environment file', { file: envFile })
      }
    }
  }

  /**
   * Load configuration file
   */
  private loadConfigFile(filename: string): Record<string, unknown> {
    const configFile = join(this.configPath, 'environments', filename)
    
    if (!existsSync(configFile)) {
      this.logger.debug('Configuration file not found', { file: configFile })
      return { name: '', value: '', encrypted: false }
    }

    try {
      const content = readFileSync(configFile, 'utf-8')
      const config = JSON.parse(content)
      this.logger.debug('Loaded configuration file', { file: filename })
      return config
    } catch (error) {
      this.logger.error('Failed to load configuration file', { file: filename, error })
      throw new Error(`Failed to load configuration file ${filename}: ${(error as Error).message}`)
    }
  }

  /**
   * Load secrets
   */
  private loadSecrets(): SecretConfig {
    const secretsFile = join(this.secretsPath, 'secrets.json')
    
    if (!existsSync(secretsFile)) {
      this.logger.debug('Secrets file not found', { file: secretsFile })
      return { name: '', value: '', encrypted: false }
    }

    try {
      const content = readFileSync(secretsFile, 'utf-8')
      const secrets = JSON.parse(content)
      this.logger.debug('Loaded secrets file')
      return secrets
    } catch (error) {
      this.logger.warn('Failed to load secrets file', { error: error instanceof Error ? error.message : String(error) })
      return { name: '', value: '', encrypted: false }
    }
  }

  /**
   * Merge configurations
   */
  private mergeConfigurations(
    baseConfig: Record<string, unknown>,
    envConfig: Record<string, unknown>,
    environment: Environment
  ): AppConfig {
    // Get environment variables
    const envVars = process.env

    // Default configuration
    const defaultConfig: AppConfig = {
      environment,
      app: {
        vendor: envVars['APP_VENDOR'] || 'vtex',
        name: envVars['APP_NAME'] || 'vtex-deploy-automation',
        versionPrefix: envVars['APP_VERSION_PREFIX'] || '1.0.0',
        autoInstall: envVars['AUTO_INSTALL'] === 'true',
        autoPublish: envVars['AUTO_PUBLISH'] === 'true',
        skipTests: envVars['SKIP_TESTS'] === 'true',
        requireApproval: envVars['REQUIRE_APPROVAL'] === 'true'
      },
      vtex: {
        account: envVars['VTEX_ACCOUNT'] || '',
        workspace: envVars['VTEX_WORKSPACE'] || 'development',
        authToken: envVars['VTEX_AUTH_TOKEN'] || '',
        userEmail: envVars['VTEX_USER_EMAIL'] || '',
        timeout: 30000,
        retryAttempts: 3,
        apiVersion: 'v1',
        region: 'us'
      },
      deployment: {
        timeout: 1800000, // 30 minutes
        maxRetries: 3,
        rollbackOnFailure: true,
        healthCheckTimeout: 60000,
        healthCheckRetries: 3,
        parallelDeployments: false,
        maxParallelJobs: 1
      },
      workspace: {
        createWorkspace: true,
        workspacePrefix: 'deploy-',
        workspaceCleanup: false,
        workspaceTTL: '24h',
        promoteRequiresApproval: environment === 'production',
        autoPromoteToMaster: environment !== 'production'
      },
      notifications: {
        enabled: false,
        slack: {
          enabled: false,
          webhookUrl: envVars['SLACK_WEBHOOK_URL'] || '',
          channel: envVars['SLACK_CHANNEL'] || '#deployments',
          username: 'VTEX Deploy Bot',
          iconEmoji: ':rocket:'
        },
        teams: {
          enabled: false,
          webhookUrl: ''
        },
        email: {
          enabled: false,
          smtpHost: envVars['EMAIL_SMTP_HOST'] || '',
          smtpPort: parseInt(envVars['EMAIL_SMTP_PORT'] || '587'),
          smtpSecure: false,
          smtpUser: envVars['EMAIL_SMTP_USER'] || '',
          smtpPassword: envVars['EMAIL_SMTP_PASSWORD'] || '',
          from: envVars['EMAIL_FROM'] || '',
          to: envVars['EMAIL_TO'] ? envVars['EMAIL_TO'].split(',') : []
        }
      },
      git: {
        mainBranch: envVars['GIT_MAIN_BRANCH'] || 'main',
        productionBranch: envVars['GIT_PRODUCTION_BRANCH'] || 'production',
        allowedBranchPrefixes: ['feature/', 'hotfix/', 'release/'],
        requirePullRequest: environment === 'production',
        requireCodeReview: environment === 'production',
        autoMerge: false,
        deleteFeatureBranches: true
      },
      docker: {
        enabled: false,
        registry: envVars['DOCKER_REGISTRY'] || '',
        tagPrefix: envVars['DOCKER_TAG_PREFIX'] || 'vtex-app',
        securityScan: environment === 'production',
        pushOnSuccess: true
      },
      security: {
        enableSecurityScan: true,
        blockOnVulnerabilities: environment === 'production',
        tokenRefreshInterval: 3600000,
        securityScanTimeout: 300000,
        allowedVulnerabilityLevels: ['low', 'medium'],
        encryptSecrets: true
      },
      monitoring: {
        enabled: false,
        metricsEndpoint: '/metrics',
        healthCheckInterval: 30000,
        performanceMonitoring: false,
        alertThresholds: {
          deploymentFailureRate: 10,
          deploymentDuration: 300000,
          errorRate: 5,
          responseTime: 2000
        }
      },
      logging: {
        level: environment === 'development' ? 'debug' : 'info',
        format: 'json',
        auditEnabled: environment !== 'development',
        retentionDays: 30,
        maxFileSize: '10MB',
        maxFiles: 5
      }
    }

    // Deep merge configurations
    return this.deepMerge(defaultConfig as any, baseConfig as any, envConfig as any) as unknown as AppConfig
  }

  /**
   * Get default feature flags
   */


  /**
   * Deep merge objects
   */
  private deepMerge(...objects: Record<string, unknown>[]): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const obj of objects) {
      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = this.deepMerge(
            result[key] as Record<string, unknown> || {},
            value as Record<string, unknown>
          )
        } else {
          result[key] = value
        }
      }
    }

    return result
  }

  /**
   * Validate configuration
   */
  private async validateConfig(config: AppConfig): Promise<ConfigValidationResult> {
    const errors: ConfigError[] = []
    const warnings: ConfigWarning[] = []

    try {
      // Validate required fields
      if (!config.vtex.account) {
        errors.push({
          field: 'vtex.account',
          message: 'VTEX account is required'
        })
      }

      if (!config.vtex.authToken) {
        errors.push({
          field: 'vtex.authToken',
          message: 'VTEX auth token is required'
        })
      }

      // Additional VTEX validation
      if (!config.vtex.authToken) {
        warnings.push({
          field: 'vtex.authToken',
          message: 'VTEX auth token not configured - authentication may fail'
        })
      }

      // Validate deployment settings
      if (config.deployment.timeout < 60000) {
        warnings.push({
          field: 'deployment.timeout',
          message: 'Deployment timeout is very low (< 1 minute)'
        })
      }

      if (config.deployment.maxRetries < 1) {
        warnings.push({
          field: 'deployment.retries',
          message: 'Deployment retries should be at least 1'
        })
      }

      // Validate notification settings
      if (config.notifications.enabled) {
        if (config.notifications.slack.enabled && !config.notifications.slack.webhookUrl) {
          errors.push({
            field: 'notifications.slack.webhookUrl',
            message: 'Slack webhook URL is required when Slack notifications are enabled'
          })
        }

        if (config.notifications.email.enabled) {
          if (!config.notifications.email.smtpHost) {
            errors.push({
              field: 'notifications.email.smtpHost',
              message: 'Email SMTP host is required when email notifications are enabled'
            })
          }

          if (!config.notifications.email.smtpUser || !config.notifications.email.smtpPassword) {
            errors.push({
              field: 'notifications.email.auth',
              message: 'Email authentication credentials are required'
            })
          }
        }
      }

      // Validate security settings
      if (config.security.enableSecurityScan && !config.security.encryptSecrets) {
        warnings.push({
          field: 'security.encryptSecrets',
          message: 'Secrets encryption should be enabled when security scanning is active'
        })
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      }
    } catch (error) {
      errors.push({
        field: 'general',
        message: `Configuration validation error: ${(error as Error).message}`
      })

      return {
        valid: false,
        errors,
        warnings
      }
    }
  }

  /**
   * Detect environment
   */
  private detectEnvironment(): Environment {
    const nodeEnv = process.env['NODE_ENV']?.toLowerCase()
    
    switch (nodeEnv) {
      case 'production':
      case 'prod':
        return 'production'
      case 'qa':
      case 'staging':
      case 'test':
        return 'qa'
      case 'development':
      case 'dev':
      default:
        return 'development'
    }
  }

  /**
   * Get configuration schema
   */
  getConfigSchema(): Record<string, unknown> {
    return {
      type: 'object',
      required: ['app', 'vtex', 'deployment'],
      properties: {
        app: {
          type: 'object',
          required: ['name', 'version', 'environment'],
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            environment: { type: 'string', enum: ['development', 'qa', 'production'] },
            debug: { type: 'boolean' },
            port: { type: 'number', minimum: 1, maximum: 65535 },
            host: { type: 'string' }
          }
        },
        vtex: {
          type: 'object',
          required: ['account', 'environments'],
          properties: {
            account: { type: 'string', minLength: 1 },
            authToken: { type: 'string', minLength: 1 },
            environments: {
              type: 'object',
              required: ['development', 'qa', 'production'],
              properties: {
                development: { $ref: '#/definitions/vtexEnvironment' },
                qa: { $ref: '#/definitions/vtexEnvironment' },
                production: { $ref: '#/definitions/vtexEnvironment' }
              }
            }
          }
        },
        deployment: {
          type: 'object',
          properties: {
            timeout: { type: 'number', minimum: 60000 },
            retries: { type: 'number', minimum: 0 },
            rollbackOnFailure: { type: 'boolean' },
            requireApproval: { type: 'boolean' },
            canaryDeployment: { type: 'boolean' },
            canaryPercentage: { type: 'number', minimum: 1, maximum: 100 }
          }
        }
      },
      definitions: {
        vtexEnvironment: {
          type: 'object',
          required: ['account', 'workspace'],
          properties: {
            account: { type: 'string', minLength: 1 },
            workspace: { type: 'string', minLength: 1 },
            authToken: { type: 'string' },
            region: { type: 'string' },
            apps: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  }

  /**
   * Export configuration
   */
  exportConfig(): string {
    if (!this.config) {
      throw new Error('Configuration not loaded')
    }

    // Remove sensitive data
    const exportConfig = { ...this.config }
    
    // Remove sensitive fields if they exist
    if ('vtex' in exportConfig && 'authToken' in exportConfig.vtex) {
      const vtexConfig = { ...exportConfig.vtex }
      const { authToken, ...cleanVtexConfig } = vtexConfig
      exportConfig.vtex = { ...cleanVtexConfig, authToken: '' }
    }

    return JSON.stringify(exportConfig, null, 2)
  }

  /**
   * Reset configuration
   */
  resetConfig(): void {
    this.config = null
    this.logger.info('Configuration reset')
  }
}
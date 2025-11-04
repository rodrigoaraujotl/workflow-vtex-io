/**
 * Configuration Types
 * Defines the structure for application configuration
 */

import { Environment } from './deploy.types'

export interface AppConfig {
  environment: Environment
  vtex: VTEXEnvironmentConfig
  app: AppSettings
  deployment: DeploymentSettings
  workspace: WorkspaceSettings
  notifications: NotificationSettings
  git: GitSettings
  docker: DockerSettings
  security: SecuritySettings
  monitoring: MonitoringSettings
  logging: LoggingSettings
  healthCheck: any
}

export interface VTEXEnvironmentConfig {
  account: string
  workspace: string
  authToken: string
  userEmail: string
  timeout: number
  retryAttempts: number
  apiVersion: string
  region: string
}

export interface AppSettings {
  vendor: string
  name: string
  versionPrefix: string
  autoInstall: boolean
  autoPublish: boolean
  skipTests: boolean
  requireApproval: boolean
}

export interface DeploymentSettings {
  timeout: number
  maxRetries: number
  rollbackOnFailure: boolean
  healthCheckTimeout: number
  healthCheckRetries: number
  parallelDeployments: boolean
  maxParallelJobs: number
  retries?: number
}

export interface WorkspaceSettings {
  createWorkspace: boolean
  workspacePrefix: string
  workspaceCleanup: boolean
  workspaceTTL: string
  promoteRequiresApproval: boolean
  autoPromoteToMaster: boolean
}

export interface NotificationSettings {
  enabled: boolean
  slack: SlackConfig
  email: EmailConfig
  teams: TeamsConfig
  webhook?: WebhookConfig
  channels?: any
}

export interface SlackConfig {
  enabled: boolean
  webhookUrl: string
  channel: string
  username?: string
  iconEmoji?: string
  mentionOnFailure?: boolean
  mentionUsers?: string[]
  webhook?: string
}

export interface EmailConfig {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPassword: string
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
}

export interface TeamsConfig {
  enabled: boolean
  webhookUrl: string
}

export interface WebhookConfig {
  enabled: boolean
  url: string
  method: 'POST' | 'PUT' | 'PATCH'
  headers?: Record<string, string>
  timeout: number
  retryAttempts: number
}

export interface GitSettings {
  mainBranch: string
  productionBranch: string
  allowedBranchPrefixes: string[]
  requirePullRequest: boolean
  requireCodeReview: boolean
  autoMerge: boolean
  deleteFeatureBranches: boolean
}

export interface DockerSettings {
  enabled: boolean
  registry: string
  tagPrefix: string
  buildArgs?: Record<string, string>
  securityScan: boolean
  pushOnSuccess: boolean
}

export interface SecuritySettings {
  enableSecurityScan: boolean
  blockOnVulnerabilities: boolean
  tokenRefreshInterval: number
  securityScanTimeout: number
  allowedVulnerabilityLevels: VulnerabilityLevel[]
  encryptSecrets: boolean
}

export type VulnerabilityLevel = 'low' | 'medium' | 'high' | 'critical'

export interface MonitoringSettings {
  enabled: boolean
  metricsEndpoint: string
  healthCheckInterval: number
  performanceMonitoring: boolean
  alertThresholds: AlertThresholds
}

export interface AlertThresholds {
  deploymentFailureRate: number
  deploymentDuration: number
  errorRate: number
  responseTime: number
}

export interface LoggingSettings {
  level: 'debug' | 'info' | 'warn' | 'error'
  format: 'json' | 'text'
  auditEnabled: boolean
  retentionDays: number
  maxFileSize: string
  maxFiles: number
}

export interface EnvironmentVariables {
  // VTEX Configuration
  VTEX_ACCOUNT?: string
  VTEX_WORKSPACE?: string
  VTEX_AUTH_TOKEN?: string
  VTEX_USER_EMAIL?: string

  // App Configuration
  APP_VENDOR?: string
  APP_NAME?: string
  APP_VERSION_PREFIX?: string

  // Deployment Settings
  AUTO_INSTALL?: string
  AUTO_PUBLISH?: string
  SKIP_TESTS?: string
  REQUIRE_APPROVAL?: string
  DEPLOYMENT_TIMEOUT?: string

  // Workspace Management
  CREATE_WORKSPACE?: string
  WORKSPACE_PREFIX?: string
  WORKSPACE_CLEANUP?: string
  WORKSPACE_TTL?: string

  // Notifications
  SLACK_WEBHOOK_URL?: string
  SLACK_CHANNEL?: string
  EMAIL_SMTP_HOST?: string
  EMAIL_SMTP_PORT?: string
  EMAIL_SMTP_USER?: string
  EMAIL_SMTP_PASSWORD?: string
  EMAIL_FROM?: string
  EMAIL_TO?: string

  // Security
  ENABLE_SECURITY_SCAN?: string
  BLOCK_ON_VULNERABILITIES?: string
  TOKEN_REFRESH_INTERVAL?: string

  // Logging
  LOG_LEVEL?: string
  LOG_FORMAT?: string
  AUDIT_ENABLED?: string

  // Git Configuration
  GIT_MAIN_BRANCH?: string
  GIT_PRODUCTION_BRANCH?: string
  ALLOWED_BRANCH_PREFIXES?: string

  // Docker
  DOCKER_REGISTRY?: string
  DOCKER_TAG_PREFIX?: string
  DOCKER_SECURITY_SCAN?: string
}

export interface ConfigValidationResult {
  valid: boolean
  errors: ConfigError[]
  warnings: ConfigWarning[]
}

export interface ConfigError {
  field: string
  message: string
  value?: unknown
  expectedType?: string
}

export interface ConfigWarning {
  field: string
  message: string
  suggestion?: string
}

export interface SecretConfig {
  name: string
  value: string
  encrypted: boolean
  expiresAt?: Date
  rotationInterval?: number
  lastRotated?: Date
}

export interface FeatureFlags {
  enableBetaFeatures: boolean
  enableExperimentalFeatures: boolean
  enableDebugMode: boolean
  enableMetricsCollection: boolean
  enableAutoRollback: boolean
  enableParallelDeployments: boolean
}

export interface DatabaseConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl: boolean
  connectionTimeout: number
  maxConnections: number
}

export interface CacheConfig {
  enabled: boolean
  provider: 'redis' | 'memory'
  host?: string
  port?: number
  password?: string
  ttl: number
  maxSize: number
}
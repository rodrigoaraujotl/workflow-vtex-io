/**
 * Test utilities and helpers
 */

import { Logger } from '../src/utils/logger'
import { LoggingSettings, AppConfig } from '../src/types'

/**
 * Create a mock logger for testing
 */
export function createMockLogger(): jest.Mocked<Logger> {
  const mockSettings: LoggingSettings = {
    level: 'info',
    format: 'json',
    auditEnabled: false,
    retentionDays: 30,
    maxFileSize: '10MB',
    maxFiles: 5
  }
  
  const logger = new Logger(mockSettings)
  
  // Mock all methods
  jest.spyOn(logger, 'info').mockImplementation()
  jest.spyOn(logger, 'error').mockImplementation()
  jest.spyOn(logger, 'warn').mockImplementation()
  jest.spyOn(logger, 'debug').mockImplementation()
  // Mock logger methods
  
  return logger as jest.Mocked<Logger>
}

/**
 * Mock async function that resolves
 */
export function mockAsyncFunction<T>(returnValue: T): jest.MockedFunction<() => Promise<T>> {
  return jest.fn().mockResolvedValue(returnValue)
}

/**
 * Mock async function that rejects
 */
export function mockRejectedFunction(error: Error): jest.MockedFunction<() => Promise<never>> {
  return jest.fn().mockRejectedValue(error)
}

/**
 * Create temporary test directory
 */
export function createTempDir(): string {
  const os = require('os')
  const path = require('path')
  const fs = require('fs')
  
  const tempDir = path.join(os.tmpdir(), `vtex-test-${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })
  
  return tempDir
}

/**
 * Clean up temporary directory
 */
export function cleanupTempDir(dir: string): void {
  const fs = require('fs')
  
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Create mock configuration for testing
 */
export function createMockConfig(): AppConfig {
  return {
    environment: 'development',
    vtex: {
      account: 'testaccount',
      workspace: 'dev',
      authToken: 'test-token',
      userEmail: 'test@test.com',
      timeout: 30000,
      retryAttempts: 3,
      apiVersion: '1.0',
      region: 'aws-us-east-1'
    },
    app: {
      vendor: 'testvendor',
      name: 'testapp',
      versionPrefix: '1.0',
      autoInstall: true,
      autoPublish: false,
      skipTests: false,
      requireApproval: false
    },
    deployment: {
      timeout: 300,
      maxRetries: 3,
      rollbackOnFailure: true,
      healthCheckTimeout: 60,
      healthCheckRetries: 3,
      parallelDeployments: false,
      maxParallelJobs: 1
    },
    workspace: {
      createWorkspace: true,
      workspacePrefix: 'test',
      workspaceCleanup: true,
      workspaceTTL: '24h',
      promoteRequiresApproval: false,
      autoPromoteToMaster: false
    },
    notifications: {
      enabled: true,
      slack: {
        enabled: true,
        webhookUrl: 'https://hooks.slack.com/test',
        channel: '#deployments'
      },
      email: {
        enabled: false,
        smtpHost: 'smtp.test.com',
        smtpPort: 587,
        smtpSecure: true,
        smtpUser: 'test@test.com',
        smtpPassword: 'password',
        from: 'test@test.com',
        to: ['admin@test.com']
      }
    },
    git: {
      mainBranch: 'main',
      productionBranch: 'production',
      allowedBranchPrefixes: ['feature/', 'hotfix/'],
      requirePullRequest: true,
      requireCodeReview: true,
      autoMerge: false,
      deleteFeatureBranches: true
    },
    docker: {
      enabled: false,
      registry: 'docker.io',
      tagPrefix: 'v',
      securityScan: true,
      pushOnSuccess: true
    },
    security: {
      enableSecurityScan: true,
      blockOnVulnerabilities: false,
      tokenRefreshInterval: 3600,
      securityScanTimeout: 300,
      allowedVulnerabilityLevels: ['low', 'medium'],
      encryptSecrets: true
    },
    monitoring: {
      enabled: true,
      metricsEndpoint: 'http://localhost:9090',
      healthCheckInterval: 30,
      performanceMonitoring: true,
      alertThresholds: {
        deploymentFailureRate: 0.1,
        deploymentDuration: 600,
        errorRate: 0.05,
        responseTime: 1000
      }
    },
    logging: {
      level: 'info',
      format: 'json',
      auditEnabled: true,
      retentionDays: 30,
      maxFileSize: '10MB',
      maxFiles: 5
    },
    healthCheck: {
      enabled: true,
      interval: 30000,
      timeout: 10000,
      retries: 3
    }
  }
}

/**
 * Create default logging settings for testing
 */
export function createMockLoggingSettings(): LoggingSettings {
  return {
    level: 'info',
    format: 'json',
    auditEnabled: false,
    retentionDays: 7,
    maxFileSize: '10MB',
    maxFiles: 5
  }
}

/**
 * Create mock deployment options for testing
 */
export function createMockDeploymentOptions(options: any = {}): any {
  return {
    environment: options.environment || 'qa',
    branch: options.branch || 'develop',
    workspace: options.workspace || 'qa-workspace',
    force: options.force || false,
    skipValidation: options.skipValidation || false,
    skipTests: options.skipTests || false,
    canary: options.canary || false,
    ...options
  }
}

/**
 * Create mock deployment result for testing
 */
export function createMockDeploymentResult(options: any = {}): any {
  return {
    success: options.success !== undefined ? options.success : true,
    id: options.id || `deploy-${Date.now()}`,
    environment: options.environment || 'qa',
    version: options.version || '1.0.0',
    workspace: options.workspace || 'qa-workspace',
    status: options.status || 'completed',
    startTime: options.startTime || new Date(),
    endTime: options.endTime || new Date(),
    duration: options.duration || 1000,
    logs: options.logs || [],
    error: options.error || undefined,
    canary: options.canary || false,
    ...options
  }
}
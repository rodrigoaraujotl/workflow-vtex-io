import { Logger } from '../../src/utils/logger'
import { ConfigManager } from '../../src/utils/config-manager'
import { VTEXClient } from '../../src/core/vtex-client'
import { GitOperations } from '../../src/core/git-operations'
import { ValidationEngine } from '../../src/core/validation-engine'
import { DeployManager } from '../../src/core/deploy-manager'
import { NotificationService } from '../../src/services/notification-service'
import { HealthCheckService } from '../../src/services/health-check-service'
import { jest } from '@jest/globals'

// Mock Logger
export const createMockLogger = (): jest.Mocked<Logger> => {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    setLevel: jest.fn(),
    getLevel: jest.fn().mockReturnValue('info')
  } as jest.Mocked<Logger>
}

// Mock ConfigManager
export const createMockConfigManager = (): jest.Mocked<ConfigManager> => {
  const mockConfig = {
    vtex: {
      account: 'test-account',
      workspace: 'test-workspace',
      region: 'aws-us-east-1'
    },
    deployment: {
      timeout: 300000,
      retries: 3,
      autoRollback: true
    },
    notifications: {
      enabled: false
    }
  }

  return {
    loadConfig: jest.fn().mockResolvedValue(mockConfig),
    saveConfig: jest.fn().mockResolvedValue(undefined),
    getConfig: jest.fn().mockReturnValue(mockConfig),
    setConfig: jest.fn().mockReturnValue(undefined),
    configExists: jest.fn().mockResolvedValue(true),
    validateConfig: jest.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }),
    initializeConfig: jest.fn().mockResolvedValue(undefined),
    exportConfig: jest.fn().mockResolvedValue('{}'),
    importConfig: jest.fn().mockResolvedValue(undefined)
  } as jest.Mocked<ConfigManager>
}

// Mock VTEXClient
export const createMockVTEXClient = (): jest.Mocked<VTEXClient> => {
  return {
    validateCLI: jest.fn().mockResolvedValue('3.0.0'),
    validateAccount: jest.fn().mockResolvedValue({ account: 'test-account', region: 'aws-us-east-1' }),
    useWorkspace: jest.fn().mockResolvedValue(undefined),
    createWorkspace: jest.fn().mockResolvedValue(undefined),
    deleteWorkspace: jest.fn().mockResolvedValue(undefined),
    listWorkspaces: jest.fn().mockResolvedValue(['master', 'test-workspace']),
    getWorkspaceInfo: jest.fn().mockResolvedValue({ name: 'test-workspace', production: false }),
    validateWorkspace: jest.fn().mockResolvedValue(true),
    installApp: jest.fn().mockResolvedValue(undefined),
    uninstallApp: jest.fn().mockResolvedValue(undefined),
    listApps: jest.fn().mockResolvedValue([]),
    getCurrentAppVersion: jest.fn().mockResolvedValue('1.0.0'),
    getAllAppVersions: jest.fn().mockResolvedValue(['1.0.0', '0.9.0']),
    isAppInstalled: jest.fn().mockResolvedValue(false),
    getAppInfo: jest.fn().mockResolvedValue({ name: 'test-app', version: '1.0.0' }),
    releaseApp: jest.fn().mockResolvedValue(undefined),
    promoteWorkspace: jest.fn().mockResolvedValue(undefined)
  } as jest.Mocked<VTEXClient>
}

// Mock GitOperations
export const createMockGitOperations = (): jest.Mocked<GitOperations> => {
  return {
    getCurrentBranch: jest.fn().mockResolvedValue('main'),
    getStatus: jest.fn().mockResolvedValue('clean'),
    getCommitHash: jest.fn().mockResolvedValue('abc123'),
    getCommitMessage: jest.fn().mockResolvedValue('Test commit'),
    getCommitAuthor: jest.fn().mockResolvedValue('Test User <test@example.com>'),
    getCommitLog: jest.fn().mockResolvedValue([]),
    createBranch: jest.fn().mockResolvedValue(undefined),
    switchBranch: jest.fn().mockResolvedValue(undefined),
    deleteBranch: jest.fn().mockResolvedValue(undefined),
    listBranches: jest.fn().mockResolvedValue(['main', 'develop']),
    addFiles: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    push: jest.fn().mockResolvedValue(undefined),
    pull: jest.fn().mockResolvedValue(undefined),
    fetch: jest.fn().mockResolvedValue(undefined),
    createTag: jest.fn().mockResolvedValue(undefined),
    listTags: jest.fn().mockResolvedValue([]),
    getDiff: jest.fn().mockResolvedValue(''),
    getRemoteInfo: jest.fn().mockResolvedValue({ origin: 'https://github.com/test/repo.git' }),
    isClean: jest.fn().mockResolvedValue(true),
    branchExists: jest.fn().mockResolvedValue(true),
    getLatestTag: jest.fn().mockResolvedValue('v1.0.0'),
    stash: jest.fn().mockResolvedValue(undefined),
    stashPop: jest.fn().mockResolvedValue(undefined),
    isGitRepository: jest.fn().mockResolvedValue(true)
  } as jest.Mocked<GitOperations>
}

// Mock ValidationEngine
export const createMockValidationEngine = (): jest.Mocked<ValidationEngine> => {
  return {
    validateManifest: jest.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }),
    checkDependencies: jest.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }),
    securityScan: jest.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }),
    runTests: jest.fn().mockResolvedValue({ success: true, output: 'All tests passed' }),
    runSmokeTests: jest.fn().mockResolvedValue({ success: true, output: 'Smoke tests passed' }),
    validateProductionReadiness: jest.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }),
    checkSecurityCompliance: jest.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] })
  } as jest.Mocked<ValidationEngine>
}

// Mock NotificationService
export const createMockNotificationService = (): jest.Mocked<NotificationService> => {
  return {
    sendDeploymentStarted: jest.fn().mockResolvedValue(undefined),
    sendDeploymentSuccess: jest.fn().mockResolvedValue(undefined),
    sendDeploymentFailed: jest.fn().mockResolvedValue(undefined),
    sendRollbackStarted: jest.fn().mockResolvedValue(undefined),
    sendRollbackSuccess: jest.fn().mockResolvedValue(undefined),
    sendRollbackFailed: jest.fn().mockResolvedValue(undefined),
    sendHealthAlert: jest.fn().mockResolvedValue(undefined),
    sendCustomNotification: jest.fn().mockResolvedValue(undefined),
    testNotifications: jest.fn().mockResolvedValue({ slack: true, email: true }),
    getEnabledNotifiers: jest.fn().mockReturnValue(['slack']),
    isEnabled: jest.fn().mockReturnValue(false),
    validateConfiguration: jest.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] })
  } as jest.Mocked<NotificationService>
}

// Mock HealthCheckService
export const createMockHealthCheckService = (): jest.Mocked<HealthCheckService> => {
  return {
    runHealthCheck: jest.fn().mockResolvedValue({
      overall: 'healthy',
      services: [],
      timestamp: new Date(),
      recommendations: []
    }),
    startContinuousMonitoring: jest.fn(),
    stopContinuousMonitoring: jest.fn(),
    isMonitoring: jest.fn().mockReturnValue(false),
    getLastResults: jest.fn().mockReturnValue([]),
    validateConfiguration: jest.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] })
  } as jest.Mocked<HealthCheckService>
}

// Test data generators
export const generateDeploymentId = (): string => {
  return `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export const generateVersion = (): string => {
  const major = Math.floor(Math.random() * 10)
  const minor = Math.floor(Math.random() * 10)
  const patch = Math.floor(Math.random() * 10)
  return `${major}.${minor}.${patch}`
}

export const createTestManifest = () => ({
  name: 'test-app',
  vendor: 'test-vendor',
  version: '1.0.0',
  title: 'Test App',
  description: 'A test application',
  dependencies: {},
  builders: {
    'react': '3.x',
    'store': '0.x'
  }
})

export const createTestPackageJson = () => ({
  name: 'test-app',
  version: '1.0.0',
  description: 'A test application',
  scripts: {
    test: 'jest',
    build: 'vtex build'
  },
  dependencies: {
    react: '^17.0.0'
  },
  devDependencies: {
    '@types/react': '^17.0.0',
    jest: '^27.0.0'
  }
})

// Async test helpers
export const waitFor = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const expectToThrow = async (fn: () => Promise<any>, expectedError?: string): Promise<void> => {
  try {
    await fn()
    throw new Error('Expected function to throw, but it did not')
  } catch (error) {
    if (expectedError && !(error as Error).message.includes(expectedError)) {
      throw new Error(`Expected error to contain "${expectedError}", but got: ${(error as Error).message}`)
    }
  }
}

// Mock file system operations
export const mockFs = {
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  unlinkSync: jest.fn(),
  copyFileSync: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  promises: {
    readFile: jest.fn().mockResolvedValue(''),
    writeFile: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn().mockResolvedValue([]),
    stat: jest.fn().mockResolvedValue({}),
    unlink: jest.fn().mockResolvedValue(undefined),
    copyFile: jest.fn().mockResolvedValue(undefined)
  }
}

// Mock child process operations
export const mockExec = jest.fn()

// Mock axios for HTTP requests
export const mockAxios = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn()
}

// Test environment setup
export const setupTestEnvironment = () => {
  // Reset all mocks
  jest.clearAllMocks()
  
  // Set test environment variables
  process.env.NODE_ENV = 'test'
  process.env.VTEX_ACCOUNT = 'test-account'
  process.env.VTEX_WORKSPACE = 'test-workspace'
}

// Cleanup test environment
export const cleanupTestEnvironment = () => {
  jest.clearAllMocks()
  delete process.env.VTEX_ACCOUNT
  delete process.env.VTEX_WORKSPACE
}
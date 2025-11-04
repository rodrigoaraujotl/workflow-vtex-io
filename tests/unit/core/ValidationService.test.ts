/**
 * Unit tests for ValidationService
 */

import { ValidationService } from '@/core/ValidationService'
import { ConfigManager } from '@/core/ConfigManager'
import { GitService } from '@/core/GitService'
import { VtexService } from '@/core/VtexService'
import { Logger } from '@/utils/Logger'
import {
  createMockConfig,
  createMockDeploymentOptions,
  mockAsyncFunction,
  mockRejectedFunction,
  createMockLoggingSettings,
} from '@tests/test-utils'

// Mock dependencies
jest.mock('@/core/ConfigManager')
jest.mock('@/core/GitService')
jest.mock('@/core/VtexService')
jest.mock('@/utils/Logger')

describe('ValidationService', () => {
  let validationService: ValidationService
  let mockConfig: ConfigManager
  let mockGitService: GitService
  let mockVtexService: VtexService
  let mockLogger: Logger

  beforeEach(() => {
    // Create mock instances
    mockConfig = new ConfigManager() as jest.Mocked<ConfigManager>
    mockGitService = new GitService(mockConfig) as jest.Mocked<GitService>
    mockVtexService = new VtexService(mockConfig) as jest.Mocked<VtexService>
    mockLogger = new Logger(createMockLoggingSettings()) as jest.Mocked<Logger>

    // Setup default mock implementations
    mockConfig.get = jest.fn().mockImplementation((key: string) => {
      const config = createMockConfig()
      return key.split('.').reduce((obj, k) => obj?.[k], config)
    })

    mockGitService.getCurrentBranch = mockAsyncFunction('develop')
    mockGitService.getLatestCommit = mockAsyncFunction({
      hash: 'abc123',
      message: 'feat: add new feature',
      author: 'test-user',
      date: new Date(),
    })
    mockGitService.hasUncommittedChanges = mockAsyncFunction(false)
    mockGitService.getBranchStatus = mockAsyncFunction({
      ahead: 0,
      behind: 0,
      current: 'develop',
    })

    mockVtexService.validateWorkspace = mockAsyncFunction({
      valid: true,
      workspace: 'test-qa',
    })
    mockVtexService.checkAppCompatibility = mockAsyncFunction({
      compatible: true,
      issues: [],
    })

    mockLogger.info = jest.fn()
    mockLogger.error = jest.fn()
    mockLogger.warn = jest.fn()
    mockLogger.debug = jest.fn()

    // Create ValidationService instance
    validationService = new ValidationService(mockConfig)
  })

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(validationService).toBeInstanceOf(ValidationService)
      expect(mockConfig).toBeDefined()
    })
  })

  describe('validateDeployment', () => {
    it('should pass validation for valid deployment options', async () => {
      const options = createMockDeploymentOptions({
        environment: 'qa',
        branch: 'develop',
      })

      const result = await validationService.validateDeployment(options)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    it('should validate git repository state', async () => {
      const options = createMockDeploymentOptions()

      await validationService.validateDeployment(options)

      expect(mockGitService.getCurrentBranch).toHaveBeenCalled()
      expect(mockGitService.hasUncommittedChanges).toHaveBeenCalled()
      expect(mockGitService.getBranchStatus).toHaveBeenCalled()
    })

    it('should fail validation when there are uncommitted changes', async () => {
      const options = createMockDeploymentOptions()
      
      mockGitService.hasUncommittedChanges = mockAsyncFunction(true)

      const result = await validationService.validateDeployment(options)

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('uncommitted changes')
    })

    it('should validate branch compatibility', async () => {
      const options = createMockDeploymentOptions({
        environment: 'production',
        branch: 'develop', // Wrong branch for production
      })

      const result = await validationService.validateDeployment(options)

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('branch')
    })

    it('should validate workspace availability', async () => {
      const options = createMockDeploymentOptions()

      await validationService.validateDeployment(options)

      expect(mockVtexService.validateWorkspace).toHaveBeenCalledWith(
        options.workspace || 'test-qa'
      )
    })

    it('should fail validation when workspace is invalid', async () => {
      const options = createMockDeploymentOptions()
      
      mockVtexService.validateWorkspace = mockAsyncFunction({
        valid: false,
        error: 'Workspace not found',
      })

      const result = await validationService.validateDeployment(options)

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('Workspace not found')
    })

    it('should check app compatibility', async () => {
      const options = createMockDeploymentOptions()

      await validationService.validateDeployment(options)

      expect(mockVtexService.checkAppCompatibility).toHaveBeenCalled()
    })

    it('should warn about app compatibility issues', async () => {
      const options = createMockDeploymentOptions()
      
      mockVtexService.checkAppCompatibility = mockAsyncFunction({
        compatible: true,
        issues: [
          { type: 'warning', message: 'Deprecated API usage detected' },
        ],
      })

      const result = await validationService.validateDeployment(options)

      expect(result.isValid).toBe(true)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0].message).toContain('Deprecated API')
    })

    it('should fail validation for incompatible apps', async () => {
      const options = createMockDeploymentOptions()
      
      mockVtexService.checkAppCompatibility = mockAsyncFunction({
        compatible: false,
        issues: [
          { type: 'error', message: 'Breaking API changes detected' },
        ],
      })

      const result = await validationService.validateDeployment(options)

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('Breaking API changes')
    })
  })

  describe('validateGitState', () => {
    it('should validate clean git state', async () => {
      const result = await validationService.validateGitState()

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect uncommitted changes', async () => {
      mockGitService.hasUncommittedChanges = mockAsyncFunction(true)

      const result = await validationService.validateGitState()

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('uncommitted changes')
    })

    it('should detect unpushed commits', async () => {
      mockGitService.getBranchStatus = mockAsyncFunction({
        ahead: 2,
        behind: 0,
        current: 'develop',
      })

      const result = await validationService.validateGitState()

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('unpushed commits')
    })

    it('should warn about outdated branch', async () => {
      mockGitService.getBranchStatus = mockAsyncFunction({
        ahead: 0,
        behind: 3,
        current: 'develop',
      })

      const result = await validationService.validateGitState()

      expect(result.isValid).toBe(true)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0].message).toContain('behind')
    })
  })

  describe('validateBranch', () => {
    it('should validate correct branch for QA environment', async () => {
      const result = await validationService.validateBranch('develop', 'qa')

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should validate correct branch for production environment', async () => {
      const result = await validationService.validateBranch('main', 'production')

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail validation for wrong branch in production', async () => {
      const result = await validationService.validateBranch('develop', 'production')

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('production deployments require main branch')
    })

    it('should allow feature branches in QA with warning', async () => {
      const result = await validationService.validateBranch('feature/new-feature', 'qa')

      expect(result.isValid).toBe(true)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0].message).toContain('feature branch')
    })

    it('should reject invalid branch names', async () => {
      const result = await validationService.validateBranch('invalid/branch/name!', 'qa')

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('invalid branch name')
    })
  })

  describe('validateWorkspace', () => {
    it('should validate existing workspace', async () => {
      const result = await validationService.validateWorkspace('test-qa')

      expect(result.isValid).toBe(true)
      expect(mockVtexService.validateWorkspace).toHaveBeenCalledWith('test-qa')
    })

    it('should fail validation for non-existent workspace', async () => {
      mockVtexService.validateWorkspace = mockAsyncFunction({
        valid: false,
        error: 'Workspace does not exist',
      })

      const result = await validationService.validateWorkspace('non-existent')

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('Workspace does not exist')
    })

    it('should handle workspace validation errors', async () => {
      mockVtexService.validateWorkspace = mockRejectedFunction(
        new Error('Network error')
      )

      const result = await validationService.validateWorkspace('test-qa')

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('Network error')
    })
  })

  describe('validateEnvironment', () => {
    it('should validate QA environment', async () => {
      const options = createMockDeploymentOptions({ environment: 'qa' })

      const result = await validationService.validateEnvironment(options)

      expect(result.isValid).toBe(true)
    })

    it('should validate production environment with stricter rules', async () => {
      const options = createMockDeploymentOptions({
        environment: 'production',
        branch: 'main',
        confirm: true,
      })

      const result = await validationService.validateEnvironment(options)

      expect(result.isValid).toBe(true)
    })

    it('should require confirmation for production deployments', async () => {
      const options = createMockDeploymentOptions({
        environment: 'production',
        confirm: false,
      })

      const result = await validationService.validateEnvironment(options)

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('confirmation required')
    })

    it('should reject invalid environment names', async () => {
      const options = createMockDeploymentOptions({
        environment: 'invalid' as any,
      })

      const result = await validationService.validateEnvironment(options)

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('invalid environment')
    })
  })

  describe('validateConfiguration', () => {
    it('should validate complete configuration', async () => {
      const result = await validationService.validateConfiguration()

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect missing required configuration', async () => {
      mockConfig.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'vtex.account') return undefined
        const config = createMockConfig()
        return key.split('.').reduce((obj, k) => obj?.[k], config)
      })

      const result = await validationService.validateConfiguration()

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('VTEX account')
    })

    it('should validate configuration values', async () => {
      mockConfig.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'deployment.timeout') return -1 // Invalid timeout
        const config = createMockConfig()
        return key.split('.').reduce((obj, k) => obj?.[k], config)
      })

      const result = await validationService.validateConfiguration()

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('timeout')
    })
  })

  describe('error handling', () => {
    it('should handle git service errors gracefully', async () => {
      mockGitService.getCurrentBranch = mockRejectedFunction(
        new Error('Git not initialized')
      )

      const options = createMockDeploymentOptions()
      const result = await validationService.validateDeployment(options)

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('Git not initialized')
    })

    it('should handle VTEX service errors gracefully', async () => {
      mockVtexService.validateWorkspace = mockRejectedFunction(
        new Error('VTEX API unavailable')
      )

      const options = createMockDeploymentOptions()
      const result = await validationService.validateDeployment(options)

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveValidationErrors()
      expect(result.errors[0].message).toContain('VTEX API unavailable')
    })

    it('should continue validation even if some checks fail', async () => {
      mockGitService.getCurrentBranch = mockRejectedFunction(
        new Error('Git error')
      )
      // Other services should still be called

      const options = createMockDeploymentOptions()
      const result = await validationService.validateDeployment(options)

      expect(mockVtexService.validateWorkspace).toHaveBeenCalled()
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('performance', () => {
    it('should complete validation within reasonable time', async () => {
      const startTime = Date.now()
      const options = createMockDeploymentOptions()

      await validationService.validateDeployment(options)

      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
    })

    it('should run validation checks in parallel when possible', async () => {
      const options = createMockDeploymentOptions()

      await validationService.validateDeployment(options)

      // All async operations should have been called
      expect(mockGitService.getCurrentBranch).toHaveBeenCalled()
      expect(mockGitService.hasUncommittedChanges).toHaveBeenCalled()
      expect(mockVtexService.validateWorkspace).toHaveBeenCalled()
      expect(mockVtexService.checkAppCompatibility).toHaveBeenCalled()
    })
  })
})
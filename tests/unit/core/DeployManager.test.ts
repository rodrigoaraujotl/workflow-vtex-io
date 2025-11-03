/**
 * Unit tests for DeployManager
 */

import { DeployManager } from '@/core/DeployManager'
import { ConfigManager } from '@/core/ConfigManager'
import { ValidationService } from '@/core/ValidationService'
import { GitService } from '@/core/GitService'
import { VtexService } from '@/core/VtexService'
import { Logger } from '@/utils/Logger'
import { NotificationService } from '@/core/NotificationService'
import { HealthChecker } from '@/core/HealthChecker'
import {
  createMockConfig,
  createMockDeploymentOptions,
  createMockDeploymentResult,
  mockAsyncFunction,
  mockRejectedFunction,
} from '@tests/setup'

// Mock all dependencies
jest.mock('@/core/ConfigManager')
jest.mock('@/core/ValidationService')
jest.mock('@/core/GitService')
jest.mock('@/core/VtexService')
jest.mock('@/utils/Logger')
jest.mock('@/core/NotificationService')
jest.mock('@/core/HealthChecker')

describe('DeployManager', () => {
  let deployManager: DeployManager
  let mockConfig: ConfigManager
  let mockValidationService: ValidationService
  let mockGitService: GitService
  let mockVtexService: VtexService
  let mockLogger: Logger
  let mockNotificationService: NotificationService
  let mockHealthChecker: HealthChecker

  beforeEach(() => {
    // Create mock instances
    mockConfig = new ConfigManager() as jest.Mocked<ConfigManager>
    mockValidationService = new ValidationService(mockConfig) as jest.Mocked<ValidationService>
    mockGitService = new GitService(mockConfig) as jest.Mocked<GitService>
    mockVtexService = new VtexService(mockConfig) as jest.Mocked<VtexService>
    mockLogger = new Logger() as jest.Mocked<Logger>
    mockNotificationService = new NotificationService(mockConfig) as jest.Mocked<NotificationService>
    mockHealthChecker = new HealthChecker(mockConfig) as jest.Mocked<HealthChecker>

    // Setup default mock implementations
    mockConfig.get = jest.fn().mockImplementation((key: string) => {
      const config = createMockConfig()
      return key.split('.').reduce((obj, k) => obj?.[k], config)
    })

    mockValidationService.validateDeployment = mockAsyncFunction({
      isValid: true,
      errors: [],
      warnings: [],
    })

    mockGitService.getCurrentBranch = mockAsyncFunction('develop')
    mockGitService.getLatestCommit = mockAsyncFunction({
      hash: 'abc123',
      message: 'test commit',
      author: 'test-user',
      date: new Date(),
    })

    mockVtexService.deployToWorkspace = mockAsyncFunction({
      success: true,
      workspaceUrl: 'https://test-qa--test-account.myvtex.com',
    })

    mockHealthChecker.checkHealth = mockAsyncFunction({
      healthy: true,
      checks: [],
    })

    mockNotificationService.sendDeploymentNotification = mockAsyncFunction(undefined)

    mockLogger.info = jest.fn()
    mockLogger.error = jest.fn()
    mockLogger.warn = jest.fn()
    mockLogger.debug = jest.fn()

    // Create DeployManager instance
    deployManager = new DeployManager(mockConfig)
  })

  describe('constructor', () => {
    it('should initialize with all required services', () => {
      expect(deployManager).toBeInstanceOf(DeployManager)
      expect(mockConfig).toBeDefined()
    })
  })

  describe('deployToQA', () => {
    it('should successfully deploy to QA environment', async () => {
      const options = createMockDeploymentOptions({
        environment: 'qa',
        branch: 'develop',
      })

      const result = await deployManager.deployToQA(options)

      expect(result).toBeValidDeploymentResult()
      expect(result.success).toBe(true)
      expect(result.environment).toBe('qa')
      expect(mockValidationService.validateDeployment).toHaveBeenCalledWith(options)
      expect(mockVtexService.deployToWorkspace).toHaveBeenCalled()
      expect(mockNotificationService.sendDeploymentNotification).toHaveBeenCalled()
    })

    it('should fail deployment when validation fails', async () => {
      const options = createMockDeploymentOptions()
      
      mockValidationService.validateDeployment = mockAsyncFunction({
        isValid: false,
        errors: [{ message: 'Validation failed', severity: 'error' }],
        warnings: [],
      })

      await expect(deployManager.deployToQA(options)).rejects.toThrow('Deployment validation failed')
      expect(mockVtexService.deployToWorkspace).not.toHaveBeenCalled()
    })

    it('should skip validation when skipValidation is true', async () => {
      const options = createMockDeploymentOptions({
        skipValidation: true,
      })

      const result = await deployManager.deployToQA(options)

      expect(result.success).toBe(true)
      expect(mockValidationService.validateDeployment).not.toHaveBeenCalled()
      expect(mockVtexService.deployToWorkspace).toHaveBeenCalled()
    })

    it('should handle VTEX deployment failures', async () => {
      const options = createMockDeploymentOptions()
      
      mockVtexService.deployToWorkspace = mockRejectedFunction(
        new Error('VTEX deployment failed')
      )

      await expect(deployManager.deployToQA(options)).rejects.toThrow('VTEX deployment failed')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should perform health check after deployment', async () => {
      const options = createMockDeploymentOptions()

      await deployManager.deployToQA(options)

      expect(mockHealthChecker.checkHealth).toHaveBeenCalled()
    })
  })

  describe('deployToProduction', () => {
    it('should successfully deploy to production environment', async () => {
      const options = createMockDeploymentOptions({
        environment: 'production',
        branch: 'main',
      })

      const result = await deployManager.deployToProduction(options)

      expect(result).toBeValidDeploymentResult()
      expect(result.success).toBe(true)
      expect(result.environment).toBe('production')
      expect(mockValidationService.validateDeployment).toHaveBeenCalledWith(options)
      expect(mockVtexService.deployToWorkspace).toHaveBeenCalled()
    })

    it('should enforce stricter validation for production', async () => {
      const options = createMockDeploymentOptions({
        environment: 'production',
        skipValidation: true, // Should be ignored for production
      })

      await deployManager.deployToProduction(options)

      // Validation should still be called even with skipValidation=true
      expect(mockValidationService.validateDeployment).toHaveBeenCalled()
    })

    it('should handle canary deployment', async () => {
      const options = createMockDeploymentOptions({
        environment: 'production',
        canary: true,
        canaryPercentage: 10,
      })

      mockVtexService.deployCanary = mockAsyncFunction({
        success: true,
        canaryUrl: 'https://canary--test-account.myvtex.com',
      })

      const result = await deployManager.deployToProduction(options)

      expect(result.success).toBe(true)
      expect(mockVtexService.deployCanary).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 10,
        })
      )
    })

    it('should require confirmation for production deployment', async () => {
      const options = createMockDeploymentOptions({
        environment: 'production',
        confirm: false,
      })

      await expect(deployManager.deployToProduction(options)).rejects.toThrow(
        'Production deployment requires explicit confirmation'
      )
    })
  })

  describe('rollback', () => {
    it('should successfully rollback to previous deployment', async () => {
      const options = {
        environment: 'qa' as const,
        steps: 1,
      }

      mockVtexService.getDeploymentHistory = mockAsyncFunction([
        createMockDeploymentResult({ deploymentId: 'current-123' }),
        createMockDeploymentResult({ deploymentId: 'previous-456' }),
      ])

      mockVtexService.rollbackToDeployment = mockAsyncFunction({
        success: true,
        rolledBackTo: 'previous-456',
      })

      const result = await deployManager.rollback(options)

      expect(result.success).toBe(true)
      expect(mockVtexService.rollbackToDeployment).toHaveBeenCalledWith('previous-456')
      expect(mockNotificationService.sendDeploymentNotification).toHaveBeenCalled()
    })

    it('should rollback to specific deployment ID', async () => {
      const options = {
        environment: 'qa' as const,
        deploymentId: 'specific-789',
      }

      mockVtexService.rollbackToDeployment = mockAsyncFunction({
        success: true,
        rolledBackTo: 'specific-789',
      })

      const result = await deployManager.rollback(options)

      expect(result.success).toBe(true)
      expect(mockVtexService.rollbackToDeployment).toHaveBeenCalledWith('specific-789')
    })

    it('should handle rollback failures', async () => {
      const options = {
        environment: 'qa' as const,
        steps: 1,
      }

      mockVtexService.getDeploymentHistory = mockAsyncFunction([])

      await expect(deployManager.rollback(options)).rejects.toThrow(
        'No previous deployments found for rollback'
      )
    })

    it('should perform dry run rollback', async () => {
      const options = {
        environment: 'qa' as const,
        steps: 1,
        dryRun: true,
      }

      mockVtexService.getDeploymentHistory = mockAsyncFunction([
        createMockDeploymentResult({ deploymentId: 'current-123' }),
        createMockDeploymentResult({ deploymentId: 'previous-456' }),
      ])

      const result = await deployManager.rollback(options)

      expect(result.success).toBe(true)
      expect(result.dryRun).toBe(true)
      expect(mockVtexService.rollbackToDeployment).not.toHaveBeenCalled()
    })
  })

  describe('getStatus', () => {
    it('should return deployment status for environment', async () => {
      const environment = 'qa'

      mockVtexService.getWorkspaceStatus = mockAsyncFunction({
        workspace: 'test-qa',
        status: 'active',
        apps: [],
      })

      mockHealthChecker.checkHealth = mockAsyncFunction({
        healthy: true,
        checks: [
          { name: 'endpoint', status: 'healthy', responseTime: 150 },
        ],
      })

      const status = await deployManager.getStatus(environment)

      expect(status).toBeDefined()
      expect(status.environment).toBe(environment)
      expect(status.healthy).toBe(true)
      expect(mockVtexService.getWorkspaceStatus).toHaveBeenCalled()
      expect(mockHealthChecker.checkHealth).toHaveBeenCalled()
    })

    it('should handle status check failures gracefully', async () => {
      const environment = 'qa'

      mockVtexService.getWorkspaceStatus = mockRejectedFunction(
        new Error('Workspace not found')
      )

      const status = await deployManager.getStatus(environment)

      expect(status.healthy).toBe(false)
      expect(status.error).toBeDefined()
    })
  })

  describe('getDeploymentHistory', () => {
    it('should return deployment history', async () => {
      const mockHistory = [
        createMockDeploymentResult({ deploymentId: 'deploy-1' }),
        createMockDeploymentResult({ deploymentId: 'deploy-2' }),
      ]

      mockVtexService.getDeploymentHistory = mockAsyncFunction(mockHistory)

      const history = await deployManager.getDeploymentHistory('qa')

      expect(history).toEqual(mockHistory)
      expect(mockVtexService.getDeploymentHistory).toHaveBeenCalledWith('qa')
    })

    it('should handle empty deployment history', async () => {
      mockVtexService.getDeploymentHistory = mockAsyncFunction([])

      const history = await deployManager.getDeploymentHistory('qa')

      expect(history).toEqual([])
    })
  })

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      const options = createMockDeploymentOptions()
      
      mockVtexService.deployToWorkspace = mockRejectedFunction(
        new Error('Network timeout')
      )

      await expect(deployManager.deployToQA(options)).rejects.toThrow('Network timeout')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Deployment failed'),
        expect.any(Object)
      )
    })

    it('should handle authentication errors', async () => {
      const options = createMockDeploymentOptions()
      
      mockVtexService.deployToWorkspace = mockRejectedFunction(
        new Error('Authentication failed')
      )

      await expect(deployManager.deployToQA(options)).rejects.toThrow('Authentication failed')
    })

    it('should handle configuration errors', async () => {
      mockConfig.get = jest.fn().mockReturnValue(undefined)

      await expect(deployManager.deployToQA(createMockDeploymentOptions())).rejects.toThrow()
    })
  })

  describe('notifications', () => {
    it('should send success notification after successful deployment', async () => {
      const options = createMockDeploymentOptions()

      await deployManager.deployToQA(options)

      expect(mockNotificationService.sendDeploymentNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          environment: 'qa',
        })
      )
    })

    it('should send failure notification after failed deployment', async () => {
      const options = createMockDeploymentOptions()
      
      mockVtexService.deployToWorkspace = mockRejectedFunction(
        new Error('Deployment failed')
      )

      try {
        await deployManager.deployToQA(options)
      } catch (error) {
        // Expected to throw
      }

      expect(mockNotificationService.sendDeploymentNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'failure',
          environment: 'qa',
        })
      )
    })
  })

  describe('performance monitoring', () => {
    it('should track deployment duration', async () => {
      const options = createMockDeploymentOptions()

      const result = await deployManager.deployToQA(options)

      expect(result.duration).toBeDefined()
      expect(typeof result.duration).toBe('number')
      expect(result.duration).toBeGreaterThan(0)
    })

    it('should log performance metrics', async () => {
      const options = createMockDeploymentOptions()

      await deployManager.deployToQA(options)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Deployment completed'),
        expect.objectContaining({
          duration: expect.any(Number),
        })
      )
    })
  })
})
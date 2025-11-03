import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { DeployManager } from '../../src/core/deploy-manager'
import {
  createMockLogger,
  createMockConfigManager,
  createMockVTEXClient,
  createMockGitOperations,
  createMockValidationEngine,
  createMockNotificationService,
  generateDeploymentId,
  generateVersion,
  setupTestEnvironment,
  cleanupTestEnvironment,
  expectToThrow
} from '../helpers/test-helpers'

describe('DeployManager', () => {
  let deployManager: DeployManager
  let mockLogger: any
  let mockConfig: any
  let mockVtexClient: any
  let mockGitOps: any
  let mockValidation: any
  let mockNotifications: any

  beforeEach(() => {
    setupTestEnvironment()
    
    mockLogger = createMockLogger()
    mockConfig = createMockConfigManager()
    mockVtexClient = createMockVTEXClient()
    mockGitOps = createMockGitOperations()
    mockValidation = createMockValidationEngine()
    mockNotifications = createMockNotificationService()

    deployManager = new DeployManager(
      mockLogger,
      mockConfig,
      mockVtexClient,
      mockGitOps,
      mockValidation,
      mockNotifications
    )
  })

  afterEach(() => {
    cleanupTestEnvironment()
  })

  describe('deployToQA', () => {
    it('should successfully deploy to QA environment', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      const result = await deployManager.deployToQA(options)

      expect(result.success).toBe(true)
      expect(result.deploymentId).toBeDefined()
      expect(result.environment).toBe('qa')
      expect(result.workspace).toBe('test-workspace')
      expect(result.branch).toBe('feature/test')

      // Verify the deployment flow
      expect(mockValidation.validateManifest).toHaveBeenCalled()
      expect(mockValidation.checkDependencies).toHaveBeenCalled()
      expect(mockValidation.runTests).toHaveBeenCalled()
      expect(mockVtexClient.useWorkspace).toHaveBeenCalledWith('test-workspace')
      expect(mockVtexClient.installApp).toHaveBeenCalled()
      expect(mockNotifications.sendDeploymentStarted).toHaveBeenCalled()
      expect(mockNotifications.sendDeploymentSuccess).toHaveBeenCalled()
    })

    it('should skip tests when skipTests is true', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: true,
        force: false
      }

      await deployManager.deployToQA(options)

      expect(mockValidation.runTests).not.toHaveBeenCalled()
    })

    it('should handle validation failures', async () => {
      mockValidation.validateManifest.mockResolvedValue({
        isValid: false,
        errors: ['Invalid manifest'],
        warnings: []
      })

      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      await expectToThrow(
        () => deployManager.deployToQA(options),
        'Validation failed'
      )

      expect(mockNotifications.sendDeploymentFailed).toHaveBeenCalled()
    })

    it('should handle VTEX client errors', async () => {
      mockVtexClient.installApp.mockRejectedValue(new Error('Installation failed'))

      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      await expectToThrow(
        () => deployManager.deployToQA(options),
        'Installation failed'
      )

      expect(mockNotifications.sendDeploymentFailed).toHaveBeenCalled()
    })

    it('should force deployment when force is true', async () => {
      mockValidation.validateManifest.mockResolvedValue({
        isValid: false,
        errors: ['Minor validation error'],
        warnings: []
      })

      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: true
      }

      const result = await deployManager.deployToQA(options)

      expect(result.success).toBe(true)
      expect(mockVtexClient.installApp).toHaveBeenCalled()
    })
  })

  describe('deployToProduction', () => {
    it('should successfully deploy to production', async () => {
      const options = {
        version: '1.0.0',
        branch: 'main',
        skipTests: false,
        force: false,
        emergency: false
      }

      const result = await deployManager.deployToProduction(options)

      expect(result.success).toBe(true)
      expect(result.deploymentId).toBeDefined()
      expect(result.environment).toBe('production')
      expect(result.version).toBe('1.0.0')
      expect(result.branch).toBe('main')

      // Verify production-specific validations
      expect(mockValidation.validateProductionReadiness).toHaveBeenCalled()
      expect(mockValidation.checkSecurityCompliance).toHaveBeenCalled()
      expect(mockVtexClient.promoteWorkspace).toHaveBeenCalled()
      expect(mockNotifications.sendDeploymentStarted).toHaveBeenCalled()
      expect(mockNotifications.sendDeploymentSuccess).toHaveBeenCalled()
    })

    it('should handle production validation failures', async () => {
      mockValidation.validateProductionReadiness.mockResolvedValue({
        isValid: false,
        errors: ['Not ready for production'],
        warnings: []
      })

      const options = {
        version: '1.0.0',
        branch: 'main',
        skipTests: false,
        force: false,
        emergency: false
      }

      await expectToThrow(
        () => deployManager.deployToProduction(options),
        'Production validation failed'
      )
    })

    it('should allow emergency deployments', async () => {
      mockValidation.validateProductionReadiness.mockResolvedValue({
        isValid: false,
        errors: ['Not ready for production'],
        warnings: []
      })

      const options = {
        version: '1.0.0',
        branch: 'main',
        skipTests: false,
        force: false,
        emergency: true
      }

      const result = await deployManager.deployToProduction(options)

      expect(result.success).toBe(true)
      expect(result.metadata?.emergency).toBe(true)
    })

    it('should require main branch for production (unless emergency)', async () => {
      const options = {
        version: '1.0.0',
        branch: 'feature/test',
        skipTests: false,
        force: false,
        emergency: false
      }

      await expectToThrow(
        () => deployManager.deployToProduction(options),
        'Production deployments must be from main branch'
      )
    })
  })

  describe('rollback', () => {
    it('should successfully rollback deployment', async () => {
      const options = {
        deploymentId: 'deploy-123',
        environment: 'qa' as const,
        version: '0.9.0',
        workspace: 'test-workspace',
        force: false
      }

      const result = await deployManager.rollback(options)

      expect(result.success).toBe(true)
      expect(result.deploymentId).toBeDefined()
      expect(result.environment).toBe('qa')
      expect(result.targetVersion).toBe('0.9.0')

      expect(mockVtexClient.installApp).toHaveBeenCalledWith(
        expect.any(String),
        '0.9.0'
      )
      expect(mockNotifications.sendRollbackStarted).toHaveBeenCalled()
      expect(mockNotifications.sendRollbackSuccess).toHaveBeenCalled()
    })

    it('should handle rollback failures', async () => {
      mockVtexClient.installApp.mockRejectedValue(new Error('Rollback failed'))

      const options = {
        deploymentId: 'deploy-123',
        environment: 'qa' as const,
        version: '0.9.0',
        workspace: 'test-workspace',
        force: false
      }

      await expectToThrow(
        () => deployManager.rollback(options),
        'Rollback failed'
      )

      expect(mockNotifications.sendRollbackFailed).toHaveBeenCalled()
    })

    it('should validate rollback version exists', async () => {
      mockVtexClient.getAllAppVersions.mockResolvedValue(['1.0.0'])

      const options = {
        deploymentId: 'deploy-123',
        environment: 'qa' as const,
        version: '0.9.0',
        workspace: 'test-workspace',
        force: false
      }

      await expectToThrow(
        () => deployManager.rollback(options),
        'Version 0.9.0 not found'
      )
    })
  })

  describe('getDeployStatus', () => {
    it('should return deployment status', async () => {
      const deploymentId = generateDeploymentId()
      
      // Mock a deployment first
      const deployOptions = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }
      
      await deployManager.deployToQA(deployOptions)

      const status = await deployManager.getDeployStatus(deploymentId)

      expect(status).toBeDefined()
      expect(status.deploymentId).toBe(deploymentId)
      expect(status.status).toBeDefined()
      expect(status.environment).toBeDefined()
    })

    it('should return null for non-existent deployment', async () => {
      const status = await deployManager.getDeployStatus('non-existent')

      expect(status).toBeNull()
    })
  })

  describe('private methods', () => {
    it('should generate unique deployment IDs', () => {
      const id1 = (deployManager as any).generateDeploymentId()
      const id2 = (deployManager as any).generateDeploymentId()

      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^deploy-\d+-[a-z0-9]+$/)
    })

    it('should get app name from manifest', async () => {
      const manifest = {
        name: 'test-app',
        vendor: 'test-vendor'
      }

      const appName = (deployManager as any).getAppName(manifest)

      expect(appName).toBe('test-vendor.test-app')
    })

    it('should generate version correctly', () => {
      const version = (deployManager as any).generateVersion()

      expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    })

    it('should validate prerequisites', async () => {
      const isValid = await (deployManager as any).validatePrerequisites()

      expect(isValid).toBe(true)
      expect(mockVtexClient.validateCLI).toHaveBeenCalled()
      expect(mockVtexClient.validateAccount).toHaveBeenCalled()
    })

    it('should handle auto-rollback on failure', async () => {
      const config = mockConfig.getConfig()
      config.deployment.autoRollback = true

      const deploymentData = {
        deploymentId: 'deploy-123',
        environment: 'qa' as const,
        previousVersion: '0.9.0',
        workspace: 'test-workspace'
      }

      await (deployManager as any).handleAutoRollback(deploymentData, new Error('Test error'))

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Auto-rollback triggered')
      )
    })
  })

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockVtexClient.validateCLI.mockRejectedValue(new Error('Network error'))

      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      await expectToThrow(
        () => deployManager.deployToQA(options),
        'Network error'
      )
    })

    it('should handle timeout errors', async () => {
      mockVtexClient.installApp.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      )

      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      await expectToThrow(
        () => deployManager.deployToQA(options),
        'Timeout'
      )
    })
  })

  describe('configuration', () => {
    it('should respect deployment timeout configuration', async () => {
      const config = mockConfig.getConfig()
      config.deployment.timeout = 1000 // 1 second

      mockVtexClient.installApp.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 2000)) // 2 seconds
      )

      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      // Should timeout before the mock resolves
      await expectToThrow(
        () => deployManager.deployToQA(options)
      )
    })

    it('should respect retry configuration', async () => {
      const config = mockConfig.getConfig()
      config.deployment.retries = 2

      let attempts = 0
      mockVtexClient.installApp.mockImplementation(() => {
        attempts++
        if (attempts < 3) {
          throw new Error('Temporary failure')
        }
        return Promise.resolve()
      })

      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      const result = await deployManager.deployToQA(options)

      expect(result.success).toBe(true)
      expect(attempts).toBe(3) // Initial attempt + 2 retries
    })
  })
})
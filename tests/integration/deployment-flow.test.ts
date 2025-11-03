import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { Logger } from '../../src/utils/logger'
import { ConfigManager } from '../../src/core/config-manager'
import { DeployManager } from '../../src/core/deploy-manager'
import { VTEXClient } from '../../src/core/vtex-client'
import { GitOperations } from '../../src/core/git-operations'
import { ValidationEngine } from '../../src/core/validation-engine'
import { NotificationService } from '../../src/services/notification-service'
import { HealthCheckService } from '../../src/services/health-check-service'
import {
  mockFs,
  mockExec,
  mockAxios,
  setupTestEnvironment,
  cleanupTestEnvironment,
  waitFor
} from '../helpers/test-helpers'
import path from 'path'
import fs from 'fs'

describe('Deployment Flow Integration', () => {
  let logger: Logger
  let configManager: ConfigManager
  let deployManager: DeployManager
  let vtexClient: VTEXClient
  let gitOps: GitOperations
  let validation: ValidationEngine
  let notifications: NotificationService
  let healthCheck: HealthCheckService

  beforeEach(() => {
    setupTestEnvironment()

    // Initialize real instances with mocked dependencies
    logger = new Logger()
    configManager = new ConfigManager(logger)
    vtexClient = new VTEXClient(logger, configManager)
    gitOps = new GitOperations(logger)
    validation = new ValidationEngine(logger, configManager, vtexClient, gitOps)
    notifications = new NotificationService(logger, configManager)
    healthCheck = new HealthCheckService(logger, configManager, vtexClient, gitOps, notifications)
    deployManager = new DeployManager(logger, configManager, vtexClient, gitOps, validation, notifications)

    // Setup basic configuration
    configManager.updateConfig({
      vtex: {
        account: 'test-account',
        workspace: 'test-workspace',
        timeout: 30000,
        retries: 2
      },
      deployment: {
        timeout: 300000,
        retries: 3,
        autoRollback: true
      },
      notifications: {
        enabled: true,
        channels: ['slack'],
        slack: {
          enabled: true,
          webhook: 'https://hooks.slack.com/test'
        }
      }
    })

    // Setup common mocks
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      name: 'test-app',
      vendor: 'test-vendor',
      version: '1.0.0'
    }))

    mockExec.mockImplementation((command: string) => {
      if (command.includes('vtex --version')) {
        return Promise.resolve({ stdout: 'vtex version 3.1.0', stderr: '' })
      }
      if (command.includes('vtex whoami')) {
        return Promise.resolve({ stdout: JSON.stringify({ account: 'test-account' }), stderr: '' })
      }
      if (command.includes('git rev-parse --abbrev-ref HEAD')) {
        return Promise.resolve({ stdout: 'feature/test', stderr: '' })
      }
      if (command.includes('git status --porcelain')) {
        return Promise.resolve({ stdout: '', stderr: '' })
      }
      if (command.includes('vtex use')) {
        return Promise.resolve({ stdout: 'Workspace changed', stderr: '' })
      }
      if (command.includes('vtex install')) {
        return Promise.resolve({ stdout: 'App installed successfully', stderr: '' })
      }
      if (command.includes('vtex test')) {
        return Promise.resolve({ stdout: 'All tests passed', stderr: '' })
      }
      return Promise.resolve({ stdout: '', stderr: '' })
    })

    mockAxios.post.mockResolvedValue({ status: 200, data: { ok: true } })
  })

  afterEach(() => {
    cleanupTestEnvironment()
  })

  describe('Complete QA Deployment Flow', () => {
    it('should execute complete QA deployment successfully', async () => {
      const deployOptions = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      const result = await deployManager.deployToQA(deployOptions)

      expect(result.success).toBe(true)
      expect(result.deploymentId).toBeDefined()
      expect(result.environment).toBe('qa')
      expect(result.workspace).toBe('test-workspace')
      expect(result.branch).toBe('feature/test')

      // Verify the complete flow was executed
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('vtex --version'))
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('vtex whoami'))
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('git status'))
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('vtex use test-workspace'))
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('vtex test'))
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('vtex install'))

      // Verify notifications were sent
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          text: expect.stringContaining('QA deployment started')
        })
      )
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          text: expect.stringContaining('QA deployment completed successfully')
        })
      )
    })

    it('should handle validation failures and trigger notifications', async () => {
      // Mock validation failure
      mockFs.readFileSync.mockReturnValue('invalid json')

      const deployOptions = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      await expect(deployManager.deployToQA(deployOptions)).rejects.toThrow()

      // Verify failure notification was sent
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          text: expect.stringContaining('QA deployment failed')
        })
      )
    })

    it('should handle VTEX CLI errors gracefully', async () => {
      // Mock VTEX CLI error
      mockExec.mockImplementation((command: string) => {
        if (command.includes('vtex install')) {
          return Promise.reject(new Error('Installation failed'))
        }
        return Promise.resolve({ stdout: 'vtex version 3.1.0', stderr: '' })
      })

      const deployOptions = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      await expect(deployManager.deployToQA(deployOptions)).rejects.toThrow('Installation failed')

      // Verify failure notification was sent
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          text: expect.stringContaining('QA deployment failed')
        })
      )
    })

    it('should retry failed operations according to configuration', async () => {
      let attempts = 0
      mockExec.mockImplementation((command: string) => {
        if (command.includes('vtex install')) {
          attempts++
          if (attempts < 3) {
            return Promise.reject(new Error('Temporary failure'))
          }
          return Promise.resolve({ stdout: 'App installed successfully', stderr: '' })
        }
        return Promise.resolve({ stdout: 'vtex version 3.1.0', stderr: '' })
      })

      const deployOptions = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      const result = await deployManager.deployToQA(deployOptions)

      expect(result.success).toBe(true)
      expect(attempts).toBe(3) // Initial attempt + 2 retries
    })
  })

  describe('Production Deployment Flow', () => {
    it('should execute complete production deployment successfully', async () => {
      // Mock production-specific validations
      mockExec.mockImplementation((command: string) => {
        if (command.includes('git rev-parse --abbrev-ref HEAD')) {
          return Promise.resolve({ stdout: 'main', stderr: '' })
        }
        if (command.includes('vtex workspace promote')) {
          return Promise.resolve({ stdout: 'Workspace promoted', stderr: '' })
        }
        return Promise.resolve({ stdout: 'vtex version 3.1.0', stderr: '' })
      })

      const deployOptions = {
        version: '1.0.0',
        branch: 'main',
        skipTests: false,
        force: false,
        emergency: false
      }

      const result = await deployManager.deployToProduction(deployOptions)

      expect(result.success).toBe(true)
      expect(result.deploymentId).toBeDefined()
      expect(result.environment).toBe('production')
      expect(result.version).toBe('1.0.0')
      expect(result.branch).toBe('main')

      // Verify production-specific operations
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('vtex workspace promote'))

      // Verify production deployment notifications
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          text: expect.stringContaining('Production deployment started')
        })
      )
    })

    it('should enforce production deployment restrictions', async () => {
      const deployOptions = {
        version: '1.0.0',
        branch: 'feature/test', // Not main branch
        skipTests: false,
        force: false,
        emergency: false
      }

      await expect(deployManager.deployToProduction(deployOptions)).rejects.toThrow(
        'Production deployments must be from main branch'
      )
    })

    it('should allow emergency deployments with relaxed restrictions', async () => {
      const deployOptions = {
        version: '1.0.0',
        branch: 'hotfix/critical-fix',
        skipTests: false,
        force: false,
        emergency: true
      }

      const result = await deployManager.deployToProduction(deployOptions)

      expect(result.success).toBe(true)
      expect(result.metadata?.emergency).toBe(true)

      // Verify emergency deployment notification
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          text: expect.stringContaining('EMERGENCY')
        })
      )
    })
  })

  describe('Rollback Flow', () => {
    it('should execute complete rollback successfully', async () => {
      // First deploy something
      const deployOptions = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      const deployResult = await deployManager.deployToQA(deployOptions)

      // Then rollback
      const rollbackOptions = {
        deploymentId: deployResult.deploymentId,
        environment: 'qa' as const,
        version: '0.9.0',
        workspace: 'test-workspace',
        force: false
      }

      const rollbackResult = await deployManager.rollback(rollbackOptions)

      expect(rollbackResult.success).toBe(true)
      expect(rollbackResult.deploymentId).toBeDefined()
      expect(rollbackResult.environment).toBe('qa')
      expect(rollbackResult.targetVersion).toBe('0.9.0')

      // Verify rollback notifications
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          text: expect.stringContaining('Rollback started')
        })
      )
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          text: expect.stringContaining('Rollback completed successfully')
        })
      )
    })

    it('should trigger auto-rollback on deployment failure', async () => {
      // Enable auto-rollback
      configManager.setValue('deployment.autoRollback', true)

      // Mock deployment failure
      mockExec.mockImplementation((command: string) => {
        if (command.includes('vtex install')) {
          return Promise.reject(new Error('Installation failed'))
        }
        return Promise.resolve({ stdout: 'vtex version 3.1.0', stderr: '' })
      })

      const deployOptions = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      await expect(deployManager.deployToQA(deployOptions)).rejects.toThrow('Installation failed')

      // Wait for auto-rollback to be triggered
      await waitFor(() => {
        expect(mockAxios.post).toHaveBeenCalledWith(
          'https://hooks.slack.com/test',
          expect.objectContaining({
            text: expect.stringContaining('Auto-rollback triggered')
          })
        )
      })
    })
  })

  describe('Health Check Integration', () => {
    it('should perform health checks during deployment', async () => {
      const deployOptions = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      const result = await deployManager.deployToQA(deployOptions)

      expect(result.success).toBe(true)

      // Verify health checks were performed
      const healthResult = await healthCheck.checkAll()

      expect(healthResult.overall).toBe('healthy')
      expect(healthResult.services).toHaveProperty('vtex')
      expect(healthResult.services).toHaveProperty('git')
      expect(healthResult.services).toHaveProperty('config')
    })

    it('should send health alerts when issues are detected', async () => {
      // Mock health check failure
      mockExec.mockImplementation((command: string) => {
        if (command.includes('vtex whoami')) {
          return Promise.reject(new Error('Authentication failed'))
        }
        return Promise.resolve({ stdout: 'vtex version 3.1.0', stderr: '' })
      })

      const healthResult = await healthCheck.checkAll()

      expect(healthResult.overall).toBe('unhealthy')

      // Verify health alert notification
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          text: expect.stringContaining('Health Alert')
        })
      )
    })
  })

  describe('Configuration Management Integration', () => {
    it('should validate configuration before deployment', async () => {
      // Set invalid configuration
      configManager.setValue('vtex.account', '')

      const deployOptions = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      await expect(deployManager.deployToQA(deployOptions)).rejects.toThrow()
    })

    it('should use environment variables to override configuration', async () => {
      process.env.VTEX_ACCOUNT = 'env-account'
      process.env.VTEX_WORKSPACE = 'env-workspace'

      // Create new config manager to pick up env vars
      const envConfigManager = new ConfigManager(logger)
      const envDeployManager = new DeployManager(
        logger,
        envConfigManager,
        vtexClient,
        gitOps,
        validation,
        notifications
      )

      const config = envConfigManager.getConfig()
      expect(config.vtex.account).toBe('env-account')
      expect(config.vtex.workspace).toBe('env-workspace')

      delete process.env.VTEX_ACCOUNT
      delete process.env.VTEX_WORKSPACE
    })
  })

  describe('Error Recovery and Resilience', () => {
    it('should handle network timeouts gracefully', async () => {
      // Mock network timeout
      mockAxios.post.mockRejectedValue(new Error('Network timeout'))

      const deployOptions = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      // Deployment should still succeed even if notifications fail
      const result = await deployManager.deployToQA(deployOptions)

      expect(result.success).toBe(true)
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send notification')
      )
    })

    it('should handle concurrent deployments correctly', async () => {
      const deployOptions1 = {
        branch: 'feature/test1',
        workspace: 'test-workspace1',
        skipTests: false,
        force: false
      }

      const deployOptions2 = {
        branch: 'feature/test2',
        workspace: 'test-workspace2',
        skipTests: false,
        force: false
      }

      // Start both deployments concurrently
      const [result1, result2] = await Promise.all([
        deployManager.deployToQA(deployOptions1),
        deployManager.deployToQA(deployOptions2)
      ])

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      expect(result1.deploymentId).not.toBe(result2.deploymentId)
    })

    it('should maintain deployment history correctly', async () => {
      // Perform multiple deployments
      const deployOptions1 = {
        branch: 'feature/test1',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      const deployOptions2 = {
        branch: 'feature/test2',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      const result1 = await deployManager.deployToQA(deployOptions1)
      const result2 = await deployManager.deployToQA(deployOptions2)

      // Check deployment history
      const status1 = await deployManager.getDeployStatus(result1.deploymentId)
      const status2 = await deployManager.getDeployStatus(result2.deploymentId)

      expect(status1).toBeDefined()
      expect(status2).toBeDefined()
      expect(status1?.deploymentId).toBe(result1.deploymentId)
      expect(status2?.deploymentId).toBe(result2.deploymentId)
    })
  })

  describe('Performance and Scalability', () => {
    it('should handle large deployment logs efficiently', async () => {
      // Mock large log output
      const largeLogs = Array(1000).fill('Log entry').join('\n')
      mockExec.mockImplementation((command: string) => {
        if (command.includes('vtex install')) {
          return Promise.resolve({ stdout: largeLogs, stderr: '' })
        }
        return Promise.resolve({ stdout: 'vtex version 3.1.0', stderr: '' })
      })

      const deployOptions = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      const startTime = Date.now()
      const result = await deployManager.deployToQA(deployOptions)
      const endTime = Date.now()

      expect(result.success).toBe(true)
      expect(endTime - startTime).toBeLessThan(10000) // Should complete within 10 seconds
    })

    it('should handle deployment timeout correctly', async () => {
      // Set short timeout
      configManager.setValue('deployment.timeout', 1000) // 1 second

      // Mock long-running deployment
      mockExec.mockImplementation((command: string) => {
        if (command.includes('vtex install')) {
          return new Promise(resolve => setTimeout(resolve, 2000)) // 2 seconds
        }
        return Promise.resolve({ stdout: 'vtex version 3.1.0', stderr: '' })
      })

      const deployOptions = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      }

      await expect(deployManager.deployToQA(deployOptions)).rejects.toThrow('timeout')
    })
  })
})
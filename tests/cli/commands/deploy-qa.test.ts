import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { Command } from 'commander'
import {
  createMockLogger,
  createMockConfigManager,
  createMockDeployManager,
  createMockGitOperations,
  createMockVTEXClient,
  createMockValidationEngine,
  createMockNotificationService,
  setupTestEnvironment,
  cleanupTestEnvironment,
  expectToThrow
} from '../../helpers/test-helpers'

// Mock the command module
const mockCommand = {
  name: jest.fn().mockReturnThis(),
  description: jest.fn().mockReturnThis(),
  option: jest.fn().mockReturnThis(),
  action: jest.fn().mockReturnThis(),
  parse: jest.fn()
}

jest.mock('commander', () => ({
  Command: jest.fn(() => mockCommand)
}))

jest.mock('inquirer', () => ({
  prompt: jest.fn()
}))

jest.mock('ora', () => jest.fn(() => ({
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis()
})))

describe('deploy-qa command', () => {
  let mockLogger: any
  let mockConfig: any
  let mockDeployManager: any
  let mockGitOps: any
  let mockVtexClient: any
  let mockValidation: any
  let mockNotifications: any
  let deployQACommand: any

  beforeEach(async () => {
    setupTestEnvironment()
    
    mockLogger = createMockLogger()
    mockConfig = createMockConfigManager()
    mockDeployManager = createMockDeployManager()
    mockGitOps = createMockGitOperations()
    mockVtexClient = createMockVTEXClient()
    mockValidation = createMockValidationEngine()
    mockNotifications = createMockNotificationService()

    // Clear all mocks
    jest.clearAllMocks()

    // Import the command after mocking dependencies
    const { createDeployQACommand } = await import('../../../src/cli/commands/deploy-qa')
    deployQACommand = createDeployQACommand(
      mockLogger,
      mockConfig,
      mockDeployManager,
      mockGitOps,
      mockVtexClient,
      mockValidation,
      mockNotifications
    )
  })

  afterEach(() => {
    cleanupTestEnvironment()
  })

  describe('command setup', () => {
    it('should create command with correct name and description', () => {
      expect(mockCommand.name).toHaveBeenCalledWith('deploy-qa')
      expect(mockCommand.description).toHaveBeenCalledWith(
        expect.stringContaining('Deploy to QA environment')
      )
    })

    it('should define all required options', () => {
      expect(mockCommand.option).toHaveBeenCalledWith(
        '-b, --branch <branch>',
        expect.any(String)
      )
      expect(mockCommand.option).toHaveBeenCalledWith(
        '-w, --workspace <workspace>',
        expect.any(String)
      )
      expect(mockCommand.option).toHaveBeenCalledWith(
        '--skip-tests',
        expect.any(String)
      )
      expect(mockCommand.option).toHaveBeenCalledWith(
        '--force',
        expect.any(String)
      )
      expect(mockCommand.option).toHaveBeenCalledWith(
        '--no-notifications',
        expect.any(String)
      )
    })

    it('should register action handler', () => {
      expect(mockCommand.action).toHaveBeenCalledWith(expect.any(Function))
    })
  })

  describe('command execution', () => {
    let actionHandler: any

    beforeEach(() => {
      // Get the action handler that was registered
      actionHandler = mockCommand.action.mock.calls[0][0]
    })

    it('should deploy successfully with default options', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      mockDeployManager.deployToQA.mockResolvedValue({
        success: true,
        deploymentId: 'deploy-123',
        environment: 'qa',
        workspace: 'test-workspace',
        branch: 'feature/test',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      })

      await actionHandler(options)

      expect(mockDeployManager.deployToQA).toHaveBeenCalledWith({
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('QA deployment completed successfully')
      )
    })

    it('should use current branch when branch not specified', async () => {
      const options = {
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      mockGitOps.getCurrentBranch.mockResolvedValue('current-branch')
      mockDeployManager.deployToQA.mockResolvedValue({
        success: true,
        deploymentId: 'deploy-123',
        environment: 'qa',
        workspace: 'test-workspace',
        branch: 'current-branch',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      })

      await actionHandler(options)

      expect(mockGitOps.getCurrentBranch).toHaveBeenCalled()
      expect(mockDeployManager.deployToQA).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'current-branch'
        })
      )
    })

    it('should use default workspace from config when not specified', async () => {
      const options = {
        branch: 'feature/test',
        skipTests: false,
        force: false,
        notifications: true
      }

      const config = mockConfig.getConfig()
      config.vtex.workspace = 'default-workspace'

      mockDeployManager.deployToQA.mockResolvedValue({
        success: true,
        deploymentId: 'deploy-123',
        environment: 'qa',
        workspace: 'default-workspace',
        branch: 'feature/test',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      })

      await actionHandler(options)

      expect(mockDeployManager.deployToQA).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: 'default-workspace'
        })
      )
    })

    it('should handle deployment failures', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      mockDeployManager.deployToQA.mockRejectedValue(new Error('Deployment failed'))

      await expectToThrow(
        () => actionHandler(options),
        'Deployment failed'
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('QA deployment failed')
      )
    })

    it('should skip tests when skipTests option is true', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: true,
        force: false,
        notifications: true
      }

      mockDeployManager.deployToQA.mockResolvedValue({
        success: true,
        deploymentId: 'deploy-123',
        environment: 'qa',
        workspace: 'test-workspace',
        branch: 'feature/test',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      })

      await actionHandler(options)

      expect(mockDeployManager.deployToQA).toHaveBeenCalledWith(
        expect.objectContaining({
          skipTests: true
        })
      )
    })

    it('should force deployment when force option is true', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: true,
        notifications: true
      }

      mockDeployManager.deployToQA.mockResolvedValue({
        success: true,
        deploymentId: 'deploy-123',
        environment: 'qa',
        workspace: 'test-workspace',
        branch: 'feature/test',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      })

      await actionHandler(options)

      expect(mockDeployManager.deployToQA).toHaveBeenCalledWith(
        expect.objectContaining({
          force: true
        })
      )
    })

    it('should validate workspace name format', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'Invalid Workspace Name',
        skipTests: false,
        force: false,
        notifications: true
      }

      await expectToThrow(
        () => actionHandler(options),
        'Invalid workspace name format'
      )
    })

    it('should validate branch exists', async () => {
      const options = {
        branch: 'non-existent-branch',
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      mockGitOps.branchExists.mockResolvedValue(false)

      await expectToThrow(
        () => actionHandler(options),
        'Branch non-existent-branch does not exist'
      )
    })

    it('should check for uncommitted changes', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      mockGitOps.hasUncommittedChanges.mockResolvedValue(true)

      await expectToThrow(
        () => actionHandler(options),
        'You have uncommitted changes'
      )
    })

    it('should allow uncommitted changes with force flag', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: true,
        notifications: true
      }

      mockGitOps.hasUncommittedChanges.mockResolvedValue(true)
      mockDeployManager.deployToQA.mockResolvedValue({
        success: true,
        deploymentId: 'deploy-123',
        environment: 'qa',
        workspace: 'test-workspace',
        branch: 'feature/test',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      })

      await actionHandler(options)

      expect(mockDeployManager.deployToQA).toHaveBeenCalled()
    })

    it('should display deployment summary', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      const deployResult = {
        success: true,
        deploymentId: 'deploy-123',
        environment: 'qa',
        workspace: 'test-workspace',
        branch: 'feature/test',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        duration: 120000,
        logs: ['Step 1 completed', 'Step 2 completed']
      }

      mockDeployManager.deployToQA.mockResolvedValue(deployResult)

      await actionHandler(options)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Deployment ID: deploy-123')
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Version: 1.0.0')
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Duration: 2m 0s')
      )
    })

    it('should handle interactive workspace selection', async () => {
      const inquirer = require('inquirer')
      
      const options = {
        branch: 'feature/test',
        skipTests: false,
        force: false,
        notifications: true
      }

      mockVtexClient.listWorkspaces.mockResolvedValue([
        { name: 'workspace1', weight: 0, production: false },
        { name: 'workspace2', weight: 0, production: false }
      ])

      inquirer.prompt.mockResolvedValue({ workspace: 'workspace1' })

      mockDeployManager.deployToQA.mockResolvedValue({
        success: true,
        deploymentId: 'deploy-123',
        environment: 'qa',
        workspace: 'workspace1',
        branch: 'feature/test',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      })

      await actionHandler(options)

      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'list',
          name: 'workspace',
          message: 'Select workspace:',
          choices: ['workspace1', 'workspace2']
        })
      ])

      expect(mockDeployManager.deployToQA).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: 'workspace1'
        })
      )
    })

    it('should handle deployment warnings', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      const deployResult = {
        success: true,
        deploymentId: 'deploy-123',
        environment: 'qa',
        workspace: 'test-workspace',
        branch: 'feature/test',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        warnings: ['Warning: Deprecated API used', 'Warning: Missing tests']
      }

      mockDeployManager.deployToQA.mockResolvedValue(deployResult)

      await actionHandler(options)

      expect(mockLogger.warn).toHaveBeenCalledWith('Warning: Deprecated API used')
      expect(mockLogger.warn).toHaveBeenCalledWith('Warning: Missing tests')
    })

    it('should disable notifications when no-notifications flag is set', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: false
      }

      mockDeployManager.deployToQA.mockResolvedValue({
        success: true,
        deploymentId: 'deploy-123',
        environment: 'qa',
        workspace: 'test-workspace',
        branch: 'feature/test',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      })

      await actionHandler(options)

      // Verify notifications were not sent
      expect(mockNotifications.sendDeploymentStarted).not.toHaveBeenCalled()
      expect(mockNotifications.sendDeploymentSuccess).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    let actionHandler: any

    beforeEach(() => {
      actionHandler = mockCommand.action.mock.calls[0][0]
    })

    it('should handle git operation errors', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      mockGitOps.getCurrentBranch.mockRejectedValue(new Error('Git error'))

      await expectToThrow(
        () => actionHandler(options),
        'Git error'
      )
    })

    it('should handle VTEX client errors', async () => {
      const options = {
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      mockVtexClient.listWorkspaces.mockRejectedValue(new Error('VTEX API error'))

      await expectToThrow(
        () => actionHandler(options),
        'VTEX API error'
      )
    })

    it('should handle validation errors', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      mockValidation.validateManifest.mockResolvedValue({
        isValid: false,
        errors: ['Invalid manifest format'],
        warnings: []
      })

      mockDeployManager.deployToQA.mockRejectedValue(new Error('Validation failed'))

      await expectToThrow(
        () => actionHandler(options),
        'Validation failed'
      )
    })

    it('should provide helpful error messages', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      mockDeployManager.deployToQA.mockRejectedValue(new Error('Network timeout'))

      await expectToThrow(
        () => actionHandler(options),
        'Network timeout'
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Try running the command again')
      )
    })
  })

  describe('spinner integration', () => {
    let actionHandler: any
    let mockSpinner: any

    beforeEach(() => {
      actionHandler = mockCommand.action.mock.calls[0][0]
      const ora = require('ora')
      mockSpinner = ora()
    })

    it('should show spinner during deployment', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      mockDeployManager.deployToQA.mockResolvedValue({
        success: true,
        deploymentId: 'deploy-123',
        environment: 'qa',
        workspace: 'test-workspace',
        branch: 'feature/test',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      })

      await actionHandler(options)

      expect(mockSpinner.start).toHaveBeenCalled()
      expect(mockSpinner.succeed).toHaveBeenCalled()
    })

    it('should fail spinner on error', async () => {
      const options = {
        branch: 'feature/test',
        workspace: 'test-workspace',
        skipTests: false,
        force: false,
        notifications: true
      }

      mockDeployManager.deployToQA.mockRejectedValue(new Error('Deployment failed'))

      await expectToThrow(
        () => actionHandler(options),
        'Deployment failed'
      )

      expect(mockSpinner.start).toHaveBeenCalled()
      expect(mockSpinner.fail).toHaveBeenCalled()
    })
  })
})
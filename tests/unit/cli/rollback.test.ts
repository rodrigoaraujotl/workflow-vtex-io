/**
 * Unit tests for rollback CLI command
 */

import { Command } from 'commander'
import { DeployManager } from '@/core/DeployManager'
import { ConfigManager } from '@/core/ConfigManager'
import { Logger } from '@/utils/Logger'
import {
  createMockConfig,
  createMockDeploymentResult,
  mockAsyncFunction,
  mockRejectedFunction,
} from '@tests/test-utils'

// Mock dependencies
jest.mock('@/core/DeployManager')
jest.mock('@/core/ConfigManager')
jest.mock('@/utils/Logger')

// Import the rollback command after mocking
let rollbackCommand: any

describe('rollback CLI command', () => {
  let mockDeployManager: jest.Mocked<DeployManager>
  let mockConfigManager: jest.Mocked<ConfigManager>
  let mockLogger: jest.Mocked<Logger>
  let program: Command
  let consoleLogSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance
  let processExitSpy: jest.SpyInstance

  beforeEach(async () => {
    // Create mock instances
    mockDeployManager = {
      rollback: jest.fn(),
      getDeploymentHistory: jest.fn(),
      getDeploymentStatus: jest.fn(),
    } as any

    mockConfigManager = {
      loadConfig: jest.fn(),
      get: jest.fn(),
      validate: jest.fn(),
    } as any

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      perf: jest.fn(),
    } as any

    // Setup mocks
    ;(DeployManager as jest.MockedClass<typeof DeployManager>).mockImplementation(
      () => mockDeployManager
    )
    ;(ConfigManager as jest.MockedClass<typeof ConfigManager>).mockImplementation(
      () => mockConfigManager
    )
    ;(Logger as jest.MockedClass<typeof Logger>).mockImplementation(
      () => mockLogger
    )

    mockConfigManager.loadConfig.mockResolvedValue(undefined)
    mockConfigManager.get.mockImplementation((key: string) => {
      const config = createMockConfig()
      return key.split('.').reduce((obj, k) => obj?.[k], config)
    })
    mockConfigManager.validate.mockReturnValue({ valid: true, errors: [] })

    // Setup console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation()

    // Create fresh commander instance
    program = new Command()

    // Import and setup rollback command
    const { setupRollbackCommand } = await import('@/cli/commands/rollback')
    rollbackCommand = setupRollbackCommand(program)
  })

  afterEach(() => {
    jest.clearAllMocks()
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    processExitSpy.mockRestore()
  })

  describe('command setup', () => {
    it('should register rollback command with correct options', () => {
      expect(rollbackCommand.name()).toBe('rollback')
      expect(rollbackCommand.description()).toContain('Rollback deployment')
      
      const options = rollbackCommand.options
      const optionNames = options.map((opt: any) => opt.long)
      
      expect(optionNames).toContain('--environment')
      expect(optionNames).toContain('--steps')
      expect(optionNames).toContain('--to')
      expect(optionNames).toContain('--dry-run')
      expect(optionNames).toContain('--force')
      expect(optionNames).toContain('--list')
    })

    it('should have correct default values for options', () => {
      const environmentOption = rollbackCommand.options.find(
        (opt: any) => opt.long === '--environment'
      )
      expect(environmentOption.defaultValue).toBe('qa')

      const stepsOption = rollbackCommand.options.find(
        (opt: any) => opt.long === '--steps'
      )
      expect(stepsOption.defaultValue).toBe(1)
    })
  })

  describe('successful rollback', () => {
    it('should rollback by steps (default 1 step)', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        deploymentId: 'rollback-123',
        previousVersion: '1.2.2',
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback'], { from: 'user' })

      expect(mockDeployManager.rollback).toHaveBeenCalledWith('qa', {
        steps: 1,
        dryRun: false,
        force: false,
      })
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Rollback successful')
      )
    })

    it('should rollback by specified steps', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        deploymentId: 'rollback-123',
        previousVersion: '1.2.0',
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback', '--steps', '3'], { from: 'user' })

      expect(mockDeployManager.rollback).toHaveBeenCalledWith('qa', {
        steps: 3,
        dryRun: false,
        force: false,
      })
    })

    it('should rollback to specific deployment ID', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'production',
        deploymentId: 'rollback-456',
        previousVersion: '1.1.5',
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback', '--to', 'deploy-abc123', '--environment', 'production'], { from: 'user' })

      expect(mockDeployManager.rollback).toHaveBeenCalledWith('production', {
        deploymentId: 'deploy-abc123',
        dryRun: false,
        force: false,
      })
    })

    it('should handle dry run rollback', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        dryRun: true,
        previousVersion: '1.2.2',
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback', '--dry-run'], { from: 'user' })

      expect(mockDeployManager.rollback).toHaveBeenCalledWith('qa', {
        steps: 1,
        dryRun: true,
        force: false,
      })
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔍 Dry run completed')
      )
    })

    it('should display rollback details on success', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        deploymentId: 'rollback-123',
        previousVersion: '1.2.2',
        currentVersion: '1.2.3',
        duration: 45000,
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rollback ID: rollback-123')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('From: 1.2.3')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('To: 1.2.2')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duration: 45s')
      )
    })
  })

  describe('deployment history listing', () => {
    it('should list deployment history when --list flag is used', async () => {
      const mockHistory = [
        {
          deploymentId: 'deploy-123',
          version: '1.2.3',
          environment: 'qa',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          status: 'success',
          duration: 120000,
        },
        {
          deploymentId: 'deploy-122',
          version: '1.2.2',
          environment: 'qa',
          timestamp: new Date('2024-01-14T15:30:00Z'),
          status: 'success',
          duration: 95000,
        },
        {
          deploymentId: 'deploy-121',
          version: '1.2.1',
          environment: 'qa',
          timestamp: new Date('2024-01-13T09:15:00Z'),
          status: 'failed',
          duration: 30000,
        },
      ]
      mockDeployManager.getDeploymentHistory.mockResolvedValue(mockHistory)

      await rollbackCommand.parseAsync(['rollback', '--list'], { from: 'user' })

      expect(mockDeployManager.getDeploymentHistory).toHaveBeenCalledWith('qa', { limit: 10 })
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📋 Recent Deployments')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('deploy-123')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1.2.3')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ success')
      )
    })

    it('should format deployment history table correctly', async () => {
      const mockHistory = [
        {
          deploymentId: 'deploy-123',
          version: '1.2.3',
          environment: 'qa',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          status: 'success',
          duration: 120000,
        },
      ]
      mockDeployManager.getDeploymentHistory.mockResolvedValue(mockHistory)

      await rollbackCommand.parseAsync(['rollback', '--list'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('ID')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Version')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Date')
      )
    })

    it('should handle empty deployment history', async () => {
      mockDeployManager.getDeploymentHistory.mockResolvedValue([])

      await rollbackCommand.parseAsync(['rollback', '--list'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No deployments found')
      )
    })
  })

  describe('failed rollback', () => {
    it('should handle rollback failure', async () => {
      const mockResult = createMockDeploymentResult({
        success: false,
        environment: 'qa',
        error: 'Rollback failed: Target version not found',
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Rollback failed')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Target version not found')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should handle rollback manager errors', async () => {
      mockDeployManager.rollback.mockRejectedValue(
        new Error('Failed to connect to VTEX API')
      )

      await rollbackCommand.parseAsync(['rollback'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Rollback failed')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to connect to VTEX API')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should handle validation errors', async () => {
      mockConfigManager.validate.mockReturnValue({
        valid: false,
        errors: ['Missing VTEX account configuration'],
      })

      await rollbackCommand.parseAsync(['rollback'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration validation failed')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('option validation', () => {
    it('should validate environment option', async () => {
      await rollbackCommand.parseAsync(['rollback', '--environment', 'invalid'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid environment')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should validate steps option', async () => {
      await rollbackCommand.parseAsync(['rollback', '--steps', '0'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Steps must be a positive number')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should validate conflicting options', async () => {
      await rollbackCommand.parseAsync(['rollback', '--steps', '2', '--to', 'deploy-123'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot use both --steps and --to options')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should validate deployment ID format', async () => {
      await rollbackCommand.parseAsync(['rollback', '--to', 'invalid-id'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid deployment ID format')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('interactive features', () => {
    it('should prompt for confirmation in production', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'production',
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      // Mock user input for confirmation
      const mockInquirer = {
        prompt: jest.fn().mockResolvedValue({ confirm: true }),
      }
      jest.doMock('inquirer', () => mockInquirer)

      await rollbackCommand.parseAsync(['rollback', '--environment', 'production'], { from: 'user' })

      expect(mockDeployManager.rollback).toHaveBeenCalled()
    })

    it('should abort rollback if user declines confirmation', async () => {
      // Mock user declining confirmation
      const mockInquirer = {
        prompt: jest.fn().mockResolvedValue({ confirm: false }),
      }
      jest.doMock('inquirer', () => mockInquirer)

      await rollbackCommand.parseAsync(['rollback', '--environment', 'production'], { from: 'user' })

      expect(mockDeployManager.rollback).not.toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rollback cancelled')
      )
    })

    it('should skip confirmation with force flag', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'production',
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback', '--environment', 'production', '--force'], { from: 'user' })

      expect(mockDeployManager.rollback).toHaveBeenCalledWith('production', {
        steps: 1,
        dryRun: false,
        force: true,
      })
    })

    it('should show deployment selection when multiple options available', async () => {
      const mockHistory = [
        {
          deploymentId: 'deploy-123',
          version: '1.2.3',
          environment: 'qa',
          timestamp: new Date(),
          status: 'success',
        },
        {
          deploymentId: 'deploy-122',
          version: '1.2.2',
          environment: 'qa',
          timestamp: new Date(),
          status: 'success',
        },
      ]
      mockDeployManager.getDeploymentHistory.mockResolvedValue(mockHistory)

      const mockInquirer = {
        prompt: jest.fn().mockResolvedValue({ 
          selectedDeployment: 'deploy-122',
          confirm: true,
        }),
      }
      jest.doMock('inquirer', () => mockInquirer)

      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback', '--interactive'], { from: 'user' })

      expect(mockDeployManager.rollback).toHaveBeenCalledWith('qa', {
        deploymentId: 'deploy-122',
        dryRun: false,
        force: false,
      })
    })
  })

  describe('progress reporting', () => {
    it('should show progress during rollback', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        steps: [
          { name: 'Validation', status: 'completed', duration: 3000 },
          { name: 'Rollback', status: 'completed', duration: 25000 },
          { name: 'Health Check', status: 'completed', duration: 5000 },
        ],
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Starting rollback')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Rollback successful')
      )
    })

    it('should show step-by-step progress', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        steps: [
          { name: 'Validation', status: 'completed', duration: 3000 },
          { name: 'Rollback', status: 'completed', duration: 25000 },
        ],
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Validation')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rollback')
      )
    })
  })

  describe('output formatting', () => {
    it('should format rollback summary correctly', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        deploymentId: 'rollback-abc123',
        previousVersion: '1.2.2',
        currentVersion: '1.2.3',
        duration: 33000,
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📋 Rollback Summary')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Environment: qa')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rollback ID: rollback-abc123')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('From: 1.2.3')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('To: 1.2.2')
      )
    })

    it('should use colors and emojis for better UX', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('⏪')
      )
    })

    it('should format deployment history table with proper alignment', async () => {
      const mockHistory = [
        {
          deploymentId: 'deploy-123456789',
          version: '1.2.3',
          environment: 'qa',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          status: 'success',
          duration: 120000,
        },
      ]
      mockDeployManager.getDeploymentHistory.mockResolvedValue(mockHistory)

      await rollbackCommand.parseAsync(['rollback', '--list'], { from: 'user' })

      // Check that table formatting is consistent
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/deploy-123456789.*1\.2\.3.*success/)
      )
    })
  })

  describe('error recovery', () => {
    it('should provide helpful error messages for common issues', async () => {
      mockDeployManager.rollback.mockRejectedValue(
        new Error('No previous deployment found')
      )

      await rollbackCommand.parseAsync(['rollback'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('💡 Suggestion')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Check deployment history')
      )
    })

    it('should suggest fixes for authentication errors', async () => {
      const mockResult = createMockDeploymentResult({
        success: false,
        environment: 'qa',
        error: 'Authentication failed',
      })
      mockDeployManager.rollback.mockResolvedValue(mockResult)

      await rollbackCommand.parseAsync(['rollback'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('vtex login')
      )
    })

    it('should handle network connectivity issues', async () => {
      mockDeployManager.rollback.mockRejectedValue(
        new Error('Network timeout')
      )

      await rollbackCommand.parseAsync(['rollback'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Check your internet connection')
      )
    })
  })
})
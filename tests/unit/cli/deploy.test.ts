/**
 * Unit tests for deploy CLI command
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

// Import the deploy command after mocking
let deployCommand: any

describe('deploy CLI command', () => {
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
      deploy: jest.fn(),
      getDeploymentStatus: jest.fn(),
      getDeploymentHistory: jest.fn(),
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

    // Import and setup deploy command
    const { setupDeployCommand } = await import('@/cli/commands/deploy')
    deployCommand = setupDeployCommand(program)
  })

  afterEach(() => {
    jest.clearAllMocks()
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    processExitSpy.mockRestore()
  })

  describe('command setup', () => {
    it('should register deploy command with correct options', () => {
      expect(deployCommand.name()).toBe('deploy')
      expect(deployCommand.description()).toContain('Deploy application')
      
      const options = deployCommand.options
      const optionNames = options.map((opt: any) => opt.long)
      
      expect(optionNames).toContain('--environment')
      expect(optionNames).toContain('--skip-validation')
      expect(optionNames).toContain('--dry-run')
      expect(optionNames).toContain('--force')
      expect(optionNames).toContain('--canary')
      expect(optionNames).toContain('--workspace')
    })

    it('should have correct default values for options', () => {
      const environmentOption = deployCommand.options.find(
        (opt: any) => opt.long === '--environment'
      )
      expect(environmentOption.defaultValue).toBe('qa')

      const canaryOption = deployCommand.options.find(
        (opt: any) => opt.long === '--canary'
      )
      expect(canaryOption.defaultValue).toBe(false)
    })
  })

  describe('successful deployment', () => {
    it('should deploy to QA environment by default', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(mockDeployManager.deploy).toHaveBeenCalledWith('qa', {
        skipValidation: false,
        dryRun: false,
        force: false,
        canary: false,
        workspace: undefined,
      })
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Deployment successful')
      )
    })

    it('should deploy to specified environment', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'production',
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy', '--environment', 'production'], { from: 'user' })

      expect(mockDeployManager.deploy).toHaveBeenCalledWith('production', {
        skipValidation: false,
        dryRun: false,
        force: false,
        canary: false,
        workspace: undefined,
      })
    })

    it('should handle canary deployment', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'production',
        canary: true,
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy', '--environment', 'production', '--canary'], { from: 'user' })

      expect(mockDeployManager.deploy).toHaveBeenCalledWith('production', {
        skipValidation: false,
        dryRun: false,
        force: false,
        canary: true,
        workspace: undefined,
      })
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('canary deployment')
      )
    })

    it('should handle dry run deployment', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        dryRun: true,
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy', '--dry-run'], { from: 'user' })

      expect(mockDeployManager.deploy).toHaveBeenCalledWith('qa', {
        skipValidation: false,
        dryRun: true,
        force: false,
        canary: false,
        workspace: undefined,
      })
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔍 Dry run completed')
      )
    })

    it('should skip validation when requested', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy', '--skip-validation'], { from: 'user' })

      expect(mockDeployManager.deploy).toHaveBeenCalledWith('qa', {
        skipValidation: true,
        dryRun: false,
        force: false,
        canary: false,
        workspace: undefined,
      })
    })

    it('should use specified workspace', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        workspace: 'feature-branch',
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy', '--workspace', 'feature-branch'], { from: 'user' })

      expect(mockDeployManager.deploy).toHaveBeenCalledWith('qa', {
        skipValidation: false,
        dryRun: false,
        force: false,
        canary: false,
        workspace: 'feature-branch',
      })
    })

    it('should display deployment details on success', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        deploymentId: 'deploy-123',
        version: '1.2.3',
        duration: 120000,
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deployment ID: deploy-123')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Version: 1.2.3')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duration: 2m 0s')
      )
    })
  })

  describe('failed deployment', () => {
    it('should handle deployment failure', async () => {
      const mockResult = createMockDeploymentResult({
        success: false,
        environment: 'qa',
        error: 'Build failed: TypeScript compilation error',
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Deployment failed')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('TypeScript compilation error')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should handle validation errors', async () => {
      mockConfigManager.validate.mockReturnValue({
        valid: false,
        errors: ['Missing VTEX account configuration', 'Invalid workspace name'],
      })

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration validation failed')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing VTEX account configuration')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid workspace name')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should handle deployment manager errors', async () => {
      mockDeployManager.deploy.mockRejectedValue(
        new Error('Failed to connect to VTEX API')
      )

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Deployment failed')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to connect to VTEX API')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should handle config loading errors', async () => {
      mockConfigManager.loadConfig.mockRejectedValue(
        new Error('Config file not found')
      )

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load configuration')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Config file not found')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('option validation', () => {
    it('should validate environment option', async () => {
      await deployCommand.parseAsync(['deploy', '--environment', 'invalid'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid environment')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should accept valid environments', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'production',
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      // Test all valid environments
      const validEnvironments = ['qa', 'production', 'staging']
      
      for (const env of validEnvironments) {
        mockDeployManager.deploy.mockClear()
        await deployCommand.parseAsync(['deploy', '--environment', env], { from: 'user' })
        expect(mockDeployManager.deploy).toHaveBeenCalledWith(env, expect.any(Object))
      }
    })

    it('should handle conflicting options gracefully', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'production',
        canary: true,
        dryRun: true,
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy', '--canary', '--dry-run'], { from: 'user' })

      expect(mockDeployManager.deploy).toHaveBeenCalledWith('qa', {
        skipValidation: false,
        dryRun: true,
        force: false,
        canary: true,
        workspace: undefined,
      })
    })
  })

  describe('interactive features', () => {
    it('should prompt for confirmation in production', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'production',
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      // Mock user input for confirmation
      const mockInquirer = {
        prompt: jest.fn().mockResolvedValue({ confirm: true }),
      }
      jest.doMock('inquirer', () => mockInquirer)

      await deployCommand.parseAsync(['deploy', '--environment', 'production'], { from: 'user' })

      expect(mockDeployManager.deploy).toHaveBeenCalled()
    })

    it('should abort deployment if user declines confirmation', async () => {
      // Mock user declining confirmation
      const mockInquirer = {
        prompt: jest.fn().mockResolvedValue({ confirm: false }),
      }
      jest.doMock('inquirer', () => mockInquirer)

      await deployCommand.parseAsync(['deploy', '--environment', 'production'], { from: 'user' })

      expect(mockDeployManager.deploy).not.toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deployment cancelled')
      )
    })

    it('should skip confirmation with force flag', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'production',
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy', '--environment', 'production', '--force'], { from: 'user' })

      expect(mockDeployManager.deploy).toHaveBeenCalledWith('production', {
        skipValidation: false,
        dryRun: false,
        force: true,
        canary: false,
        workspace: undefined,
      })
    })
  })

  describe('progress reporting', () => {
    it('should show progress during deployment', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        steps: [
          { name: 'Validation', status: 'completed', duration: 5000 },
          { name: 'Build', status: 'completed', duration: 30000 },
          { name: 'Deploy', status: 'completed', duration: 15000 },
        ],
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Starting deployment')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Deployment successful')
      )
    })

    it('should show step-by-step progress', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        steps: [
          { name: 'Validation', status: 'completed', duration: 5000 },
          { name: 'Build', status: 'completed', duration: 30000 },
          { name: 'Deploy', status: 'completed', duration: 15000 },
        ],
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Validation')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Build')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deploy')
      )
    })
  })

  describe('output formatting', () => {
    it('should format duration correctly', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        duration: 125000, // 2 minutes 5 seconds
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duration: 2m 5s')
      )
    })

    it('should format deployment summary correctly', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
        deploymentId: 'deploy-abc123',
        version: '1.2.3',
        workspace: 'main',
        duration: 60000,
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📋 Deployment Summary')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Environment: qa')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deployment ID: deploy-abc123')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Version: 1.2.3')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Workspace: main')
      )
    })

    it('should use colors and emojis for better UX', async () => {
      const mockResult = createMockDeploymentResult({
        success: true,
        environment: 'qa',
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚀')
      )
    })
  })

  describe('error recovery', () => {
    it('should provide helpful error messages', async () => {
      mockDeployManager.deploy.mockRejectedValue(
        new Error('VTEX workspace not found')
      )

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('💡 Suggestion')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('vtex use')
      )
    })

    it('should suggest fixes for common errors', async () => {
      const mockResult = createMockDeploymentResult({
        success: false,
        environment: 'qa',
        error: 'Authentication failed',
      })
      mockDeployManager.deploy.mockResolvedValue(mockResult)

      await deployCommand.parseAsync(['deploy'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('vtex login')
      )
    })
  })
})
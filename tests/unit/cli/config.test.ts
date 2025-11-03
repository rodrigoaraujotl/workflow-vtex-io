/**
 * Unit tests for config CLI command
 */

import { Command } from 'commander'
import { ConfigManager } from '@/core/ConfigManager'
import { Logger } from '@/utils/Logger'
import {
  createMockConfig,
  mockAsyncFunction,
  mockRejectedFunction,
} from '@tests/setup'

// Mock dependencies
jest.mock('@/core/ConfigManager')
jest.mock('@/utils/Logger')

// Import the config command after mocking
let configCommand: any

describe('config CLI command', () => {
  let mockConfigManager: jest.Mocked<ConfigManager>
  let mockLogger: jest.Mocked<Logger>
  let program: Command
  let consoleLogSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance
  let processExitSpy: jest.SpyInstance

  beforeEach(async () => {
    // Create mock instances
    mockConfigManager = {
      loadConfig: jest.fn(),
      saveConfig: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
      getAll: jest.fn(),
      reset: jest.fn(),
      validate: jest.fn(),
      merge: jest.fn(),
    } as any

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any

    // Setup mocks
    ;(ConfigManager as jest.MockedClass<typeof ConfigManager>).mockImplementation(
      () => mockConfigManager
    )
    ;(Logger as jest.MockedClass<typeof Logger>).mockImplementation(
      () => mockLogger
    )

    mockConfigManager.loadConfig.mockResolvedValue(undefined)
    mockConfigManager.saveConfig.mockResolvedValue(undefined)
    mockConfigManager.get.mockImplementation((key: string) => {
      const config = createMockConfig()
      return key.split('.').reduce((obj, k) => obj?.[k], config)
    })
    mockConfigManager.getAll.mockReturnValue(createMockConfig())
    mockConfigManager.validate.mockReturnValue({ valid: true, errors: [] })

    // Setup console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation()

    // Create fresh commander instance
    program = new Command()

    // Import and setup config command
    const { setupConfigCommand } = await import('@/cli/commands/config')
    configCommand = setupConfigCommand(program)
  })

  afterEach(() => {
    jest.clearAllMocks()
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    processExitSpy.mockRestore()
  })

  describe('command setup', () => {
    it('should register config command with subcommands', () => {
      expect(configCommand.name()).toBe('config')
      expect(configCommand.description()).toContain('Manage configuration')
      
      const subcommands = configCommand.commands
      const subcommandNames = subcommands.map((cmd: any) => cmd.name())
      
      expect(subcommandNames).toContain('get')
      expect(subcommandNames).toContain('set')
      expect(subcommandNames).toContain('delete')
      expect(subcommandNames).toContain('list')
      expect(subcommandNames).toContain('validate')
      expect(subcommandNames).toContain('reset')
      expect(subcommandNames).toContain('init')
    })
  })

  describe('config get', () => {
    it('should get configuration value by key', async () => {
      mockConfigManager.get.mockReturnValue('test-account')

      await configCommand.parseAsync(['config', 'get', 'vtex.account'], { from: 'user' })

      expect(mockConfigManager.get).toHaveBeenCalledWith('vtex.account')
      expect(consoleLogSpy).toHaveBeenCalledWith('test-account')
    })

    it('should get nested configuration value', async () => {
      mockConfigManager.get.mockReturnValue({
        account: 'test-account',
        workspace: 'main',
        timeout: 30000,
      })

      await configCommand.parseAsync(['config', 'get', 'vtex'], { from: 'user' })

      expect(mockConfigManager.get).toHaveBeenCalledWith('vtex')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({
          account: 'test-account',
          workspace: 'main',
          timeout: 30000,
        }, null, 2)
      )
    })

    it('should handle non-existent configuration key', async () => {
      mockConfigManager.get.mockReturnValue(undefined)

      await configCommand.parseAsync(['config', 'get', 'non.existent.key'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration key "non.existent.key" not found')
      )
    })

    it('should get all configuration when no key provided', async () => {
      const mockConfig = createMockConfig()
      mockConfigManager.getAll.mockReturnValue(mockConfig)

      await configCommand.parseAsync(['config', 'get'], { from: 'user' })

      expect(mockConfigManager.getAll).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify(mockConfig, null, 2)
      )
    })
  })

  describe('config set', () => {
    it('should set configuration value', async () => {
      await configCommand.parseAsync(['config', 'set', 'vtex.account', 'new-account'], { from: 'user' })

      expect(mockConfigManager.set).toHaveBeenCalledWith('vtex.account', 'new-account')
      expect(mockConfigManager.saveConfig).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Configuration updated')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('vtex.account = "new-account"')
      )
    })

    it('should set nested configuration value', async () => {
      await configCommand.parseAsync(['config', 'set', 'notifications.slack.enabled', 'true'], { from: 'user' })

      expect(mockConfigManager.set).toHaveBeenCalledWith('notifications.slack.enabled', 'true')
      expect(mockConfigManager.saveConfig).toHaveBeenCalled()
    })

    it('should handle JSON values', async () => {
      const jsonValue = '{"enabled":true,"webhook":"https://hooks.slack.com/test"}'

      await configCommand.parseAsync(['config', 'set', 'notifications.slack', jsonValue], { from: 'user' })

      expect(mockConfigManager.set).toHaveBeenCalledWith('notifications.slack', {
        enabled: true,
        webhook: 'https://hooks.slack.com/test',
      })
    })

    it('should handle boolean values', async () => {
      await configCommand.parseAsync(['config', 'set', 'deployment.skipValidation', 'false'], { from: 'user' })

      expect(mockConfigManager.set).toHaveBeenCalledWith('deployment.skipValidation', false)
    })

    it('should handle numeric values', async () => {
      await configCommand.parseAsync(['config', 'set', 'vtex.timeout', '60000'], { from: 'user' })

      expect(mockConfigManager.set).toHaveBeenCalledWith('vtex.timeout', 60000)
    })

    it('should handle save errors', async () => {
      mockConfigManager.saveConfig.mockRejectedValue(new Error('Permission denied'))

      await configCommand.parseAsync(['config', 'set', 'vtex.account', 'new-account'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to save configuration')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('config delete', () => {
    it('should delete configuration key', async () => {
      mockConfigManager.has.mockReturnValue(true)
      mockConfigManager.delete.mockReturnValue(true)

      await configCommand.parseAsync(['config', 'delete', 'vtex.workspace'], { from: 'user' })

      expect(mockConfigManager.delete).toHaveBeenCalledWith('vtex.workspace')
      expect(mockConfigManager.saveConfig).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Configuration key deleted')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('vtex.workspace')
      )
    })

    it('should handle non-existent key deletion', async () => {
      mockConfigManager.has.mockReturnValue(false)

      await configCommand.parseAsync(['config', 'delete', 'non.existent.key'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration key "non.existent.key" not found')
      )
      expect(mockConfigManager.delete).not.toHaveBeenCalled()
      expect(mockConfigManager.saveConfig).not.toHaveBeenCalled()
    })

    it('should require confirmation for critical keys', async () => {
      mockConfigManager.has.mockReturnValue(true)

      // Mock user confirmation
      const mockInquirer = {
        prompt: jest.fn().mockResolvedValue({ confirm: true }),
      }
      jest.doMock('inquirer', () => mockInquirer)

      await configCommand.parseAsync(['config', 'delete', 'vtex.account'], { from: 'user' })

      expect(mockConfigManager.delete).toHaveBeenCalledWith('vtex.account')
    })

    it('should abort deletion if user declines confirmation', async () => {
      mockConfigManager.has.mockReturnValue(true)

      // Mock user declining confirmation
      const mockInquirer = {
        prompt: jest.fn().mockResolvedValue({ confirm: false }),
      }
      jest.doMock('inquirer', () => mockInquirer)

      await configCommand.parseAsync(['config', 'delete', 'vtex.account'], { from: 'user' })

      expect(mockConfigManager.delete).not.toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deletion cancelled')
      )
    })
  })

  describe('config list', () => {
    it('should list all configuration keys and values', async () => {
      const mockConfig = createMockConfig()
      mockConfigManager.getAll.mockReturnValue(mockConfig)

      await configCommand.parseAsync(['config', 'list'], { from: 'user' })

      expect(mockConfigManager.getAll).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📋 Configuration')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('vtex.account')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('test-account')
      )
    })

    it('should format configuration list with proper indentation', async () => {
      const mockConfig = {
        vtex: {
          account: 'test-account',
          workspace: 'main',
          timeout: 30000,
        },
        notifications: {
          slack: {
            enabled: true,
            webhook: 'https://hooks.slack.com/test',
          },
          email: {
            enabled: false,
          },
        },
      }
      mockConfigManager.getAll.mockReturnValue(mockConfig)

      await configCommand.parseAsync(['config', 'list'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('vtex:')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('  account: test-account')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('  workspace: main')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('notifications:')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('  slack:')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('    enabled: true')
      )
    })

    it('should show empty configuration message', async () => {
      mockConfigManager.getAll.mockReturnValue({})

      await configCommand.parseAsync(['config', 'list'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No configuration found')
      )
    })

    it('should filter configuration by prefix', async () => {
      const mockConfig = createMockConfig()
      mockConfigManager.getAll.mockReturnValue(mockConfig)

      await configCommand.parseAsync(['config', 'list', '--filter', 'vtex'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('vtex.account')
      )
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('notifications')
      )
    })
  })

  describe('config validate', () => {
    it('should validate configuration successfully', async () => {
      mockConfigManager.validate.mockReturnValue({ valid: true, errors: [] })

      await configCommand.parseAsync(['config', 'validate'], { from: 'user' })

      expect(mockConfigManager.validate).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Configuration is valid')
      )
    })

    it('should show validation errors', async () => {
      mockConfigManager.validate.mockReturnValue({
        valid: false,
        errors: [
          'Missing required field: vtex.account',
          'Invalid value for notifications.slack.webhook: must be a valid URL',
          'Invalid type for vtex.timeout: expected number, got string',
        ],
      })

      await configCommand.parseAsync(['config', 'validate'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Configuration validation failed')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field: vtex.account')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid value for notifications.slack.webhook')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid type for vtex.timeout')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should provide suggestions for common errors', async () => {
      mockConfigManager.validate.mockReturnValue({
        valid: false,
        errors: ['Missing required field: vtex.account'],
      })

      await configCommand.parseAsync(['config', 'validate'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('💡 Suggestion')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('vtex-workflow config set vtex.account')
      )
    })
  })

  describe('config reset', () => {
    it('should reset configuration to defaults', async () => {
      // Mock user confirmation
      const mockInquirer = {
        prompt: jest.fn().mockResolvedValue({ confirm: true }),
      }
      jest.doMock('inquirer', () => mockInquirer)

      await configCommand.parseAsync(['config', 'reset'], { from: 'user' })

      expect(mockConfigManager.reset).toHaveBeenCalled()
      expect(mockConfigManager.saveConfig).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Configuration reset to defaults')
      )
    })

    it('should abort reset if user declines confirmation', async () => {
      // Mock user declining confirmation
      const mockInquirer = {
        prompt: jest.fn().mockResolvedValue({ confirm: false }),
      }
      jest.doMock('inquirer', () => mockInquirer)

      await configCommand.parseAsync(['config', 'reset'], { from: 'user' })

      expect(mockConfigManager.reset).not.toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reset cancelled')
      )
    })

    it('should skip confirmation with --force flag', async () => {
      await configCommand.parseAsync(['config', 'reset', '--force'], { from: 'user' })

      expect(mockConfigManager.reset).toHaveBeenCalled()
      expect(mockConfigManager.saveConfig).toHaveBeenCalled()
    })
  })

  describe('config init', () => {
    it('should initialize configuration interactively', async () => {
      // Mock user input
      const mockInquirer = {
        prompt: jest.fn().mockResolvedValue({
          vtexAccount: 'my-account',
          vtexWorkspace: 'main',
          slackEnabled: true,
          slackWebhook: 'https://hooks.slack.com/services/test',
          emailEnabled: false,
        }),
      }
      jest.doMock('inquirer', () => mockInquirer)

      await configCommand.parseAsync(['config', 'init'], { from: 'user' })

      expect(mockConfigManager.set).toHaveBeenCalledWith('vtex.account', 'my-account')
      expect(mockConfigManager.set).toHaveBeenCalledWith('vtex.workspace', 'main')
      expect(mockConfigManager.set).toHaveBeenCalledWith('notifications.slack.enabled', true)
      expect(mockConfigManager.set).toHaveBeenCalledWith('notifications.slack.webhook', 'https://hooks.slack.com/services/test')
      expect(mockConfigManager.set).toHaveBeenCalledWith('notifications.email.enabled', false)
      expect(mockConfigManager.saveConfig).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Configuration initialized')
      )
    })

    it('should validate user input during initialization', async () => {
      // Mock invalid then valid input
      const mockInquirer = {
        prompt: jest.fn()
          .mockResolvedValueOnce({
            vtexAccount: '', // Invalid empty account
          })
          .mockResolvedValueOnce({
            vtexAccount: 'valid-account',
            vtexWorkspace: 'main',
            slackEnabled: false,
            emailEnabled: false,
          }),
      }
      jest.doMock('inquirer', () => mockInquirer)

      await configCommand.parseAsync(['config', 'init'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('VTEX account cannot be empty')
      )
      expect(mockConfigManager.set).toHaveBeenCalledWith('vtex.account', 'valid-account')
    })

    it('should skip initialization if configuration exists', async () => {
      mockConfigManager.validate.mockReturnValue({ valid: true, errors: [] })

      // Mock user declining overwrite
      const mockInquirer = {
        prompt: jest.fn().mockResolvedValue({ overwrite: false }),
      }
      jest.doMock('inquirer', () => mockInquirer)

      await configCommand.parseAsync(['config', 'init'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration initialization cancelled')
      )
    })
  })

  describe('error handling', () => {
    it('should handle configuration loading errors', async () => {
      mockConfigManager.loadConfig.mockRejectedValue(
        new Error('Config file not found')
      )

      await configCommand.parseAsync(['config', 'get', 'vtex.account'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to load configuration')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Config file not found')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should handle invalid JSON values in set command', async () => {
      await configCommand.parseAsync(['config', 'set', 'notifications.slack', '{invalid json}'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Invalid JSON value')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should handle missing required arguments', async () => {
      await configCommand.parseAsync(['config', 'set'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required arguments')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should handle configuration manager errors', async () => {
      mockConfigManager.set.mockImplementation(() => {
        throw new Error('Invalid configuration key')
      })

      await configCommand.parseAsync(['config', 'set', 'invalid.key', 'value'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to update configuration')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid configuration key')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('output formatting', () => {
    it('should format configuration values with proper types', async () => {
      const testCases = [
        { value: 'string-value', expected: '"string-value"' },
        { value: 123, expected: '123' },
        { value: true, expected: 'true' },
        { value: false, expected: 'false' },
        { value: null, expected: 'null' },
        { value: { nested: 'object' }, expected: '{\n  "nested": "object"\n}' },
        { value: ['array', 'values'], expected: '[\n  "array",\n  "values"\n]' },
      ]

      for (const { value, expected } of testCases) {
        mockConfigManager.get.mockReturnValue(value)
        consoleLogSpy.mockClear()

        await configCommand.parseAsync(['config', 'get', 'test.key'], { from: 'user' })

        expect(consoleLogSpy).toHaveBeenCalledWith(expected)
      }
    })

    it('should use colors and icons for better UX', async () => {
      await configCommand.parseAsync(['config', 'set', 'vtex.account', 'test'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅')
      )
    })

    it('should format validation errors with proper indentation', async () => {
      mockConfigManager.validate.mockReturnValue({
        valid: false,
        errors: [
          'Error 1',
          'Error 2',
          'Error 3',
        ],
      })

      await configCommand.parseAsync(['config', 'validate'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('  • Error 1')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('  • Error 2')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('  • Error 3')
      )
    })
  })
})
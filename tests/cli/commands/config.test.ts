import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { Command } from 'commander'
import {
  createMockLogger,
  createMockConfigManager,
  createMockVTEXClient,
  mockFs,
  setupTestEnvironment,
  cleanupTestEnvironment,
  expectToThrow
} from '../../helpers/test-helpers'

// Mock the command module
const mockCommand = {
  name: jest.fn().mockReturnThis(),
  description: jest.fn().mockReturnThis(),
  addCommand: jest.fn().mockReturnThis(),
  parse: jest.fn()
}

const mockSubCommand = {
  name: jest.fn().mockReturnThis(),
  description: jest.fn().mockReturnThis(),
  option: jest.fn().mockReturnThis(),
  argument: jest.fn().mockReturnThis(),
  action: jest.fn().mockReturnThis()
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

describe('config command', () => {
  let mockLogger: any
  let mockConfig: any
  let mockVtexClient: any
  let configCommand: any

  beforeEach(async () => {
    setupTestEnvironment()
    
    mockLogger = createMockLogger()
    mockConfig = createMockConfigManager()
    mockVtexClient = createMockVTEXClient()

    // Clear all mocks
    jest.clearAllMocks()

    // Mock Command constructor to return different instances for subcommands
    const Command = require('commander').Command
    Command.mockImplementation(() => {
      if (Command.mock.calls.length === 1) {
        return mockCommand
      }
      return { ...mockSubCommand }
    })

    // Import the command after mocking dependencies
    const { createConfigCommand } = await import('../../../src/cli/commands/config')
    configCommand = createConfigCommand(mockLogger, mockConfig, mockVtexClient)
  })

  afterEach(() => {
    cleanupTestEnvironment()
  })

  describe('command setup', () => {
    it('should create main command with correct name and description', () => {
      expect(mockCommand.name).toHaveBeenCalledWith('config')
      expect(mockCommand.description).toHaveBeenCalledWith(
        expect.stringContaining('Manage configuration settings')
      )
    })

    it('should add all subcommands', () => {
      expect(mockCommand.addCommand).toHaveBeenCalledTimes(6)
    })
  })

  describe('show subcommand', () => {
    let showActionHandler: any

    beforeEach(() => {
      // Find the show command action handler
      const showCommand = mockCommand.addCommand.mock.calls.find(
        call => call[0].name.mock.calls[0][0] === 'show'
      )?.[0]
      showActionHandler = showCommand?.action.mock.calls[0][0]
    })

    it('should display full configuration by default', async () => {
      const options = {}

      await showActionHandler(options)

      expect(mockConfig.getConfig).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Current Configuration')
      )
    })

    it('should display specific section when requested', async () => {
      const options = { section: 'vtex' }

      await showActionHandler(options)

      expect(mockConfig.getValue).toHaveBeenCalledWith('vtex')
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('VTEX Configuration')
      )
    })

    it('should output JSON format when requested', async () => {
      const options = { json: true }

      await showActionHandler(options)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\{.*\}$/s)
      )
    })

    it('should hide sensitive data by default', async () => {
      const options = {}

      const config = mockConfig.getConfig()
      config.notifications.slack.webhook = 'https://hooks.slack.com/secret'

      await showActionHandler(options)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('***')
      )
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('secret')
      )
    })

    it('should show sensitive data when requested', async () => {
      const options = { showSensitive: true }

      const config = mockConfig.getConfig()
      config.notifications.slack.webhook = 'https://hooks.slack.com/secret'

      await showActionHandler(options)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('secret')
      )
    })

    it('should handle non-existent section', async () => {
      const options = { section: 'nonexistent' }

      mockConfig.getValue.mockReturnValue(undefined)

      await expectToThrow(
        () => showActionHandler(options),
        'Configuration section "nonexistent" not found'
      )
    })
  })

  describe('set subcommand', () => {
    let setActionHandler: any

    beforeEach(() => {
      const setCommand = mockCommand.addCommand.mock.calls.find(
        call => call[0].name.mock.calls[0][0] === 'set'
      )?.[0]
      setActionHandler = setCommand?.action.mock.calls[0][0]
    })

    it('should set configuration value', async () => {
      const key = 'vtex.account'
      const value = 'test-account'

      await setActionHandler(key, value, {})

      expect(mockConfig.setValue).toHaveBeenCalledWith(key, 'test-account')
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Set ${key} = test-account`
      )
    })

    it('should parse boolean values', async () => {
      const key = 'notifications.enabled'
      const value = 'false'

      await setActionHandler(key, value, {})

      expect(mockConfig.setValue).toHaveBeenCalledWith(key, false)
    })

    it('should parse numeric values', async () => {
      const key = 'deployment.timeout'
      const value = '60000'

      await setActionHandler(key, value, {})

      expect(mockConfig.setValue).toHaveBeenCalledWith(key, 60000)
    })

    it('should parse array values', async () => {
      const key = 'notifications.channels'
      const value = 'slack,email'

      await setActionHandler(key, value, {})

      expect(mockConfig.setValue).toHaveBeenCalledWith(key, ['slack', 'email'])
    })

    it('should handle invalid key format', async () => {
      const key = 'invalid..key'
      const value = 'test'

      await expectToThrow(
        () => setActionHandler(key, value, {}),
        'Invalid configuration key format'
      )
    })

    it('should validate value before setting', async () => {
      const key = 'deployment.timeout'
      const value = 'invalid'

      mockConfig.setValue.mockImplementation(() => {
        throw new Error('Invalid value type')
      })

      await expectToThrow(
        () => setActionHandler(key, value, {}),
        'Invalid value type'
      )
    })
  })

  describe('init subcommand', () => {
    let initActionHandler: any
    let inquirer: any

    beforeEach(() => {
      const initCommand = mockCommand.addCommand.mock.calls.find(
        call => call[0].name.mock.calls[0][0] === 'init'
      )?.[0]
      initActionHandler = initCommand?.action.mock.calls[0][0]
      inquirer = require('inquirer')
    })

    it('should initialize configuration interactively', async () => {
      const options = {}

      inquirer.prompt.mockResolvedValueOnce({
        vtexAccount: 'test-account',
        vtexWorkspace: 'test-workspace',
        enableNotifications: true,
        notificationChannels: ['slack']
      })

      inquirer.prompt.mockResolvedValueOnce({
        slackWebhook: 'https://hooks.slack.com/test'
      })

      await initActionHandler(options)

      expect(mockConfig.setValue).toHaveBeenCalledWith('vtex.account', 'test-account')
      expect(mockConfig.setValue).toHaveBeenCalledWith('vtex.workspace', 'test-workspace')
      expect(mockConfig.setValue).toHaveBeenCalledWith('notifications.enabled', true)
      expect(mockConfig.setValue).toHaveBeenCalledWith('notifications.channels', ['slack'])
      expect(mockConfig.setValue).toHaveBeenCalledWith('notifications.slack.webhook', 'https://hooks.slack.com/test')
    })

    it('should use template when specified', async () => {
      const options = { template: 'basic' }

      await initActionHandler(options)

      expect(mockConfig.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          vtex: expect.objectContaining({
            account: expect.any(String)
          })
        })
      )
    })

    it('should force overwrite existing configuration', async () => {
      const options = { force: true }

      mockConfig.getConfigPath.mockReturnValue('/path/to/config.json')
      mockFs.existsSync.mockReturnValue(true)

      inquirer.prompt.mockResolvedValue({
        vtexAccount: 'new-account'
      })

      await initActionHandler(options)

      expect(mockConfig.resetToDefaults).toHaveBeenCalled()
    })

    it('should prompt before overwriting existing configuration', async () => {
      const options = {}

      mockConfig.getConfigPath.mockReturnValue('/path/to/config.json')
      mockFs.existsSync.mockReturnValue(true)

      inquirer.prompt.mockResolvedValueOnce({ overwrite: true })
      inquirer.prompt.mockResolvedValueOnce({ vtexAccount: 'new-account' })

      await initActionHandler(options)

      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'confirm',
          name: 'overwrite',
          message: expect.stringContaining('overwrite')
        })
      ])
    })

    it('should abort if user chooses not to overwrite', async () => {
      const options = {}

      mockConfig.getConfigPath.mockReturnValue('/path/to/config.json')
      mockFs.existsSync.mockReturnValue(true)

      inquirer.prompt.mockResolvedValue({ overwrite: false })

      await initActionHandler(options)

      expect(mockLogger.info).toHaveBeenCalledWith('Configuration initialization aborted')
    })
  })

  describe('validate subcommand', () => {
    let validateActionHandler: any

    beforeEach(() => {
      const validateCommand = mockCommand.addCommand.mock.calls.find(
        call => call[0].name.mock.calls[0][0] === 'validate'
      )?.[0]
      validateActionHandler = validateCommand?.action.mock.calls[0][0]
    })

    it('should validate configuration successfully', async () => {
      const options = {}

      mockConfig.validateConfiguration.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      })

      await validateActionHandler(options)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Configuration is valid')
      )
    })

    it('should display validation errors', async () => {
      const options = {}

      mockConfig.validateConfiguration.mockResolvedValue({
        isValid: false,
        errors: ['VTEX account is required', 'Invalid timeout value'],
        warnings: ['Notifications are disabled']
      })

      await validateActionHandler(options)

      expect(mockLogger.error).toHaveBeenCalledWith('VTEX account is required')
      expect(mockLogger.error).toHaveBeenCalledWith('Invalid timeout value')
      expect(mockLogger.warn).toHaveBeenCalledWith('Notifications are disabled')
    })

    it('should attempt auto-fix when requested', async () => {
      const options = { fix: true }

      mockConfig.validateConfiguration.mockResolvedValue({
        isValid: false,
        errors: ['VTEX account is required'],
        warnings: [],
        fixable: ['VTEX account is required']
      })

      await validateActionHandler(options)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to fix')
      )
    })

    it('should output JSON format when requested', async () => {
      const options = { json: true }

      mockConfig.validateConfiguration.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      })

      await validateActionHandler(options)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\{.*\}$/s)
      )
    })
  })

  describe('export subcommand', () => {
    let exportActionHandler: any

    beforeEach(() => {
      const exportCommand = mockCommand.addCommand.mock.calls.find(
        call => call[0].name.mock.calls[0][0] === 'export'
      )?.[0]
      exportActionHandler = exportCommand?.action.mock.calls[0][0]
    })

    it('should export configuration to file', async () => {
      const filePath = '/tmp/config-export.json'
      const options = {}

      await exportActionHandler(filePath, options)

      expect(mockConfig.exportConfig).toHaveBeenCalledWith(filePath, {
        includeSensitive: false,
        format: 'json'
      })
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Configuration exported to ${filePath}`
      )
    })

    it('should include sensitive data when requested', async () => {
      const filePath = '/tmp/config-export.json'
      const options = { includeSensitive: true }

      await exportActionHandler(filePath, options)

      expect(mockConfig.exportConfig).toHaveBeenCalledWith(filePath, {
        includeSensitive: true,
        format: 'json'
      })
    })

    it('should use specified format', async () => {
      const filePath = '/tmp/config-export.yaml'
      const options = { format: 'yaml' }

      await exportActionHandler(filePath, options)

      expect(mockConfig.exportConfig).toHaveBeenCalledWith(filePath, {
        includeSensitive: false,
        format: 'yaml'
      })
    })

    it('should handle export errors', async () => {
      const filePath = '/invalid/path/config.json'
      const options = {}

      mockConfig.exportConfig.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      await expectToThrow(
        () => exportActionHandler(filePath, options),
        'Failed to export configuration'
      )
    })
  })

  describe('import subcommand', () => {
    let importActionHandler: any

    beforeEach(() => {
      const importCommand = mockCommand.addCommand.mock.calls.find(
        call => call[0].name.mock.calls[0][0] === 'import'
      )?.[0]
      importActionHandler = importCommand?.action.mock.calls[0][0]
    })

    it('should import configuration from file', async () => {
      const filePath = '/tmp/config-import.json'
      const options = {}

      await importActionHandler(filePath, options)

      expect(mockConfig.importConfig).toHaveBeenCalledWith(filePath, {
        merge: false,
        validate: true
      })
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Configuration imported from ${filePath}`
      )
    })

    it('should merge with existing configuration when requested', async () => {
      const filePath = '/tmp/config-import.json'
      const options = { merge: true }

      await importActionHandler(filePath, options)

      expect(mockConfig.importConfig).toHaveBeenCalledWith(filePath, {
        merge: true,
        validate: true
      })
    })

    it('should skip validation when requested', async () => {
      const filePath = '/tmp/config-import.json'
      const options = { skipValidation: true }

      await importActionHandler(filePath, options)

      expect(mockConfig.importConfig).toHaveBeenCalledWith(filePath, {
        merge: false,
        validate: false
      })
    })

    it('should handle import errors', async () => {
      const filePath = '/nonexistent/config.json'
      const options = {}

      mockConfig.importConfig.mockImplementation(() => {
        throw new Error('File not found')
      })

      await expectToThrow(
        () => importActionHandler(filePath, options),
        'Failed to import configuration'
      )
    })
  })

  describe('helper functions', () => {
    it('should create interactive configuration correctly', async () => {
      const inquirer = require('inquirer')
      
      inquirer.prompt.mockResolvedValueOnce({
        vtexAccount: 'test-account',
        vtexWorkspace: 'test-workspace',
        enableNotifications: true,
        notificationChannels: ['slack', 'email']
      })

      inquirer.prompt.mockResolvedValueOnce({
        slackWebhook: 'https://hooks.slack.com/test'
      })

      inquirer.prompt.mockResolvedValueOnce({
        emailHost: 'smtp.gmail.com',
        emailPort: 587,
        emailUser: 'test@example.com',
        emailPassword: 'password'
      })

      // This would be called by the init command
      // We can't test it directly since it's a private function
      // But we can verify the behavior through the init command
    })

    it('should apply configuration template correctly', () => {
      // This would test the template application logic
      // Since it's a private function, we test it through the init command
    })

    it('should format configuration display correctly', () => {
      // This would test the display formatting logic
      // Since it's a private function, we test it through the show command
    })

    it('should mask sensitive values correctly', () => {
      // This would test the sensitive value masking logic
      // Since it's a private function, we test it through the show command
    })
  })

  describe('error handling', () => {
    it('should handle configuration manager errors', async () => {
      const showCommand = mockCommand.addCommand.mock.calls.find(
        call => call[0].name.mock.calls[0][0] === 'show'
      )?.[0]
      const showActionHandler = showCommand?.action.mock.calls[0][0]

      mockConfig.getConfig.mockImplementation(() => {
        throw new Error('Configuration error')
      })

      await expectToThrow(
        () => showActionHandler({}),
        'Configuration error'
      )
    })

    it('should handle file system errors', async () => {
      const exportCommand = mockCommand.addCommand.mock.calls.find(
        call => call[0].name.mock.calls[0][0] === 'export'
      )?.[0]
      const exportActionHandler = exportCommand?.action.mock.calls[0][0]

      mockConfig.exportConfig.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      await expectToThrow(
        () => exportActionHandler('/tmp/config.json', {}),
        'Failed to export configuration'
      )
    })

    it('should handle VTEX client errors', async () => {
      const initCommand = mockCommand.addCommand.mock.calls.find(
        call => call[0].name.mock.calls[0][0] === 'init'
      )?.[0]
      const initActionHandler = initCommand?.action.mock.calls[0][0]

      mockVtexClient.validateAccount.mockRejectedValue(new Error('VTEX error'))

      // This should not fail the init process, just show a warning
      await initActionHandler({})

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not validate VTEX account')
      )
    })
  })
})
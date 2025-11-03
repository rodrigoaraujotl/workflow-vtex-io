import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { ConfigManager } from '../../src/core/config-manager'
import {
  createMockLogger,
  setupTestEnvironment,
  cleanupTestEnvironment,
  expectToThrow
} from '../helpers/test-helpers'
import path from 'path'

// Mock fs module
const mockReadFile = jest.fn()
const mockWriteFile = jest.fn()
const mockExistsSync = jest.fn()
const mockReadFileSync = jest.fn()
const mockWriteFileSync = jest.fn()
const mockMkdir = jest.fn()

jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir
  }
}))

describe('ConfigManager', () => {
  let configManager: ConfigManager
  let mockLogger: any
  let defaultConfig: any

  beforeEach(() => {
    setupTestEnvironment()
    mockLogger = createMockLogger()
    configManager = new ConfigManager(mockLogger)
    defaultConfig = configManager.getConfig()
  })

  afterEach(() => {
    cleanupTestEnvironment()
  })

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const config = configManager.getConfig()

      expect(config).toBeDefined()
      expect(config.vtex).toBeDefined()
      expect(config.deployment).toBeDefined()
      expect(config.notifications).toBeDefined()
      expect(config.healthCheck).toBeDefined()
    })

    it('should load configuration from file if exists', () => {
      const mockConfig = {
        vtex: {
          account: 'test-account',
          workspace: 'test-workspace'
        }
      }

      mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig))
      mockExistsSync.mockReturnValue(true)

      const newConfigManager = new ConfigManager(mockLogger)
      const config = newConfigManager.getConfig()

      expect(config.vtex.account).toBe('test-account')
      expect(config.vtex.workspace).toBe('test-workspace')
    })

    it('should handle invalid JSON in config file', () => {
      mockReadFileSync.mockReturnValue('invalid json')
      mockExistsSync.mockReturnValue(true)

      expect(() => new ConfigManager(mockLogger)).toThrow()
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse configuration file')
      )
    })
  })

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = configManager.getConfig()

      expect(config).toHaveProperty('vtex')
      expect(config).toHaveProperty('deployment')
      expect(config).toHaveProperty('notifications')
      expect(config).toHaveProperty('healthCheck')
    })

    it('should return deep copy of configuration', () => {
      const config1 = configManager.getConfig()
      const config2 = configManager.getConfig()

      config1.vtex.account = 'modified'

      expect(config2.vtex.account).not.toBe('modified')
    })
  })

  describe('updateConfig', () => {
    it('should update configuration with partial object', () => {
      const updates = {
        vtex: {
          account: 'new-account'
        }
      }

      configManager.updateConfig(updates)
      const config = configManager.getConfig()

      expect(config.vtex.account).toBe('new-account')
    })

    it('should merge nested objects correctly', () => {
      const updates = {
        deployment: {
          timeout: 60000
        }
      }

      configManager.updateConfig(updates)
      const config = configManager.getConfig()

      expect(config.deployment.timeout).toBe(60000)
      expect(config.deployment.retries).toBeDefined() // Should preserve existing values
    })

    it('should validate configuration after update', () => {
      const invalidUpdates = {
        vtex: {
          account: '' // Invalid empty account
        }
      }

      expect(() => configManager.updateConfig(invalidUpdates)).toThrow()
    })

    it('should save configuration to file after update', () => {
      const updates = {
        vtex: {
          account: 'new-account'
        }
      }

      configManager.updateConfig(updates)

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('vtex-deploy.config.json'),
        expect.stringContaining('new-account'),
        'utf8'
      )
    })
  })

  describe('setValue', () => {
    it('should set nested values using dot notation', () => {
      configManager.setValue('vtex.account', 'test-account')
      const config = configManager.getConfig()

      expect(config.vtex.account).toBe('test-account')
    })

    it('should set array values', () => {
      configManager.setValue('notifications.channels', ['slack', 'email'])
      const config = configManager.getConfig()

      expect(config.notifications.channels).toEqual(['slack', 'email'])
    })

    it('should handle deep nested paths', () => {
      configManager.setValue('notifications.slack.webhook', 'https://hooks.slack.com/test')
      const config = configManager.getConfig()

      expect(config.notifications.slack.webhook).toBe('https://hooks.slack.com/test')
    })

    it('should throw error for invalid paths', () => {
      expect(() => configManager.setValue('', 'value')).toThrow()
      expect(() => configManager.setValue('invalid..path', 'value')).toThrow()
    })

    it('should validate value types', () => {
      expect(() => configManager.setValue('deployment.timeout', 'invalid')).toThrow()
      expect(() => configManager.setValue('deployment.retries', -1)).toThrow()
    })
  })

  describe('getValue', () => {
    it('should get nested values using dot notation', () => {
      configManager.setValue('vtex.account', 'test-account')
      const value = configManager.getValue('vtex.account')

      expect(value).toBe('test-account')
    })

    it('should return undefined for non-existent paths', () => {
      const value = configManager.getValue('non.existent.path')

      expect(value).toBeUndefined()
    })

    it('should return default value when provided', () => {
      const value = configManager.getValue('non.existent.path', 'default')

      expect(value).toBe('default')
    })
  })

  describe('validateConfiguration', () => {
    it('should validate valid configuration', async () => {
      const result = await configManager.validateConfiguration()

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect missing required fields', async () => {
      configManager.setValue('vtex.account', '')
      const result = await configManager.validateConfiguration()

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toContain('VTEX account is required')
    })

    it('should validate notification configuration correctly', async () => {
      const config = {
        ...defaultConfig,
        notifications: {
          enabled: true,
          slack: {
            enabled: true,
            webhook: ''
          }
        }
      }
      
      configManager.updateConfig(config)
      const result = await configManager.validateConfiguration()
      
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toContain('Slack webhook URL is required')
    })

    it('should provide warnings for optional configurations', async () => {
      const config = {
        ...defaultConfig,
        deployment: {
          timeout: 30000 // Less than 1 minute
        }
      }
      
      configManager.updateConfig(config)
      const result = await configManager.validateConfiguration()
      
      expect(result.valid).toBe(true)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0].message).toContain('Deployment timeout is less than 1 minute')
    })
  })

  describe('resetToDefaults', () => {
    it('should reset configuration to defaults', () => {
      configManager.setValue('vtex.account', 'test-account')
      configManager.resetToDefaults()
      
      const config = configManager.getConfig()

      expect(config.vtex.account).toBe('')
    })

    it('should save defaults to file', () => {
      configManager.resetToDefaults()

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('exportConfig', () => {
    it('should export configuration to file', async () => {
      const filePath = '/tmp/config-export.json'
      
      await configManager.exportConfig(filePath)

      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        filePath,
        expect.any(String),
        'utf8'
      )
    })

    it('should exclude sensitive data by default', async () => {
      configManager.setValue('notifications.slack.webhook', 'https://hooks.slack.com/secret')
      
      const filePath = '/tmp/config-export.json'
      await configManager.exportConfig(filePath)

      const writtenData = mockFs.promises.writeFile.mock.calls[0][1]
      expect(writtenData).not.toContain('secret')
      expect(writtenData).toContain('***')
    })

    it('should include sensitive data when requested', async () => {
      configManager.setValue('notifications.slack.webhook', 'https://hooks.slack.com/secret')
      
      const filePath = '/tmp/config-export.json'
      await configManager.exportConfig(filePath, true)

      const writtenData = mockFs.promises.writeFile.mock.calls[0][1]
      expect(writtenData).toContain('secret')
    })
  })

  describe('importConfig', () => {
    it('should import configuration from file', async () => {
      const importConfig = {
        vtex: {
          account: 'imported-account'
        }
      }

      ;(mockFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify(importConfig))
      ;(mockFs.existsSync as jest.Mock).mockReturnValue(true)

      await configManager.importConfig('/tmp/config-import.json')
      const config = configManager.getConfig()

      expect(config.vtex.account).toBe('imported-account')
    })

    it('should merge imported configuration', async () => {
      configManager.setValue('vtex.workspace', 'existing-workspace')
      
      const importConfig = {
        vtex: {
          account: 'imported-account'
        }
      }

      ;(mockFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify(importConfig))
      ;(mockFs.existsSync as jest.Mock).mockReturnValue(true)

      await configManager.importConfig('/tmp/config-import.json', true)
      const config = configManager.getConfig()

      expect(config.vtex.account).toBe('imported-account')
      expect(config.vtex.workspace).toBe('existing-workspace')
    })

    it('should validate imported configuration', async () => {
      const invalidConfig = {
        vtex: {
          account: '' // Invalid
        }
      }

      ;(mockFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify(invalidConfig))
      ;(mockFs.existsSync as jest.Mock).mockReturnValue(true)

      await expect(
        configManager.importConfig('/tmp/config-import.json', false)
      ).rejects.toThrow()
    })

    it('should handle non-existent import file', async () => {
      mockFs.existsSync.mockReturnValue(false)

      await expect(
        configManager.importConfig('/tmp/non-existent.json')
      ).rejects.toThrow('Configuration file not found')
    })
  })

  describe('getConfigPath', () => {
    it('should return correct config file path', () => {
      const configPath = configManager.getConfigPath()

      expect(configPath).toContain('vtex-deploy.config.json')
      expect(path.isAbsolute(configPath)).toBe(true)
    })
  })

  describe('private methods', () => {
    it('should create default configuration correctly', () => {
      const defaultConfig = (configManager as any).createDefaultConfig()

      expect(defaultConfig).toHaveProperty('vtex')
      expect(defaultConfig).toHaveProperty('deployment')
      expect(defaultConfig).toHaveProperty('notifications')
      expect(defaultConfig).toHaveProperty('healthCheck')
      
      expect(defaultConfig.vtex.account).toBe('')
      expect(defaultConfig.deployment.timeout).toBeGreaterThan(0)
      expect(defaultConfig.notifications.enabled).toBe(true)
    })

    it('should merge configurations deeply', () => {
      const base = {
        vtex: { account: 'base', workspace: 'base' },
        deployment: { timeout: 30000 }
      }
      
      const updates = {
        vtex: { account: 'updated' },
        notifications: { enabled: false }
      }

      const merged = (configManager as any).mergeConfig(base, updates)

      expect(merged.vtex.account).toBe('updated')
      expect(merged.vtex.workspace).toBe('base')
      expect(merged.deployment.timeout).toBe(30000)
      expect(merged.notifications.enabled).toBe(false)
    })

    it('should mask sensitive values correctly', () => {
      const config = {
        notifications: {
          slack: {
            webhook: 'https://hooks.slack.com/secret-token'
          },
          email: {
            password: 'secret-password'
          }
        }
      }

      const masked = (configManager as any).maskSensitiveValues(config)

      expect(masked.notifications.slack.webhook).toBe('***')
      expect(masked.notifications.email.password).toBe('***')
    })

    it('should validate field types correctly', () => {
      expect((configManager as any).validateFieldType('string', 'test')).toBe(true)
      expect((configManager as any).validateFieldType('number', 123)).toBe(true)
      expect((configManager as any).validateFieldType('boolean', true)).toBe(true)
      expect((configManager as any).validateFieldType('array', [])).toBe(true)
      
      expect((configManager as any).validateFieldType('string', 123)).toBe(false)
      expect((configManager as any).validateFieldType('number', 'test')).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should handle file system errors gracefully', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      expect(() => configManager.setValue('vtex.account', 'test')).toThrow()
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save configuration')
      )
    })

    it('should handle corrupted config files', () => {
      mockFs.readFileSync.mockReturnValue('corrupted data')
      mockFs.existsSync.mockReturnValue(true)

      expect(() => new ConfigManager(mockLogger)).toThrow()
    })
  })

  describe('environment variables', () => {
    it('should override config with environment variables', () => {
      process.env.VTEX_ACCOUNT = 'env-account'
      process.env.VTEX_WORKSPACE = 'env-workspace'

      const newConfigManager = new ConfigManager(mockLogger)
      const config = newConfigManager.getConfig()

      expect(config.vtex.account).toBe('env-account')
      expect(config.vtex.workspace).toBe('env-workspace')

      delete process.env.VTEX_ACCOUNT
      delete process.env.VTEX_WORKSPACE
    })

    it('should handle boolean environment variables', () => {
      process.env.VTEX_DEPLOY_NOTIFICATIONS_ENABLED = 'false'

      const newConfigManager = new ConfigManager(mockLogger)
      const config = newConfigManager.getConfig()

      expect(config.notifications.enabled).toBe(false)

      delete process.env.VTEX_DEPLOY_NOTIFICATIONS_ENABLED
    })

    it('should handle numeric environment variables', () => {
      process.env.VTEX_DEPLOY_TIMEOUT = '60000'

      const newConfigManager = new ConfigManager(mockLogger)
      const config = newConfigManager.getConfig()

      expect(config.deployment.timeout).toBe(60000)

      delete process.env.VTEX_DEPLOY_TIMEOUT
    })
  })
})
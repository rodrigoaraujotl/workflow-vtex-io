/**
 * Unit tests for ConfigManager
 */

import { ConfigManager } from '@/utils/config-manager'
import { Logger } from '@/utils/logger'
import { AppConfig } from '@/types/config.types'
import fs from 'fs'
import path from 'path'
import {
  createMockLogger,
  createMockConfig,
} from '../../test-utils'
// Mock dependencies
jest.mock('@/utils/logger')
jest.mock('fs')
jest.mock('path')

describe('ConfigManager', () => {
  let configManager: ConfigManager
  let mockLogger: Logger
  let mockFs: jest.Mocked<typeof fs>

  beforeEach(() => {
    // Create mock instances
    mockLogger = createMockLogger()
    mockFs = fs as jest.Mocked<typeof fs>

    // Setup mocks
    mockLogger.info = jest.fn()
    mockLogger.error = jest.fn()
    mockLogger.warn = jest.fn()
    mockLogger.debug = jest.fn()

    // Mock path methods
    ;(path.join as jest.Mock).mockImplementation((...args) => args.join('/'))
    ;(path.resolve as jest.Mock).mockImplementation((...args) => '/' + args.join('/'))

    // Setup default fs mocks
    mockFs.existsSync = jest.fn().mockReturnValue(true)
    mockFs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(createMockConfig()))
    mockFs.writeFileSync = jest.fn()
    mockFs.mkdirSync = jest.fn()

    // Create ConfigManager instance
    configManager = new ConfigManager(mockLogger, 'test-config')
  })

  describe('constructor', () => {
    it('should initialize with default config path', () => {
      expect(configManager).toBeInstanceOf(ConfigManager)
    })

    it('should initialize with custom config path', () => {
      const customPath = '/custom/config/path'
      const customConfigManager = new ConfigManager(mockLogger, customPath)
      
      expect(customConfigManager).toBeInstanceOf(ConfigManager)
    })

    it('should initialize without loading config automatically', () => {
      // ConfigManager should not load config automatically in constructor
      expect(configManager).toBeInstanceOf(ConfigManager)
    })
  })

  describe('loadConfig', () => {
    it('should load config from file successfully', async () => {
      const mockConfig = createMockConfig()
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      await configManager.loadConfig()

      expect(mockFs.readFileSync).toHaveBeenCalled()
      const config = configManager.getConfig()
      expect(config.vtex.account).toBe(mockConfig.vtex.account)
    })

    it('should create default config if file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false)
      
      // Set required environment variables to pass validation
      process.env['VTEX_ACCOUNT'] = 'test-account'
      process.env['VTEX_AUTH_TOKEN'] = 'test-token'

      await configManager.loadConfig()

      const config = configManager.getConfig()
      expect(config.vtex.account).toBe('test-account')
      
      // Cleanup
      delete process.env['VTEX_ACCOUNT']
      delete process.env['VTEX_AUTH_TOKEN']
    })

    it('should handle invalid JSON in config file', async () => {
      mockFs.readFileSync.mockReturnValue('invalid json')

      await expect(configManager.loadConfig()).rejects.toThrow()
    })

    it('should handle file read errors', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      await expect(configManager.loadConfig()).rejects.toThrow('Permission denied')
    })

    it('should merge with environment variables', async () => {
      // Set environment variables before creating config manager
      process.env['VTEX_ACCOUNT'] = 'env-account'
      process.env['VTEX_AUTH_TOKEN'] = 'env-token'

      // Mock file system to return empty config so env vars take precedence
      mockFs.existsSync.mockReturnValue(false)
      
      // Create a new config manager to test environment variable merging
      const envConfigManager = new ConfigManager(mockLogger, 'test-env-config')
      
      await envConfigManager.loadConfig()

      const config = envConfigManager.getConfig()
      expect(config.vtex.account).toBe('env-account')
      expect(config.vtex.authToken).toBe('env-token')

      // Cleanup
      delete process.env['VTEX_ACCOUNT']
      delete process.env['VTEX_AUTH_TOKEN']
    })
  })

  describe('saveConfig', () => {
    it('should save configuration to file', async () => {
      const mockConfig = createMockConfig()
      
      await configManager.saveConfig('development', mockConfig)
      
      expect(mockFs.writeFileSync).toHaveBeenCalled()
      const writeCall = mockFs.writeFileSync.mock.calls[0]
      expect(writeCall).toBeDefined()
      expect(writeCall![1]).toContain('"vtex"')
    })

    it('should create directory if it does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false)
      const mockConfig = createMockConfig()

      await configManager.saveConfig('development', mockConfig)

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      )
    })

    it('should handle write errors', async () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('permission denied')
      })

      const mockConfig = createMockConfig()
      await expect(configManager.saveConfig('development', mockConfig)).rejects.toThrow('permission denied')
    })

    it('should handle directory creation errors', async () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Cannot create directory')
      })

      const mockConfig = createMockConfig()
      await expect(configManager.saveConfig('development', mockConfig)).rejects.toThrow('Cannot create directory')
    })

    it('should format JSON with proper indentation', async () => {
      const mockConfig = createMockConfig()
      await configManager.saveConfig('development', mockConfig)

      const writeCall = mockFs.writeFileSync.mock.calls[0]
      expect(writeCall).toBeDefined()
      const jsonContent = writeCall![1] as string
      
      expect(jsonContent).toContain('\n')
      expect(jsonContent).toContain('  ') // Indentation
    })
  })

  describe('getConfig', () => {
    it('should return configuration after loading', async () => {
      const mockConfig = createMockConfig()
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))
      
      await configManager.loadConfig()
      const config = configManager.getConfig()
      
      expect(config.vtex.account).toBe(mockConfig.vtex.account)
    })

    it('should throw error if configuration not loaded', () => {
      const newConfigManager = new ConfigManager(mockLogger, 'test-config-new')
      expect(() => newConfigManager.getConfig()).toThrow('Configuration not loaded. Call loadConfig() first.')
    })
  })

  describe('getVTEXConfig', () => {
    it('should return VTEX configuration for environment', async () => {
      const mockConfig = createMockConfig()
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))
      
      await configManager.loadConfig()
      const vtexConfig = configManager.getVTEXConfig('development')
      expect(vtexConfig.workspace).toBeDefined()
      expect(vtexConfig.account).toBeDefined()
    })

    it('should return VTEX configuration for any environment', async () => {
      const mockConfig = createMockConfig()
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))
      
      await configManager.loadConfig()
      const vtexConfig = configManager.getVTEXConfig('production')
      expect(vtexConfig.workspace).toBeDefined()
      expect(vtexConfig.account).toBeDefined()
    })

    it('should throw error if configuration not loaded', () => {
      const newConfigManager = new ConfigManager(mockLogger, 'test-config-2')
      expect(() => newConfigManager.getVTEXConfig('development')).toThrow('Configuration not loaded. Call loadConfig() first.')
    })
  })





  describe('updateConfig', () => {
    it('should update configuration successfully', async () => {
      const mockConfig = createMockConfig()
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))
      
      await configManager.loadConfig()
      
      const updates: Partial<AppConfig> = { 
        vtex: { 
          account: 'updated-account',
          workspace: 'test-workspace',
          authToken: 'test-token',
          userEmail: 'test@example.com',
          timeout: 30000,
          retryAttempts: 3,
          apiVersion: 'v1',
          region: 'us'
        } 
      }
      
      await configManager.updateConfig(updates)
      
      const config = configManager.getConfig()
      expect(config.vtex.account).toBe('updated-account')
    })

    it('should throw error if configuration not loaded', async () => {
      const newConfigManager = new ConfigManager(mockLogger, 'test-config')
      const updates: Partial<AppConfig> = { 
        vtex: { 
          account: 'test',
          workspace: 'test-workspace',
          authToken: 'test-token',
          userEmail: 'test@example.com',
          timeout: 30000,
          retryAttempts: 3,
          apiVersion: 'v1',
          region: 'us'
        } 
      }
      
      await expect(newConfigManager.updateConfig(updates)).rejects.toThrow('Configuration not loaded')
    })
  })

  describe('edge cases', () => {
    it('should handle configuration without loading', () => {
      expect(() => configManager.getConfig()).toThrow('Configuration not loaded. Call loadConfig() first.')
    })

    it('should handle malformed configuration files', async () => {
      ;(fs.readFileSync as jest.Mock).mockReturnValue('invalid json')
      
      await expect(configManager.loadConfig()).rejects.toThrow()
    })

    it('should handle missing configuration files gracefully', async () => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      
      // Set required environment variables to pass validation
      process.env['VTEX_ACCOUNT'] = 'test-account'
      process.env['VTEX_AUTH_TOKEN'] = 'test-token'
      
      await expect(configManager.loadConfig()).resolves.toBeDefined()
      
      // Cleanup
      delete process.env['VTEX_ACCOUNT']
      delete process.env['VTEX_AUTH_TOKEN']
    })

    it('should handle file system errors', async () => {
      ;(fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('File system error')
      })
      
      await expect(configManager.loadConfig()).rejects.toThrow('File system error')
    })
  })
})
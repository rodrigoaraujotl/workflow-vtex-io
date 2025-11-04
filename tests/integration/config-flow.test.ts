/**
 * Integration tests for configuration management flow
 */

import { ConfigManager } from '@/core/ConfigManager'
import { ValidationService } from '@/core/ValidationService'
import { GitService } from '@/core/GitService'
import { VtexService } from '@/core/VtexService'
import { Logger } from '@/utils/Logger'
import { createMockConfig, createMockLoggingSettings } from '@tests/test-utils'
import * as fs from 'fs'
import * as path from 'path'

// Mock external dependencies
jest.mock('fs')
jest.mock('child_process')
jest.mock('simple-git')

describe('Configuration Flow Integration', () => {
  let configManager: ConfigManager
  let validationService: ValidationService
  let gitService: GitService
  let vtexService: VtexService
  let logger: Logger
  let mockFs: jest.Mocked<typeof fs>

  beforeEach(() => {
    mockFs = fs as jest.Mocked<typeof fs>
    
    // Create real instances
    configManager = new ConfigManager()
    logger = new Logger(createMockLoggingSettings())
    gitService = new GitService(configManager, logger)
    vtexService = new VtexService(configManager, logger)
    validationService = new ValidationService(configManager, gitService, vtexService, logger)

    // Reset mocks
    jest.clearAllMocks()
  })

  describe('configuration loading and validation', () => {
    it('should load and validate complete configuration', async () => {
      const mockConfig = createMockConfig()
      
      // Mock file system operations
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      await configManager.loadConfig()
      const validationResult = configManager.validate()

      expect(validationResult.valid).toBe(true)
      expect(validationResult.errors).toHaveLength(0)
      expect(configManager.get('vtex.account')).toBe('test-account')
      expect(configManager.get('deployment.environments.qa.workspace')).toBe('main')
    })

    it('should handle missing configuration file', async () => {
      // Mock missing config file
      mockFs.existsSync.mockReturnValue(false)

      await configManager.loadConfig()
      const validationResult = configManager.validate()

      expect(validationResult.valid).toBe(false)
      expect(validationResult.errors).toContain('Configuration file not found')
    })

    it('should validate configuration with missing required fields', async () => {
      const incompleteConfig = {
        vtex: {
          // Missing account
          workspace: 'main',
        },
        deployment: {
          environments: {
            qa: {
              workspace: 'main',
            },
          },
        },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(incompleteConfig))

      await configManager.loadConfig()
      const validationResult = configManager.validate()

      expect(validationResult.valid).toBe(false)
      expect(validationResult.errors).toContain('Missing required field: vtex.account')
    })

    it('should validate configuration with invalid values', async () => {
      const invalidConfig = {
        vtex: {
          account: 'test-account',
          workspace: 'main',
          timeout: -1000, // Invalid negative timeout
        },
        deployment: {
          environments: {
            qa: {
              workspace: 'main',
            },
          },
        },
        notifications: {
          slack: {
            enabled: true,
            webhook: 'invalid-url', // Invalid URL format
          },
        },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig))

      await configManager.loadConfig()
      const validationResult = configManager.validate()

      expect(validationResult.valid).toBe(false)
      expect(validationResult.errors).toContain('Invalid timeout value: must be positive')
      expect(validationResult.errors).toContain('Invalid webhook URL format')
    })
  })

  describe('configuration modification and persistence', () => {
    it('should set and persist configuration values', async () => {
      const mockConfig = createMockConfig()
      
      // Mock initial load
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))
      mockFs.writeFileSync.mockImplementation(() => {})

      await configManager.loadConfig()

      // Modify configuration
      configManager.set('vtex.account', 'new-account')
      configManager.set('deployment.environments.staging.workspace', 'staging-workspace')
      
      await configManager.save()

      expect(configManager.get('vtex.account')).toBe('new-account')
      expect(configManager.get('deployment.environments.staging.workspace')).toBe('staging-workspace')
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('vtex-workflow.json'),
        expect.stringContaining('"account": "new-account"'),
        'utf8'
      )
    })

    it('should handle nested configuration updates', async () => {
      const mockConfig = createMockConfig()
      
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))
      mockFs.writeFileSync.mockImplementation(() => {})

      await configManager.loadConfig()

      // Set nested values
      configManager.set('notifications.email.smtp.host', 'new-smtp.example.com')
      configManager.set('notifications.email.smtp.port', 587)
      configManager.set('deployment.validation.requireCleanBranch', false)

      await configManager.save()

      expect(configManager.get('notifications.email.smtp.host')).toBe('new-smtp.example.com')
      expect(configManager.get('notifications.email.smtp.port')).toBe(587)
      expect(configManager.get('deployment.validation.requireCleanBranch')).toBe(false)
    })

    it('should delete configuration keys', async () => {
      const mockConfig = createMockConfig()
      
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))
      mockFs.writeFileSync.mockImplementation(() => {})

      await configManager.loadConfig()

      // Delete configuration keys
      configManager.delete('notifications.slack')
      configManager.delete('deployment.environments.staging')

      await configManager.save()

      expect(configManager.get('notifications.slack')).toBeUndefined()
      expect(configManager.get('deployment.environments.staging')).toBeUndefined()
      expect(configManager.get('notifications.email')).toBeDefined() // Should still exist
    })

    it('should handle configuration backup and restore', async () => {
      const mockConfig = createMockConfig()
      
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))
      mockFs.writeFileSync.mockImplementation(() => {})
      mockFs.copyFileSync.mockImplementation(() => {})

      await configManager.loadConfig()

      // Create backup
      await configManager.backup()
      expect(mockFs.copyFileSync).toHaveBeenCalledWith(
        expect.stringContaining('vtex-workflow.json'),
        expect.stringContaining('vtex-workflow.json.backup')
      )

      // Modify configuration
      configManager.set('vtex.account', 'modified-account')
      await configManager.save()

      // Restore from backup
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig)) // Original config
      await configManager.restore()

      expect(configManager.get('vtex.account')).toBe('test-account') // Original value
    })
  })

  describe('environment-specific configuration', () => {
    it('should resolve environment-specific settings', async () => {
      const mockConfig = {
        vtex: {
          account: 'test-account',
          workspace: 'main',
        },
        deployment: {
          environments: {
            qa: {
              workspace: 'qa-workspace',
              requireHealthCheck: false,
            },
            production: {
              workspace: 'production',
              requireHealthCheck: true,
              canary: {
                enabled: true,
                percentage: 10,
              },
            },
          },
        },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      await configManager.loadConfig()

      // Test QA environment settings
      const qaConfig = configManager.getEnvironmentConfig('qa')
      expect(qaConfig.workspace).toBe('qa-workspace')
      expect(qaConfig.requireHealthCheck).toBe(false)

      // Test production environment settings
      const prodConfig = configManager.getEnvironmentConfig('production')
      expect(prodConfig.workspace).toBe('production')
      expect(prodConfig.requireHealthCheck).toBe(true)
      expect(prodConfig.canary.enabled).toBe(true)
      expect(prodConfig.canary.percentage).toBe(10)
    })

    it('should merge global and environment-specific settings', async () => {
      const mockConfig = {
        vtex: {
          account: 'test-account',
          workspace: 'main',
          timeout: 30000,
        },
        deployment: {
          validation: {
            requireCleanBranch: true,
            allowedBranches: ['main', 'develop'],
          },
          environments: {
            qa: {
              workspace: 'qa-workspace',
              validation: {
                requireCleanBranch: false, // Override global setting
              },
            },
            production: {
              workspace: 'production',
              validation: {
                allowedBranches: ['main'], // Override global setting
              },
            },
          },
        },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      await configManager.loadConfig()

      // Test QA environment (overrides requireCleanBranch)
      const qaConfig = configManager.getEnvironmentConfig('qa')
      expect(qaConfig.validation.requireCleanBranch).toBe(false)
      expect(qaConfig.validation.allowedBranches).toEqual(['main', 'develop']) // Inherited

      // Test production environment (overrides allowedBranches)
      const prodConfig = configManager.getEnvironmentConfig('production')
      expect(prodConfig.validation.requireCleanBranch).toBe(true) // Inherited
      expect(prodConfig.validation.allowedBranches).toEqual(['main'])
    })
  })

  describe('configuration validation with services', () => {
    it('should validate VTEX configuration with service integration', async () => {
      const mockConfig = createMockConfig()
      
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      await configManager.loadConfig()

      // Mock VTEX service validation
      jest.spyOn(vtexService, 'validateAccount').mockResolvedValue({
        valid: true,
        account: 'test-account',
      })
      jest.spyOn(vtexService, 'validateWorkspace').mockResolvedValue({
        exists: true,
        name: 'main',
        production: false,
      })

      const validationResult = await validationService.validateConfiguration()

      expect(validationResult.valid).toBe(true)
      expect(vtexService.validateAccount).toHaveBeenCalledWith('test-account')
      expect(vtexService.validateWorkspace).toHaveBeenCalledWith('main')
    })

    it('should detect invalid VTEX configuration', async () => {
      const mockConfig = createMockConfig()
      mockConfig.vtex.account = 'invalid-account'
      
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      await configManager.loadConfig()

      // Mock VTEX service validation failure
      jest.spyOn(vtexService, 'validateAccount').mockResolvedValue({
        valid: false,
        error: 'Account not found or access denied',
      })

      const validationResult = await validationService.validateConfiguration()

      expect(validationResult.valid).toBe(false)
      expect(validationResult.errors).toContain('Invalid VTEX account: Account not found or access denied')
    })

    it('should validate Git configuration', async () => {
      const mockConfig = createMockConfig()
      
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      await configManager.loadConfig()

      // Mock Git service validation
      jest.spyOn(gitService, 'validateRepository').mockResolvedValue({
        valid: true,
        hasRemote: true,
        currentBranch: 'main',
      })

      const validationResult = await validationService.validateConfiguration()

      expect(validationResult.valid).toBe(true)
      expect(gitService.validateRepository).toHaveBeenCalled()
    })
  })

  describe('configuration migration and versioning', () => {
    it('should migrate old configuration format', async () => {
      const oldConfig = {
        // Old format
        account: 'test-account',
        workspace: 'main',
        slackWebhook: 'https://hooks.slack.com/test',
        emailSettings: {
          host: 'smtp.example.com',
          port: 587,
        },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(oldConfig))
      mockFs.writeFileSync.mockImplementation(() => {})

      await configManager.loadConfig()

      // Should migrate to new format
      expect(configManager.get('vtex.account')).toBe('test-account')
      expect(configManager.get('vtex.workspace')).toBe('main')
      expect(configManager.get('notifications.slack.webhook')).toBe('https://hooks.slack.com/test')
      expect(configManager.get('notifications.email.smtp.host')).toBe('smtp.example.com')
      expect(configManager.get('notifications.email.smtp.port')).toBe(587)

      // Should save migrated configuration
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('vtex-workflow.json'),
        expect.stringContaining('"vtex"'),
        'utf8'
      )
    })

    it('should handle configuration version updates', async () => {
      const configV1 = {
        version: '1.0.0',
        vtex: {
          account: 'test-account',
          workspace: 'main',
        },
        // Missing new fields from v2
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(configV1))
      mockFs.writeFileSync.mockImplementation(() => {})

      await configManager.loadConfig()

      // Should upgrade to current version with defaults
      expect(configManager.get('version')).toBe('2.0.0') // Current version
      expect(configManager.get('deployment.validation.requireCleanBranch')).toBe(true) // Default value
      expect(configManager.get('notifications.enabled')).toBe(false) // Default value
    })
  })

  describe('configuration templates and initialization', () => {
    it('should initialize configuration from template', async () => {
      // Mock no existing config
      mockFs.existsSync.mockReturnValue(false)
      mockFs.writeFileSync.mockImplementation(() => {})

      const initOptions = {
        vtexAccount: 'new-account',
        defaultWorkspace: 'main',
        enableNotifications: true,
        slackWebhook: 'https://hooks.slack.com/new',
      }

      await configManager.initializeFromTemplate(initOptions)

      expect(configManager.get('vtex.account')).toBe('new-account')
      expect(configManager.get('vtex.workspace')).toBe('main')
      expect(configManager.get('notifications.slack.enabled')).toBe(true)
      expect(configManager.get('notifications.slack.webhook')).toBe('https://hooks.slack.com/new')

      // Should save initialized configuration
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('vtex-workflow.json'),
        expect.stringMatching(/"account": "new-account"/),
        'utf8'
      )
    })

    it('should provide configuration templates for different scenarios', async () => {
      const templates = configManager.getTemplates()

      expect(templates).toHaveProperty('basic')
      expect(templates).toHaveProperty('enterprise')
      expect(templates).toHaveProperty('minimal')

      // Test basic template
      const basicTemplate = templates.basic
      expect(basicTemplate.vtex).toBeDefined()
      expect(basicTemplate.deployment).toBeDefined()
      expect(basicTemplate.notifications).toBeDefined()

      // Test enterprise template
      const enterpriseTemplate = templates.enterprise
      expect(enterpriseTemplate.deployment.environments).toHaveProperty('qa')
      expect(enterpriseTemplate.deployment.environments).toHaveProperty('staging')
      expect(enterpriseTemplate.deployment.environments).toHaveProperty('production')
      expect(enterpriseTemplate.notifications.slack.enabled).toBe(true)
      expect(enterpriseTemplate.notifications.email.enabled).toBe(true)
    })
  })

  describe('configuration security and validation', () => {
    it('should validate sensitive configuration fields', async () => {
      const configWithSecrets = {
        vtex: {
          account: 'test-account',
          workspace: 'main',
          authToken: 'vtex-token-123', // Sensitive
        },
        notifications: {
          slack: {
            enabled: true,
            webhook: 'https://hooks.slack.com/test', // Sensitive
          },
          email: {
            enabled: true,
            smtp: {
              host: 'smtp.example.com',
              port: 587,
              auth: {
                user: 'user@example.com',
                pass: 'password123', // Sensitive
              },
            },
          },
        },
      }

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(configWithSecrets))

      await configManager.loadConfig()

      // Should identify sensitive fields
      const sensitiveFields = configManager.getSensitiveFields()
      expect(sensitiveFields).toContain('vtex.authToken')
      expect(sensitiveFields).toContain('notifications.slack.webhook')
      expect(sensitiveFields).toContain('notifications.email.smtp.auth.pass')
    })

    it('should mask sensitive values in logs and exports', async () => {
      const configWithSecrets = createMockConfig()
      configWithSecrets.vtex.authToken = 'vtex-secret-token'
      configWithSecrets.notifications.slack.webhook = 'https://hooks.slack.com/secret'

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(configWithSecrets))

      await configManager.loadConfig()

      // Export configuration with masked values
      const exportedConfig = configManager.export({ maskSensitive: true })
      
      expect(exportedConfig.vtex.authToken).toBe('***masked***')
      expect(exportedConfig.notifications.slack.webhook).toBe('***masked***')
      expect(exportedConfig.vtex.account).toBe('test-account') // Non-sensitive should not be masked
    })

    it('should validate configuration file permissions', async () => {
      const mockConfig = createMockConfig()
      
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))
      mockFs.statSync.mockReturnValue({
        mode: 0o644, // World-readable
      } as any)

      await configManager.loadConfig()
      const validationResult = configManager.validateSecurity()

      expect(validationResult.valid).toBe(false)
      expect(validationResult.warnings).toContain('Configuration file is world-readable')
    })
  })
})
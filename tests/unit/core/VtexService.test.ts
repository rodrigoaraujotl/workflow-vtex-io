/**
 * Unit tests for VtexService
 */

import { VtexService } from '@/core/VtexService'
import { ConfigManager } from '@/core/ConfigManager'
import { Logger } from '@/utils/Logger'
import { exec } from 'child_process'
import {
  createMockConfig,
  createMockDeploymentOptions,
  mockAsyncFunction,
  mockRejectedFunction,
  createMockLoggingSettings,
} from '@tests/test-utils'

// Mock dependencies
jest.mock('@/core/ConfigManager')
jest.mock('@/utils/Logger')
jest.mock('child_process')

describe('VtexService', () => {
  let vtexService: VtexService
  let mockConfig: ConfigManager
  let mockLogger: Logger
  let mockExec: jest.MockedFunction<typeof exec>

  beforeEach(() => {
    // Create mock instances
    mockConfig = new ConfigManager() as jest.Mocked<ConfigManager>
    mockLogger = new Logger(createMockLoggingSettings()) as jest.Mocked<Logger>
    mockExec = exec as jest.MockedFunction<typeof exec>

    // Setup mocks
    mockConfig.get = jest.fn().mockImplementation((key: string) => {
      const config = createMockConfig()
      return key.split('.').reduce((obj, k) => obj?.[k], config)
    })

    mockLogger.info = jest.fn()
    mockLogger.error = jest.fn()
    mockLogger.warn = jest.fn()
    mockLogger.debug = jest.fn()

    // Setup default exec mock
    mockExec.mockImplementation((command, callback) => {
      // Default successful response
      const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
      setTimeout(() => mockCallback(null, '{"success": true}', ''), 0)
      return {} as any
    })

    // Create VtexService instance
    vtexService = new VtexService(mockConfig)
  })

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(vtexService).toBeInstanceOf(VtexService)
      expect(mockConfig).toBeDefined()
    })
  })

  describe('login', () => {
    it('should login successfully with account', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, 'Logged in successfully', ''), 0)
        return {} as any
      })

      await vtexService.login('test-account')

      expect(mockExec).toHaveBeenCalledWith(
        'vtex login test-account',
        expect.any(Function)
      )
    })

    it('should handle login errors', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('Login failed'), '', 'Invalid credentials'), 0)
        return {} as any
      })

      await expect(vtexService.login('invalid-account')).rejects.toThrow(
        'Login failed'
      )
    })

    it('should use account from config if not provided', async () => {
      await vtexService.login()

      expect(mockExec).toHaveBeenCalledWith(
        'vtex login test-account',
        expect.any(Function)
      )
    })
  })

  describe('useWorkspace', () => {
    it('should switch to workspace successfully', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, 'Using workspace test-qa', ''), 0)
        return {} as any
      })

      await vtexService.useWorkspace('test-qa')

      expect(mockExec).toHaveBeenCalledWith(
        'vtex use test-qa',
        expect.any(Function)
      )
    })

    it('should handle workspace switch errors', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('Workspace not found'), '', ''), 0)
        return {} as any
      })

      await expect(vtexService.useWorkspace('nonexistent')).rejects.toThrow(
        'Workspace not found'
      )
    })
  })

  describe('deploy', () => {
    it('should deploy app successfully', async () => {
      const options = createMockDeploymentOptions()
      
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, 'App deployed successfully', ''), 0)
        return {} as any
      })

      const result = await vtexService.deploy(options)

      expect(result.success).toBe(true)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('vtex deploy'),
        expect.any(Function)
      )
    })

    it('should handle deployment with custom options', async () => {
      const options = createMockDeploymentOptions({
        force: true,
        verbose: true,
        timeout: 600,
      })

      await vtexService.deploy(options)

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('--force'),
        expect.any(Function)
      )
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('--verbose'),
        expect.any(Function)
      )
    })

    it('should handle deployment failures', async () => {
      const options = createMockDeploymentOptions()
      
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('Deployment failed'), '', 'Build error'), 0)
        return {} as any
      })

      const result = await vtexService.deploy(options)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Deployment failed')
    })

    it('should respect deployment timeout', async () => {
      const options = createMockDeploymentOptions({ timeout: 1 })
      
      mockExec.mockImplementation((command, callback) => {
        // Simulate long-running deployment
        setTimeout(() => {
          const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
          mockCallback(null, 'Deployment completed', '')
        }, 2000)
        return {} as any
      })

      const startTime = Date.now()
      const result = await vtexService.deploy(options)
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(1500) // Should timeout before 2 seconds
      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    })
  })

  describe('publish', () => {
    it('should publish app successfully', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, 'App published successfully', ''), 0)
        return {} as any
      })

      const result = await vtexService.publish()

      expect(result.success).toBe(true)
      expect(mockExec).toHaveBeenCalledWith(
        'vtex publish',
        expect.any(Function)
      )
    })

    it('should handle publish with tag', async () => {
      await vtexService.publish('beta')

      expect(mockExec).toHaveBeenCalledWith(
        'vtex publish --tag beta',
        expect.any(Function)
      )
    })

    it('should handle publish failures', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('Publish failed'), '', ''), 0)
        return {} as any
      })

      const result = await vtexService.publish()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Publish failed')
    })
  })

  describe('validateWorkspace', () => {
    it('should validate existing workspace', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, JSON.stringify({
          workspace: 'test-qa',
          account: 'test-account',
          valid: true
        }), ''), 0)
        return {} as any
      })

      const result = await vtexService.validateWorkspace('test-qa')

      expect(result.valid).toBe(true)
      expect(result.workspace).toBe('test-qa')
    })

    it('should handle non-existent workspace', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('Workspace not found'), '', ''), 0)
        return {} as any
      })

      const result = await vtexService.validateWorkspace('nonexistent')

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Workspace not found')
    })
  })

  describe('checkAppCompatibility', () => {
    it('should return compatibility information', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, JSON.stringify({
          compatible: true,
          issues: []
        }), ''), 0)
        return {} as any
      })

      const result = await vtexService.checkAppCompatibility()

      expect(result.compatible).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('should detect compatibility issues', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, JSON.stringify({
          compatible: false,
          issues: [
            { type: 'error', message: 'Breaking API change detected' },
            { type: 'warning', message: 'Deprecated function usage' }
          ]
        }), ''), 0)
        return {} as any
      })

      const result = await vtexService.checkAppCompatibility()

      expect(result.compatible).toBe(false)
      expect(result.issues).toHaveLength(2)
      expect(result.issues[0].type).toBe('error')
      expect(result.issues[1].type).toBe('warning')
    })
  })

  describe('getAppInfo', () => {
    it('should return app information', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          vendor: 'test-vendor',
          dependencies: {}
        }), ''), 0)
        return {} as any
      })

      const appInfo = await vtexService.getAppInfo()

      expect(appInfo.name).toBe('test-app')
      expect(appInfo.version).toBe('1.0.0')
      expect(appInfo.vendor).toBe('test-vendor')
    })

    it('should handle missing manifest', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('manifest.json not found'), '', ''), 0)
        return {} as any
      })

      await expect(vtexService.getAppInfo()).rejects.toThrow(
        'manifest.json not found'
      )
    })
  })

  describe('listWorkspaces', () => {
    it('should return list of workspaces', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, JSON.stringify([
          { name: 'master', production: true },
          { name: 'test-qa', production: false },
          { name: 'dev-workspace', production: false }
        ]), ''), 0)
        return {} as any
      })

      const workspaces = await vtexService.listWorkspaces()

      expect(workspaces).toHaveLength(3)
      expect(workspaces[0].name).toBe('master')
      expect(workspaces[0].production).toBe(true)
    })

    it('should handle workspace listing errors', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('Access denied'), '', ''), 0)
        return {} as any
      })

      await expect(vtexService.listWorkspaces()).rejects.toThrow(
        'Access denied'
      )
    })
  })

  describe('installApp', () => {
    it('should install app successfully', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, 'App installed successfully', ''), 0)
        return {} as any
      })

      const result = await vtexService.installApp('vtex.store-theme@1.0.0')

      expect(result.success).toBe(true)
      expect(mockExec).toHaveBeenCalledWith(
        'vtex install vtex.store-theme@1.0.0',
        expect.any(Function)
      )
    })

    it('should handle app installation failures', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('App not found'), '', ''), 0)
        return {} as any
      })

      const result = await vtexService.installApp('nonexistent.app')

      expect(result.success).toBe(false)
      expect(result.error).toContain('App not found')
    })
  })

  describe('uninstallApp', () => {
    it('should uninstall app successfully', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, 'App uninstalled successfully', ''), 0)
        return {} as any
      })

      const result = await vtexService.uninstallApp('vtex.store-theme')

      expect(result.success).toBe(true)
      expect(mockExec).toHaveBeenCalledWith(
        'vtex uninstall vtex.store-theme',
        expect.any(Function)
      )
    })
  })

  describe('getDeploymentStatus', () => {
    it('should return deployment status', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, JSON.stringify({
          status: 'deployed',
          version: '1.0.0',
          deployedAt: '2024-01-01T10:00:00Z'
        }), ''), 0)
        return {} as any
      })

      const status = await vtexService.getDeploymentStatus('test-app')

      expect(status.status).toBe('deployed')
      expect(status.version).toBe('1.0.0')
    })

    it('should handle status check errors', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('App not found'), '', ''), 0)
        return {} as any
      })

      await expect(
        vtexService.getDeploymentStatus('nonexistent-app')
      ).rejects.toThrow('App not found')
    })
  })

  describe('rollback', () => {
    it('should rollback to previous version', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, 'Rollback completed successfully', ''), 0)
        return {} as any
      })

      const result = await vtexService.rollback('test-app', '0.9.0')

      expect(result.success).toBe(true)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('vtex install test-app@0.9.0'),
        expect.any(Function)
      )
    })

    it('should handle rollback failures', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('Version not found'), '', ''), 0)
        return {} as any
      })

      const result = await vtexService.rollback('test-app', '0.5.0')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Version not found')
    })
  })

  describe('getLogs', () => {
    it('should return app logs', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(null, JSON.stringify([
          { timestamp: '2024-01-01T10:00:00Z', level: 'info', message: 'App started' },
          { timestamp: '2024-01-01T10:01:00Z', level: 'error', message: 'Error occurred' }
        ]), ''), 0)
        return {} as any
      })

      const logs = await vtexService.getLogs('test-app')

      expect(logs).toHaveLength(2)
      expect(logs[0].level).toBe('info')
      expect(logs[1].level).toBe('error')
    })

    it('should handle log retrieval errors', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('Logs not available'), '', ''), 0)
        return {} as any
      })

      await expect(vtexService.getLogs('test-app')).rejects.toThrow(
        'Logs not available'
      )
    })
  })

  describe('error handling', () => {
    it('should handle VTEX CLI not installed', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('vtex: command not found'), '', ''), 0)
        return {} as any
      })

      await expect(vtexService.login()).rejects.toThrow(
        'vtex: command not found'
      )
    })

    it('should handle network connectivity issues', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('Network unreachable'), '', ''), 0)
        return {} as any
      })

      await expect(vtexService.deploy(createMockDeploymentOptions())).resolves.toEqual({
        success: false,
        error: expect.stringContaining('Network unreachable')
      })
    })

    it('should handle authentication errors', async () => {
      mockExec.mockImplementation((command, callback) => {
        const mockCallback = callback as (error: Error | null, stdout: string, stderr: string) => void
        setTimeout(() => mockCallback(new Error('Authentication failed'), '', ''), 0)
        return {} as any
      })

      await expect(vtexService.login('test-account')).rejects.toThrow(
        'Authentication failed'
      )
    })
  })

  describe('performance', () => {
    it('should complete VTEX operations within reasonable time', async () => {
      const startTime = Date.now()

      await vtexService.validateWorkspace('test-qa')
      await vtexService.checkAppCompatibility()

      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(2000) // Should complete within 2 seconds
    })

    it('should handle concurrent operations', async () => {
      const promises = [
        vtexService.validateWorkspace('test-qa'),
        vtexService.checkAppCompatibility(),
        vtexService.getAppInfo(),
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result).toBeDefined()
      })
    })
  })
})
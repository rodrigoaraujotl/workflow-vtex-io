import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { VTEXClient } from '../../src/core/vtex-client'
import {
  createMockLogger,
  createMockConfigManager,
  mockExec,
  mockAxios,
  setupTestEnvironment,
  cleanupTestEnvironment,
  expectToThrow
} from '../helpers/test-helpers'

describe('VTEXClient', () => {
  let vtexClient: VTEXClient
  let mockLogger: any
  let mockConfig: any

  beforeEach(() => {
    setupTestEnvironment()
    mockLogger = createMockLogger()
    mockConfig = createMockConfigManager()
    vtexClient = new VTEXClient(mockLogger, mockConfig)
  })

  afterEach(() => {
    cleanupTestEnvironment()
  })

  describe('validateCLI', () => {
    it('should validate VTEX CLI is installed', async () => {
      mockExec.mockResolvedValue({ stdout: 'vtex version 3.0.0', stderr: '' })

      const result = await vtexClient.validateCLI()

      expect(result).toBe(true)
      expect(mockExec).toHaveBeenCalledWith('vtex --version')
    })

    it('should handle missing VTEX CLI', async () => {
      mockExec.mockRejectedValue(new Error('command not found'))

      await expectToThrow(
        () => vtexClient.validateCLI(),
        'VTEX CLI is not installed'
      )
    })

    it('should handle outdated VTEX CLI version', async () => {
      mockExec.mockResolvedValue({ stdout: 'vtex version 2.0.0', stderr: '' })

      await expectToThrow(
        () => vtexClient.validateCLI(),
        'VTEX CLI version 3.0.0 or higher is required'
      )
    })
  })

  describe('validateAccount', () => {
    it('should validate VTEX account access', async () => {
      mockExec.mockResolvedValue({ 
        stdout: JSON.stringify({ account: 'test-account' }), 
        stderr: '' 
      })

      const result = await vtexClient.validateAccount()

      expect(result).toBe(true)
      expect(mockExec).toHaveBeenCalledWith('vtex whoami --json')
    })

    it('should handle authentication errors', async () => {
      mockExec.mockRejectedValue(new Error('Not authenticated'))

      await expectToThrow(
        () => vtexClient.validateAccount(),
        'Not authenticated with VTEX'
      )
    })

    it('should handle account mismatch', async () => {
      mockExec.mockResolvedValue({ 
        stdout: JSON.stringify({ account: 'wrong-account' }), 
        stderr: '' 
      })

      const config = mockConfig.getConfig()
      config.vtex.account = 'test-account'

      await expectToThrow(
        () => vtexClient.validateAccount(),
        'Account mismatch'
      )
    })
  })

  describe('useWorkspace', () => {
    it('should switch to specified workspace', async () => {
      mockExec.mockResolvedValue({ stdout: 'Workspace changed', stderr: '' })

      await vtexClient.useWorkspace('test-workspace')

      expect(mockExec).toHaveBeenCalledWith('vtex use test-workspace')
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Switched to workspace: test-workspace'
      )
    })

    it('should handle workspace switch errors', async () => {
      mockExec.mockRejectedValue(new Error('Workspace not found'))

      await expectToThrow(
        () => vtexClient.useWorkspace('non-existent'),
        'Failed to switch to workspace'
      )
    })

    it('should create workspace if it does not exist', async () => {
      mockExec
        .mockRejectedValueOnce(new Error('Workspace not found'))
        .mockResolvedValueOnce({ stdout: 'Workspace created', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'Workspace changed', stderr: '' })

      await vtexClient.useWorkspace('new-workspace', { createIfNotExists: true })

      expect(mockExec).toHaveBeenCalledWith('vtex workspace create new-workspace')
      expect(mockExec).toHaveBeenCalledWith('vtex use new-workspace')
    })
  })

  describe('installApp', () => {
    it('should install app successfully', async () => {
      mockExec.mockResolvedValue({ stdout: 'App installed', stderr: '' })

      await vtexClient.installApp('test-vendor.test-app')

      expect(mockExec).toHaveBeenCalledWith('vtex install test-vendor.test-app')
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Installing app: test-vendor.test-app'
      )
    })

    it('should install specific app version', async () => {
      mockExec.mockResolvedValue({ stdout: 'App installed', stderr: '' })

      await vtexClient.installApp('test-vendor.test-app', '1.0.0')

      expect(mockExec).toHaveBeenCalledWith('vtex install test-vendor.test-app@1.0.0')
    })

    it('should handle installation errors', async () => {
      mockExec.mockRejectedValue(new Error('Installation failed'))

      await expectToThrow(
        () => vtexClient.installApp('test-vendor.test-app'),
        'Failed to install app'
      )
    })

    it('should retry installation on failure', async () => {
      mockExec
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ stdout: 'App installed', stderr: '' })

      await vtexClient.installApp('test-vendor.test-app')

      expect(mockExec).toHaveBeenCalledTimes(2)
    })
  })

  describe('publishApp', () => {
    it('should publish app successfully', async () => {
      mockExec.mockResolvedValue({ 
        stdout: 'Published test-vendor.test-app@1.0.0', 
        stderr: '' 
      })

      const result = await vtexClient.publishApp()

      expect(result.version).toBe('1.0.0')
      expect(mockExec).toHaveBeenCalledWith('vtex publish --yes')
    })

    it('should handle publish errors', async () => {
      mockExec.mockRejectedValue(new Error('Publish failed'))

      await expectToThrow(
        () => vtexClient.publishApp(),
        'Failed to publish app'
      )
    })

    it('should publish with custom tag', async () => {
      mockExec.mockResolvedValue({ 
        stdout: 'Published test-vendor.test-app@1.0.0-beta', 
        stderr: '' 
      })

      await vtexClient.publishApp({ tag: 'beta' })

      expect(mockExec).toHaveBeenCalledWith('vtex publish --tag beta --yes')
    })
  })

  describe('promoteWorkspace', () => {
    it('should promote workspace to master', async () => {
      mockExec.mockResolvedValue({ stdout: 'Workspace promoted', stderr: '' })

      await vtexClient.promoteWorkspace('test-workspace')

      expect(mockExec).toHaveBeenCalledWith('vtex workspace promote test-workspace')
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Promoted workspace test-workspace to master'
      )
    })

    it('should handle promotion errors', async () => {
      mockExec.mockRejectedValue(new Error('Promotion failed'))

      await expectToThrow(
        () => vtexClient.promoteWorkspace('test-workspace'),
        'Failed to promote workspace'
      )
    })
  })

  describe('getAppInfo', () => {
    it('should get app information', async () => {
      const appInfo = {
        name: 'test-app',
        vendor: 'test-vendor',
        version: '1.0.0'
      }

      mockExec.mockResolvedValue({ 
        stdout: JSON.stringify(appInfo), 
        stderr: '' 
      })

      const result = await vtexClient.getAppInfo('test-vendor.test-app')

      expect(result).toEqual(appInfo)
      expect(mockExec).toHaveBeenCalledWith('vtex list test-vendor.test-app --json')
    })

    it('should handle app not found', async () => {
      mockExec.mockRejectedValue(new Error('App not found'))

      const result = await vtexClient.getAppInfo('non-existent.app')

      expect(result).toBeNull()
    })
  })

  describe('getAllAppVersions', () => {
    it('should get all app versions', async () => {
      const versions = ['1.0.0', '1.0.1', '1.1.0']
      
      mockAxios.get.mockResolvedValue({
        data: versions.map(v => ({ version: v }))
      })

      const result = await vtexClient.getAllAppVersions('test-vendor.test-app')

      expect(result).toEqual(versions)
    })

    it('should handle API errors', async () => {
      mockAxios.get.mockRejectedValue(new Error('API error'))

      await expectToThrow(
        () => vtexClient.getAllAppVersions('test-vendor.test-app'),
        'Failed to get app versions'
      )
    })
  })

  describe('getWorkspaceInfo', () => {
    it('should get workspace information', async () => {
      const workspaceInfo = {
        name: 'test-workspace',
        weight: 100,
        production: false
      }

      mockExec.mockResolvedValue({ 
        stdout: JSON.stringify(workspaceInfo), 
        stderr: '' 
      })

      const result = await vtexClient.getWorkspaceInfo('test-workspace')

      expect(result).toEqual(workspaceInfo)
      expect(mockExec).toHaveBeenCalledWith('vtex workspace info test-workspace --json')
    })

    it('should handle workspace not found', async () => {
      mockExec.mockRejectedValue(new Error('Workspace not found'))

      const result = await vtexClient.getWorkspaceInfo('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('listWorkspaces', () => {
    it('should list all workspaces', async () => {
      const workspaces = [
        { name: 'master', weight: 100, production: true },
        { name: 'test', weight: 0, production: false }
      ]

      mockExec.mockResolvedValue({ 
        stdout: JSON.stringify(workspaces), 
        stderr: '' 
      })

      const result = await vtexClient.listWorkspaces()

      expect(result).toEqual(workspaces)
      expect(mockExec).toHaveBeenCalledWith('vtex workspace list --json')
    })
  })

  describe('deleteWorkspace', () => {
    it('should delete workspace', async () => {
      mockExec.mockResolvedValue({ stdout: 'Workspace deleted', stderr: '' })

      await vtexClient.deleteWorkspace('test-workspace')

      expect(mockExec).toHaveBeenCalledWith('vtex workspace delete test-workspace --yes')
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Deleted workspace: test-workspace'
      )
    })

    it('should handle deletion errors', async () => {
      mockExec.mockRejectedValue(new Error('Cannot delete master workspace'))

      await expectToThrow(
        () => vtexClient.deleteWorkspace('master'),
        'Failed to delete workspace'
      )
    })

    it('should not delete production workspace without force', async () => {
      await expectToThrow(
        () => vtexClient.deleteWorkspace('master'),
        'Cannot delete production workspace without force flag'
      )
    })

    it('should delete production workspace with force', async () => {
      mockExec.mockResolvedValue({ stdout: 'Workspace deleted', stderr: '' })

      await vtexClient.deleteWorkspace('master', { force: true })

      expect(mockExec).toHaveBeenCalledWith('vtex workspace delete master --yes --force')
    })
  })

  describe('runTests', () => {
    it('should run app tests', async () => {
      mockExec.mockResolvedValue({ 
        stdout: 'All tests passed', 
        stderr: '' 
      })

      const result = await vtexClient.runTests()

      expect(result.success).toBe(true)
      expect(result.output).toContain('All tests passed')
      expect(mockExec).toHaveBeenCalledWith('vtex test')
    })

    it('should handle test failures', async () => {
      mockExec.mockRejectedValue(new Error('Tests failed'))

      const result = await vtexClient.runTests()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Tests failed')
    })

    it('should run specific test suite', async () => {
      mockExec.mockResolvedValue({ 
        stdout: 'Unit tests passed', 
        stderr: '' 
      })

      await vtexClient.runTests({ suite: 'unit' })

      expect(mockExec).toHaveBeenCalledWith('vtex test --suite unit')
    })
  })

  describe('getLogs', () => {
    it('should get app logs', async () => {
      const logs = [
        { timestamp: '2023-01-01T00:00:00Z', level: 'info', message: 'App started' },
        { timestamp: '2023-01-01T00:01:00Z', level: 'error', message: 'Error occurred' }
      ]

      mockExec.mockResolvedValue({ 
        stdout: logs.map(l => JSON.stringify(l)).join('\n'), 
        stderr: '' 
      })

      const result = await vtexClient.getLogs('test-vendor.test-app')

      expect(result).toHaveLength(2)
      expect(result[0].level).toBe('info')
      expect(result[1].level).toBe('error')
    })

    it('should filter logs by level', async () => {
      const logs = [
        { timestamp: '2023-01-01T00:00:00Z', level: 'info', message: 'Info message' },
        { timestamp: '2023-01-01T00:01:00Z', level: 'error', message: 'Error message' }
      ]

      mockExec.mockResolvedValue({ 
        stdout: logs.map(l => JSON.stringify(l)).join('\n'), 
        stderr: '' 
      })

      const result = await vtexClient.getLogs('test-vendor.test-app', { level: 'error' })

      expect(result).toHaveLength(1)
      expect(result[0].level).toBe('error')
    })
  })

  describe('private methods', () => {
    it('should execute VTEX commands with proper error handling', async () => {
      mockExec.mockRejectedValue(new Error('Command failed'))

      await expectToThrow(
        () => (vtexClient as any).executeVTEXCommand('invalid-command'),
        'VTEX command failed'
      )
    })

    it('should parse VTEX CLI version correctly', () => {
      const version1 = (vtexClient as any).parseVersion('vtex version 3.1.0')
      const version2 = (vtexClient as any).parseVersion('3.0.5')

      expect(version1).toEqual([3, 1, 0])
      expect(version2).toEqual([3, 0, 5])
    })

    it('should compare versions correctly', () => {
      const isNewer1 = (vtexClient as any).isVersionNewer([3, 1, 0], [3, 0, 0])
      const isNewer2 = (vtexClient as any).isVersionNewer([2, 9, 0], [3, 0, 0])

      expect(isNewer1).toBe(true)
      expect(isNewer2).toBe(false)
    })

    it('should format app name correctly', () => {
      const formatted1 = (vtexClient as any).formatAppName('test-app', 'test-vendor')
      const formatted2 = (vtexClient as any).formatAppName('test-vendor.test-app')

      expect(formatted1).toBe('test-vendor.test-app')
      expect(formatted2).toBe('test-vendor.test-app')
    })

    it('should validate workspace name', () => {
      const valid1 = (vtexClient as any).validateWorkspaceName('test-workspace')
      const valid2 = (vtexClient as any).validateWorkspaceName('test_workspace')
      const invalid1 = (vtexClient as any).validateWorkspaceName('Test Workspace')
      const invalid2 = (vtexClient as any).validateWorkspaceName('')

      expect(valid1).toBe(true)
      expect(valid2).toBe(true)
      expect(invalid1).toBe(false)
      expect(invalid2).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should handle network timeouts', async () => {
      mockExec.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      )

      await expectToThrow(
        () => vtexClient.validateCLI(),
        'Timeout'
      )
    })

    it('should handle rate limiting', async () => {
      mockAxios.get.mockRejectedValue({
        response: { status: 429, data: { message: 'Rate limited' } }
      })

      await expectToThrow(
        () => vtexClient.getAllAppVersions('test-vendor.test-app'),
        'Rate limited'
      )
    })

    it('should handle authentication expiry', async () => {
      mockExec.mockRejectedValue(new Error('Token expired'))

      await expectToThrow(
        () => vtexClient.validateAccount(),
        'Authentication expired'
      )
    })
  })

  describe('configuration', () => {
    it('should use configured timeout', async () => {
      const config = mockConfig.getConfig()
      config.vtex.timeout = 5000

      mockExec.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 6000))
      )

      await expectToThrow(
        () => vtexClient.validateCLI()
      )
    })

    it('should use configured retry count', async () => {
      const config = mockConfig.getConfig()
      config.vtex.retries = 2

      let attempts = 0
      mockExec.mockImplementation(() => {
        attempts++
        if (attempts < 3) {
          throw new Error('Temporary failure')
        }
        return Promise.resolve({ stdout: 'Success', stderr: '' })
      })

      await vtexClient.validateCLI()

      expect(attempts).toBe(3) // Initial + 2 retries
    })
  })
})
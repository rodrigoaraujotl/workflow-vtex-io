/**
 * Unit tests for status CLI command
 */

import { Command } from 'commander'
import { DeployManager } from '@/core/DeployManager'
import { ConfigManager } from '@/core/ConfigManager'
import { Logger } from '@/utils/Logger'
import { HealthChecker } from '@/utils/HealthChecker'
import {
  createMockConfig,
  createMockDeploymentResult,
  mockAsyncFunction,
  mockRejectedFunction,
} from '@tests/setup'

// Mock dependencies
jest.mock('@/core/DeployManager')
jest.mock('@/core/ConfigManager')
jest.mock('@/utils/Logger')
jest.mock('@/utils/HealthChecker')

// Import the status command after mocking
let statusCommand: any

describe('status CLI command', () => {
  let mockDeployManager: jest.Mocked<DeployManager>
  let mockConfigManager: jest.Mocked<ConfigManager>
  let mockLogger: jest.Mocked<Logger>
  let mockHealthChecker: jest.Mocked<HealthChecker>
  let program: Command
  let consoleLogSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance
  let processExitSpy: jest.SpyInstance

  beforeEach(async () => {
    // Create mock instances
    mockDeployManager = {
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
    } as any

    mockHealthChecker = {
      performComprehensiveHealthCheck: jest.fn(),
      getHealthSummary: jest.fn(),
      checkApplicationHealth: jest.fn(),
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
    ;(HealthChecker as jest.MockedClass<typeof HealthChecker>).mockImplementation(
      () => mockHealthChecker
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

    // Import and setup status command
    const { setupStatusCommand } = await import('@/cli/commands/status')
    statusCommand = setupStatusCommand(program)
  })

  afterEach(() => {
    jest.clearAllMocks()
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    processExitSpy.mockRestore()
  })

  describe('command setup', () => {
    it('should register status command with correct options', () => {
      expect(statusCommand.name()).toBe('status')
      expect(statusCommand.description()).toContain('Show deployment status')
      
      const options = statusCommand.options
      const optionNames = options.map((opt: any) => opt.long)
      
      expect(optionNames).toContain('--environment')
      expect(optionNames).toContain('--deployment-id')
      expect(optionNames).toContain('--health')
      expect(optionNames).toContain('--history')
      expect(optionNames).toContain('--watch')
      expect(optionNames).toContain('--json')
    })

    it('should have correct default values for options', () => {
      const environmentOption = statusCommand.options.find(
        (opt: any) => opt.long === '--environment'
      )
      expect(environmentOption.defaultValue).toBe('qa')
    })
  })

  describe('deployment status', () => {
    it('should show current deployment status', async () => {
      const mockStatus = {
        deploymentId: 'deploy-123',
        environment: 'qa',
        status: 'success',
        version: '1.2.3',
        timestamp: new Date('2024-01-15T10:00:00Z'),
        duration: 120000,
        workspace: 'main',
        branch: 'main',
        commit: 'abc123def456',
        author: 'john.doe@example.com',
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      await statusCommand.parseAsync(['status'], { from: 'user' })

      expect(mockDeployManager.getDeploymentStatus).toHaveBeenCalledWith('qa')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📊 Deployment Status')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('deploy-123')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ success')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1.2.3')
      )
    })

    it('should show status for specific deployment ID', async () => {
      const mockStatus = {
        deploymentId: 'deploy-456',
        environment: 'production',
        status: 'in-progress',
        version: '1.2.4',
        timestamp: new Date(),
        progress: 75,
        currentStep: 'Health Check',
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      await statusCommand.parseAsync(['status', '--deployment-id', 'deploy-456'], { from: 'user' })

      expect(mockDeployManager.getDeploymentStatus).toHaveBeenCalledWith(undefined, 'deploy-456')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('deploy-456')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔄 in-progress')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('75%')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Health Check')
      )
    })

    it('should show status for specific environment', async () => {
      const mockStatus = {
        deploymentId: 'deploy-789',
        environment: 'production',
        status: 'success',
        version: '1.2.5',
        timestamp: new Date(),
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      await statusCommand.parseAsync(['status', '--environment', 'production'], { from: 'user' })

      expect(mockDeployManager.getDeploymentStatus).toHaveBeenCalledWith('production')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('production')
      )
    })

    it('should handle no active deployment', async () => {
      mockDeployManager.getDeploymentStatus.mockResolvedValue(null)

      await statusCommand.parseAsync(['status'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No active deployment found')
      )
    })

    it('should show failed deployment status', async () => {
      const mockStatus = {
        deploymentId: 'deploy-failed',
        environment: 'qa',
        status: 'failed',
        version: '1.2.6',
        timestamp: new Date(),
        error: 'Build compilation failed',
        failedStep: 'Build',
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      await statusCommand.parseAsync(['status'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ failed')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Build compilation failed')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed at: Build')
      )
    })
  })

  describe('health check integration', () => {
    it('should show health status when --health flag is used', async () => {
      const mockStatus = {
        deploymentId: 'deploy-123',
        environment: 'qa',
        status: 'success',
        version: '1.2.3',
        timestamp: new Date(),
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      const mockHealthResult = {
        overall: { healthy: true, responseTime: 150, timestamp: new Date() },
        application: { healthy: true, responseTime: 100, status: 'healthy' },
        database: { healthy: true, connected: true, latency: 25 },
        externalServices: [
          { name: 'Payment API', healthy: true, responseTime: 80 },
          { name: 'User API', healthy: true, responseTime: 120 },
        ],
      }
      mockHealthChecker.performComprehensiveHealthCheck.mockResolvedValue(mockHealthResult)

      const mockHealthSummary = {
        totalChecks: 4,
        healthyChecks: 4,
        unhealthyChecks: 0,
        overallHealth: 'healthy' as const,
        issues: [],
      }
      mockHealthChecker.getHealthSummary.mockReturnValue(mockHealthSummary)

      await statusCommand.parseAsync(['status', '--health'], { from: 'user' })

      expect(mockHealthChecker.performComprehensiveHealthCheck).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🏥 Health Status')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ healthy')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('4/4 checks passing')
      )
    })

    it('should show degraded health status', async () => {
      const mockStatus = {
        deploymentId: 'deploy-123',
        environment: 'qa',
        status: 'success',
        version: '1.2.3',
        timestamp: new Date(),
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      const mockHealthResult = {
        overall: { healthy: false, responseTime: 300, timestamp: new Date() },
        application: { healthy: true, responseTime: 100 },
        database: { healthy: false, connected: false, error: 'Connection timeout' },
        externalServices: [
          { name: 'Payment API', healthy: true, responseTime: 80 },
          { name: 'User API', healthy: false, error: 'Service unavailable' },
        ],
      }
      mockHealthChecker.performComprehensiveHealthCheck.mockResolvedValue(mockHealthResult)

      const mockHealthSummary = {
        totalChecks: 4,
        healthyChecks: 2,
        unhealthyChecks: 2,
        overallHealth: 'degraded' as const,
        issues: ['Database connection failed', 'User API service unavailable'],
      }
      mockHealthChecker.getHealthSummary.mockReturnValue(mockHealthSummary)

      await statusCommand.parseAsync(['status', '--health'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ degraded')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('2/4 checks passing')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Database connection failed')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('User API service unavailable')
      )
    })
  })

  describe('deployment history', () => {
    it('should show deployment history when --history flag is used', async () => {
      const mockHistory = [
        {
          deploymentId: 'deploy-123',
          version: '1.2.3',
          environment: 'qa',
          timestamp: new Date('2024-01-15T10:00:00Z'),
          status: 'success',
          duration: 120000,
          author: 'john.doe@example.com',
        },
        {
          deploymentId: 'deploy-122',
          version: '1.2.2',
          environment: 'qa',
          timestamp: new Date('2024-01-14T15:30:00Z'),
          status: 'success',
          duration: 95000,
          author: 'jane.smith@example.com',
        },
        {
          deploymentId: 'deploy-121',
          version: '1.2.1',
          environment: 'qa',
          timestamp: new Date('2024-01-13T09:15:00Z'),
          status: 'failed',
          duration: 30000,
          author: 'bob.wilson@example.com',
        },
      ]
      mockDeployManager.getDeploymentHistory.mockResolvedValue(mockHistory)

      await statusCommand.parseAsync(['status', '--history'], { from: 'user' })

      expect(mockDeployManager.getDeploymentHistory).toHaveBeenCalledWith('qa', { limit: 10 })
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📋 Deployment History')
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
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ failed')
      )
    })

    it('should handle empty deployment history', async () => {
      mockDeployManager.getDeploymentHistory.mockResolvedValue([])

      await statusCommand.parseAsync(['status', '--history'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No deployment history found')
      )
    })
  })

  describe('JSON output', () => {
    it('should output status in JSON format when --json flag is used', async () => {
      const mockStatus = {
        deploymentId: 'deploy-123',
        environment: 'qa',
        status: 'success',
        version: '1.2.3',
        timestamp: new Date('2024-01-15T10:00:00Z'),
        duration: 120000,
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      await statusCommand.parseAsync(['status', '--json'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify(mockStatus, null, 2)
      )
    })

    it('should output health status in JSON format', async () => {
      const mockStatus = {
        deploymentId: 'deploy-123',
        environment: 'qa',
        status: 'success',
        version: '1.2.3',
        timestamp: new Date(),
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      const mockHealthResult = {
        overall: { healthy: true, responseTime: 150, timestamp: new Date() },
        application: { healthy: true, responseTime: 100 },
        database: { healthy: true, connected: true, latency: 25 },
        externalServices: [],
      }
      mockHealthChecker.performComprehensiveHealthCheck.mockResolvedValue(mockHealthResult)

      await statusCommand.parseAsync(['status', '--health', '--json'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"healthy": true')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"responseTime": 150')
      )
    })

    it('should output deployment history in JSON format', async () => {
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

      await statusCommand.parseAsync(['status', '--history', '--json'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify(mockHistory, null, 2)
      )
    })
  })

  describe('watch mode', () => {
    it('should continuously monitor status when --watch flag is used', async () => {
      const mockStatus = {
        deploymentId: 'deploy-123',
        environment: 'qa',
        status: 'in-progress',
        version: '1.2.3',
        timestamp: new Date(),
        progress: 50,
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      // Mock setInterval to control timing
      const mockSetInterval = jest.fn()
      const mockClearInterval = jest.fn()
      global.setInterval = mockSetInterval
      global.clearInterval = mockClearInterval

      await statusCommand.parseAsync(['status', '--watch'], { from: 'user' })

      expect(mockSetInterval).toHaveBeenCalledWith(
        expect.any(Function),
        5000 // 5 second interval
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('👀 Watching deployment status')
      )
    })

    it('should stop watching when deployment completes', async () => {
      let callCount = 0
      mockDeployManager.getDeploymentStatus.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            deploymentId: 'deploy-123',
            environment: 'qa',
            status: 'in-progress',
            version: '1.2.3',
            timestamp: new Date(),
            progress: 75,
          })
        }
        return Promise.resolve({
          deploymentId: 'deploy-123',
          environment: 'qa',
          status: 'success',
          version: '1.2.3',
          timestamp: new Date(),
          duration: 120000,
        })
      })

      const mockClearInterval = jest.fn()
      global.clearInterval = mockClearInterval

      await statusCommand.parseAsync(['status', '--watch'], { from: 'user' })

      // Simulate interval execution
      const intervalCallback = (global.setInterval as jest.Mock).mock.calls[0][0]
      await intervalCallback()

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Deployment completed')
      )
    })
  })

  describe('error handling', () => {
    it('should handle deployment status errors', async () => {
      mockDeployManager.getDeploymentStatus.mockRejectedValue(
        new Error('Failed to fetch deployment status')
      )

      await statusCommand.parseAsync(['status'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to get deployment status')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch deployment status')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should handle health check errors', async () => {
      const mockStatus = {
        deploymentId: 'deploy-123',
        environment: 'qa',
        status: 'success',
        version: '1.2.3',
        timestamp: new Date(),
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      mockHealthChecker.performComprehensiveHealthCheck.mockRejectedValue(
        new Error('Health check service unavailable')
      )

      await statusCommand.parseAsync(['status', '--health'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Health check failed')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Health check service unavailable')
      )
    })

    it('should handle configuration validation errors', async () => {
      mockConfigManager.validate.mockReturnValue({
        valid: false,
        errors: ['Missing VTEX account configuration'],
      })

      await statusCommand.parseAsync(['status'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration validation failed')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should handle invalid deployment ID format', async () => {
      await statusCommand.parseAsync(['status', '--deployment-id', 'invalid-id'], { from: 'user' })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid deployment ID format')
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('output formatting', () => {
    it('should format deployment status with proper alignment', async () => {
      const mockStatus = {
        deploymentId: 'deploy-123456789',
        environment: 'production',
        status: 'success',
        version: '1.2.3',
        timestamp: new Date('2024-01-15T10:00:00Z'),
        duration: 125000,
        workspace: 'main',
        branch: 'release/v1.2.3',
        commit: 'abc123def456789',
        author: 'john.doe@example.com',
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      await statusCommand.parseAsync(['status'], { from: 'user' })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📊 Deployment Status')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('ID: deploy-123456789')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Environment: production')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status: ✅ success')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Version: 1.2.3')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duration: 2m 5s')
      )
    })

    it('should use appropriate status icons and colors', async () => {
      const statuses = [
        { status: 'success', icon: '✅' },
        { status: 'failed', icon: '❌' },
        { status: 'in-progress', icon: '🔄' },
        { status: 'pending', icon: '⏳' },
      ]

      for (const { status, icon } of statuses) {
        const mockStatus = {
          deploymentId: 'deploy-123',
          environment: 'qa',
          status,
          version: '1.2.3',
          timestamp: new Date(),
        }
        mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

        consoleLogSpy.mockClear()
        await statusCommand.parseAsync(['status'], { from: 'user' })

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(icon)
        )
      }
    })

    it('should format duration correctly', async () => {
      const durations = [
        { duration: 30000, expected: '30s' },
        { duration: 90000, expected: '1m 30s' },
        { duration: 3600000, expected: '1h 0m 0s' },
        { duration: 3725000, expected: '1h 2m 5s' },
      ]

      for (const { duration, expected } of durations) {
        const mockStatus = {
          deploymentId: 'deploy-123',
          environment: 'qa',
          status: 'success',
          version: '1.2.3',
          timestamp: new Date(),
          duration,
        }
        mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

        consoleLogSpy.mockClear()
        await statusCommand.parseAsync(['status'], { from: 'user' })

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(expected)
        )
      }
    })
  })

  describe('performance', () => {
    it('should complete status check within reasonable time', async () => {
      const mockStatus = {
        deploymentId: 'deploy-123',
        environment: 'qa',
        status: 'success',
        version: '1.2.3',
        timestamp: new Date(),
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      const startTime = Date.now()
      await statusCommand.parseAsync(['status'], { from: 'user' })
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should handle concurrent status requests efficiently', async () => {
      const mockStatus = {
        deploymentId: 'deploy-123',
        environment: 'qa',
        status: 'success',
        version: '1.2.3',
        timestamp: new Date(),
      }
      mockDeployManager.getDeploymentStatus.mockResolvedValue(mockStatus)

      const promises = Array.from({ length: 5 }, () =>
        statusCommand.parseAsync(['status'], { from: 'user' })
      )

      const startTime = Date.now()
      await Promise.all(promises)
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(2000) // Should handle concurrency well
    })
  })
})
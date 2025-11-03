/**
 * Unit tests for HealthChecker
 */

import { HealthChecker } from '@/utils/HealthChecker'
import { ConfigManager } from '@/core/ConfigManager'
import { Logger } from '@/utils/Logger'
import axios from 'axios'
import {
  createMockConfig,
  mockAsyncFunction,
  mockRejectedFunction,
} from '@tests/setup'

// Mock dependencies
jest.mock('@/core/ConfigManager')
jest.mock('@/utils/Logger')
jest.mock('axios')

describe('HealthChecker', () => {
  let healthChecker: HealthChecker
  let mockConfig: ConfigManager
  let mockLogger: Logger
  let mockAxios: jest.Mocked<typeof axios>

  beforeEach(() => {
    // Create mock instances
    mockConfig = new ConfigManager() as jest.Mocked<ConfigManager>
    mockLogger = new Logger() as jest.Mocked<Logger>
    mockAxios = axios as jest.Mocked<typeof axios>

    // Setup mocks
    mockConfig.get = jest.fn().mockImplementation((key: string) => {
      const config = createMockConfig()
      return key.split('.').reduce((obj, k) => obj?.[k], config)
    })

    mockLogger.info = jest.fn()
    mockLogger.error = jest.fn()
    mockLogger.warn = jest.fn()
    mockLogger.debug = jest.fn()

    // Setup default axios mock
    mockAxios.get = jest.fn().mockResolvedValue({
      status: 200,
      data: { status: 'healthy' },
      headers: {},
      config: {},
      statusText: 'OK',
    })

    mockAxios.post = jest.fn().mockResolvedValue({
      status: 200,
      data: { success: true },
      headers: {},
      config: {},
      statusText: 'OK',
    })

    // Create HealthChecker instance
    healthChecker = new HealthChecker(mockConfig)
  })

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(healthChecker).toBeInstanceOf(HealthChecker)
      expect(mockConfig).toBeDefined()
    })
  })

  describe('checkApplicationHealth', () => {
    it('should return healthy status for successful health check', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: { status: 'healthy', version: '1.0.0' },
        headers: {},
        config: {},
        statusText: 'OK',
      })

      const result = await healthChecker.checkApplicationHealth(
        'https://app.example.com/health'
      )

      expect(result.healthy).toBe(true)
      expect(result.status).toBe('healthy')
      expect(result.responseTime).toBeGreaterThan(0)
      expect(result.details).toEqual({ status: 'healthy', version: '1.0.0' })
    })

    it('should return unhealthy status for failed health check', async () => {
      mockAxios.get.mockRejectedValue(new Error('Connection refused'))

      const result = await healthChecker.checkApplicationHealth(
        'https://app.example.com/health'
      )

      expect(result.healthy).toBe(false)
      expect(result.error).toContain('Connection refused')
      expect(result.responseTime).toBeGreaterThan(0)
    })

    it('should handle HTTP error responses', async () => {
      mockAxios.get.mockRejectedValue({
        response: {
          status: 503,
          statusText: 'Service Unavailable',
          data: { error: 'Database connection failed' },
        },
      })

      const result = await healthChecker.checkApplicationHealth(
        'https://app.example.com/health'
      )

      expect(result.healthy).toBe(false)
      expect(result.statusCode).toBe(503)
      expect(result.error).toContain('Service Unavailable')
    })

    it('should respect timeout configuration', async () => {
      const slowResponse = new Promise((resolve) => {
        setTimeout(() => resolve({
          status: 200,
          data: { status: 'healthy' },
        }), 2000)
      })

      mockAxios.get.mockReturnValue(slowResponse as any)

      const startTime = Date.now()
      const result = await healthChecker.checkApplicationHealth(
        'https://app.example.com/health',
        { timeout: 1000 }
      )
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(1500) // Should timeout before 2 seconds
      expect(result.healthy).toBe(false)
      expect(result.error).toContain('timeout')
    })

    it('should include custom headers in health check request', async () => {
      const customHeaders = {
        'Authorization': 'Bearer token123',
        'X-Custom-Header': 'custom-value',
      }

      await healthChecker.checkApplicationHealth(
        'https://app.example.com/health',
        { headers: customHeaders }
      )

      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://app.example.com/health',
        expect.objectContaining({
          headers: expect.objectContaining(customHeaders),
        })
      )
    })
  })

  describe('checkDatabaseHealth', () => {
    it('should return healthy status for successful database check', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { 
          connected: true, 
          latency: 15,
          activeConnections: 5,
        },
        headers: {},
        config: {},
        statusText: 'OK',
      })

      const result = await healthChecker.checkDatabaseHealth(
        'https://api.example.com/db/health'
      )

      expect(result.healthy).toBe(true)
      expect(result.connected).toBe(true)
      expect(result.latency).toBe(15)
      expect(result.details.activeConnections).toBe(5)
    })

    it('should return unhealthy status for database connection failure', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { 
          connected: false, 
          error: 'Connection timeout',
        },
        headers: {},
        config: {},
        statusText: 'OK',
      })

      const result = await healthChecker.checkDatabaseHealth(
        'https://api.example.com/db/health'
      )

      expect(result.healthy).toBe(false)
      expect(result.connected).toBe(false)
      expect(result.error).toContain('Connection timeout')
    })

    it('should handle database check request failures', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'))

      const result = await healthChecker.checkDatabaseHealth(
        'https://api.example.com/db/health'
      )

      expect(result.healthy).toBe(false)
      expect(result.error).toContain('Network error')
    })
  })

  describe('checkExternalServiceHealth', () => {
    it('should check multiple external services', async () => {
      const services = [
        { name: 'API Gateway', url: 'https://api.example.com/health' },
        { name: 'Payment Service', url: 'https://payments.example.com/health' },
        { name: 'User Service', url: 'https://users.example.com/health' },
      ]

      mockAxios.get
        .mockResolvedValueOnce({
          status: 200,
          data: { status: 'healthy' },
          headers: {},
          config: {},
          statusText: 'OK',
        })
        .mockResolvedValueOnce({
          status: 200,
          data: { status: 'healthy' },
          headers: {},
          config: {},
          statusText: 'OK',
        })
        .mockRejectedValueOnce(new Error('Service unavailable'))

      const results = await healthChecker.checkExternalServiceHealth(services)

      expect(results).toHaveLength(3)
      expect(results[0].name).toBe('API Gateway')
      expect(results[0].healthy).toBe(true)
      expect(results[1].name).toBe('Payment Service')
      expect(results[1].healthy).toBe(true)
      expect(results[2].name).toBe('User Service')
      expect(results[2].healthy).toBe(false)
    })

    it('should handle concurrent service checks', async () => {
      const services = Array.from({ length: 10 }, (_, i) => ({
        name: `Service ${i}`,
        url: `https://service${i}.example.com/health`,
      }))

      const startTime = Date.now()
      const results = await healthChecker.checkExternalServiceHealth(services)
      const duration = Date.now() - startTime

      expect(results).toHaveLength(10)
      expect(duration).toBeLessThan(2000) // Should complete concurrently, not sequentially
    })
  })

  describe('performComprehensiveHealthCheck', () => {
    it('should perform comprehensive health check with all components', async () => {
      const healthConfig = {
        application: {
          url: 'https://app.example.com/health',
          timeout: 5000,
        },
        database: {
          url: 'https://api.example.com/db/health',
        },
        externalServices: [
          { name: 'Payment API', url: 'https://payments.example.com/health' },
          { name: 'User API', url: 'https://users.example.com/health' },
        ],
      }

      // Mock all successful responses
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: { status: 'healthy' },
        headers: {},
        config: {},
        statusText: 'OK',
      })

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { connected: true, latency: 10 },
        headers: {},
        config: {},
        statusText: 'OK',
      })

      const result = await healthChecker.performComprehensiveHealthCheck(healthConfig)

      expect(result.overall.healthy).toBe(true)
      expect(result.application.healthy).toBe(true)
      expect(result.database.healthy).toBe(true)
      expect(result.externalServices).toHaveLength(2)
      expect(result.externalServices.every(s => s.healthy)).toBe(true)
    })

    it('should report overall unhealthy when any component fails', async () => {
      const healthConfig = {
        application: {
          url: 'https://app.example.com/health',
        },
        database: {
          url: 'https://api.example.com/db/health',
        },
      }

      // Application healthy, database unhealthy
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: { status: 'healthy' },
        headers: {},
        config: {},
        statusText: 'OK',
      })

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { connected: false, error: 'Connection failed' },
        headers: {},
        config: {},
        statusText: 'OK',
      })

      const result = await healthChecker.performComprehensiveHealthCheck(healthConfig)

      expect(result.overall.healthy).toBe(false)
      expect(result.application.healthy).toBe(true)
      expect(result.database.healthy).toBe(false)
    })

    it('should include performance metrics in comprehensive check', async () => {
      const healthConfig = {
        application: {
          url: 'https://app.example.com/health',
        },
      }

      const result = await healthChecker.performComprehensiveHealthCheck(healthConfig)

      expect(result.overall.responseTime).toBeGreaterThan(0)
      expect(result.overall.timestamp).toBeInstanceOf(Date)
      expect(result.application.responseTime).toBeGreaterThan(0)
    })
  })

  describe('waitForHealthy', () => {
    it('should wait for application to become healthy', async () => {
      let callCount = 0
      mockAxios.get.mockImplementation(() => {
        callCount++
        if (callCount < 3) {
          return Promise.reject(new Error('Service starting'))
        }
        return Promise.resolve({
          status: 200,
          data: { status: 'healthy' },
          headers: {},
          config: {},
          statusText: 'OK',
        })
      })

      const result = await healthChecker.waitForHealthy(
        'https://app.example.com/health',
        { maxAttempts: 5, interval: 100 }
      )

      expect(result.healthy).toBe(true)
      expect(callCount).toBe(3)
    })

    it('should timeout after max attempts', async () => {
      mockAxios.get.mockRejectedValue(new Error('Service unavailable'))

      const startTime = Date.now()
      const result = await healthChecker.waitForHealthy(
        'https://app.example.com/health',
        { maxAttempts: 3, interval: 100 }
      )
      const duration = Date.now() - startTime

      expect(result.healthy).toBe(false)
      expect(duration).toBeGreaterThan(200) // Should wait for intervals
      expect(duration).toBeLessThan(500) // But not too long
    })

    it('should respect custom retry configuration', async () => {
      let callCount = 0
      mockAxios.get.mockImplementation(() => {
        callCount++
        return Promise.reject(new Error('Still starting'))
      })

      await healthChecker.waitForHealthy(
        'https://app.example.com/health',
        { maxAttempts: 2, interval: 50 }
      )

      expect(callCount).toBe(2)
    })
  })

  describe('getHealthSummary', () => {
    it('should generate health summary from comprehensive check', async () => {
      const healthConfig = {
        application: {
          url: 'https://app.example.com/health',
        },
        database: {
          url: 'https://api.example.com/db/health',
        },
        externalServices: [
          { name: 'Payment API', url: 'https://payments.example.com/health' },
        ],
      }

      // Mixed health results
      mockAxios.get
        .mockResolvedValueOnce({
          status: 200,
          data: { status: 'healthy' },
          headers: {},
          config: {},
          statusText: 'OK',
        })
        .mockRejectedValueOnce(new Error('Service down'))

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { connected: true, latency: 15 },
        headers: {},
        config: {},
        statusText: 'OK',
      })

      const result = await healthChecker.performComprehensiveHealthCheck(healthConfig)
      const summary = healthChecker.getHealthSummary(result)

      expect(summary.totalChecks).toBe(3)
      expect(summary.healthyChecks).toBe(2)
      expect(summary.unhealthyChecks).toBe(1)
      expect(summary.overallHealth).toBe('degraded')
      expect(summary.issues).toHaveLength(1)
      expect(summary.issues[0]).toContain('Payment API')
    })

    it('should classify health status correctly', async () => {
      const allHealthyResult = {
        overall: { healthy: true, responseTime: 100, timestamp: new Date() },
        application: { healthy: true, responseTime: 50 },
        database: { healthy: true, connected: true, latency: 10 },
        externalServices: [
          { name: 'Service1', healthy: true, responseTime: 30 },
        ],
      }

      const summary = healthChecker.getHealthSummary(allHealthyResult)
      expect(summary.overallHealth).toBe('healthy')

      const allUnhealthyResult = {
        overall: { healthy: false, responseTime: 100, timestamp: new Date() },
        application: { healthy: false, error: 'App down' },
        database: { healthy: false, connected: false },
        externalServices: [
          { name: 'Service1', healthy: false, error: 'Service down' },
        ],
      }

      const unhealthySummary = healthChecker.getHealthSummary(allUnhealthyResult)
      expect(unhealthySummary.overallHealth).toBe('unhealthy')
    })
  })

  describe('error handling', () => {
    it('should handle network timeouts gracefully', async () => {
      mockAxios.get.mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded',
      })

      const result = await healthChecker.checkApplicationHealth(
        'https://app.example.com/health'
      )

      expect(result.healthy).toBe(false)
      expect(result.error).toContain('timeout')
    })

    it('should handle DNS resolution failures', async () => {
      mockAxios.get.mockRejectedValue({
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND nonexistent.example.com',
      })

      const result = await healthChecker.checkApplicationHealth(
        'https://nonexistent.example.com/health'
      )

      expect(result.healthy).toBe(false)
      expect(result.error).toContain('ENOTFOUND')
    })

    it('should handle SSL certificate errors', async () => {
      mockAxios.get.mockRejectedValue({
        code: 'CERT_UNTRUSTED',
        message: 'certificate verify failed',
      })

      const result = await healthChecker.checkApplicationHealth(
        'https://untrusted.example.com/health'
      )

      expect(result.healthy).toBe(false)
      expect(result.error).toContain('certificate')
    })

    it('should handle malformed URLs gracefully', async () => {
      const result = await healthChecker.checkApplicationHealth('invalid-url')

      expect(result.healthy).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('performance', () => {
    it('should complete health checks within reasonable time', async () => {
      const startTime = Date.now()

      await healthChecker.checkApplicationHealth('https://app.example.com/health')

      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should handle concurrent health checks efficiently', async () => {
      const urls = Array.from({ length: 10 }, (_, i) => 
        `https://service${i}.example.com/health`
      )

      const startTime = Date.now()
      const promises = urls.map(url => 
        healthChecker.checkApplicationHealth(url)
      )
      await Promise.all(promises)
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(2000) // Should handle concurrency well
    })
  })

  describe('monitoring and metrics', () => {
    it('should track health check metrics', async () => {
      await healthChecker.checkApplicationHealth('https://app.example.com/health')
      await healthChecker.checkApplicationHealth('https://app.example.com/health')
      await healthChecker.checkApplicationHealth('https://app.example.com/health')

      const metrics = healthChecker.getMetrics()

      expect(metrics.totalChecks).toBe(3)
      expect(metrics.successfulChecks).toBeGreaterThan(0)
      expect(metrics.averageResponseTime).toBeGreaterThan(0)
    })

    it('should reset metrics when requested', async () => {
      await healthChecker.checkApplicationHealth('https://app.example.com/health')
      
      let metrics = healthChecker.getMetrics()
      expect(metrics.totalChecks).toBe(1)

      healthChecker.resetMetrics()
      
      metrics = healthChecker.getMetrics()
      expect(metrics.totalChecks).toBe(0)
    })
  })
})
/**
 * Unit tests for NotificationService
 */

import { NotificationService } from '@/utils/NotificationService'
import { ConfigManager } from '@/core/ConfigManager'
import { Logger } from '@/utils/Logger'
import axios from 'axios'
import nodemailer from 'nodemailer'
import {
  createMockConfig,
  createMockDeploymentResult,
  mockAsyncFunction,
  mockRejectedFunction,
  createMockLoggingSettings,
} from '@tests/test-utils'

// Mock dependencies
jest.mock('@/core/ConfigManager')
jest.mock('@/utils/Logger')
jest.mock('axios')
jest.mock('nodemailer')

describe('NotificationService', () => {
  let notificationService: NotificationService
  let mockConfig: ConfigManager
  let mockLogger: Logger
  let mockAxios: jest.Mocked<typeof axios>
  let mockNodemailer: jest.Mocked<typeof nodemailer>
  let mockTransporter: any

  beforeEach(() => {
    // Create mock instances
    mockConfig = new ConfigManager() as jest.Mocked<ConfigManager>
    mockLogger = new Logger(createMockLoggingSettings()) as jest.Mocked<Logger>
    mockAxios = axios as jest.Mocked<typeof axios>
    mockNodemailer = nodemailer as jest.Mocked<typeof nodemailer>

    // Setup mocks
    mockConfig.get = jest.fn().mockImplementation((key: string) => {
      const config = createMockConfig()
      return key.split('.').reduce((obj, k) => obj?.[k], config)
    })

    mockLogger.info = jest.fn()
    mockLogger.error = jest.fn()
    mockLogger.warn = jest.fn()
    mockLogger.debug = jest.fn()

    // Mock axios
    mockAxios.post = jest.fn().mockResolvedValue({ status: 200, data: { ok: true } })

    // Mock nodemailer
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
      verify: jest.fn().mockResolvedValue(true),
    }
    mockNodemailer.createTransporter = jest.fn().mockReturnValue(mockTransporter)

    // Create NotificationService instance
    notificationService = new NotificationService(mockConfig)
  })

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(notificationService).toBeInstanceOf(NotificationService)
      expect(mockConfig).toBeDefined()
    })
  })

  describe('sendSlackNotification', () => {
    it('should send successful deployment notification to Slack', async () => {
      const deploymentResult = createMockDeploymentResult({ success: true })

      await notificationService.sendSlackNotification(
        'Deployment successful',
        deploymentResult,
        'success'
      )

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test-webhook',
        expect.objectContaining({
          text: 'Deployment successful',
          attachments: expect.arrayContaining([
            expect.objectContaining({
              color: 'good',
              fields: expect.any(Array),
            }),
          ]),
        })
      )
    })

    it('should send failure deployment notification to Slack', async () => {
      const deploymentResult = createMockDeploymentResult({ 
        success: false,
        error: 'Deployment failed due to build error'
      })

      await notificationService.sendSlackNotification(
        'Deployment failed',
        deploymentResult,
        'error'
      )

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test-webhook',
        expect.objectContaining({
          text: 'Deployment failed',
          attachments: expect.arrayContaining([
            expect.objectContaining({
              color: 'danger',
              fields: expect.any(Array),
            }),
          ]),
        })
      )
    })

    it('should include deployment details in Slack message', async () => {
      const deploymentResult = createMockDeploymentResult({
        environment: 'production',
        version: '1.2.0',
        duration: 180000, // 3 minutes
      })

      await notificationService.sendSlackNotification(
        'Deployment completed',
        deploymentResult,
        'success'
      )

      const slackPayload = mockAxios.post.mock.calls[0][1]
      const attachment = slackPayload.attachments[0]

      expect(attachment.fields).toContainEqual(
        expect.objectContaining({
          title: 'Environment',
          value: 'production',
        })
      )
      expect(attachment.fields).toContainEqual(
        expect.objectContaining({
          title: 'Version',
          value: '1.2.0',
        })
      )
      expect(attachment.fields).toContainEqual(
        expect.objectContaining({
          title: 'Duration',
          value: '3m 0s',
        })
      )
    })

    it('should handle Slack webhook errors gracefully', async () => {
      mockAxios.post.mockRejectedValue(new Error('Webhook not found'))

      const deploymentResult = createMockDeploymentResult()

      await expect(
        notificationService.sendSlackNotification(
          'Test message',
          deploymentResult,
          'info'
        )
      ).resolves.not.toThrow()

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send Slack notification'),
        expect.any(Error)
      )
    })

    it('should skip Slack notification when disabled', async () => {
      mockConfig.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'notifications.slack.enabled') return false
        const config = createMockConfig()
        return key.split('.').reduce((obj, k) => obj?.[k], config)
      })

      const deploymentResult = createMockDeploymentResult()

      await notificationService.sendSlackNotification(
        'Test message',
        deploymentResult,
        'info'
      )

      expect(mockAxios.post).not.toHaveBeenCalled()
    })

    it('should skip Slack notification when webhook URL is missing', async () => {
      mockConfig.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'notifications.slack.webhookUrl') return undefined
        const config = createMockConfig()
        return key.split('.').reduce((obj, k) => obj?.[k], config)
      })

      const deploymentResult = createMockDeploymentResult()

      await notificationService.sendSlackNotification(
        'Test message',
        deploymentResult,
        'info'
      )

      expect(mockAxios.post).not.toHaveBeenCalled()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Slack webhook URL not configured')
      )
    })
  })

  describe('sendEmailNotification', () => {
    it('should send successful deployment notification via email', async () => {
      const deploymentResult = createMockDeploymentResult({ success: true })

      await notificationService.sendEmailNotification(
        'Deployment successful',
        deploymentResult,
        'success'
      )

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@company.com',
          to: 'team@company.com',
          subject: expect.stringContaining('Deployment successful'),
          html: expect.stringContaining('success'),
        })
      )
    })

    it('should send failure deployment notification via email', async () => {
      const deploymentResult = createMockDeploymentResult({ 
        success: false,
        error: 'Build failed'
      })

      await notificationService.sendEmailNotification(
        'Deployment failed',
        deploymentResult,
        'error'
      )

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Deployment failed'),
          html: expect.stringContaining('Build failed'),
        })
      )
    })

    it('should include deployment details in email', async () => {
      const deploymentResult = createMockDeploymentResult({
        environment: 'production',
        version: '1.2.0',
        branch: 'main',
        commitHash: 'abc123',
      })

      await notificationService.sendEmailNotification(
        'Deployment completed',
        deploymentResult,
        'success'
      )

      const emailCall = mockTransporter.sendMail.mock.calls[0][0]
      const htmlContent = emailCall.html

      expect(htmlContent).toContain('production')
      expect(htmlContent).toContain('1.2.0')
      expect(htmlContent).toContain('main')
      expect(htmlContent).toContain('abc123')
    })

    it('should handle email sending errors gracefully', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'))

      const deploymentResult = createMockDeploymentResult()

      await expect(
        notificationService.sendEmailNotification(
          'Test message',
          deploymentResult,
          'info'
        )
      ).resolves.not.toThrow()

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send email notification'),
        expect.any(Error)
      )
    })

    it('should skip email notification when disabled', async () => {
      mockConfig.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'notifications.email.enabled') return false
        const config = createMockConfig()
        return key.split('.').reduce((obj, k) => obj?.[k], config)
      })

      const deploymentResult = createMockDeploymentResult()

      await notificationService.sendEmailNotification(
        'Test message',
        deploymentResult,
        'info'
      )

      expect(mockTransporter.sendMail).not.toHaveBeenCalled()
    })

    it('should skip email notification when SMTP not configured', async () => {
      mockConfig.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'notifications.email.smtp.host') return undefined
        const config = createMockConfig()
        return key.split('.').reduce((obj, k) => obj?.[k], config)
      })

      const deploymentResult = createMockDeploymentResult()

      await notificationService.sendEmailNotification(
        'Test message',
        deploymentResult,
        'info'
      )

      expect(mockTransporter.sendMail).not.toHaveBeenCalled()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Email SMTP not configured')
      )
    })
  })

  describe('sendDeploymentSuccess', () => {
    it('should send success notifications to all enabled channels', async () => {
      const deploymentResult = createMockDeploymentResult({ success: true })

      await notificationService.sendDeploymentSuccess(deploymentResult)

      expect(mockAxios.post).toHaveBeenCalled() // Slack
      expect(mockTransporter.sendMail).toHaveBeenCalled() // Email
    })

    it('should include success-specific messaging', async () => {
      const deploymentResult = createMockDeploymentResult({ 
        success: true,
        environment: 'production'
      })

      await notificationService.sendDeploymentSuccess(deploymentResult)

      const slackCall = mockAxios.post.mock.calls[0][1]
      expect(slackCall.text).toContain('successfully deployed')
      expect(slackCall.text).toContain('production')
    })
  })

  describe('sendDeploymentFailure', () => {
    it('should send failure notifications to all enabled channels', async () => {
      const deploymentResult = createMockDeploymentResult({ 
        success: false,
        error: 'Build failed'
      })

      await notificationService.sendDeploymentFailure(deploymentResult)

      expect(mockAxios.post).toHaveBeenCalled() // Slack
      expect(mockTransporter.sendMail).toHaveBeenCalled() // Email
    })

    it('should include failure-specific messaging and error details', async () => {
      const deploymentResult = createMockDeploymentResult({ 
        success: false,
        error: 'TypeScript compilation failed'
      })

      await notificationService.sendDeploymentFailure(deploymentResult)

      const slackCall = mockAxios.post.mock.calls[0][1]
      expect(slackCall.text).toContain('failed')
      expect(slackCall.attachments[0].fields).toContainEqual(
        expect.objectContaining({
          title: 'Error',
          value: 'TypeScript compilation failed',
        })
      )
    })
  })

  describe('sendRollbackNotification', () => {
    it('should send rollback notifications', async () => {
      const rollbackResult = {
        success: true,
        environment: 'production',
        fromVersion: '1.2.0',
        toVersion: '1.1.0',
        reason: 'Critical bug found',
        timestamp: new Date(),
      }

      await notificationService.sendRollbackNotification(rollbackResult)

      expect(mockAxios.post).toHaveBeenCalled()
      expect(mockTransporter.sendMail).toHaveBeenCalled()

      const slackCall = mockAxios.post.mock.calls[0][1]
      expect(slackCall.text).toContain('rollback')
      expect(slackCall.text).toContain('production')
    })

    it('should include rollback details in notifications', async () => {
      const rollbackResult = {
        success: true,
        environment: 'production',
        fromVersion: '1.2.0',
        toVersion: '1.1.0',
        reason: 'Performance issues',
        timestamp: new Date(),
      }

      await notificationService.sendRollbackNotification(rollbackResult)

      const slackCall = mockAxios.post.mock.calls[0][1]
      const attachment = slackCall.attachments[0]

      expect(attachment.fields).toContainEqual(
        expect.objectContaining({
          title: 'From Version',
          value: '1.2.0',
        })
      )
      expect(attachment.fields).toContainEqual(
        expect.objectContaining({
          title: 'To Version',
          value: '1.1.0',
        })
      )
      expect(attachment.fields).toContainEqual(
        expect.objectContaining({
          title: 'Reason',
          value: 'Performance issues',
        })
      )
    })
  })

  describe('formatDuration', () => {
    it('should format duration in milliseconds correctly', () => {
      expect(notificationService.formatDuration(1000)).toBe('1s')
      expect(notificationService.formatDuration(60000)).toBe('1m 0s')
      expect(notificationService.formatDuration(90000)).toBe('1m 30s')
      expect(notificationService.formatDuration(3661000)).toBe('1h 1m 1s')
    })

    it('should handle zero and negative durations', () => {
      expect(notificationService.formatDuration(0)).toBe('0s')
      expect(notificationService.formatDuration(-1000)).toBe('0s')
    })

    it('should handle very large durations', () => {
      const oneDay = 24 * 60 * 60 * 1000
      expect(notificationService.formatDuration(oneDay)).toBe('24h 0m 0s')
    })
  })

  describe('generateEmailTemplate', () => {
    it('should generate HTML email template for success', () => {
      const deploymentResult = createMockDeploymentResult({ success: true })
      
      const html = notificationService.generateEmailTemplate(
        'Deployment successful',
        deploymentResult,
        'success'
      )

      expect(html).toContain('<html>')
      expect(html).toContain('success')
      expect(html).toContain('Deployment successful')
      expect(html).toContain(deploymentResult.environment)
    })

    it('should generate HTML email template for failure', () => {
      const deploymentResult = createMockDeploymentResult({ 
        success: false,
        error: 'Build error'
      })
      
      const html = notificationService.generateEmailTemplate(
        'Deployment failed',
        deploymentResult,
        'error'
      )

      expect(html).toContain('<html>')
      expect(html).toContain('error')
      expect(html).toContain('Deployment failed')
      expect(html).toContain('Build error')
    })

    it('should include all deployment details in template', () => {
      const deploymentResult = createMockDeploymentResult({
        environment: 'production',
        version: '1.2.0',
        branch: 'main',
        commitHash: 'abc123',
        duration: 120000,
      })
      
      const html = notificationService.generateEmailTemplate(
        'Deployment completed',
        deploymentResult,
        'success'
      )

      expect(html).toContain('production')
      expect(html).toContain('1.2.0')
      expect(html).toContain('main')
      expect(html).toContain('abc123')
      expect(html).toContain('2m 0s')
    })
  })

  describe('notification filtering', () => {
    it('should respect notification level filtering', async () => {
      mockConfig.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'notifications.level') return 'error'
        const config = createMockConfig()
        return key.split('.').reduce((obj, k) => obj?.[k], config)
      })

      const deploymentResult = createMockDeploymentResult({ success: true })

      // Success notification should be filtered out
      await notificationService.sendDeploymentSuccess(deploymentResult)

      expect(mockAxios.post).not.toHaveBeenCalled()
      expect(mockTransporter.sendMail).not.toHaveBeenCalled()
    })

    it('should send error notifications regardless of level', async () => {
      mockConfig.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'notifications.level') return 'error'
        const config = createMockConfig()
        return key.split('.').reduce((obj, k) => obj?.[k], config)
      })

      const deploymentResult = createMockDeploymentResult({ 
        success: false,
        error: 'Critical error'
      })

      await notificationService.sendDeploymentFailure(deploymentResult)

      expect(mockAxios.post).toHaveBeenCalled()
      expect(mockTransporter.sendMail).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should handle configuration errors gracefully', async () => {
      mockConfig.get = jest.fn().mockImplementation(() => {
        throw new Error('Config error')
      })

      const deploymentResult = createMockDeploymentResult()

      await expect(
        notificationService.sendDeploymentSuccess(deploymentResult)
      ).resolves.not.toThrow()

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send notifications'),
        expect.any(Error)
      )
    })

    it('should continue with other notifications if one fails', async () => {
      mockAxios.post.mockRejectedValue(new Error('Slack error'))
      // Email should still work

      const deploymentResult = createMockDeploymentResult()

      await notificationService.sendDeploymentSuccess(deploymentResult)

      expect(mockAxios.post).toHaveBeenCalled() // Failed
      expect(mockTransporter.sendMail).toHaveBeenCalled() // Should still work
    })
  })

  describe('performance', () => {
    it('should send notifications quickly', async () => {
      const deploymentResult = createMockDeploymentResult()
      
      const startTime = Date.now()
      await notificationService.sendDeploymentSuccess(deploymentResult)
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should handle concurrent notifications', async () => {
      const deploymentResult = createMockDeploymentResult()

      const promises = [
        notificationService.sendDeploymentSuccess(deploymentResult),
        notificationService.sendDeploymentSuccess(deploymentResult),
        notificationService.sendDeploymentSuccess(deploymentResult),
      ]

      await expect(Promise.all(promises)).resolves.not.toThrow()
    })
  })
})
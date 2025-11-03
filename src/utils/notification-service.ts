/**
 * Notification Service
 * Handles sending notifications via multiple channels (Slack, Email, Webhook)
 */

import axios from 'axios'
import nodemailer from 'nodemailer'
import {
  NotificationSettings
} from '../types/config.types'
import {
  DeployResult,
  RollbackResult,
  ApprovalRequest
} from '../types/deploy.types'
import { Logger } from './logger'

export class NotificationService {
  private readonly settings: NotificationSettings
  private readonly logger: Logger
  private emailTransporter?: nodemailer.Transporter

  constructor(settings: NotificationSettings, logger: Logger) {
    this.settings = settings
    this.logger = logger
    this.initializeEmailTransporter()
  }

  /**
   * Initialize email transporter
   */
  private initializeEmailTransporter(): void {
    if (this.settings.email.enabled) {
      try {
        this.emailTransporter = nodemailer.createTransport({
          host: this.settings.email.smtpHost,
          port: this.settings.email.smtpPort,
          secure: this.settings.email.smtpSecure,
          auth: {
            user: this.settings.email.smtpUser,
            pass: this.settings.email.smtpPassword
          }
        })

        this.logger.info('Email transporter initialized successfully')
      } catch (error) {
        this.logger.error('Failed to initialize email transporter', error)
      }
    }
  }

  /**
   * Send deployment notification
   */
  async sendDeploymentNotification(result: DeployResult): Promise<void> {
    if (!this.settings.enabled) {
      return
    }

    const isSuccess = result.status === 'success'
    
    this.logger.info('Sending deployment notification', {
      deploymentId: result.id,
      success: isSuccess,
      environment: result.environment
    })

    const message = this.formatDeploymentMessage(result)

    try {
      await Promise.allSettled([
        this.sendSlackNotification(message, isSuccess),
        this.sendEmailNotification(
          `Deployment ${isSuccess ? 'Successful' : 'Failed'} - ${result.environment}`,
          message,
          isSuccess ? 'success' : 'error'
        ),
        this.sendWebhookNotification({
          type: 'deployment',
          result,
          message
        })
      ])
    } catch (error) {
      this.logger.error('Failed to send deployment notification', error)
    }
  }

  /**
   * Send rollback notification
   */
  async sendRollbackNotification(result: RollbackResult): Promise<void> {
    if (!this.settings.enabled) {
      return
    }

    this.logger.info('Sending rollback notification', {
      previousVersion: result.previousVersion,
      currentVersion: result.currentVersion,
      success: result.success,
      environment: result.environment
    })

    const message = this.formatRollbackMessage(result)

    try {
      await Promise.allSettled([
        this.sendSlackNotification(message, result.success),
        this.sendEmailNotification(
          `Rollback ${result.success ? 'Successful' : 'Failed'} - ${result.environment}`,
          message,
          result.success ? 'warning' : 'error'
        ),
        this.sendWebhookNotification({
          type: 'rollback',
          result,
          message
        })
      ])
    } catch (error) {
      this.logger.error('Failed to send rollback notification', error)
    }
  }

  /**
   * Send approval request notification
   */
  async sendApprovalRequest(request: ApprovalRequest): Promise<void> {
    if (!this.settings.enabled) {
      return
    }

    this.logger.info('Sending approval request notification', {
      approvalId: request.id,
      environment: request.environment
    })

    const message = this.formatApprovalMessage(request)

    try {
      await Promise.allSettled([
        this.sendSlackNotification(message, false, true), // Mention users for approval
        this.sendEmailNotification(
          `Deployment Approval Required - ${request.environment}`,
          message,
          'info'
        ),
        this.sendWebhookNotification({
          type: 'approval_request',
          request,
          message
        })
      ])
    } catch (error) {
      this.logger.error('Failed to send approval request notification', error)
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(
    message: string,
    isSuccess: boolean,
    mentionUsers = false
  ): Promise<void> {
    if (!this.settings.slack.enabled || !this.settings.slack.webhookUrl) {
      return
    }

    try {
      const color = isSuccess ? 'good' : 'danger'
      const emoji = isSuccess ? ':white_check_mark:' : ':x:'
      
      let text = `${emoji} ${message}`
      
      if (mentionUsers && this.settings.slack.mentionUsers?.length) {
        const mentions = this.settings.slack.mentionUsers.map(user => `<@${user}>`).join(' ')
        text = `${mentions} ${text}`
      } else if (!isSuccess && this.settings.slack.mentionOnFailure && this.settings.slack.mentionUsers?.length) {
        const mentions = this.settings.slack.mentionUsers.map(user => `<@${user}>`).join(' ')
        text = `${mentions} ${text}`
      }

      const payload = {
        channel: this.settings.slack.channel,
        username: this.settings.slack.username || 'VTEX Deploy Bot',
        icon_emoji: this.settings.slack.iconEmoji || ':robot_face:',
        attachments: [
          {
            color,
            text,
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      }

      await axios.post(this.settings.slack.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      })

      this.logger.debug('Slack notification sent successfully')
    } catch (error) {
      this.logger.error('Failed to send Slack notification', error)
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    subject: string,
    message: string,
    type: 'success' | 'error' | 'warning' | 'info'
  ): Promise<void> {
    if (!this.settings.email.enabled || !this.emailTransporter) {
      return
    }

    try {
      const htmlMessage = this.formatEmailMessage(message, type)

      const mailOptions = {
        from: this.settings.email.from,
        to: this.settings.email.to.join(', '),
        cc: this.settings.email.cc?.join(', '),
        bcc: this.settings.email.bcc?.join(', '),
        subject,
        text: message,
        html: htmlMessage
      }

      await this.emailTransporter.sendMail(mailOptions)
      this.logger.debug('Email notification sent successfully')
    } catch (error) {
      this.logger.error('Failed to send email notification', error)
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(payload: Record<string, unknown>): Promise<void> {
    if (!this.settings.webhook?.enabled || !this.settings.webhook.url) {
      return
    }

    try {
      const config = this.settings.webhook
      
      await axios({
        method: config.method,
        url: config.url,
        data: {
          timestamp: new Date().toISOString(),
          source: 'vtex-deploy-automation',
          ...payload
        },
        headers: {
          'Content-Type': 'application/json',
          ...config.headers
        },
        timeout: config.timeout
      })

      this.logger.debug('Webhook notification sent successfully')
    } catch (error) {
      this.logger.error('Failed to send webhook notification', error)
    }
  }

  /**
   * Format deployment message
   */
  private formatDeploymentMessage(result: DeployResult): string {
    const isSuccess = result.status === 'success'
    const status = isSuccess ? 'SUCCESS' : 'FAILED'
    const duration = result.duration ? Math.round(result.duration / 1000) : 0
    
    let message = `**Deployment ${status}**\n`
    message += `Environment: ${result.environment}\n`
    message += `Deployment ID: ${result.id}\n`
    message += `Duration: ${duration}s\n`
    message += `Workspace: ${result.workspace}\n`
    
    if (result.version) {
      message += `Version: ${result.version}\n`
    }
    
    if (result.startTime) {
      message += `Start Time: ${result.startTime.toISOString()}\n`
    }
    
    if (result.endTime) {
      message += `End Time: ${result.endTime.toISOString()}\n`
    }
    
    if (result.error) {
      message += `Error: ${result.error.message}\n`
    }
    
    if (result.logs?.length) {
      const recentLogs = result.logs.slice(-3)
      message += `Recent Logs:\n${recentLogs.join('\n')}\n`
    }

    return message
  }

  /**
   * Format rollback message
   */
  private formatRollbackMessage(result: RollbackResult): string {
    const status = result.success ? 'SUCCESS' : 'FAILED'
    const duration = Math.round(result.duration / 1000)
    
    let message = `**Rollback ${status}**\n`
    message += `Environment: ${result.environment}\n`
    message += `Rollback Time: ${result.rollbackTime.toISOString()}\n`
    message += `Previous Version: ${result.previousVersion}\n`
    message += `Current Version: ${result.currentVersion}\n`
    message += `Duration: ${duration}s\n`
    
    if (result.affectedWorkspaces && result.affectedWorkspaces.length > 0) {
      message += `Affected Workspaces: ${result.affectedWorkspaces.join(', ')}\n`
    }
    
    if (result.error) {
      message += `Error: ${result.error.message}\n`
    }

    return message
  }

  /**
   * Format approval message
   */
  private formatApprovalMessage(request: ApprovalRequest): string {
    let message = `**Deployment Approval Required**\n`
    message += `Environment: ${request.environment}\n`
    message += `Version: ${request.version}\n`
    message += `Approval ID: ${request.id}\n`
    message += `Requested by: ${request.requestedBy}\n`
    message += `Requested at: ${request.requestedAt.toISOString()}\n`
    
    if (request.description) {
      message += `Description: ${request.description}\n`
    }

    return message
  }

  /**
   * Format email message as HTML
   */
  private formatEmailMessage(message: string, type: 'success' | 'error' | 'warning' | 'info'): string {
    const colors = {
      success: '#28a745',
      error: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8'
    }

    const color = colors[type]
    const formattedMessage = message.replace(/\n/g, '<br>')
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${color}; color: white; padding: 20px; border-radius: 5px 5px 0 0;">
          <h2 style="margin: 0;">VTEX Deployment Notification</h2>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; border-radius: 0 0 5px 5px;">
          <div style="white-space: pre-line; font-family: monospace; background-color: white; padding: 15px; border-radius: 3px; border-left: 4px solid ${color};">
            ${formattedMessage}
          </div>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #dee2e6;">
          <p style="margin: 0; color: #6c757d; font-size: 12px;">
            This is an automated notification from VTEX Deploy Automation System.<br>
            Timestamp: ${new Date().toISOString()}
          </p>
        </div>
      </div>
    `
  }

  /**
   * Test notification configuration
   */
  async testNotifications(): Promise<{ slack: boolean; email: boolean; webhook: boolean }> {
    const results = {
      slack: false,
      email: false,
      webhook: false
    }

    // Test Slack
    if (this.settings.slack.enabled) {
      try {
        await this.sendSlackNotification('Test notification from VTEX Deploy Automation', true)
        results.slack = true
      } catch (error) {
        this.logger.error('Slack test failed', error)
      }
    }

    // Test Email
    if (this.settings.email.enabled) {
      try {
        await this.sendEmailNotification(
          'Test Notification - VTEX Deploy Automation',
          'This is a test notification to verify email configuration.',
          'info'
        )
        results.email = true
      } catch (error) {
        this.logger.error('Email test failed', error)
      }
    }

    // Test Webhook
    if (this.settings.webhook?.enabled) {
      try {
        await this.sendWebhookNotification({
          type: 'test',
          message: 'Test notification from VTEX Deploy Automation'
        })
        results.webhook = true
      } catch (error) {
        this.logger.error('Webhook test failed', error)
      }
    }

    return results
  }

  /**
   * Send custom notification
   */
  async sendCustomNotification(
    title: string,
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info'
  ): Promise<void> {
    if (!this.settings.enabled) {
      return
    }

    try {
      await Promise.allSettled([
        this.sendSlackNotification(`**${title}**\n${message}`, type === 'success'),
        this.sendEmailNotification(title, message, type),
        this.sendWebhookNotification({
          type: 'custom',
          title,
          message,
          level: type
        })
      ])
    } catch (error) {
      this.logger.error('Failed to send custom notification', error)
    }
  }
}
import { Logger } from '../utils/logger'
import { SlackNotifier } from './notifiers/slack-notifier'
import { EmailNotifier } from './notifiers/email-notifier'
import { TeamsNotifier } from './notifiers/teams-notifier'
import { NotificationTemplate } from './templates/notification-template'

export interface NotificationConfig {
  enabled: boolean
  slack?: {
    webhookUrl: string
    channel?: string | undefined
    username?: string | undefined
    iconEmoji?: string | undefined
  } | undefined
  email?: {
    smtpHost: string
    smtpPort: number
    smtpUser: string
    smtpPassword: string
    from: string
    to: string[]
  } | undefined
  teams?: {
    webhookUrl: string
  } | undefined
}

export interface NotificationData {
  type: 'deployment' | 'rollback' | 'error' | 'warning' | 'info'
  environment: 'qa' | 'production'
  status: 'started' | 'success' | 'failed' | 'warning'
  deploymentId: string
  version?: string | undefined
  branch?: string | undefined
  workspace?: string | undefined
  author?: string | undefined
  duration?: number | undefined
  error?: string | undefined
  logs?: string[] | undefined
  metadata?: Record<string, any> | undefined
}

export class NotificationService {
  private slackNotifier?: SlackNotifier
  private emailNotifier?: EmailNotifier
  private teamsNotifier?: TeamsNotifier
  private template: NotificationTemplate

  constructor(
    private logger: Logger,
    private config: NotificationConfig
  ) {
    this.template = new NotificationTemplate()
    this.initializeNotifiers()
  }

  private initializeNotifiers(): void {
    if (!this.config.enabled) {
      this.logger.debug('Notifications are disabled')
      return
    }

    // Initialize Slack notifier
    if (this.config.slack?.webhookUrl) {
      this.slackNotifier = new SlackNotifier(this.logger, this.config.slack)
      this.logger.debug('Slack notifier initialized')
    }

    // Initialize Email notifier
    if (this.config.email?.smtpHost) {
      this.emailNotifier = new EmailNotifier(this.logger, this.config.email)
      this.logger.debug('Email notifier initialized')
    }

    // Initialize Teams notifier
    if (this.config.teams?.webhookUrl) {
      this.teamsNotifier = new TeamsNotifier(this.logger, this.config.teams)
      this.logger.debug('Teams notifier initialized')
    }
  }

  async sendDeploymentStarted(data: NotificationData): Promise<void> {
    if (!this.config.enabled) return

    this.logger.info(`Sending deployment started notification for ${data.deploymentId}`)

    const message = this.template.generateDeploymentStarted(data)
    await this.sendNotification(message, data)
  }

  async sendDeploymentSuccess(data: NotificationData): Promise<void> {
    if (!this.config.enabled) return

    this.logger.info(`Sending deployment success notification for ${data.deploymentId}`)

    const message = this.template.generateDeploymentSuccess(data)
    await this.sendNotification(message, data)
  }

  async sendDeploymentFailed(data: NotificationData): Promise<void> {
    if (!this.config.enabled) return

    this.logger.error(`Sending deployment failed notification for ${data.deploymentId}`)

    const message = this.template.generateDeploymentFailed(data)
    await this.sendNotification(message, data)
  }

  async sendRollbackStarted(data: NotificationData): Promise<void> {
    if (!this.config.enabled) return

    this.logger.info(`Sending rollback started notification for ${data.deploymentId}`)

    const message = this.template.generateRollbackStarted(data)
    await this.sendNotification(message, data)
  }

  async sendRollbackSuccess(data: NotificationData): Promise<void> {
    if (!this.config.enabled) return

    this.logger.info(`Sending rollback success notification for ${data.deploymentId}`)

    const message = this.template.generateRollbackSuccess(data)
    await this.sendNotification(message, data)
  }

  async sendRollbackFailed(data: NotificationData): Promise<void> {
    if (!this.config.enabled) return

    this.logger.error(`Sending rollback failed notification for ${data.deploymentId}`)

    const message = this.template.generateRollbackFailed(data)
    await this.sendNotification(message, data)
  }

  async sendHealthAlert(data: NotificationData): Promise<void> {
    if (!this.config.enabled) return

    this.logger.warn(`Sending health alert notification`)

    const message = this.template.generateHealthAlert(data)
    await this.sendNotification(message, data)
  }

  async sendCustomNotification(
    title: string,
    message: string,
    type: NotificationData['type'] = 'info',
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.config.enabled) return

    this.logger.info(`Sending custom notification: ${title}`)

    const notificationData: NotificationData = {
      type,
      environment: 'qa', // Default
      status: 'info' as any,
      deploymentId: 'custom',
      metadata
    }

    const customMessage = this.template.generateCustomMessage(title, message, notificationData)
    await this.sendNotification(customMessage, notificationData)
  }

  private async sendNotification(message: any, data: NotificationData): Promise<void> {
    const promises: Promise<void>[] = []

    // Send to Slack
    if (this.slackNotifier) {
      promises.push(
        this.slackNotifier.send(message.slack, data).catch(error => {
          this.logger.error('Failed to send Slack notification', error)
        })
      )
    }

    // Send to Email
    if (this.emailNotifier) {
      promises.push(
        this.emailNotifier.send(message.email, data).catch(error => {
          this.logger.error('Failed to send email notification', error)
        })
      )
    }

    // Send to Teams
    if (this.teamsNotifier) {
      promises.push(
        this.teamsNotifier.send(message.teams, data).catch(error => {
          this.logger.error('Failed to send Teams notification', error)
        })
      )
    }

    // Wait for all notifications to complete (but don't fail if some fail)
    await Promise.allSettled(promises)
  }

  async testNotifications(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {}

    if (this.slackNotifier) {
      try {
        await this.slackNotifier.test()
        results.slack = true
        this.logger.info('Slack notification test successful')
      } catch (error) {
        results.slack = false
        this.logger.error('Slack notification test failed', error as Error)
      }
    }

    if (this.emailNotifier) {
      try {
        await this.emailNotifier.test()
        results.email = true
        this.logger.info('Email notification test successful')
      } catch (error) {
        results.email = false
        this.logger.error('Email notification test failed', error as Error)
      }
    }

    if (this.teamsNotifier) {
      try {
        await this.teamsNotifier.test()
        results.teams = true
        this.logger.info('Teams notification test successful')
      } catch (error) {
        results.teams = false
        this.logger.error('Teams notification test failed', error as Error)
      }
    }

    return results
  }

  getEnabledNotifiers(): string[] {
    const enabled: string[] = []

    if (this.slackNotifier) enabled.push('slack')
    if (this.emailNotifier) enabled.push('email')
    if (this.teamsNotifier) enabled.push('teams')

    return enabled
  }

  isEnabled(): boolean {
    return this.config.enabled && this.getEnabledNotifiers().length > 0
  }

  /**
   * Notify deployment success (alias for sendDeploymentSuccess)
   */
  async notifyDeploySuccess(data: NotificationData): Promise<void> {
    return this.sendDeploymentSuccess(data)
  }

  /**
   * Notify deployment failure (alias for sendDeploymentFailed)
   */
  async notifyDeployFailure(data: NotificationData, error: Error): Promise<void> {
    const failureData: NotificationData = {
      ...data,
      status: 'failed',
      error: error.message
    }
    return this.sendDeploymentFailed(failureData)
  }

  /**
   * Notify rollback success (alias for sendRollbackSuccess)
   */
  async notifyRollbackSuccess(data: NotificationData): Promise<void> {
    return this.sendRollbackSuccess(data)
  }

  /**
   * Notify rollback failure (alias for sendRollbackFailed)
   */
  async notifyRollbackFailure(data: NotificationData, error: Error): Promise<void> {
    const failureData: NotificationData = {
      ...data,
      status: 'failed',
      error: error.message
    }
    return this.sendRollbackFailed(failureData)
  }

  async validateConfiguration(): Promise<{
    isValid: boolean
    errors: string[]
    warnings: string[]
  }> {
    const errors: string[] = []
    const warnings: string[] = []

    if (!this.config.enabled) {
      warnings.push('Notifications are disabled')
      return { isValid: true, errors, warnings }
    }

    // Validate Slack configuration
    if (this.config.slack) {
      if (!this.config.slack.webhookUrl) {
        errors.push('Slack webhook URL is required')
      } else if (!this.config.slack.webhookUrl.startsWith('https://hooks.slack.com/')) {
        errors.push('Invalid Slack webhook URL format')
      }
    }

    // Validate Email configuration
    if (this.config.email) {
      if (!this.config.email.smtpHost) {
        errors.push('SMTP host is required for email notifications')
      }
      if (!this.config.email.smtpUser) {
        errors.push('SMTP user is required for email notifications')
      }
      if (!this.config.email.smtpPassword) {
        errors.push('SMTP password is required for email notifications')
      }
      if (!this.config.email.from) {
        errors.push('From email address is required')
      }
      if (!this.config.email.to || this.config.email.to.length === 0) {
        errors.push('At least one recipient email is required')
      }
    }

    // Validate Teams configuration
    if (this.config.teams) {
      if (!this.config.teams.webhookUrl) {
        errors.push('Teams webhook URL is required')
      } else if (!this.config.teams.webhookUrl.startsWith('https://')) {
        errors.push('Invalid Teams webhook URL format')
      }
    }

    // Check if at least one notifier is configured
    const hasNotifiers = this.config.slack || this.config.email || this.config.teams
    if (!hasNotifiers) {
      warnings.push('No notification channels configured')
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }
}
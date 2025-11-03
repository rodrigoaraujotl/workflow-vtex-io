import axios from 'axios'
import { Logger } from '../../utils/logger'
import { NotificationData } from '../notification-service'

export interface SlackConfig {
  webhookUrl: string
  channel?: string
  username?: string
  iconEmoji?: string
}

export interface SlackMessage {
  text?: string
  blocks?: any[]
  attachments?: any[]
  channel?: string
  username?: string
  icon_emoji?: string
}

export class SlackNotifier {
  constructor(
    private logger: Logger,
    private config: SlackConfig
  ) {}

  async send(message: SlackMessage, data: NotificationData): Promise<void> {
    try {
      const payload = {
        ...message,
        channel: message.channel || this.config.channel,
        username: message.username || this.config.username || 'VTEX Deploy Bot',
        icon_emoji: message.icon_emoji || this.config.iconEmoji || ':rocket:'
      }

      const response = await axios.post(this.config.webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      })

      if (response.status !== 200) {
        throw new Error(`Slack API returned status ${response.status}: ${response.data}`)
      }

      this.logger.debug('Slack notification sent successfully')
    } catch (error) {
      this.logger.error('Failed to send Slack notification', error as Error)
      throw error
    }
  }

  async test(): Promise<void> {
    const testMessage: SlackMessage = {
      text: '🧪 Test notification from VTEX Deploy Bot',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Test Notification* :white_check_mark:\n\nThis is a test message to verify Slack integration is working correctly.'
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Sent at ${new Date().toISOString()}`
            }
          ]
        }
      ]
    }

    const testData: NotificationData = {
      type: 'info',
      environment: 'qa',
      status: 'success',
      deploymentId: 'test-notification'
    }

    await this.send(testMessage, testData)
  }

  createDeploymentStartedMessage(data: NotificationData): SlackMessage {
    const color = data.environment === 'production' ? '#ff9500' : '#36a64f'
    const emoji = data.environment === 'production' ? ':warning:' : ':rocket:'

    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *Deployment Started*\n\n*Environment:* ${data.environment.toUpperCase()}\n*Deployment ID:* \`${data.deploymentId}\`${data.version ? `\n*Version:* \`${data.version}\`` : ''}${data.branch ? `\n*Branch:* \`${data.branch}\`` : ''}${data.workspace ? `\n*Workspace:* \`${data.workspace}\`` : ''}${data.author ? `\n*Author:* ${data.author}` : ''}`
          }
        }
      ],
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Status',
              value: 'In Progress',
              short: true
            },
            {
              title: 'Started At',
              value: new Date().toISOString(),
              short: true
            }
          ]
        }
      ]
    }
  }

  createDeploymentSuccessMessage(data: NotificationData): SlackMessage {
    const emoji = data.environment === 'production' ? ':tada:' : ':white_check_mark:'
    const color = '#36a64f'

    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *Deployment Successful*\n\n*Environment:* ${data.environment.toUpperCase()}\n*Deployment ID:* \`${data.deploymentId}\`${data.version ? `\n*Version:* \`${data.version}\`` : ''}${data.branch ? `\n*Branch:* \`${data.branch}\`` : ''}${data.workspace ? `\n*Workspace:* \`${data.workspace}\`` : ''}${data.author ? `\n*Author:* ${data.author}` : ''}${data.duration ? `\n*Duration:* ${Math.round(data.duration / 1000)}s` : ''}`
          }
        }
      ],
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Status',
              value: 'Success',
              short: true
            },
            {
              title: 'Completed At',
              value: new Date().toISOString(),
              short: true
            }
          ]
        }
      ]
    }
  }

  createDeploymentFailedMessage(data: NotificationData): SlackMessage {
    const color = '#ff0000'

    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:x: *Deployment Failed*\n\n*Environment:* ${data.environment.toUpperCase()}\n*Deployment ID:* \`${data.deploymentId}\`${data.version ? `\n*Version:* \`${data.version}\`` : ''}${data.branch ? `\n*Branch:* \`${data.branch}\`` : ''}${data.workspace ? `\n*Workspace:* \`${data.workspace}\`` : ''}${data.author ? `\n*Author:* ${data.author}` : ''}${data.duration ? `\n*Duration:* ${Math.round(data.duration / 1000)}s` : ''}`
          }
        }
      ],
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Status',
              value: 'Failed',
              short: true
            },
            {
              title: 'Failed At',
              value: new Date().toISOString(),
              short: true
            }
          ]
        }
      ]
    }
  }

  createRollbackMessage(data: NotificationData): SlackMessage {
    const isStarted = data.status === 'started'
    const isSuccess = data.status === 'success'
    const isFailed = data.status === 'failed'

    let emoji = ':leftwards_arrow_with_hook:'
    let color = '#ff9500'
    let statusText = 'In Progress'

    if (isSuccess) {
      emoji = ':white_check_mark:'
      color = '#36a64f'
      statusText = 'Success'
    } else if (isFailed) {
      emoji = ':x:'
      color = '#ff0000'
      statusText = 'Failed'
    }

    const title = isStarted ? 'Rollback Started' : isSuccess ? 'Rollback Successful' : 'Rollback Failed'

    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *${title}*\n\n*Environment:* ${data.environment.toUpperCase()}\n*Deployment ID:* \`${data.deploymentId}\`${data.version ? `\n*Target Version:* \`${data.version}\`` : ''}${data.workspace ? `\n*Workspace:* \`${data.workspace}\`` : ''}${data.author ? `\n*Author:* ${data.author}` : ''}${data.duration ? `\n*Duration:* ${Math.round(data.duration / 1000)}s` : ''}`
          }
        }
      ],
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Status',
              value: statusText,
              short: true
            },
            {
              title: 'Timestamp',
              value: new Date().toISOString(),
              short: true
            }
          ]
        }
      ]
    }
  }

  createHealthAlertMessage(data: NotificationData): SlackMessage {
    const color = data.status === 'failed' ? '#ff0000' : '#ff9500'
    const emoji = data.status === 'failed' ? ':rotating_light:' : ':warning:'

    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *Health Check Alert*\n\n*Environment:* ${data.environment.toUpperCase()}${data.workspace ? `\n*Workspace:* \`${data.workspace}\`` : ''}${data.error ? `\n*Issue:* ${data.error}` : ''}`
          }
        }
      ],
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Status',
              value: data.status === 'failed' ? 'Critical' : 'Warning',
              short: true
            },
            {
              title: 'Detected At',
              value: new Date().toISOString(),
              short: true
            }
          ]
        }
      ]
    }
  }

  createCustomMessage(title: string, message: string, data: NotificationData): SlackMessage {
    let color = '#36a64f'
    let emoji = ':information_source:'

    switch (data.type) {
      case 'error':
        color = '#ff0000'
        emoji = ':x:'
        break
      case 'warning':
        color = '#ff9500'
        emoji = ':warning:'
        break
      case 'deployment':
        color = '#0099cc'
        emoji = ':rocket:'
        break
      case 'rollback':
        color = '#ff9500'
        emoji = ':leftwards_arrow_with_hook:'
        break
    }

    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *${title}*\n\n${message}`
          }
        }
      ],
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Type',
              value: data.type.charAt(0).toUpperCase() + data.type.slice(1),
              short: true
            },
            {
              title: 'Timestamp',
              value: new Date().toISOString(),
              short: true
            }
          ]
        }
      ]
    }
  }
}
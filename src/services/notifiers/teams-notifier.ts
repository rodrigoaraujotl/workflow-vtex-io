import axios from 'axios'
import { Logger } from '../../utils/logger'
import { NotificationData } from '../notification-service'

export interface TeamsConfig {
  webhookUrl: string
}

export interface TeamsMessage {
  '@type': string
  '@context': string
  summary: string
  themeColor: string
  sections: TeamsSection[]
  potentialAction?: TeamsAction[]
}

export interface TeamsSection {
  activityTitle: string
  activitySubtitle?: string
  activityImage?: string
  facts: TeamsFact[]
  markdown?: boolean
}

export interface TeamsFact {
  name: string
  value: string
}

export interface TeamsAction {
  '@type': string
  name: string
  targets: TeamsTarget[]
}

export interface TeamsTarget {
  os: string
  uri: string
}

export class TeamsNotifier {
  constructor(
    private logger: Logger,
    private config: TeamsConfig
  ) {}

  async send(message: TeamsMessage, data: NotificationData): Promise<void> {
    try {
      const response = await axios.post(this.config.webhookUrl, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      })

      if (response.status !== 200) {
        throw new Error(`Teams API returned status ${response.status}: ${response.data}`)
      }

      this.logger.debug('Teams notification sent successfully')
    } catch (error) {
      this.logger.error('Failed to send Teams notification', error as Error)
      throw error
    }
  }

  async test(): Promise<void> {
    const testMessage: TeamsMessage = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: 'Test Notification - VTEX Deploy Bot',
      themeColor: '0078D4',
      sections: [
        {
          activityTitle: '🧪 Test Notification',
          activitySubtitle: 'VTEX Deploy Bot',
          facts: [
            {
              name: 'Status',
              value: 'Test Successful'
            },
            {
              name: 'Sent At',
              value: new Date().toISOString()
            }
          ],
          markdown: true
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

  createDeploymentStartedMessage(data: NotificationData): TeamsMessage {
    const themeColor = data.environment === 'production' ? 'FF9500' : '36A64F'

    const facts: TeamsFact[] = [
      { name: 'Environment', value: data.environment.toUpperCase() },
      { name: 'Deployment ID', value: data.deploymentId },
      { name: 'Status', value: 'In Progress' },
      { name: 'Started At', value: new Date().toISOString() }
    ]

    if (data.version) facts.splice(2, 0, { name: 'Version', value: data.version })
    if (data.branch) facts.splice(data.version ? 3 : 2, 0, { name: 'Branch', value: data.branch })
    if (data.workspace) facts.splice(data.version && data.branch ? 4 : data.version || data.branch ? 3 : 2, 0, { name: 'Workspace', value: data.workspace })
    if (data.author) facts.splice(-2, 0, { name: 'Author', value: data.author })

    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: `Deployment Started - ${data.environment.toUpperCase()}`,
      themeColor,
      sections: [
        {
          activityTitle: '🚀 Deployment Started',
          activitySubtitle: `${data.environment.toUpperCase()} Environment`,
          facts,
          markdown: true
        }
      ]
    }
  }

  createDeploymentSuccessMessage(data: NotificationData): TeamsMessage {
    const emoji = data.environment === 'production' ? '🎉' : '✅'
    const themeColor = '36A64F'

    const facts: TeamsFact[] = [
      { name: 'Environment', value: data.environment.toUpperCase() },
      { name: 'Deployment ID', value: data.deploymentId },
      { name: 'Status', value: 'Success' },
      { name: 'Completed At', value: new Date().toISOString() }
    ]

    if (data.version) facts.splice(2, 0, { name: 'Version', value: data.version })
    if (data.branch) facts.splice(data.version ? 3 : 2, 0, { name: 'Branch', value: data.branch })
    if (data.workspace) facts.splice(data.version && data.branch ? 4 : data.version || data.branch ? 3 : 2, 0, { name: 'Workspace', value: data.workspace })
    if (data.author) facts.splice(-2, 0, { name: 'Author', value: data.author })
    if (data.duration) facts.splice(-1, 0, { name: 'Duration', value: `${Math.round(data.duration / 1000)}s` })

    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: `Deployment Successful - ${data.environment.toUpperCase()}`,
      themeColor,
      sections: [
        {
          activityTitle: `${emoji} Deployment Successful`,
          activitySubtitle: `${data.environment.toUpperCase()} Environment`,
          facts,
          markdown: true
        }
      ]
    }
  }

  createDeploymentFailedMessage(data: NotificationData): TeamsMessage {
    const themeColor = 'FF0000'

    const facts: TeamsFact[] = [
      { name: 'Environment', value: data.environment.toUpperCase() },
      { name: 'Deployment ID', value: data.deploymentId },
      { name: 'Status', value: 'Failed' },
      { name: 'Failed At', value: new Date().toISOString() }
    ]

    if (data.version) facts.splice(2, 0, { name: 'Version', value: data.version })
    if (data.branch) facts.splice(data.version ? 3 : 2, 0, { name: 'Branch', value: data.branch })
    if (data.workspace) facts.splice(data.version && data.branch ? 4 : data.version || data.branch ? 3 : 2, 0, { name: 'Workspace', value: data.workspace })
    if (data.author) facts.splice(-2, 0, { name: 'Author', value: data.author })
    if (data.duration) facts.splice(-1, 0, { name: 'Duration', value: `${Math.round(data.duration / 1000)}s` })
    if (data.error) facts.splice(-1, 0, { name: 'Error', value: data.error })

    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: `Deployment Failed - ${data.environment.toUpperCase()}`,
      themeColor,
      sections: [
        {
          activityTitle: '❌ Deployment Failed',
          activitySubtitle: `${data.environment.toUpperCase()} Environment`,
          facts,
          markdown: true
        }
      ]
    }
  }

  createRollbackMessage(data: NotificationData): TeamsMessage {
    const isStarted = data.status === 'started'
    const isSuccess = data.status === 'success'
    const isFailed = data.status === 'failed'

    let emoji = '🔄'
    let themeColor = 'FF9500'
    let statusText = 'In Progress'

    if (isSuccess) {
      emoji = '✅'
      themeColor = '36A64F'
      statusText = 'Success'
    } else if (isFailed) {
      emoji = '❌'
      themeColor = 'FF0000'
      statusText = 'Failed'
    }

    const title = isStarted ? 'Rollback Started' : isSuccess ? 'Rollback Successful' : 'Rollback Failed'

    const facts: TeamsFact[] = [
      { name: 'Environment', value: data.environment.toUpperCase() },
      { name: 'Deployment ID', value: data.deploymentId },
      { name: 'Status', value: statusText },
      { name: 'Timestamp', value: new Date().toISOString() }
    ]

    if (data.version) facts.splice(2, 0, { name: 'Target Version', value: data.version })
    if (data.workspace) facts.splice(data.version ? 3 : 2, 0, { name: 'Workspace', value: data.workspace })
    if (data.author) facts.splice(-2, 0, { name: 'Author', value: data.author })
    if (data.duration) facts.splice(-1, 0, { name: 'Duration', value: `${Math.round(data.duration / 1000)}s` })
    if (data.error) facts.splice(-1, 0, { name: 'Error', value: data.error })

    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: `${title} - ${data.environment.toUpperCase()}`,
      themeColor,
      sections: [
        {
          activityTitle: `${emoji} ${title}`,
          activitySubtitle: `${data.environment.toUpperCase()} Environment`,
          facts,
          markdown: true
        }
      ]
    }
  }

  createHealthAlertMessage(data: NotificationData): TeamsMessage {
    const isCritical = data.status === 'failed'
    const emoji = isCritical ? '🚨' : '⚠️'
    const themeColor = isCritical ? 'FF0000' : 'FF9500'
    const title = isCritical ? 'Critical Health Alert' : 'Health Warning'

    const facts: TeamsFact[] = [
      { name: 'Environment', value: data.environment.toUpperCase() },
      { name: 'Status', value: isCritical ? 'Critical' : 'Warning' },
      { name: 'Detected At', value: new Date().toISOString() }
    ]

    if (data.workspace) facts.splice(1, 0, { name: 'Workspace', value: data.workspace })
    if (data.error) facts.splice(-1, 0, { name: 'Issue', value: data.error })

    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: `${title} - ${data.environment.toUpperCase()}`,
      themeColor,
      sections: [
        {
          activityTitle: `${emoji} ${title}`,
          activitySubtitle: `${data.environment.toUpperCase()} Environment`,
          facts,
          markdown: true
        }
      ]
    }
  }

  createCustomMessage(title: string, message: string, data: NotificationData): TeamsMessage {
    let emoji = 'ℹ️'
    let themeColor = '0078D4'

    switch (data.type) {
      case 'error':
        emoji = '❌'
        themeColor = 'FF0000'
        break
      case 'warning':
        emoji = '⚠️'
        themeColor = 'FF9500'
        break
      case 'deployment':
        emoji = '🚀'
        themeColor = '0099CC'
        break
      case 'rollback':
        emoji = '🔄'
        themeColor = 'FF9500'
        break
    }

    const facts: TeamsFact[] = [
      { name: 'Type', value: data.type.charAt(0).toUpperCase() + data.type.slice(1) },
      { name: 'Timestamp', value: new Date().toISOString() }
    ]

    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: title,
      themeColor,
      sections: [
        {
          activityTitle: `${emoji} ${title}`,
          activitySubtitle: message,
          facts,
          markdown: true
        }
      ]
    }
  }
}
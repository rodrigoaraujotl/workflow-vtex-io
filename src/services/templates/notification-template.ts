import { NotificationData } from '../notification-service'
import { SlackMessage, SlackNotifier } from '../notifiers/slack-notifier'
import { EmailMessage, EmailNotifier } from '../notifiers/email-notifier'
import { TeamsMessage, TeamsNotifier } from '../notifiers/teams-notifier'

export interface NotificationMessages {
  slack: SlackMessage
  email: EmailMessage
  teams: TeamsMessage
}

export class NotificationTemplate {
  private slackNotifier: SlackNotifier
  private emailNotifier: EmailNotifier
  private teamsNotifier: TeamsNotifier

  constructor() {
    // Create dummy instances for template generation
    this.slackNotifier = new SlackNotifier(null as any, { webhookUrl: '' })
    this.emailNotifier = new EmailNotifier(null as any, {
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPassword: '',
      from: '',
      to: []
    })
    this.teamsNotifier = new TeamsNotifier(null as any, { webhookUrl: '' })
  }

  generateDeploymentStarted(data: NotificationData): NotificationMessages {
    return {
      slack: this.slackNotifier.createDeploymentStartedMessage(data),
      email: this.emailNotifier.createDeploymentStartedMessage(data),
      teams: this.teamsNotifier.createDeploymentStartedMessage(data)
    }
  }

  generateDeploymentSuccess(data: NotificationData): NotificationMessages {
    return {
      slack: this.slackNotifier.createDeploymentSuccessMessage(data),
      email: this.emailNotifier.createDeploymentSuccessMessage(data),
      teams: this.teamsNotifier.createDeploymentSuccessMessage(data)
    }
  }

  generateDeploymentFailed(data: NotificationData): NotificationMessages {
    return {
      slack: this.slackNotifier.createDeploymentFailedMessage(data),
      email: this.emailNotifier.createDeploymentFailedMessage(data),
      teams: this.teamsNotifier.createDeploymentFailedMessage(data)
    }
  }

  generateRollbackStarted(data: NotificationData): NotificationMessages {
    const rollbackData = { ...data, status: 'started' as const }
    return {
      slack: this.slackNotifier.createRollbackMessage(rollbackData),
      email: this.emailNotifier.createRollbackMessage(rollbackData),
      teams: this.teamsNotifier.createRollbackMessage(rollbackData)
    }
  }

  generateRollbackSuccess(data: NotificationData): NotificationMessages {
    const rollbackData = { ...data, status: 'success' as const }
    return {
      slack: this.slackNotifier.createRollbackMessage(rollbackData),
      email: this.emailNotifier.createRollbackMessage(rollbackData),
      teams: this.teamsNotifier.createRollbackMessage(rollbackData)
    }
  }

  generateRollbackFailed(data: NotificationData): NotificationMessages {
    const rollbackData = { ...data, status: 'failed' as const }
    return {
      slack: this.slackNotifier.createRollbackMessage(rollbackData),
      email: this.emailNotifier.createRollbackMessage(rollbackData),
      teams: this.teamsNotifier.createRollbackMessage(rollbackData)
    }
  }

  generateHealthAlert(data: NotificationData): NotificationMessages {
    return {
      slack: this.slackNotifier.createHealthAlertMessage(data),
      email: this.emailNotifier.createHealthAlertMessage(data),
      teams: this.teamsNotifier.createHealthAlertMessage(data)
    }
  }

  generateCustomMessage(title: string, message: string, data: NotificationData): NotificationMessages {
    return {
      slack: this.slackNotifier.createCustomMessage(title, message, data),
      email: this.emailNotifier.createCustomMessage(title, message, data),
      teams: this.teamsNotifier.createCustomMessage(title, message, data)
    }
  }

  // Template validation methods
  validateSlackTemplate(template: SlackMessage): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!template.text && !template.blocks && !template.attachments) {
      errors.push('Slack message must have at least text, blocks, or attachments')
    }

    if (template.blocks) {
      template.blocks.forEach((block, index) => {
        if (!block.type) {
          errors.push(`Block ${index} is missing required 'type' field`)
        }
      })
    }

    if (template.attachments) {
      template.attachments.forEach((attachment, index) => {
        if (attachment.fields) {
          attachment.fields.forEach((field: any, fieldIndex: number) => {
            if (!field.title && !field.value) {
              errors.push(`Attachment ${index}, field ${fieldIndex} is missing title or value`)
            }
          })
        }
      })
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  validateEmailTemplate(template: EmailMessage): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!template.subject) {
      errors.push('Email message must have a subject')
    }

    if (!template.text && !template.html) {
      errors.push('Email message must have either text or html content')
    }

    if (template.html) {
      // Basic HTML validation
      const hasOpeningTag = template.html.includes('<')
      const hasClosingTag = template.html.includes('>')
      
      if (hasOpeningTag && !hasClosingTag) {
        errors.push('HTML content appears to have malformed tags')
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  validateTeamsTemplate(template: TeamsMessage): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!template['@type']) {
      errors.push('Teams message must have @type field')
    }

    if (!template['@context']) {
      errors.push('Teams message must have @context field')
    }

    if (!template.summary) {
      errors.push('Teams message must have a summary')
    }

    if (!template.sections || template.sections.length === 0) {
      errors.push('Teams message must have at least one section')
    }

    if (template.sections) {
      template.sections.forEach((section, index) => {
        if (!section.activityTitle) {
          errors.push(`Section ${index} is missing required 'activityTitle' field`)
        }

        if (!section.facts || section.facts.length === 0) {
          errors.push(`Section ${index} must have at least one fact`)
        }

        if (section.facts) {
          section.facts.forEach((fact, factIndex) => {
            if (!fact.name || !fact.value) {
              errors.push(`Section ${index}, fact ${factIndex} is missing name or value`)
            }
          })
        }
      })
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  // Template customization methods
  customizeSlackTemplate(
    baseTemplate: SlackMessage,
    customizations: Partial<SlackMessage>
  ): SlackMessage {
    return {
      ...baseTemplate,
      ...customizations,
      blocks: customizations.blocks || baseTemplate.blocks,
      attachments: customizations.attachments || baseTemplate.attachments
    }
  }

  customizeEmailTemplate(
    baseTemplate: EmailMessage,
    customizations: Partial<EmailMessage>
  ): EmailMessage {
    return {
      ...baseTemplate,
      ...customizations
    }
  }

  customizeTeamsTemplate(
    baseTemplate: TeamsMessage,
    customizations: Partial<TeamsMessage>
  ): TeamsMessage {
    return {
      ...baseTemplate,
      ...customizations,
      sections: customizations.sections || baseTemplate.sections
    }
  }

  // Template preview methods
  previewSlackTemplate(template: SlackMessage): string {
    let preview = `**Slack Message Preview**\n\n`

    if (template.text) {
      preview += `Text: ${template.text}\n\n`
    }

    if (template.blocks) {
      preview += `Blocks (${template.blocks.length}):\n`
      template.blocks.forEach((block, index) => {
        preview += `  ${index + 1}. Type: ${block.type}\n`
        if (block.text?.text) {
          preview += `     Text: ${block.text.text}\n`
        }
      })
      preview += '\n'
    }

    if (template.attachments) {
      preview += `Attachments (${template.attachments.length}):\n`
      template.attachments.forEach((attachment, index) => {
        preview += `  ${index + 1}. Color: ${attachment.color || 'default'}\n`
        if (attachment.fields) {
          attachment.fields.forEach((field: any) => {
            preview += `     ${field.title}: ${field.value}\n`
          })
        }
      })
    }

    return preview
  }

  previewEmailTemplate(template: EmailMessage): string {
    let preview = `**Email Message Preview**\n\n`
    preview += `Subject: ${template.subject}\n\n`
    
    if (template.text) {
      preview += `Text Content:\n${template.text}\n\n`
    }

    if (template.html) {
      // Strip HTML tags for preview
      const textContent = template.html.replace(/<[^>]*>/g, '')
      preview += `HTML Content (text only):\n${textContent}\n`
    }

    return preview
  }

  previewTeamsTemplate(template: TeamsMessage): string {
    let preview = `**Teams Message Preview**\n\n`
    preview += `Summary: ${template.summary}\n`
    preview += `Theme Color: #${template.themeColor}\n\n`

    if (template.sections) {
      preview += `Sections (${template.sections.length}):\n`
      template.sections.forEach((section, index) => {
        preview += `  ${index + 1}. ${section.activityTitle}\n`
        if (section.activitySubtitle) {
          preview += `     Subtitle: ${section.activitySubtitle}\n`
        }
        if (section.facts) {
          section.facts.forEach(fact => {
            preview += `     ${fact.name}: ${fact.value}\n`
          })
        }
        preview += '\n'
      })
    }

    return preview
  }

  // Utility methods for template generation
  formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  formatTimestamp(date: Date = new Date()): string {
    return date.toISOString()
  }

  formatEnvironment(environment: string): string {
    return environment.toUpperCase()
  }

  truncateText(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) {
      return text
    }
    return text.substring(0, maxLength - 3) + '...'
  }

  escapeHtml(text: string): string {
    // Simple HTML escaping without DOM
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  escapeMarkdown(text: string): string {
    return text.replace(/[*_`~]/g, '\\$&')
  }
}
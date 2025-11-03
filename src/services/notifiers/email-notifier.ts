import nodemailer from 'nodemailer'
import { Logger } from '../../utils/logger'
import { NotificationData } from '../notification-service'

import { EmailConfig as ConfigEmailConfig } from '../../types/config.types'

export interface EmailConfig {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  from: string
  to: string[]
  smtpSecure?: boolean
  secure?: boolean
}

export interface EmailMessage {
  subject: string
  text: string
  html: string
  to?: string[]
}

export class EmailNotifier {
  private transporter: nodemailer.Transporter

  constructor(
    private logger: Logger,
    private config: EmailConfig
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: (this.config.smtpSecure ?? this.config.secure) ?? this.config.smtpPort === 465,
      auth: {
        user: this.config.smtpUser,
        pass: this.config.smtpPassword
      }
    })
  }

  async send(message: EmailMessage, data: NotificationData): Promise<void> {
    try {
      const mailOptions = {
        from: this.config.from,
        to: message.to || this.config.to,
        subject: message.subject,
        text: message.text,
        html: message.html
      }

      const result = await this.transporter.sendMail(mailOptions)
      this.logger.debug(`Email notification sent successfully: ${result.messageId}`)
    } catch (error) {
      this.logger.error('Failed to send email notification', error as Error)
      throw error
    }
  }

  async test(): Promise<void> {
    const testMessage: EmailMessage = {
      subject: '🧪 Test Notification - VTEX Deploy Bot',
      text: 'This is a test email to verify email integration is working correctly.\n\nSent at: ' + new Date().toISOString(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">🧪 Test Notification</h2>
          <p>This is a test email to verify email integration is working correctly.</p>
          <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">VTEX Deploy Bot</p>
        </div>
      `
    }

    const testData: NotificationData = {
      type: 'info',
      environment: 'qa',
      status: 'success',
      deploymentId: 'test-notification'
    }

    await this.send(testMessage, testData)
  }

  createDeploymentStartedMessage(data: NotificationData): EmailMessage {
    const subject = `🚀 Deployment Started - ${data.environment.toUpperCase()} - ${data.deploymentId}`
    
    const text = `
Deployment Started

Environment: ${data.environment.toUpperCase()}
Deployment ID: ${data.deploymentId}
${data.version ? `Version: ${data.version}` : ''}
${data.branch ? `Branch: ${data.branch}` : ''}
${data.workspace ? `Workspace: ${data.workspace}` : ''}
${data.author ? `Author: ${data.author}` : ''}

Status: In Progress
Started At: ${new Date().toISOString()}

--
VTEX Deploy Bot
    `.trim()

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #333; margin: 0;">🚀 Deployment Started</h2>
        </div>
        
        <div style="background: white; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Environment:</td>
              <td style="padding: 8px 0; color: #6c757d;">${data.environment.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Deployment ID:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.deploymentId}</td>
            </tr>
            ${data.version ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Version:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.version}</td>
            </tr>
            ` : ''}
            ${data.branch ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Branch:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.branch}</td>
            </tr>
            ` : ''}
            ${data.workspace ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Workspace:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.workspace}</td>
            </tr>
            ` : ''}
            ${data.author ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Author:</td>
              <td style="padding: 8px 0; color: #6c757d;">${data.author}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Status:</td>
              <td style="padding: 8px 0; color: #ffc107;">In Progress</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Started At:</td>
              <td style="padding: 8px 0; color: #6c757d;">${new Date().toISOString()}</td>
            </tr>
          </table>
        </div>
        
        <hr style="border: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px; text-align: center;">VTEX Deploy Bot</p>
      </div>
    `

    return { subject, text, html }
  }

  createDeploymentSuccessMessage(data: NotificationData): EmailMessage {
    const subject = `✅ Deployment Successful - ${data.environment.toUpperCase()} - ${data.deploymentId}`
    
    const text = `
Deployment Successful

Environment: ${data.environment.toUpperCase()}
Deployment ID: ${data.deploymentId}
${data.version ? `Version: ${data.version}` : ''}
${data.branch ? `Branch: ${data.branch}` : ''}
${data.workspace ? `Workspace: ${data.workspace}` : ''}
${data.author ? `Author: ${data.author}` : ''}
${data.duration ? `Duration: ${Math.round(data.duration / 1000)}s` : ''}

Status: Success
Completed At: ${new Date().toISOString()}

--
VTEX Deploy Bot
    `.trim()

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #155724; margin: 0;">✅ Deployment Successful</h2>
        </div>
        
        <div style="background: white; padding: 20px; border: 1px solid #c3e6cb; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Environment:</td>
              <td style="padding: 8px 0; color: #6c757d;">${data.environment.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Deployment ID:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.deploymentId}</td>
            </tr>
            ${data.version ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Version:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.version}</td>
            </tr>
            ` : ''}
            ${data.branch ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Branch:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.branch}</td>
            </tr>
            ` : ''}
            ${data.workspace ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Workspace:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.workspace}</td>
            </tr>
            ` : ''}
            ${data.author ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Author:</td>
              <td style="padding: 8px 0; color: #6c757d;">${data.author}</td>
            </tr>
            ` : ''}
            ${data.duration ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Duration:</td>
              <td style="padding: 8px 0; color: #6c757d;">${Math.round(data.duration / 1000)}s</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Status:</td>
              <td style="padding: 8px 0; color: #28a745;">Success</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Completed At:</td>
              <td style="padding: 8px 0; color: #6c757d;">${new Date().toISOString()}</td>
            </tr>
          </table>
        </div>
        
        <hr style="border: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px; text-align: center;">VTEX Deploy Bot</p>
      </div>
    `

    return { subject, text, html }
  }

  createDeploymentFailedMessage(data: NotificationData): EmailMessage {
    const subject = `❌ Deployment Failed - ${data.environment.toUpperCase()} - ${data.deploymentId}`
    
    const text = `
Deployment Failed

Environment: ${data.environment.toUpperCase()}
Deployment ID: ${data.deploymentId}
${data.version ? `Version: ${data.version}` : ''}
${data.branch ? `Branch: ${data.branch}` : ''}
${data.workspace ? `Workspace: ${data.workspace}` : ''}
${data.author ? `Author: ${data.author}` : ''}
${data.duration ? `Duration: ${Math.round(data.duration / 1000)}s` : ''}
${data.error ? `Error: ${data.error}` : ''}

Status: Failed
Failed At: ${new Date().toISOString()}

${data.logs && data.logs.length > 0 ? `
Recent Logs:
${data.logs.slice(-10).join('\n')}
` : ''}

--
VTEX Deploy Bot
    `.trim()

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #721c24; margin: 0;">❌ Deployment Failed</h2>
        </div>
        
        <div style="background: white; padding: 20px; border: 1px solid #f5c6cb; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Environment:</td>
              <td style="padding: 8px 0; color: #6c757d;">${data.environment.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Deployment ID:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.deploymentId}</td>
            </tr>
            ${data.version ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Version:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.version}</td>
            </tr>
            ` : ''}
            ${data.branch ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Branch:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.branch}</td>
            </tr>
            ` : ''}
            ${data.workspace ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Workspace:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.workspace}</td>
            </tr>
            ` : ''}
            ${data.author ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Author:</td>
              <td style="padding: 8px 0; color: #6c757d;">${data.author}</td>
            </tr>
            ` : ''}
            ${data.duration ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Duration:</td>
              <td style="padding: 8px 0; color: #6c757d;">${Math.round(data.duration / 1000)}s</td>
            </tr>
            ` : ''}
            ${data.error ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Error:</td>
              <td style="padding: 8px 0; color: #dc3545; font-family: monospace;">${data.error}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Status:</td>
              <td style="padding: 8px 0; color: #dc3545;">Failed</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Failed At:</td>
              <td style="padding: 8px 0; color: #6c757d;">${new Date().toISOString()}</td>
            </tr>
          </table>
          
          ${data.logs && data.logs.length > 0 ? `
          <div style="margin-top: 20px;">
            <h4 style="color: #495057; margin-bottom: 10px;">Recent Logs:</h4>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #495057; white-space: pre-wrap; overflow-x: auto;">
${data.logs.slice(-10).join('\n')}
            </div>
          </div>
          ` : ''}
        </div>
        
        <hr style="border: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px; text-align: center;">VTEX Deploy Bot</p>
      </div>
    `

    return { subject, text, html }
  }

  createRollbackMessage(data: NotificationData): EmailMessage {
    const isStarted = data.status === 'started'
    const isSuccess = data.status === 'success'
    const isFailed = data.status === 'failed'

    let emoji = '🔄'
    let statusText = 'In Progress'
    let bgColor = '#fff3cd'
    let borderColor = '#ffeaa7'
    let textColor = '#856404'

    if (isSuccess) {
      emoji = '✅'
      statusText = 'Success'
      bgColor = '#d4edda'
      borderColor = '#c3e6cb'
      textColor = '#155724'
    } else if (isFailed) {
      emoji = '❌'
      statusText = 'Failed'
      bgColor = '#f8d7da'
      borderColor = '#f5c6cb'
      textColor = '#721c24'
    }

    const title = isStarted ? 'Rollback Started' : isSuccess ? 'Rollback Successful' : 'Rollback Failed'
    const subject = `${emoji} ${title} - ${data.environment.toUpperCase()} - ${data.deploymentId}`
    
    const text = `
${title}

Environment: ${data.environment.toUpperCase()}
Deployment ID: ${data.deploymentId}
${data.version ? `Target Version: ${data.version}` : ''}
${data.workspace ? `Workspace: ${data.workspace}` : ''}
${data.author ? `Author: ${data.author}` : ''}
${data.duration ? `Duration: ${Math.round(data.duration / 1000)}s` : ''}
${data.error ? `Error: ${data.error}` : ''}

Status: ${statusText}
Timestamp: ${new Date().toISOString()}

--
VTEX Deploy Bot
    `.trim()

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${bgColor}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: ${textColor}; margin: 0;">${emoji} ${title}</h2>
        </div>
        
        <div style="background: white; padding: 20px; border: 1px solid ${borderColor}; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Environment:</td>
              <td style="padding: 8px 0; color: #6c757d;">${data.environment.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Deployment ID:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.deploymentId}</td>
            </tr>
            ${data.version ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Target Version:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.version}</td>
            </tr>
            ` : ''}
            ${data.workspace ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Workspace:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.workspace}</td>
            </tr>
            ` : ''}
            ${data.author ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Author:</td>
              <td style="padding: 8px 0; color: #6c757d;">${data.author}</td>
            </tr>
            ` : ''}
            ${data.duration ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Duration:</td>
              <td style="padding: 8px 0; color: #6c757d;">${Math.round(data.duration / 1000)}s</td>
            </tr>
            ` : ''}
            ${data.error ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Error:</td>
              <td style="padding: 8px 0; color: #dc3545; font-family: monospace;">${data.error}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Status:</td>
              <td style="padding: 8px 0; color: ${textColor};">${statusText}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Timestamp:</td>
              <td style="padding: 8px 0; color: #6c757d;">${new Date().toISOString()}</td>
            </tr>
          </table>
        </div>
        
        <hr style="border: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px; text-align: center;">VTEX Deploy Bot</p>
      </div>
    `

    return { subject, text, html }
  }

  createHealthAlertMessage(data: NotificationData): EmailMessage {
    const isCritical = data.status === 'failed'
    const emoji = isCritical ? '🚨' : '⚠️'
    const title = isCritical ? 'Critical Health Alert' : 'Health Warning'
    const subject = `${emoji} ${title} - ${data.environment.toUpperCase()}`
    
    const text = `
${title}

Environment: ${data.environment.toUpperCase()}
${data.workspace ? `Workspace: ${data.workspace}` : ''}
${data.error ? `Issue: ${data.error}` : ''}

Status: ${isCritical ? 'Critical' : 'Warning'}
Detected At: ${new Date().toISOString()}

--
VTEX Deploy Bot
    `.trim()

    const bgColor = isCritical ? '#f8d7da' : '#fff3cd'
    const borderColor = isCritical ? '#f5c6cb' : '#ffeaa7'
    const textColor = isCritical ? '#721c24' : '#856404'

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${bgColor}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: ${textColor}; margin: 0;">${emoji} ${title}</h2>
        </div>
        
        <div style="background: white; padding: 20px; border: 1px solid ${borderColor}; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Environment:</td>
              <td style="padding: 8px 0; color: #6c757d;">${data.environment.toUpperCase()}</td>
            </tr>
            ${data.workspace ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Workspace:</td>
              <td style="padding: 8px 0; color: #6c757d; font-family: monospace;">${data.workspace}</td>
            </tr>
            ` : ''}
            ${data.error ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Issue:</td>
              <td style="padding: 8px 0; color: #dc3545;">${data.error}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Status:</td>
              <td style="padding: 8px 0; color: ${textColor};">${isCritical ? 'Critical' : 'Warning'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Detected At:</td>
              <td style="padding: 8px 0; color: #6c757d;">${new Date().toISOString()}</td>
            </tr>
          </table>
        </div>
        
        <hr style="border: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px; text-align: center;">VTEX Deploy Bot</p>
      </div>
    `

    return { subject, text, html }
  }

  createCustomMessage(title: string, message: string, data: NotificationData): EmailMessage {
    let emoji = 'ℹ️'
    let bgColor = '#d1ecf1'
    let borderColor = '#bee5eb'
    let textColor = '#0c5460'

    switch (data.type) {
      case 'error':
        emoji = '❌'
        bgColor = '#f8d7da'
        borderColor = '#f5c6cb'
        textColor = '#721c24'
        break
      case 'warning':
        emoji = '⚠️'
        bgColor = '#fff3cd'
        borderColor = '#ffeaa7'
        textColor = '#856404'
        break
      case 'deployment':
        emoji = '🚀'
        bgColor = '#cce5ff'
        borderColor = '#b3d9ff'
        textColor = '#004085'
        break
      case 'rollback':
        emoji = '🔄'
        bgColor = '#fff3cd'
        borderColor = '#ffeaa7'
        textColor = '#856404'
        break
    }

    const subject = `${emoji} ${title}`
    
    const text = `
${title}

${message}

Type: ${data.type.charAt(0).toUpperCase() + data.type.slice(1)}
Timestamp: ${new Date().toISOString()}

--
VTEX Deploy Bot
    `.trim()

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${bgColor}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: ${textColor}; margin: 0;">${emoji} ${title}</h2>
        </div>
        
        <div style="background: white; padding: 20px; border: 1px solid ${borderColor}; border-radius: 8px;">
          <p style="color: #495057; line-height: 1.6; margin: 0 0 20px 0;">${message}</p>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Type:</td>
              <td style="padding: 8px 0; color: #6c757d;">${data.type.charAt(0).toUpperCase() + data.type.slice(1)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #495057;">Timestamp:</td>
              <td style="padding: 8px 0; color: #6c757d;">${new Date().toISOString()}</td>
            </tr>
          </table>
        </div>
        
        <hr style="border: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px; text-align: center;">VTEX Deploy Bot</p>
      </div>
    `

    return { subject, text, html }
  }
}
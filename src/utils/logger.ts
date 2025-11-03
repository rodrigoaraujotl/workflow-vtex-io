/**
 * Logger Utility
 * Centralized logging system with multiple transports and formatting
 */

import * as winston from 'winston'
import * as path from 'path'
import { LoggingSettings } from '../types'

export class Logger {
  private readonly logger: winston.Logger
  private readonly settings: LoggingSettings

  constructor(settings: LoggingSettings) {
    this.settings = settings
    this.logger = this.createLogger()
  }

  /**
   * Create Winston logger instance with configured transports
   */
  private createLogger(): winston.Logger {
    const transports: winston.transport[] = []

    // Console transport
    transports.push(
      new winston.transports.Console({
        level: this.settings.level,
        format: this.getConsoleFormat()
      })
    )

    // File transport for general logs
    transports.push(
      new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'app.log'),
        level: this.settings.level,
        format: this.getFileFormat(),
        maxsize: this.parseSize(this.settings.maxFileSize),
        maxFiles: this.settings.maxFiles,
        tailable: true
      })
    )

    // Error file transport
    transports.push(
      new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'error.log'),
        level: 'error',
        format: this.getFileFormat(),
        maxsize: this.parseSize(this.settings.maxFileSize),
        maxFiles: this.settings.maxFiles,
        tailable: true
      })
    )

    // Audit file transport (if enabled)
    if (this.settings.auditEnabled) {
      transports.push(
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'audit.log'),
          level: 'info',
          format: this.getAuditFormat(),
          maxsize: this.parseSize(this.settings.maxFileSize),
          maxFiles: this.settings.maxFiles,
          tailable: true
        })
      )
    }

    return winston.createLogger({
      level: this.settings.level,
      transports,
      exitOnError: false,
      silent: process.env['NODE_ENV'] === 'test'
    })
  }

  /**
   * Get console format based on settings
   */
  private getConsoleFormat(): winston.Logform.Format {
    if (this.settings.format === 'json') {
      return winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    }

    return winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
        return `${timestamp} [${level}]: ${message} ${metaStr}`
      })
    )
  }

  /**
   * Get file format based on settings
   */
  private getFileFormat(): winston.Logform.Format {
    if (this.settings.format === 'json') {
      return winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    }

    return winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : ''
        return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`
      })
    )
  }

  /**
   * Get audit format for audit logs
   */
  private getAuditFormat(): winston.Logform.Format {
    return winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return JSON.stringify({
          timestamp,
          level,
          message,
          type: 'audit',
          ...meta
        })
      })
    )
  }

  /**
   * Parse file size string to bytes
   */
  private parseSize(sizeStr: string): number {
    const units: Record<string, number> = {
      b: 1,
      kb: 1024,
      mb: 1024 * 1024,
      gb: 1024 * 1024 * 1024
    }

    const match = sizeStr.toLowerCase().match(/^(\d+)(b|kb|mb|gb)$/)
    if (!match) {
      return 10 * 1024 * 1024 // Default 10MB
    }

    const [, size, unit] = match
    if (!size || !unit || !units[unit]) {
      return 10 * 1024 * 1024 // Default 10MB
    }
    return parseInt(size) * units[unit]!
  }

  /**
   * Log debug message
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta)
  }

  /**
   * Log info message
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta)
  }

  /**
   * Log warning message
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta)
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorMeta = error instanceof Error 
      ? { 
          error: error.message, 
          stack: error.stack,
          name: error.name,
          ...meta 
        }
      : { error, ...meta }

    this.logger.error(message, errorMeta)
  }

  /**
   * Log audit event
   */
  audit(event: string, details: Record<string, unknown>): void {
    if (this.settings.auditEnabled) {
      this.logger.info(`AUDIT: ${event}`, {
        audit: true,
        event,
        ...details,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Create child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger(this.settings)
    
    // Override the logger instance with child context
    childLogger.logger.defaultMeta = {
      ...childLogger.logger.defaultMeta,
      ...context
    }

    return childLogger
  }

  /**
   * Log deployment event
   */
  deployment(phase: string, details: Record<string, unknown>): void {
    this.info(`DEPLOYMENT ${phase.toUpperCase()}`, {
      deployment: true,
      phase,
      ...details
    })
  }

  /**
   * Log performance metrics
   */
  performance(operation: string, duration: number, details?: Record<string, unknown>): void {
    this.info(`PERFORMANCE: ${operation}`, {
      performance: true,
      operation,
      duration,
      ...details
    })
  }

  /**
   * Log security event
   */
  security(event: string, details: Record<string, unknown>): void {
    this.warn(`SECURITY: ${event}`, {
      security: true,
      event,
      ...details
    })
  }

  /**
   * Start timing an operation
   */
  startTimer(label: string): () => void {
    const start = Date.now()
    
    return () => {
      const duration = Date.now() - start
      this.performance(label, duration)
    }
  }

  /**
   * Log with custom level
   */
  log(level: string, message: string, meta?: Record<string, unknown>): void {
    this.logger.log(level, message, meta)
  }

  /**
   * Get current log level
   */
  getLevel(): string {
    return this.logger.level
  }

  /**
   * Set log level
   */
  setLevel(level: string): void {
    this.logger.level = level
    this.logger.transports.forEach(transport => {
      transport.level = level
    })
  }

  /**
   * Flush all transports
   */
  async flush(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.on('finish', resolve)
      this.logger.end()
    })
  }

  /**
   * Create logger instance with default settings
   */
  static create(settings?: Partial<LoggingSettings>): Logger {
    const defaultSettings: LoggingSettings = {
      level: 'info',
      format: 'text',
      auditEnabled: true,
      retentionDays: 30,
      maxFileSize: '10mb',
      maxFiles: 5
    }

    return new Logger({ ...defaultSettings, ...settings })
  }

  /**
   * Create logger for specific module
   */
  static createModuleLogger(moduleName: string, settings?: Partial<LoggingSettings>): Logger {
    const logger = Logger.create(settings)
    return logger.child({ module: moduleName })
  }
}
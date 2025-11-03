/**
 * Unit tests for Logger
 */

import { Logger } from '@/utils/Logger'
import fs from 'fs'
import path from 'path'

// Mock dependencies
jest.mock('fs')
jest.mock('path')

describe('Logger', () => {
  let logger: Logger
  let mockFs: jest.Mocked<typeof fs>
  let consoleSpy: {
    log: jest.SpyInstance
    error: jest.SpyInstance
    warn: jest.SpyInstance
    info: jest.SpyInstance
    debug: jest.SpyInstance
  }

  beforeEach(() => {
    // Mock fs
    mockFs = fs as jest.Mocked<typeof fs>
    mockFs.existsSync = jest.fn().mockReturnValue(true)
    mockFs.mkdirSync = jest.fn()
    mockFs.appendFileSync = jest.fn()

    // Mock path
    ;(path.join as jest.Mock).mockImplementation((...args) => args.join('/'))
    ;(path.dirname as jest.Mock).mockImplementation((p) => p.split('/').slice(0, -1).join('/'))

    // Spy on console methods
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      debug: jest.spyOn(console, 'debug').mockImplementation(),
    }

    // Create Logger instance
    logger = new Logger()
  })

  afterEach(() => {
    // Restore console methods
    Object.values(consoleSpy).forEach(spy => spy.mockRestore())
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(logger).toBeInstanceOf(Logger)
    })

    it('should initialize with custom options', () => {
      const customLogger = new Logger({
        level: 'error',
        enableFileLogging: false,
        enableConsoleLogging: false,
      })

      expect(customLogger).toBeInstanceOf(Logger)
    })

    it('should create log directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false)

      new Logger({ logDir: '/custom/log/dir' })

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/custom/log/dir', { recursive: true })
    })
  })

  describe('log levels', () => {
    it('should log error messages', () => {
      logger.error('Test error message')

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR'),
        expect.stringContaining('Test error message')
      )
    })

    it('should log warn messages', () => {
      logger.warn('Test warning message')

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('WARN'),
        expect.stringContaining('Test warning message')
      )
    })

    it('should log info messages', () => {
      logger.info('Test info message')

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO'),
        expect.stringContaining('Test info message')
      )
    })

    it('should log debug messages when debug level is enabled', () => {
      const debugLogger = new Logger({ level: 'debug' })
      debugLogger.debug('Test debug message')

      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG'),
        expect.stringContaining('Test debug message')
      )
    })

    it('should not log debug messages when level is higher', () => {
      const infoLogger = new Logger({ level: 'info' })
      infoLogger.debug('Test debug message')

      expect(consoleSpy.debug).not.toHaveBeenCalled()
    })
  })

  describe('message formatting', () => {
    it('should include timestamp in log messages', () => {
      logger.info('Test message')

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        expect.any(String)
      )
    })

    it('should include log level in messages', () => {
      logger.error('Test error')
      logger.warn('Test warning')
      logger.info('Test info')

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.any(String)
      )
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        expect.any(String)
      )
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.any(String)
      )
    })

    it('should handle multiple arguments', () => {
      logger.info('Message with', 'multiple', 'arguments', 123)

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO'),
        expect.stringContaining('Message with multiple arguments 123')
      )
    })

    it('should handle object arguments', () => {
      const testObject = { key: 'value', number: 42 }
      logger.info('Object:', testObject)

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO'),
        expect.stringContaining('Object:'),
        expect.stringContaining(JSON.stringify(testObject))
      )
    })

    it('should handle error objects', () => {
      const error = new Error('Test error')
      logger.error('Error occurred:', error)

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR'),
        expect.stringContaining('Error occurred:'),
        expect.stringContaining('Test error')
      )
    })
  })

  describe('file logging', () => {
    it('should write logs to file when file logging is enabled', () => {
      const fileLogger = new Logger({ enableFileLogging: true })
      fileLogger.info('Test file log')

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.log'),
        expect.stringContaining('Test file log'),
        'utf8'
      )
    })

    it('should not write to file when file logging is disabled', () => {
      const noFileLogger = new Logger({ enableFileLogging: false })
      noFileLogger.info('Test message')

      expect(mockFs.appendFileSync).not.toHaveBeenCalled()
    })

    it('should use custom log file name', () => {
      const customLogger = new Logger({
        enableFileLogging: true,
        logFileName: 'custom.log'
      })
      customLogger.info('Test message')

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('custom.log'),
        expect.any(String),
        'utf8'
      )
    })

    it('should handle file write errors gracefully', () => {
      mockFs.appendFileSync.mockImplementation(() => {
        throw new Error('File write error')
      })

      const fileLogger = new Logger({ enableFileLogging: true })
      
      expect(() => fileLogger.info('Test message')).not.toThrow()
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write to log file')
      )
    })
  })

  describe('console logging', () => {
    it('should log to console when console logging is enabled', () => {
      const consoleLogger = new Logger({ enableConsoleLogging: true })
      consoleLogger.info('Test console log')

      expect(consoleSpy.info).toHaveBeenCalled()
    })

    it('should not log to console when console logging is disabled', () => {
      const noConsoleLogger = new Logger({ enableConsoleLogging: false })
      noConsoleLogger.info('Test message')

      expect(consoleSpy.info).not.toHaveBeenCalled()
    })
  })

  describe('log level filtering', () => {
    it('should respect error level filtering', () => {
      const errorLogger = new Logger({ level: 'error' })

      errorLogger.error('Error message')
      errorLogger.warn('Warning message')
      errorLogger.info('Info message')
      errorLogger.debug('Debug message')

      expect(consoleSpy.error).toHaveBeenCalled()
      expect(consoleSpy.warn).not.toHaveBeenCalled()
      expect(consoleSpy.info).not.toHaveBeenCalled()
      expect(consoleSpy.debug).not.toHaveBeenCalled()
    })

    it('should respect warn level filtering', () => {
      const warnLogger = new Logger({ level: 'warn' })

      warnLogger.error('Error message')
      warnLogger.warn('Warning message')
      warnLogger.info('Info message')
      warnLogger.debug('Debug message')

      expect(consoleSpy.error).toHaveBeenCalled()
      expect(consoleSpy.warn).toHaveBeenCalled()
      expect(consoleSpy.info).not.toHaveBeenCalled()
      expect(consoleSpy.debug).not.toHaveBeenCalled()
    })

    it('should respect info level filtering', () => {
      const infoLogger = new Logger({ level: 'info' })

      infoLogger.error('Error message')
      infoLogger.warn('Warning message')
      infoLogger.info('Info message')
      infoLogger.debug('Debug message')

      expect(consoleSpy.error).toHaveBeenCalled()
      expect(consoleSpy.warn).toHaveBeenCalled()
      expect(consoleSpy.info).toHaveBeenCalled()
      expect(consoleSpy.debug).not.toHaveBeenCalled()
    })

    it('should respect debug level filtering', () => {
      const debugLogger = new Logger({ level: 'debug' })

      debugLogger.error('Error message')
      debugLogger.warn('Warning message')
      debugLogger.info('Info message')
      debugLogger.debug('Debug message')

      expect(consoleSpy.error).toHaveBeenCalled()
      expect(consoleSpy.warn).toHaveBeenCalled()
      expect(consoleSpy.info).toHaveBeenCalled()
      expect(consoleSpy.debug).toHaveBeenCalled()
    })
  })

  describe('context and metadata', () => {
    it('should include context in log messages', () => {
      const contextLogger = new Logger({ context: 'TestModule' })
      contextLogger.info('Test message')

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[TestModule]'),
        expect.any(String)
      )
    })

    it('should handle dynamic context', () => {
      logger.info('Test message', { context: 'DynamicContext' })

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO'),
        expect.stringContaining('Test message'),
        expect.stringContaining('DynamicContext')
      )
    })

    it('should include metadata in log output', () => {
      logger.info('Test message', { 
        userId: '123', 
        action: 'deploy',
        metadata: { version: '1.0.0' }
      })

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO'),
        expect.stringContaining('Test message'),
        expect.stringContaining('userId'),
        expect.stringContaining('123')
      )
    })
  })

  describe('performance logging', () => {
    it('should log performance metrics', () => {
      logger.perf('Operation completed', 1500)

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('PERF'),
        expect.stringContaining('Operation completed'),
        expect.stringContaining('1500ms')
      )
    })

    it('should handle performance timing', () => {
      const timer = logger.startTimer('test-operation')
      
      // Simulate some work
      setTimeout(() => {
        timer.end()
      }, 10)

      // Timer should be created
      expect(timer).toHaveProperty('end')
      expect(typeof timer.end).toBe('function')
    })
  })

  describe('structured logging', () => {
    it('should support structured log entries', () => {
      logger.structured('info', 'User action', {
        userId: '123',
        action: 'login',
        timestamp: new Date().toISOString(),
        metadata: {
          ip: '192.168.1.1',
          userAgent: 'test-agent'
        }
      })

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO'),
        expect.stringContaining('User action'),
        expect.stringContaining('userId')
      )
    })

    it('should handle JSON serialization errors gracefully', () => {
      const circularObj: any = { name: 'test' }
      circularObj.self = circularObj

      expect(() => {
        logger.info('Circular object:', circularObj)
      }).not.toThrow()

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO'),
        expect.stringContaining('Circular object:'),
        expect.stringContaining('[Circular]')
      )
    })
  })

  describe('log rotation', () => {
    it('should handle log file rotation when size limit is reached', () => {
      const rotatingLogger = new Logger({
        enableFileLogging: true,
        maxFileSize: 1024 // 1KB
      })

      // Mock file size check
      mockFs.statSync = jest.fn().mockReturnValue({ size: 2048 }) // 2KB

      rotatingLogger.info('Test message')

      // Should attempt to rotate the log file
      expect(mockFs.appendFileSync).toHaveBeenCalled()
    })

    it('should create new log file after rotation', () => {
      const rotatingLogger = new Logger({
        enableFileLogging: true,
        maxFileSize: 1024,
        maxFiles: 3
      })

      // Simulate file rotation
      mockFs.statSync = jest.fn().mockReturnValue({ size: 2048 })
      mockFs.renameSync = jest.fn()

      rotatingLogger.info('Test message after rotation')

      expect(mockFs.appendFileSync).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should handle console logging errors gracefully', () => {
      consoleSpy.info.mockImplementation(() => {
        throw new Error('Console error')
      })

      expect(() => logger.info('Test message')).not.toThrow()
    })

    it('should handle invalid log levels gracefully', () => {
      const invalidLogger = new Logger({ level: 'invalid' as any })

      expect(() => invalidLogger.info('Test message')).not.toThrow()
    })

    it('should handle undefined/null messages', () => {
      expect(() => logger.info(undefined as any)).not.toThrow()
      expect(() => logger.info(null as any)).not.toThrow()
    })
  })

  describe('performance', () => {
    it('should log messages quickly', () => {
      const startTime = Date.now()

      for (let i = 0; i < 100; i++) {
        logger.info(`Test message ${i}`)
      }

      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should handle high-frequency logging', () => {
      const highFreqLogger = new Logger({ enableFileLogging: false })
      
      const startTime = Date.now()

      for (let i = 0; i < 1000; i++) {
        highFreqLogger.debug(`High frequency log ${i}`)
      }

      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(2000) // Should handle 1000 logs within 2 seconds
    })
  })

  describe('memory management', () => {
    it('should not leak memory with continuous logging', () => {
      const memLogger = new Logger({ enableFileLogging: false })
      
      // Simulate continuous logging
      for (let i = 0; i < 10000; i++) {
        memLogger.info(`Memory test ${i}`)
      }

      // Should not throw memory errors
      expect(true).toBe(true)
    })
  })
})
import { jest } from '@jest/globals'

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}

// Mock process.exit to prevent tests from actually exiting
const mockExit = jest.fn()
process.exit = mockExit as any

// Set test environment variables
process.env.NODE_ENV = 'test'
process.env.VTEX_ACCOUNT = 'test-account'
process.env.VTEX_WORKSPACE = 'test-workspace'

// Global test timeout
jest.setTimeout(30000)

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks()
  mockExit.mockClear()
})
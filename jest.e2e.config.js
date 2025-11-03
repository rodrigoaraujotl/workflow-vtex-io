module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/e2e'],
  testMatch: [
    '**/e2e/**/*.test.ts',
    '**/e2e/**/*.spec.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/e2e/setup.ts'],
  testTimeout: 120000, // 2 minutes for E2E tests
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/core/(.*)$': '<rootDir>/src/core/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/cli/(.*)$': '<rootDir>/src/cli/$1'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  forceExit: true,
  detectOpenHandles: true,
  maxWorkers: 1, // Run E2E tests sequentially
  bail: true // Stop on first failure for E2E tests
}
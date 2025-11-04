import { jest } from '@jest/globals'
import path from 'path'

// Ensure process.exit is mocked (tests/setup.ts already mocks it, but keep local safety)
const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any)

// Spy on logging
const mockLogger = {
  setLevel: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}
jest.unstable_mockModule('../../../src/utils/logger', () => ({
  Logger: { createModuleLogger: () => mockLogger },
}))

// Commander program is created within the module, so we need to import after mocks
const CLI_PATH = path.resolve(__dirname, '../../../src/cli/index.ts')

describe('CLI entrypoint (src/cli/index.ts)', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    delete process.env.VTEX_CONFIG_PATH
    delete process.env.DRY_RUN
  })

  it('Should enable verbose logging and set DRY_RUN and custom config via global options', async () => {
    const { program } = await import(CLI_PATH)

    // Simulate preAction by running parse with options
    const parseSpy = jest.spyOn(program, 'parse').mockImplementation(() => program as any)

    // Provide fake argv
    const argv = ['node', 'cli', '--verbose', '--dry-run', '--config', '/tmp/config.json', '--help']
    program.parse(argv as any)

    expect(mockLogger.setLevel).toHaveBeenCalledWith('debug')
    expect(mockLogger.info).toHaveBeenCalledWith('Running in dry-run mode - no changes will be made')
    expect(process.env.DRY_RUN).toBe('true')
    expect(process.env.VTEX_CONFIG_PATH).toBe('/tmp/config.json')

    parseSpy.mockRestore()
  })

  it('Should register expected subcommands', async () => {
    const { program } = await import(CLI_PATH)

    const subcommands = program.commands.map((c: any) => c.name())
    // Based on src/cli/index.ts registration
    expect(subcommands).toEqual(
      expect.arrayContaining([
        'deploy:qa',
        'deploy:prod',
        'rollback',
        'status',
        'config',
        'init',
        'validate',
        'health',
      ])
    )
  })

  it('Should format help with sorted subcommands and custom term', async () => {
    const { program } = await import(CLI_PATH)

    // commander .helpInformation() returns help text
    const help = program.helpInformation()
    expect(help).toMatch(/Examples:/)
    // Validate that each command appears in help
    expect(help).toMatch(/deploy:qa/)
    expect(help).toMatch(/deploy:prod/)
    expect(help).toMatch(/rollback/)
  })

  it('Should handle uncaughtException by logging and exiting with code 1', async () => {
    await import(CLI_PATH)

    const error = new Error('boom')
    // Emit uncaughtException
    process.emit('uncaughtException' as any, error)

    expect(mockLogger.error).toHaveBeenCalledWith('Uncaught exception', error)
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('Should handle unhandledRejection by logging and exiting with code 1', async () => {
    await import(CLI_PATH)

    const reason = new Error('rejected')
    // Emit unhandledRejection
    process.emit('unhandledRejection' as any, reason, Promise.reject(reason))

    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled rejection', reason)
    expect(mockExit).toHaveBeenCalledWith(1)
  })
})

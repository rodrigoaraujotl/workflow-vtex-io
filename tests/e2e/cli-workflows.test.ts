/**
 * End-to-end tests for CLI workflows
 * These tests simulate real user interactions with the CLI
 */

import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('CLI Workflows E2E', () => {
  let testDir: string
  let cliPath: string

  beforeAll(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtex-workflow-test-'))
    cliPath = path.join(__dirname, '../../dist/cli.js')
    
    // Ensure CLI is built
    if (!fs.existsSync(cliPath)) {
      throw new Error('CLI not built. Run "npm run build" first.')
    }
  })

  afterAll(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  beforeEach(() => {
    // Change to test directory
    process.chdir(testDir)
  })

  describe('configuration workflow', () => {
    it('should initialize configuration interactively', async () => {
      const cli = spawn('node', [cliPath, 'config', 'init'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: testDir,
      })

      // Simulate user input
      cli.stdin.write('test-account\n') // VTEX account
      cli.stdin.write('main\n') // Default workspace
      cli.stdin.write('y\n') // Enable notifications
      cli.stdin.write('https://hooks.slack.com/test\n') // Slack webhook
      cli.stdin.write('n\n') // Disable email notifications
      cli.stdin.end()

      const { stdout, stderr, exitCode } = await waitForProcess(cli)

      expect(exitCode).toBe(0)
      expect(stdout).toContain('Configuration initialized successfully')
      expect(fs.existsSync(path.join(testDir, 'vtex-workflow.json'))).toBe(true)

      // Verify configuration content
      const config = JSON.parse(fs.readFileSync(path.join(testDir, 'vtex-workflow.json'), 'utf8'))
      expect(config.vtex.account).toBe('test-account')
      expect(config.vtex.workspace).toBe('main')
      expect(config.notifications.slack.enabled).toBe(true)
      expect(config.notifications.email.enabled).toBe(false)
    })

    it('should get and set configuration values', async () => {
      // First initialize config
      await createTestConfig()

      // Test getting configuration value
      const getResult = await runCLI(['config', 'get', 'vtex.account'])
      expect(getResult.exitCode).toBe(0)
      expect(getResult.stdout).toContain('test-account')

      // Test setting configuration value
      const setResult = await runCLI(['config', 'set', 'vtex.workspace', 'new-workspace'])
      expect(setResult.exitCode).toBe(0)
      expect(setResult.stdout).toContain('Configuration updated')

      // Verify the change
      const verifyResult = await runCLI(['config', 'get', 'vtex.workspace'])
      expect(verifyResult.exitCode).toBe(0)
      expect(verifyResult.stdout).toContain('new-workspace')
    })

    it('should validate configuration', async () => {
      // Create invalid configuration
      const invalidConfig = {
        vtex: {
          // Missing account
          workspace: 'main',
        },
        notifications: {
          slack: {
            enabled: true,
            webhook: 'invalid-url', // Invalid URL
          },
        },
      }

      fs.writeFileSync(
        path.join(testDir, 'vtex-workflow.json'),
        JSON.stringify(invalidConfig, null, 2)
      )

      const result = await runCLI(['config', 'validate'])
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Missing required field: vtex.account')
      expect(result.stderr).toContain('Invalid webhook URL format')
    })

    it('should list all configuration values', async () => {
      await createTestConfig()

      const result = await runCLI(['config', 'list'])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('vtex.account')
      expect(result.stdout).toContain('vtex.workspace')
      expect(result.stdout).toContain('notifications.slack.enabled')
    })
  })

  describe('deployment workflow', () => {
    beforeEach(async () => {
      await createTestConfig()
      await createMockGitRepo()
    })

    it('should perform dry run deployment', async () => {
      const result = await runCLI(['deploy', '--environment', 'qa', '--dry-run'])
      
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Dry run mode')
      expect(result.stdout).toContain('Deployment would succeed')
      expect(result.stdout).toContain('No actual deployment performed')
    })

    it('should handle deployment with validation errors', async () => {
      // Create uncommitted changes
      fs.writeFileSync(path.join(testDir, 'test-file.txt'), 'uncommitted content')

      const result = await runCLI(['deploy', '--environment', 'qa'])
      
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Validation failed')
      expect(result.stderr).toContain('uncommitted changes')
    })

    it('should skip validation when requested', async () => {
      // Create uncommitted changes
      fs.writeFileSync(path.join(testDir, 'test-file.txt'), 'uncommitted content')

      const result = await runCLI(['deploy', '--environment', 'qa', '--skip-validation'])
      
      // Should proceed despite validation issues (but may fail at VTEX step in real scenario)
      expect(result.stdout).toContain('Skipping validation')
    })

    it('should handle production deployment with confirmation', async () => {
      const cli = spawn('node', [cliPath, 'deploy', '--environment', 'production'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: testDir,
      })

      // Simulate user declining confirmation
      cli.stdin.write('n\n')
      cli.stdin.end()

      const { stdout, stderr, exitCode } = await waitForProcess(cli)

      expect(exitCode).toBe(1)
      expect(stdout).toContain('Are you sure you want to deploy to production?')
      expect(stdout).toContain('Deployment cancelled')
    })

    it('should force production deployment without confirmation', async () => {
      const result = await runCLI(['deploy', '--environment', 'production', '--force', '--dry-run'])
      
      expect(result.exitCode).toBe(0)
      expect(result.stdout).not.toContain('Are you sure')
      expect(result.stdout).toContain('Dry run mode')
    })
  })

  describe('status workflow', () => {
    beforeEach(async () => {
      await createTestConfig()
    })

    it('should show deployment status', async () => {
      const result = await runCLI(['status', '--environment', 'qa'])
      
      // May show "No active deployment" or actual status depending on mocks
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/(No active deployment|Deployment Status)/i)
    })

    it('should show status in JSON format', async () => {
      const result = await runCLI(['status', '--environment', 'qa', '--json'])
      
      expect(result.exitCode).toBe(0)
      
      // Should be valid JSON
      expect(() => JSON.parse(result.stdout)).not.toThrow()
      
      const status = JSON.parse(result.stdout)
      expect(status).toHaveProperty('environment')
      expect(status.environment).toBe('qa')
    })

    it('should show deployment history', async () => {
      const result = await runCLI(['status', '--environment', 'qa', '--history'])
      
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/(No deployment history|Deployment History)/i)
    })

    it('should include health check in status', async () => {
      const result = await runCLI(['status', '--environment', 'qa', '--health'])
      
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/(Health Check|Application Health)/i)
    })
  })

  describe('rollback workflow', () => {
    beforeEach(async () => {
      await createTestConfig()
    })

    it('should list deployment history for rollback', async () => {
      const result = await runCLI(['rollback', '--environment', 'qa', '--list'])
      
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/(No deployment history|Deployment History)/i)
    })

    it('should perform rollback by steps', async () => {
      const result = await runCLI(['rollback', '--environment', 'qa', '--steps', '1', '--dry-run'])
      
      // Should show what would be rolled back
      expect(result.stdout).toContain('Dry run mode')
      expect(result.stdout).toMatch(/(Would rollback|No previous deployment)/i)
    })

    it('should handle rollback with confirmation', async () => {
      const cli = spawn('node', [cliPath, 'rollback', '--environment', 'production', '--steps', '1'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: testDir,
      })

      // Simulate user declining confirmation
      cli.stdin.write('n\n')
      cli.stdin.end()

      const { stdout, stderr, exitCode } = await waitForProcess(cli)

      expect(stdout).toContain('Are you sure you want to rollback production?')
      expect(stdout).toContain('Rollback cancelled')
    })
  })

  describe('error handling and recovery', () => {
    it('should handle missing configuration file', async () => {
      // Ensure no config file exists
      const configPath = path.join(testDir, 'vtex-workflow.json')
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath)
      }

      const result = await runCLI(['deploy', '--environment', 'qa'])
      
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Configuration file not found')
      expect(result.stderr).toContain('Run "vtex-workflow config init"')
    })

    it('should handle invalid JSON configuration', async () => {
      // Create invalid JSON config
      fs.writeFileSync(path.join(testDir, 'vtex-workflow.json'), '{ invalid json }')

      const result = await runCLI(['config', 'validate'])
      
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Invalid JSON')
    })

    it('should handle network connectivity issues', async () => {
      await createTestConfig()

      // Mock network failure by using invalid VTEX account
      const result = await runCLI(['config', 'set', 'vtex.account', 'invalid-account'])
      expect(result.exitCode).toBe(0)

      const deployResult = await runCLI(['deploy', '--environment', 'qa', '--dry-run'])
      
      // Should handle gracefully in dry run
      expect(deployResult.exitCode).toBe(0)
      expect(deployResult.stdout).toContain('Dry run mode')
    })

    it('should provide helpful error messages', async () => {
      const result = await runCLI(['deploy', '--environment', 'invalid-env'])
      
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('Invalid environment')
      expect(result.stderr).toMatch(/(qa|staging|production)/i) // Should suggest valid environments
    })
  })

  describe('help and documentation', () => {
    it('should show general help', async () => {
      const result = await runCLI(['--help'])
      
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('VTEX IO Deployment Workflow')
      expect(result.stdout).toContain('deploy')
      expect(result.stdout).toContain('rollback')
      expect(result.stdout).toContain('status')
      expect(result.stdout).toContain('config')
    })

    it('should show command-specific help', async () => {
      const result = await runCLI(['deploy', '--help'])
      
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Deploy application')
      expect(result.stdout).toContain('--environment')
      expect(result.stdout).toContain('--dry-run')
      expect(result.stdout).toContain('--force')
    })

    it('should show version information', async () => {
      const result = await runCLI(['--version'])
      
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/) // Version format
    })
  })

  // Helper functions
  async function createTestConfig() {
    const config = {
      version: '2.0.0',
      vtex: {
        account: 'test-account',
        workspace: 'main',
        timeout: 30000,
      },
      deployment: {
        environments: {
          qa: {
            workspace: 'main',
            requireHealthCheck: false,
          },
          staging: {
            workspace: 'staging',
            requireHealthCheck: true,
          },
          production: {
            workspace: 'production',
            requireHealthCheck: true,
            canary: {
              enabled: true,
              percentage: 10,
            },
          },
        },
        validation: {
          requireCleanBranch: true,
          allowedBranches: ['main', 'develop'],
        },
      },
      notifications: {
        enabled: true,
        slack: {
          enabled: true,
          webhook: 'https://hooks.slack.com/test',
        },
        email: {
          enabled: false,
        },
      },
    }

    fs.writeFileSync(
      path.join(testDir, 'vtex-workflow.json'),
      JSON.stringify(config, null, 2)
    )
  }

  async function createMockGitRepo() {
    // Initialize git repo
    await runCommand('git', ['init'])
    await runCommand('git', ['config', 'user.name', 'Test User'])
    await runCommand('git', ['config', 'user.email', 'test@example.com'])
    
    // Create initial commit
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test Project')
    await runCommand('git', ['add', '.'])
    await runCommand('git', ['commit', '-m', 'Initial commit'])
  }

  async function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const cli = spawn('node', [cliPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: testDir,
    })

    return waitForProcess(cli)
  }

  async function runCommand(command: string, args: string[]): Promise<void> {
    const process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: testDir,
    })

    const { exitCode } = await waitForProcess(process)
    if (exitCode !== 0) {
      throw new Error(`Command failed: ${command} ${args.join(' ')}`)
    }
  }

  async function waitForProcess(process: ChildProcess): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''

      process.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      process.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      process.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode || 0 })
      })
    })
  }
})
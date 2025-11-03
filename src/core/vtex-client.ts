import { exec } from 'child_process'
import { promisify } from 'util'
import { Logger } from '../utils/logger'
import { 
  App as VTEXApp, 
  Workspace as VTEXWorkspace,
  AppInstallOptions,
  VTEXRelease
} from '../types/vtex.types'

const execAsync = promisify(exec)

export class VTEXClient {
  private logger: Logger
  private currentAccount?: string
  private currentWorkspace?: string
  private authToken?: string

  constructor(logger: Logger) {
    this.logger = logger
  }

  /**
   * Authenticate with VTEX using auth token
   */
  async authenticate(authToken: string): Promise<void> {
    try {
      this.authToken = authToken
      
      // Set auth token in VTEX CLI
      await this.executeCommand(`vtex auth --token ${authToken}`)
      
      // Verify authentication
      const { stdout } = await this.executeCommand('vtex whoami')
      const accountInfo = JSON.parse(stdout)
      
      this.currentAccount = accountInfo.account
      this.logger.info('VTEX authentication successful', { 
        account: this.currentAccount,
        user: accountInfo.user 
      })
      
    } catch (error) {
      this.logger.error('VTEX authentication failed', error as Error)
      throw new Error(`Authentication failed: ${(error as Error).message}`)
    }
  }

  /**
   * Switch to a specific workspace
   */
  async useWorkspace(workspace: string): Promise<void> {
    try {
      await this.executeCommand(`vtex use ${workspace}`)
      this.currentWorkspace = workspace
      
      this.logger.info('Switched to workspace', { workspace })
    } catch (error) {
      this.logger.error('Failed to switch workspace', error as Error, { workspace })
      throw new Error(`Failed to switch to workspace ${workspace}: ${(error as Error).message}`)
    }
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(options: { name: string; production?: boolean }): Promise<VTEXWorkspace> {
    try {
      const productionFlag = options.production ? '--production' : ''
      await this.executeCommand(`vtex workspace create ${options.name} ${productionFlag}`)
      
      const workspace: VTEXWorkspace = {
        name: options.name,
        weight: 1,
        production: options.production || false,
        lastModified: new Date(),
        apps: [],
        status: 'active'
      }
      
      this.logger.info('Workspace created successfully', { name: workspace.name, production: workspace.production })
      return workspace
      
    } catch (error) {
      this.logger.error('Failed to create workspace', error as Error, options)
      throw new Error(`Failed to create workspace ${options.name}: ${(error as Error).message}`)
    }
  }

  /**
   * Delete a workspace
   */
  async deleteWorkspace(workspace: string): Promise<void> {
    try {
      await this.executeCommand(`vtex workspace delete ${workspace} --yes`)
      this.logger.info('Workspace deleted successfully', { workspace })
    } catch (error) {
      this.logger.error('Failed to delete workspace', error as Error, { workspace })
      throw new Error(`Failed to delete workspace ${workspace}: ${(error as Error).message}`)
    }
  }

  /**
   * List all workspaces
   */
  async listWorkspaces(): Promise<VTEXWorkspace[]> {
    try {
      const { stdout } = await this.executeCommand('vtex workspace list --json')
      const workspaces = JSON.parse(stdout)
      
      return workspaces.map((ws: any) => ({
        name: ws.name,
        production: ws.production || false,
        createdAt: new Date(ws.createdAt || Date.now()),
        status: ws.status || 'active'
      }))
    } catch (error) {
      this.logger.error('Failed to list workspaces', error as Error)
      throw new Error(`Failed to list workspaces: ${(error as Error).message}`)
    }
  }

  /**
   * Install an app
   */
  async installApp(appName: string, options: AppInstallOptions = {}): Promise<void> {
    try {
      let command = `vtex install ${appName}`
      
      if (options.force) {
        command += ' --force'
      }
      
      // Auto-confirm option can be added if needed

      await this.executeCommand(command, { timeout: 600000 }) // 10 minutes timeout
      
      this.logger.info('App installed successfully', { appName, options })
    } catch (error) {
      this.logger.error('Failed to install app', error as Error, { appName, options })
      throw new Error(`Failed to install app ${appName}: ${(error as Error).message}`)
    }
  }

  /**
   * Uninstall an app
   */
  async uninstallApp(appName: string): Promise<void> {
    try {
      await this.executeCommand(`vtex uninstall ${appName} --yes`)
      this.logger.info('App uninstalled successfully', { appName })
    } catch (error) {
      this.logger.error('Failed to uninstall app', error as Error, { appName })
      throw new Error(`Failed to uninstall app ${appName}: ${(error as Error).message}`)
    }
  }

  /**
   * List installed apps
   */
  async listInstalledApps(): Promise<VTEXApp[]> {
    try {
      const { stdout } = await this.executeCommand('vtex list --json')
      const apps = JSON.parse(stdout)
      
      return apps.map((app: any) => ({
        name: app.name,
        version: app.version,
        status: app.status || 'installed',
        installedAt: new Date(app.installedAt || Date.now())
      }))
    } catch (error) {
      this.logger.error('Failed to list installed apps', error as Error)
      throw new Error(`Failed to list installed apps: ${(error as Error).message}`)
    }
  }

  /**
   * List apps (alias for listInstalledApps)
   */
  async listApps(): Promise<VTEXApp[]> {
    return this.listInstalledApps()
  }

  /**
   * Create a release
   */
  async release(version: string, releaseType: 'beta' | 'stable' = 'beta'): Promise<VTEXRelease> {
    try {
      const command = releaseType === 'stable' 
        ? `vtex release ${version} --stable`
        : `vtex release ${version}`
      
      await this.executeCommand(command)
      
      const release: VTEXRelease = {
        version,
        tag: releaseType,
        createdAt: new Date(),
        createdBy: this.currentAccount || 'unknown',
        assets: [],
        status: 'published'
      }
      
      this.logger.info('Release created successfully', { version, releaseType, ...release })
      return release
      
    } catch (error) {
      this.logger.error('Failed to create release', error as Error, { version, releaseType })
      throw new Error(`Failed to create release ${version}: ${(error as Error).message}`)
    }
  }

  /**
   * Promote workspace to master
   */
  async promoteWorkspace(workspace: string): Promise<void> {
    try {
      await this.executeCommand(`vtex workspace promote ${workspace}`)
      this.logger.info('Workspace promoted to master', { workspace })
    } catch (error) {
      this.logger.error('Failed to promote workspace', error as Error, { workspace })
      throw new Error(`Failed to promote workspace ${workspace}: ${(error as Error).message}`)
    }
  }

  /**
   * Get current version of an app
   */
  async getCurrentVersion(appName: string): Promise<string> {
    try {
      const apps = await this.listInstalledApps()
      const app = apps.find(a => a.name === appName)
      
      if (!app) {
        throw new Error(`App ${appName} not found`)
      }
      
      return app.version
    } catch (error) {
      this.logger.error('Failed to get current version', error as Error, { appName })
      throw new Error(`Failed to get current version for ${appName}: ${(error as Error).message}`)
    }
  }

  /**
   * Get all versions of an app
   */
  async getAppVersions(appName: string): Promise<string[]> {
    try {
      const { stdout } = await this.executeCommand(`vtex list ${appName} --json`)
      const versions = JSON.parse(stdout)
      
      return versions.map((v: any) => v.version).sort((a: string, b: string) => {
        // Sort versions in descending order (newest first)
        return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })
      })
    } catch (error) {
      this.logger.error('Failed to get app versions', error as Error, { appName })
      throw new Error(`Failed to get versions for ${appName}: ${(error as Error).message}`)
    }
  }

  /**
   * Validate VTEX CLI is available
   */
  async validateCLI(): Promise<void> {
    try {
      await this.executeCommand('vtex --version')
      this.logger.info('VTEX CLI validation successful')
    } catch (error) {
      this.logger.error('VTEX CLI validation failed', error as Error)
      throw new Error('VTEX CLI is not installed or not available in PATH')
    }
  }

  /**
   * Validate account access
   */
  async validateAccount(account: string): Promise<void> {
    try {
      // Switch to account if not already using it
      if (this.currentAccount !== account) {
        await this.executeCommand(`vtex switch ${account}`)
        this.currentAccount = account
      }
      
      // Verify account access
      const { stdout } = await this.executeCommand('vtex whoami')
      const accountInfo = JSON.parse(stdout)
      
      if (accountInfo.account !== account) {
        throw new Error(`Account mismatch: expected ${account}, got ${accountInfo.account}`)
      }
      
      this.logger.info('Account validation successful', { account })
    } catch (error) {
      this.logger.error('Account validation failed', error as Error, { account })
      throw new Error(`Failed to validate account ${account}: ${(error as Error).message}`)
    }
  }

  /**
   * Validate workspace exists or can be created
   */
  async validateWorkspace(workspace: string): Promise<void> {
    try {
      const workspaces = await this.listWorkspaces()
      const exists = workspaces.some(ws => ws.name === workspace)
      
      if (!exists) {
        this.logger.info('Workspace does not exist, will be created', { workspace })
        await this.createWorkspace({ name: workspace })
      } else {
        this.logger.info('Workspace validation successful', { workspace })
      }
    } catch (error) {
      this.logger.error('Workspace validation failed', error as Error, { workspace })
      throw new Error(`Failed to validate workspace ${workspace}: ${(error as Error).message}`)
    }
  }

  /**
   * Get workspace info
   */
  async getWorkspaceInfo(workspace?: string): Promise<VTEXWorkspace> {
    try {
      const targetWorkspace = workspace || this.currentWorkspace
      if (!targetWorkspace) {
        throw new Error('No workspace specified and no current workspace set')
      }
      
      const { stdout } = await this.executeCommand(`vtex workspace info ${targetWorkspace} --json`)
      const info = JSON.parse(stdout)
      
      return {
        name: info.name,
        weight: info.weight || 1,
        production: info.production || false,
        lastModified: new Date(info.lastModified || Date.now()),
        apps: info.apps || [],
        status: (info.status || 'active') as 'active' | 'inactive' | 'promoting' | 'deleting'
      }
    } catch (error) {
      this.logger.error('Failed to get workspace info', error as Error, { workspace })
      throw new Error(`Failed to get workspace info: ${(error as Error).message}`)
    }
  }

  /**
   * Check if app is installed
   */
  async isAppInstalled(appName: string): Promise<boolean> {
    try {
      const apps = await this.listInstalledApps()
      return apps.some(app => app.name === appName)
    } catch (error) {
      this.logger.error('Failed to check app installation', error as Error, { appName })
      return false
    }
  }

  /**
   * Get app info
   */
  async getAppInfo(appName: string): Promise<VTEXApp | null> {
    try {
      const apps = await this.listInstalledApps()
      return apps.find(app => app.name === appName) || null
    } catch (error) {
      this.logger.error('Failed to get app info', error as Error, { appName })
      return null
    }
  }

  /**
   * Execute VTEX CLI command
   */
  private async executeCommand(
    command: string, 
    options: { timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    const timeout = options.timeout || 30000 // 30 seconds default
    
    this.logger.debug('Executing VTEX command', { command })
    
    try {
      const result = await execAsync(command, { 
        timeout,
        env: {
          ...process.env,
          VTEX_AUTH_TOKEN: this.authToken
        }
      })
      
      this.logger.debug('Command executed successfully', { 
        command, 
        stdout: result.stdout.substring(0, 200) // Log first 200 chars
      })
      
      return result
    } catch (error: any) {
      this.logger.error('Command execution failed', error, { command })
      
      // Handle timeout errors
      if (error.killed && error.signal === 'SIGTERM') {
        throw new Error(`Command timed out after ${timeout}ms: ${command}`)
      }
      
      // Handle CLI errors
      if (error.stderr) {
        throw new Error(`VTEX CLI error: ${error.stderr}`)
      }
      
      throw error
    }
  }

  /**
   * Get current account
   */
  getCurrentAccount(): string | undefined {
    return this.currentAccount
  }

  /**
   * Get current workspace
   */
  getCurrentWorkspace(): string | undefined {
    return this.currentWorkspace
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return !!this.authToken && !!this.currentAccount
  }
}
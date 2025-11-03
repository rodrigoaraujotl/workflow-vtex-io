import { exec } from 'child_process'
import { promisify } from 'util'
import { Logger } from '../utils/logger'
import { 
  GitCommitInfo, 
  GitBranchInfo, 
  GitStatus, 
  GitTagInfo,
  GitRemoteInfo,
  GitDiffInfo,
  GitLogOptions,
  GitOperationResult
} from '../types/git.types'

const execAsync = promisify(exec)

export class GitOperations {
  private logger: Logger
  private projectPath: string

  constructor(logger: Logger, projectPath: string = process.cwd()) {
    this.logger = logger
    this.projectPath = projectPath
  }

  /**
   * Check if current directory is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir', { cwd: this.projectPath })
      return true
    } catch {
      return false
    }
  }

  /**
   * Initialize git repository
   */
  async init(): Promise<GitOperationResult> {
    try {
      this.logger.debug('Initializing git repository')
      
      await execAsync('git init', { cwd: this.projectPath })
      
      this.logger.info('Git repository initialized successfully')
      return { success: true, message: 'Git repository initialized' }
    } catch (error) {
      this.logger.error('Failed to initialize git repository', error as Error)
      return { 
        success: false, 
        message: `Failed to initialize git repository: ${(error as Error).message}`,
        error: (error as Error).message
      }
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      this.logger.debug('Getting current branch')
      
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { 
        cwd: this.projectPath 
      })
      
      const branch = stdout.trim()
      this.logger.debug('Current branch', { branch })
      
      return branch
    } catch (error) {
      this.logger.error('Failed to get current branch', error as Error)
      throw new Error(`Failed to get current branch: ${(error as Error).message}`)
    }
  }

  /**
   * Get git status
   */
  async getStatus(): Promise<GitStatus> {
    try {
      this.logger.debug('Getting git status')
      
      const { stdout } = await execAsync('git status --porcelain', { 
        cwd: this.projectPath 
      })
      
      const lines = stdout.trim().split('\n').filter(line => line.length > 0)
      
      const status: GitStatus = {
        clean: lines.length === 0,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: []
      }

      for (const line of lines) {
        const statusCode = line.substring(0, 2)
        const filePath = line.substring(3)

        if (statusCode.includes('U') || statusCode.includes('A') && statusCode.includes('A')) {
          status.conflicted.push(filePath)
        } else if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
          status.staged.push(filePath)
        } else if (statusCode[1] !== ' ' && statusCode[1] !== '?') {
          status.unstaged.push(filePath)
        } else if (statusCode === '??') {
          status.untracked.push(filePath)
        }
      }

      this.logger.debug('Git status retrieved', {
        clean: status.clean,
        stagedCount: status.staged.length,
        unstagedCount: status.unstaged.length
      })
      return status

    } catch (error) {
      this.logger.error('Failed to get git status', error as Error)
      throw new Error(`Failed to get git status: ${(error as Error).message}`)
    }
  }

  /**
   * Get commit information
   */
  async getCommitInfo(commitHash?: string): Promise<GitCommitInfo> {
    try {
      const hash = commitHash || 'HEAD'
      this.logger.debug('Getting commit info', { hash })
      
      const { stdout } = await execAsync(
        `git show --format="%H|%h|%an|%ae|%ad|%s|%b" --no-patch ${hash}`, 
        { cwd: this.projectPath }
      )
      
      const parts = stdout.trim().split('|')
      const [fullHash = '', shortHash = '', authorName = '', authorEmail = '', date = '', subject = '', body = ''] = parts
      
      const commitInfo: GitCommitInfo = {
        hash: fullHash,
        shortHash,
        author: {
          name: authorName,
          email: authorEmail
        },
        date: new Date(date || Date.now()),
        message: {
          subject,
          body: body || ''
        }
      }

      this.logger.debug('Commit info retrieved', {
        hash: commitInfo.hash,
        author: commitInfo.author.name
      })
      return commitInfo

    } catch (error) {
      this.logger.error('Failed to get commit info', error as Error)
      throw new Error(`Failed to get commit info: ${(error as Error).message}`)
    }
  }

  /**
   * Get commit log
   */
  async getLog(options: GitLogOptions = {}): Promise<GitCommitInfo[]> {
    try {
      this.logger.debug('Getting git log', {
        limit: options.limit,
        branch: options.branch
      })
      
      const {
        limit = 10,
        since,
        until,
        author,
        grep,
        branch = 'HEAD'
      } = options

      let command = `git log --format="%H|%h|%an|%ae|%ad|%s|%b" -n ${limit}`
      
      if (since) {
        command += ` --since="${since}"`
      }
      
      if (until) {
        command += ` --until="${until}"`
      }
      
      if (author) {
        command += ` --author="${author}"`
      }
      
      if (grep) {
        command += ` --grep="${grep}"`
      }
      
      command += ` ${branch}`

      const { stdout } = await execAsync(command, { cwd: this.projectPath })
      
      const commits: GitCommitInfo[] = []
      const commitBlocks = stdout.trim().split('\n\n')

      for (const block of commitBlocks) {
        if (!block.trim()) continue
        
        const parts = block.split('|')
        const [fullHash = '', shortHash = '', authorName = '', authorEmail = '', date = '', subject = '', body = ''] = parts
        
        commits.push({
          hash: fullHash,
          shortHash,
          author: {
            name: authorName,
            email: authorEmail
          },
          date: new Date(date || Date.now()),
          message: {
            subject,
            body: body || ''
          }
        })
      }

      this.logger.debug('Git log retrieved', { count: commits.length })
      return commits

    } catch (error) {
      this.logger.error('Failed to get git log', error as Error)
      throw new Error(`Failed to get git log: ${(error as Error).message}`)
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName: string, startPoint?: string): Promise<GitOperationResult> {
    try {
      this.logger.info('Creating new branch', { branchName, startPoint })
      
      let command = `git checkout -b ${branchName}`
      if (startPoint) {
        command += ` ${startPoint}`
      }

      await execAsync(command, { cwd: this.projectPath })
      
      this.logger.info('Branch created successfully', { branchName })
      return {
        success: true,
        message: `Branch '${branchName}' created successfully`
      }

    } catch (error) {
      this.logger.error('Failed to create branch', error as Error)
      return {
        success: false,
        message: `Failed to create branch: ${(error as Error).message}`
      }
    }
  }

  /**
   * Switch to a branch
   */
  async switchBranch(branchName: string): Promise<GitOperationResult> {
    try {
      this.logger.info('Switching to branch', { branchName })
      
      await execAsync(`git checkout ${branchName}`, { cwd: this.projectPath })
      
      this.logger.info('Switched to branch successfully', { branchName })
      return {
        success: true,
        message: `Switched to branch '${branchName}' successfully`
      }

    } catch (error) {
      this.logger.error('Failed to switch branch', error as Error)
      return {
        success: false,
        message: `Failed to switch branch: ${(error as Error).message}`
      }
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchName: string, force: boolean = false): Promise<GitOperationResult> {
    try {
      this.logger.info('Deleting branch', { branchName, force })
      
      const flag = force ? '-D' : '-d'
      await execAsync(`git branch ${flag} ${branchName}`, { cwd: this.projectPath })
      
      this.logger.info('Branch deleted successfully', { branchName })
      return {
        success: true,
        message: `Branch '${branchName}' deleted successfully`
      }

    } catch (error) {
      this.logger.error('Failed to delete branch', error as Error)
      return {
        success: false,
        message: `Failed to delete branch: ${(error as Error).message}`
      }
    }
  }

  /**
   * List branches
   */
  async listBranches(includeRemote: boolean = false): Promise<GitBranchInfo[]> {
    try {
      this.logger.debug('Listing branches', { includeRemote })
      
      const flag = includeRemote ? '-a' : ''
      const { stdout } = await execAsync(`git branch ${flag} -v`, { cwd: this.projectPath })
      
      const branches: GitBranchInfo[] = []
      const lines = stdout.trim().split('\n')

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        const isCurrent = trimmed.startsWith('*')
        const isRemote = trimmed.includes('remotes/')
        
        // Parse branch info: * main 1234567 Last commit message
        const parts = trimmed.replace(/^\*\s*/, '').split(/\s+/)
        const name = parts[0] || 'unknown'
        const hash = parts[1] || ''
        const message = parts.slice(2).join(' ') || ''

        branches.push({
          name,
          hash,
          isCurrent,
          isRemote,
          lastCommitMessage: message
        })
      }

      this.logger.debug('Branches listed', { count: branches.length })
      return branches

    } catch (error) {
      this.logger.error('Failed to list branches', error as Error)
      throw new Error(`Failed to list branches: ${(error as Error).message}`)
    }
  }

  /**
   * Add files to staging
   */
  async addFiles(files: string[] | string = '.'): Promise<GitOperationResult> {
    try {
      const fileList = Array.isArray(files) ? files.join(' ') : files
      this.logger.info('Adding files to staging', { files: fileList })
      
      await execAsync(`git add ${fileList}`, { cwd: this.projectPath })
      
      this.logger.info('Files added to staging successfully')
      return {
        success: true,
        message: 'Files added to staging successfully'
      }

    } catch (error) {
      this.logger.error('Failed to add files', error as Error)
      return {
        success: false,
        message: `Failed to add files: ${(error as Error).message}`
      }
    }
  }

  /**
   * Commit changes
   */
  async commit(message: string, options: { amend?: boolean; signOff?: boolean } = {}): Promise<GitOperationResult> {
    try {
      this.logger.info('Committing changes', { message, options })
      
      let command = 'git commit'
      
      if (options.amend) {
        command += ' --amend'
      }
      
      if (options.signOff) {
        command += ' --signoff'
      }
      
      command += ` -m "${message}"`

      await execAsync(command, { cwd: this.projectPath })
      
      this.logger.info('Changes committed successfully', { message })
      return {
        success: true,
        message: 'Changes committed successfully'
      }

    } catch (error) {
      this.logger.error('Failed to commit changes', error as Error)
      return {
        success: false,
        message: `Failed to commit changes: ${(error as Error).message}`
      }
    }
  }

  /**
   * Push changes
   */
  async push(remote: string = 'origin', branch?: string, options: { force?: boolean; setUpstream?: boolean } = {}): Promise<GitOperationResult> {
    try {
      const targetBranch = branch || await this.getCurrentBranch()
      this.logger.info('Pushing changes', { remote, branch: targetBranch, options })
      
      let command = `git push ${remote} ${targetBranch}`
      
      if (options.force) {
        command += ' --force'
      }
      
      if (options.setUpstream) {
        command += ' --set-upstream'
      }

      await execAsync(command, { cwd: this.projectPath })
      
      this.logger.info('Changes pushed successfully', { remote, branch: targetBranch })
      return {
        success: true,
        message: `Changes pushed to ${remote}/${targetBranch} successfully`
      }

    } catch (error) {
      this.logger.error('Failed to push changes', error as Error)
      return {
        success: false,
        message: `Failed to push changes: ${(error as Error).message}`
      }
    }
  }

  /**
   * Pull changes
   */
  async pull(remote: string = 'origin', branch?: string): Promise<GitOperationResult> {
    try {
      const targetBranch = branch || await this.getCurrentBranch()
      this.logger.info('Pulling changes', { remote, branch: targetBranch })
      
      await execAsync(`git pull ${remote} ${targetBranch}`, { cwd: this.projectPath })
      
      this.logger.info('Changes pulled successfully', { remote, branch: targetBranch })
      return {
        success: true,
        message: `Changes pulled from ${remote}/${targetBranch} successfully`
      }

    } catch (error) {
      this.logger.error('Failed to pull changes', error as Error)
      return {
        success: false,
        message: `Failed to pull changes: ${(error as Error).message}`
      }
    }
  }

  /**
   * Fetch from remote
   */
  async fetch(remote: string = 'origin'): Promise<GitOperationResult> {
    try {
      this.logger.info('Fetching from remote', { remote })
      
      await execAsync(`git fetch ${remote}`, { cwd: this.projectPath })
      
      this.logger.info('Fetched from remote successfully', { remote })
      return {
        success: true,
        message: `Fetched from ${remote} successfully`
      }

    } catch (error) {
      this.logger.error('Failed to fetch from remote', error as Error)
      return {
        success: false,
        message: `Failed to fetch from remote: ${(error as Error).message}`
      }
    }
  }

  /**
   * Create a tag
   */
  async createTag(tagName: string, message?: string, commitHash?: string): Promise<GitOperationResult> {
    try {
      this.logger.info('Creating tag', { tagName, message, commitHash })
      
      let command = `git tag`
      
      if (message) {
        command += ` -a ${tagName} -m "${message}"`
      } else {
        command += ` ${tagName}`
      }
      
      if (commitHash) {
        command += ` ${commitHash}`
      }

      await execAsync(command, { cwd: this.projectPath })
      
      this.logger.info('Tag created successfully', { tagName })
      return {
        success: true,
        message: `Tag '${tagName}' created successfully`
      }

    } catch (error) {
      this.logger.error('Failed to create tag', error as Error)
      return {
        success: false,
        message: `Failed to create tag: ${(error as Error).message}`
      }
    }
  }

  /**
   * List tags
   */
  async listTags(): Promise<GitTagInfo[]> {
    try {
      this.logger.debug('Listing tags')
      
      const { stdout } = await execAsync('git tag -l --format="%(refname:short)|%(objectname:short)|%(taggerdate)|%(subject)"', { 
        cwd: this.projectPath 
      })
      
      const tags: GitTagInfo[] = []
      const lines = stdout.trim().split('\n').filter(line => line.length > 0)

      for (const line of lines) {
        const parts = line.split('|')
        const [name = '', hash = '', date = '', message = ''] = parts
        
        tags.push({
          name,
          hash,
          date: date ? new Date(date) : new Date(),
          message: message || ''
        })
      }

      this.logger.debug('Tags listed', { count: tags.length })
      return tags

    } catch (error) {
      this.logger.error('Failed to list tags', error as Error)
      throw new Error(`Failed to list tags: ${(error as Error).message}`)
    }
  }

  /**
   * Get diff between commits/branches
   */
  async getDiff(from?: string, to?: string, filePath?: string): Promise<GitDiffInfo> {
    try {
      this.logger.debug('Getting diff', { from, to, filePath })
      
      let command = 'git diff --stat'
      
      if (from && to) {
        command += ` ${from}..${to}`
      } else if (from) {
        command += ` ${from}`
      }
      
      if (filePath) {
        command += ` -- ${filePath}`
      }

      const { stdout: statOutput } = await execAsync(command, { cwd: this.projectPath })
      
      // Get detailed diff
      const detailCommand = command.replace('--stat', '--unified=3')
      const { stdout: diffOutput } = await execAsync(detailCommand, { cwd: this.projectPath })

      const diffInfo: GitDiffInfo = {
        summary: statOutput.trim(),
        diff: diffOutput.trim(),
        files: this.parseDiffFiles(statOutput)
      }

      this.logger.debug('Diff retrieved')
      return diffInfo

    } catch (error) {
      this.logger.error('Failed to get diff', error as Error)
      throw new Error(`Failed to get diff: ${(error as Error).message}`)
    }
  }

  /**
   * Get remote information (alias for getRemotes)
   */
  async getRemoteInfo(): Promise<GitRemoteInfo[]> {
    return this.getRemotes()
  }

  /**
   * Get remote information
   */
  async getRemotes(): Promise<GitRemoteInfo[]> {
    try {
      this.logger.debug('Getting remotes')
      
      const { stdout } = await execAsync('git remote -v', { cwd: this.projectPath })
      
      const remotes: GitRemoteInfo[] = []
      const lines = stdout.trim().split('\n').filter(line => line.length > 0)

      const remoteMap = new Map<string, { fetch?: string; push?: string }>()

      for (const line of lines) {
        const parts = line.split(/\s+/)
        const [name, url, type] = parts
        if (!name || !url || !type) continue
        
        const typeClean = type.replace(/[()]/g, '')
        
        if (!remoteMap.has(name)) {
          remoteMap.set(name, {})
        }
        
        const remote = remoteMap.get(name)!
        if (typeClean === 'fetch') {
          remote.fetch = url
        } else if (typeClean === 'push') {
          remote.push = url
        }
      }

      for (const [name, urls] of remoteMap) {
        remotes.push({
          name: name || '',
          fetchUrl: urls.fetch || '',
          pushUrl: urls.push || urls.fetch || ''
        })
      }

      this.logger.debug('Remotes retrieved', { count: remotes.length })
      return remotes

    } catch (error) {
      this.logger.error('Failed to get remotes', error as Error)
      throw new Error(`Failed to get remotes: ${(error as Error).message}`)
    }
  }

  /**
   * Check if repository is clean (no uncommitted changes)
   */
  async isClean(): Promise<boolean> {
    try {
      const status = await this.getStatus()
      return status.clean
    } catch (error) {
      this.logger.error('Failed to check if repository is clean', error as Error)
      return false
    }
  }

  /**
   * Check if branch exists
   */
  async branchExists(branchName: string, includeRemote: boolean = false): Promise<boolean> {
    try {
      const branches = await this.listBranches(includeRemote)
      return branches.some(branch => branch.name === branchName || branch.name.endsWith(`/${branchName}`))
    } catch (error) {
      this.logger.error('Failed to check if branch exists', error as Error)
      return false
    }
  }

  /**
   * Get the latest tag
   */
  async getLatestTag(): Promise<GitTagInfo | null> {
    try {
      this.logger.debug('Getting latest tag')
      
      const { stdout } = await execAsync('git describe --tags --abbrev=0', { cwd: this.projectPath })
      const tagName = stdout.trim()
      
      if (!tagName) {
        return null
      }

      const tags = await this.listTags()
      return tags.find(tag => tag.name === tagName) || null

    } catch (error) {
      // No tags exist
      this.logger.debug('No tags found')
      return null
    }
  }

  /**
   * Stash changes
   */
  async stash(message?: string): Promise<GitOperationResult> {
    try {
      this.logger.info('Stashing changes', { message })
      
      let command = 'git stash'
      if (message) {
        command += ` push -m "${message}"`
      }

      await execAsync(command, { cwd: this.projectPath })
      
      this.logger.info('Changes stashed successfully')
      return {
        success: true,
        message: 'Changes stashed successfully'
      }

    } catch (error) {
      this.logger.error('Failed to stash changes', error as Error)
      return {
        success: false,
        message: `Failed to stash changes: ${(error as Error).message}`
      }
    }
  }

  /**
   * Pop stashed changes
   */
  async stashPop(): Promise<GitOperationResult> {
    try {
      this.logger.info('Popping stashed changes')
      
      await execAsync('git stash pop', { cwd: this.projectPath })
      
      this.logger.info('Stashed changes popped successfully')
      return {
        success: true,
        message: 'Stashed changes popped successfully'
      }

    } catch (error) {
      this.logger.error('Failed to pop stashed changes', error as Error)
      return {
        success: false,
        message: `Failed to pop stashed changes: ${(error as Error).message}`
      }
    }
  }

  // Private helper methods

  private parseDiffFiles(statOutput: string): Array<{ file: string; additions: number; deletions: number }> {
    const files: Array<{ file: string; additions: number; deletions: number }> = []
    const lines = statOutput.split('\n').filter(line => line.includes('|'))

    for (const line of lines) {
      const parts = line.split('|')
      if (parts.length >= 2) {
        const file = parts[0]?.trim() || ''
        const changes = parts[1]?.trim() || ''
        
        const additionsMatch = changes.match(/(\d+)\s*\+/)
        const deletionsMatch = changes.match(/(\d+)\s*-/)
        
        files.push({
          file,
          additions: additionsMatch ? parseInt(additionsMatch[1] || '0', 10) : 0,
          deletions: deletionsMatch ? parseInt(deletionsMatch[1] || '0', 10) : 0
        })
      }
    }

    return files
  }
}
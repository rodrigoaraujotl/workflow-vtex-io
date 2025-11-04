/**
 * Unit tests for GitService
 */

import { GitService } from '@/core/GitService'
import { ConfigManager } from '@/core/ConfigManager'
import { Logger } from '@/utils/Logger'
import { simpleGit, SimpleGit } from 'simple-git'
import {
  createMockConfig,
  mockAsyncFunction,
  mockRejectedFunction,
  createMockLoggingSettings,
} from '@tests/test-utils'

// Mock dependencies
jest.mock('@/core/ConfigManager')
jest.mock('@/utils/Logger')
jest.mock('simple-git')

describe('GitService', () => {
  let gitService: GitService
  let mockConfig: ConfigManager
  let mockLogger: Logger
  let mockGit: jest.Mocked<SimpleGit>

  beforeEach(() => {
    // Create mock instances
    mockConfig = new ConfigManager() as jest.Mocked<ConfigManager>
    mockLogger = new Logger(createMockLoggingSettings()) as jest.Mocked<Logger>
    mockGit = {
      status: jest.fn(),
      branch: jest.fn(),
      log: jest.fn(),
      checkout: jest.fn(),
      pull: jest.fn(),
      push: jest.fn(),
      tag: jest.fn(),
      raw: jest.fn(),
      revparse: jest.fn(),
      show: jest.fn(),
      diff: jest.fn(),
      reset: jest.fn(),
      clean: jest.fn(),
    } as any

    // Setup mocks
    ;(simpleGit as jest.Mock).mockReturnValue(mockGit)

    mockConfig.get = jest.fn().mockImplementation((key: string) => {
      const config = createMockConfig()
      return key.split('.').reduce((obj, k) => obj?.[k], config)
    })

    mockLogger.info = jest.fn()
    mockLogger.error = jest.fn()
    mockLogger.warn = jest.fn()
    mockLogger.debug = jest.fn()

    // Setup default git mock responses
    mockGit.status.mockResolvedValue({
      current: 'develop',
      ahead: 0,
      behind: 0,
      files: [],
      staged: [],
      modified: [],
      not_added: [],
      deleted: [],
      renamed: [],
      conflicted: [],
    } as any)

    mockGit.branch.mockResolvedValue({
      current: 'develop',
      all: ['develop', 'main', 'feature/test'],
      branches: {
        develop: { current: true, name: 'develop' },
        main: { current: false, name: 'main' },
      },
    } as any)

    mockGit.log.mockResolvedValue({
      latest: {
        hash: 'abc123',
        message: 'feat: add new feature',
        author_name: 'test-user',
        author_email: 'test@example.com',
        date: '2024-01-01T10:00:00Z',
      },
      all: [],
      total: 1,
    } as any)

    // Create GitService instance
    gitService = new GitService(mockConfig)
  })

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(gitService).toBeInstanceOf(GitService)
      expect(simpleGit).toHaveBeenCalled()
    })
  })

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      const branch = await gitService.getCurrentBranch()

      expect(branch).toBe('develop')
      expect(mockGit.status).toHaveBeenCalled()
    })

    it('should handle git errors', async () => {
      mockGit.status.mockRejectedValue(new Error('Git error'))

      await expect(gitService.getCurrentBranch()).rejects.toThrow('Git error')
    })

    it('should handle detached HEAD state', async () => {
      mockGit.status.mockResolvedValue({
        current: null,
        detached: true,
      } as any)

      const branch = await gitService.getCurrentBranch()

      expect(branch).toBe('HEAD')
    })
  })

  describe('hasUncommittedChanges', () => {
    it('should return false for clean working directory', async () => {
      const hasChanges = await gitService.hasUncommittedChanges()

      expect(hasChanges).toBe(false)
      expect(mockGit.status).toHaveBeenCalled()
    })

    it('should return true when there are modified files', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['file1.ts'],
        not_added: ['file2.ts'],
        deleted: ['file3.ts'],
      } as any)

      const hasChanges = await gitService.hasUncommittedChanges()

      expect(hasChanges).toBe(true)
    })

    it('should return true when there are staged files', async () => {
      mockGit.status.mockResolvedValue({
        staged: ['file1.ts'],
      } as any)

      const hasChanges = await gitService.hasUncommittedChanges()

      expect(hasChanges).toBe(true)
    })

    it('should handle git errors', async () => {
      mockGit.status.mockRejectedValue(new Error('Git status failed'))

      await expect(gitService.hasUncommittedChanges()).rejects.toThrow(
        'Git status failed'
      )
    })
  })

  describe('getBranchStatus', () => {
    it('should return branch status with ahead/behind counts', async () => {
      mockGit.status.mockResolvedValue({
        current: 'develop',
        ahead: 2,
        behind: 1,
      } as any)

      const status = await gitService.getBranchStatus()

      expect(status).toEqual({
        current: 'develop',
        ahead: 2,
        behind: 1,
      })
    })

    it('should handle branches with no upstream', async () => {
      mockGit.status.mockResolvedValue({
        current: 'feature/new',
        ahead: 0,
        behind: 0,
        tracking: null,
      } as any)

      const status = await gitService.getBranchStatus()

      expect(status.current).toBe('feature/new')
      expect(status.ahead).toBe(0)
      expect(status.behind).toBe(0)
    })
  })

  describe('getLatestCommit', () => {
    it('should return latest commit information', async () => {
      const commit = await gitService.getLatestCommit()

      expect(commit).toEqual({
        hash: 'abc123',
        message: 'feat: add new feature',
        author: 'test-user',
        date: expect.any(Date),
      })
      expect(mockGit.log).toHaveBeenCalledWith({ maxCount: 1 })
    })

    it('should handle empty repository', async () => {
      mockGit.log.mockResolvedValue({
        latest: null,
        all: [],
        total: 0,
      } as any)

      await expect(gitService.getLatestCommit()).rejects.toThrow(
        'No commits found'
      )
    })

    it('should handle git log errors', async () => {
      mockGit.log.mockRejectedValue(new Error('Git log failed'))

      await expect(gitService.getLatestCommit()).rejects.toThrow(
        'Git log failed'
      )
    })
  })

  describe('getCommitHistory', () => {
    it('should return commit history with default limit', async () => {
      mockGit.log.mockResolvedValue({
        all: [
          {
            hash: 'abc123',
            message: 'feat: add feature',
            author_name: 'user1',
            date: '2024-01-01T10:00:00Z',
          },
          {
            hash: 'def456',
            message: 'fix: bug fix',
            author_name: 'user2',
            date: '2024-01-01T09:00:00Z',
          },
        ],
        total: 2,
      } as any)

      const history = await gitService.getCommitHistory()

      expect(history).toHaveLength(2)
      expect(history[0].hash).toBe('abc123')
      expect(history[1].hash).toBe('def456')
      expect(mockGit.log).toHaveBeenCalledWith({ maxCount: 50 })
    })

    it('should respect custom limit', async () => {
      await gitService.getCommitHistory(10)

      expect(mockGit.log).toHaveBeenCalledWith({ maxCount: 10 })
    })

    it('should filter commits by branch', async () => {
      await gitService.getCommitHistory(50, 'main')

      expect(mockGit.log).toHaveBeenCalledWith({
        maxCount: 50,
        from: 'main',
      })
    })
  })

  describe('checkoutBranch', () => {
    it('should checkout existing branch', async () => {
      await gitService.checkoutBranch('main')

      expect(mockGit.checkout).toHaveBeenCalledWith('main')
    })

    it('should create and checkout new branch', async () => {
      await gitService.checkoutBranch('feature/new', true)

      expect(mockGit.checkout).toHaveBeenCalledWith(['-b', 'feature/new'])
    })

    it('should handle checkout errors', async () => {
      mockGit.checkout.mockRejectedValue(new Error('Branch not found'))

      await expect(gitService.checkoutBranch('nonexistent')).rejects.toThrow(
        'Branch not found'
      )
    })
  })

  describe('pullLatest', () => {
    it('should pull latest changes from origin', async () => {
      mockGit.pull.mockResolvedValue({
        summary: {
          changes: 1,
          insertions: 10,
          deletions: 5,
        },
      } as any)

      const result = await gitService.pullLatest()

      expect(result.changes).toBe(1)
      expect(mockGit.pull).toHaveBeenCalledWith('origin')
    })

    it('should pull from specific remote and branch', async () => {
      await gitService.pullLatest('upstream', 'main')

      expect(mockGit.pull).toHaveBeenCalledWith('upstream', 'main')
    })

    it('should handle pull conflicts', async () => {
      mockGit.pull.mockRejectedValue(new Error('Merge conflict'))

      await expect(gitService.pullLatest()).rejects.toThrow('Merge conflict')
    })
  })

  describe('pushChanges', () => {
    it('should push changes to origin', async () => {
      await gitService.pushChanges()

      expect(mockGit.push).toHaveBeenCalledWith('origin', 'develop')
    })

    it('should push to specific remote and branch', async () => {
      await gitService.pushChanges('upstream', 'main')

      expect(mockGit.push).toHaveBeenCalledWith('upstream', 'main')
    })

    it('should force push when specified', async () => {
      await gitService.pushChanges('origin', 'develop', true)

      expect(mockGit.push).toHaveBeenCalledWith('origin', 'develop', ['--force'])
    })

    it('should handle push errors', async () => {
      mockGit.push.mockRejectedValue(new Error('Push rejected'))

      await expect(gitService.pushChanges()).rejects.toThrow('Push rejected')
    })
  })

  describe('createTag', () => {
    it('should create annotated tag', async () => {
      await gitService.createTag('v1.0.0', 'Release version 1.0.0')

      expect(mockGit.tag).toHaveBeenCalledWith([
        '-a',
        'v1.0.0',
        '-m',
        'Release version 1.0.0',
      ])
    })

    it('should create lightweight tag', async () => {
      await gitService.createTag('v1.0.0')

      expect(mockGit.tag).toHaveBeenCalledWith(['v1.0.0'])
    })

    it('should handle tag creation errors', async () => {
      mockGit.tag.mockRejectedValue(new Error('Tag already exists'))

      await expect(
        gitService.createTag('v1.0.0', 'Release')
      ).rejects.toThrow('Tag already exists')
    })
  })

  describe('getTagList', () => {
    it('should return list of tags', async () => {
      mockGit.raw.mockResolvedValue('v1.0.0\nv0.9.0\nv0.8.0')

      const tags = await gitService.getTagList()

      expect(tags).toEqual(['v1.0.0', 'v0.9.0', 'v0.8.0'])
      expect(mockGit.raw).toHaveBeenCalledWith(['tag', '-l', '--sort=-version:refname'])
    })

    it('should return empty array when no tags exist', async () => {
      mockGit.raw.mockResolvedValue('')

      const tags = await gitService.getTagList()

      expect(tags).toEqual([])
    })
  })

  describe('getCommitsSince', () => {
    it('should return commits since specific commit', async () => {
      mockGit.log.mockResolvedValue({
        all: [
          {
            hash: 'new123',
            message: 'feat: new feature',
            author_name: 'user1',
            date: '2024-01-02T10:00:00Z',
          },
        ],
        total: 1,
      } as any)

      const commits = await gitService.getCommitsSince('abc123')

      expect(commits).toHaveLength(1)
      expect(commits[0].hash).toBe('new123')
      expect(mockGit.log).toHaveBeenCalledWith({
        from: 'abc123',
        to: 'HEAD',
      })
    })

    it('should return commits since tag', async () => {
      await gitService.getCommitsSince('v1.0.0')

      expect(mockGit.log).toHaveBeenCalledWith({
        from: 'v1.0.0',
        to: 'HEAD',
      })
    })
  })

  describe('getDiffSummary', () => {
    it('should return diff summary between commits', async () => {
      mockGit.diff.mockResolvedValue(`
        file1.ts | 10 ++++++++++
        file2.ts | 5 -----
        2 files changed, 10 insertions(+), 5 deletions(-)
      `)

      const diff = await gitService.getDiffSummary('abc123', 'def456')

      expect(diff).toContain('2 files changed')
      expect(mockGit.diff).toHaveBeenCalledWith(['--stat', 'abc123..def456'])
    })

    it('should handle diff errors', async () => {
      mockGit.diff.mockRejectedValue(new Error('Invalid commit range'))

      await expect(
        gitService.getDiffSummary('invalid', 'commit')
      ).rejects.toThrow('Invalid commit range')
    })
  })

  describe('resetToCommit', () => {
    it('should perform soft reset', async () => {
      await gitService.resetToCommit('abc123', 'soft')

      expect(mockGit.reset).toHaveBeenCalledWith(['--soft', 'abc123'])
    })

    it('should perform hard reset', async () => {
      await gitService.resetToCommit('abc123', 'hard')

      expect(mockGit.reset).toHaveBeenCalledWith(['--hard', 'abc123'])
    })

    it('should default to mixed reset', async () => {
      await gitService.resetToCommit('abc123')

      expect(mockGit.reset).toHaveBeenCalledWith(['--mixed', 'abc123'])
    })
  })

  describe('cleanWorkingDirectory', () => {
    it('should clean untracked files', async () => {
      await gitService.cleanWorkingDirectory()

      expect(mockGit.clean).toHaveBeenCalledWith('f', ['-d'])
    })

    it('should clean with force and directories', async () => {
      await gitService.cleanWorkingDirectory(true, true)

      expect(mockGit.clean).toHaveBeenCalledWith('f', ['-d', '-x'])
    })
  })

  describe('isValidCommit', () => {
    it('should validate existing commit hash', async () => {
      mockGit.revparse.mockResolvedValue('abc123def456')

      const isValid = await gitService.isValidCommit('abc123')

      expect(isValid).toBe(true)
      expect(mockGit.revparse).toHaveBeenCalledWith(['--verify', 'abc123^{commit}'])
    })

    it('should return false for invalid commit', async () => {
      mockGit.revparse.mockRejectedValue(new Error('Invalid commit'))

      const isValid = await gitService.isValidCommit('invalid')

      expect(isValid).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should handle git not initialized', async () => {
      mockGit.status.mockRejectedValue(new Error('not a git repository'))

      await expect(gitService.getCurrentBranch()).rejects.toThrow(
        'not a git repository'
      )
    })

    it('should handle network errors during push/pull', async () => {
      mockGit.push.mockRejectedValue(new Error('Network unreachable'))

      await expect(gitService.pushChanges()).rejects.toThrow(
        'Network unreachable'
      )
    })

    it('should handle permission errors', async () => {
      mockGit.checkout.mockRejectedValue(new Error('Permission denied'))

      await expect(gitService.checkoutBranch('main')).rejects.toThrow(
        'Permission denied'
      )
    })
  })

  describe('performance', () => {
    it('should complete git operations within reasonable time', async () => {
      const startTime = Date.now()

      await gitService.getCurrentBranch()
      await gitService.hasUncommittedChanges()
      await gitService.getLatestCommit()

      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
    })
  })
})
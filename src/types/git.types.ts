/**
 * Git Operations Types
 * Type definitions for Git operations and data structures
 */

export interface GitCommitInfo {
  hash: string
  shortHash: string
  author: {
    name: string
    email: string
  }
  date: Date
  message: {
    subject: string
    body?: string
  }
  files?: string[]
  insertions?: number
  deletions?: number
}

export interface GitBranchInfo {
  name: string
  hash: string
  isCurrent: boolean
  isRemote: boolean
  lastCommitMessage: string
  remote?: string
  upstream?: string
  ahead?: number
  behind?: number
  lastCommit?: GitCommitInfo
}

export interface GitStatus {
  clean: boolean
  staged: string[]
  unstaged: string[]
  untracked: string[]
  conflicted: string[]
  branch?: string
  ahead?: number
  behind?: number
  modified?: string[]
  deleted?: string[]
  renamed?: string[]
}

export interface GitTagInfo {
  name: string
  hash: string
  date: Date
  message?: string
  author?: string
  email?: string
}

export interface GitRemoteInfo {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface GitDiffInfo {
  summary: string
  diff: string
  files: Array<{
    file: string
    additions: number
    deletions: number
    status?: 'added' | 'modified' | 'deleted' | 'renamed'
  }>
  totalAdditions?: number
  totalDeletions?: number
  patch?: string
}

export interface GitLogOptions {
  limit?: number
  since?: string
  until?: string
  author?: string
  grep?: string
  branch?: string
  oneline?: boolean
  graph?: boolean
  format?: string
}

export interface GitOperationResult {
  success: boolean
  message: string
  output?: string
  error?: string
  code?: number
}

export interface GitStashInfo {
  index: number
  message: string
  branch: string
  hash: string
  date: Date
}

export interface GitMergeResult extends GitOperationResult {
  conflicts?: string[]
  merged?: boolean
  fastForward?: boolean
}

export interface GitRebaseResult extends GitOperationResult {
  conflicts?: string[]
  completed?: boolean
  aborted?: boolean
}

export interface GitCloneOptions {
  branch?: string
  depth?: number
  recursive?: boolean
  bare?: boolean
  mirror?: boolean
}

export interface GitPushOptions {
  force?: boolean
  setUpstream?: boolean
  tags?: boolean
  followTags?: boolean
  dryRun?: boolean
}

export interface GitPullOptions {
  rebase?: boolean
  noCommit?: boolean
  squash?: boolean
  strategy?: string
}

export interface GitCommitOptions {
  amend?: boolean
  signOff?: boolean
  noVerify?: boolean
  allowEmpty?: boolean
  message?: string
}

export interface GitCheckoutOptions {
  createBranch?: boolean
  force?: boolean
  track?: boolean
  orphan?: boolean
}

export interface GitResetOptions {
  mode?: 'soft' | 'mixed' | 'hard'
  pathspec?: string[]
}

export interface GitConfigEntry {
  key: string
  value: string
  scope: 'local' | 'global' | 'system'
}

export type GitObjectType = 'commit' | 'tree' | 'blob' | 'tag'

export interface GitObject {
  hash: string
  type: GitObjectType
  size: number
}

export interface GitRefInfo {
  name: string
  hash: string
  type: 'branch' | 'tag' | 'remote'
}
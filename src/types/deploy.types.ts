/**
 * Deploy Configuration Types
 * Defines the structure for deployment configurations and results
 */

export type Environment = 'development' | 'qa' | 'production'
export type DeployStatus = 'success' | 'failed' | 'in_progress' | 'pending' | 'cancelled'
export type ReleaseTag = 'beta' | 'stable'

export interface DeployConfig {
  environment: Environment
  account: string
  workspace: string
  appName: string
  version?: string
  sourceBranch?: string
  autoInstall: boolean
  skipTests: boolean
  timeout: number
  requireApproval?: boolean
  notifyOnSuccess?: boolean
  notifyOnFailure?: boolean
  rollbackOnFailure?: boolean
}

export interface DeployResult {
  id: string
  status: DeployStatus
  version: string
  workspace: string
  environment: Environment
  startTime: Date
  endTime?: Date
  duration?: number
  logs: string[]
  error?: Error
  rollbackVersion?: string
  approvedBy?: string
  approvalTime?: Date
}

export interface RollbackConfig {
  targetVersion: string
  environment: Environment
  account: string
  workspace: string
  appName: string
  reason?: string
  skipValidation?: boolean
  timeout: number
}

export interface RollbackResult {
  success: boolean
  previousVersion: string
  currentVersion: string
  rollbackTime: Date
  duration: number
  affectedWorkspaces: string[]
  environment: Environment
  reason?: string
  logs: string[]
  error?: Error
}

export interface DeployMetrics {
  deployCount: number
  successRate: number
  averageDeployTime: number
  rollbackCount: number
  errorRate: number
  lastDeployTime?: Date
  totalDeployments: number
  failedDeployments: number
}

export interface DeployHistory {
  deployments: DeployResult[]
  rollbacks: RollbackResult[]
  totalCount: number
  successCount: number
  failureCount: number
  averageDuration: number
}

export interface ApprovalRequest {
  id: string
  deployId: string
  requestedBy: string
  requestedAt: Date
  environment: Environment
  version: string
  description?: string
  status: 'pending' | 'approved' | 'rejected'
  approvedBy?: string
  approvedAt?: Date
  rejectedBy?: string
  rejectedAt?: Date
  rejectionReason?: string
}

export interface DeploymentPlan {
  id: string
  environment: Environment
  steps: DeploymentStep[]
  estimatedDuration: number
  prerequisites: string[]
  risks: string[]
  rollbackPlan: string[]
}

export interface DeploymentStep {
  id: string
  name: string
  description: string
  command?: string
  timeout: number
  retryCount: number
  skipOnFailure: boolean
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startTime?: Date
  endTime?: Date
  logs: string[]
  error?: Error
}

export interface HealthCheck {
  name: string
  url?: string
  command?: string
  expectedStatus?: number
  expectedResponse?: string
  timeout: number
  retryCount: number
  interval: number
}

export interface DeploymentValidation {
  manifestValid: boolean
  dependenciesValid: boolean
  testsPass: boolean
  securityScanPass: boolean
  performanceTestsPass: boolean
  errors: string[]
  warnings: string[]
}
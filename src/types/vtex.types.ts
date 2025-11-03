/**
 * VTEX Platform Types
 * Defines the structure for VTEX IO platform interactions
 */

export interface VTEXConfig {
  account: string
  workspace: string
  authToken: string
  userEmail?: string
  timeout?: number
  retryAttempts?: number
  apiVersion?: string
  region?: string
}

export interface Workspace {
  name: string
  weight: number
  production: boolean
  lastModified: Date
  createdBy?: string
  description?: string
  apps: App[]
  status: 'active' | 'inactive' | 'promoting' | 'deleting'
}

export interface App {
  name: string
  vendor: string
  version: string
  status: 'installed' | 'installing' | 'failed' | 'uninstalling'
  workspace: string
  installedAt?: Date
  updatedAt?: Date
  size?: number
  dependencies: AppDependency[]
  settings?: Record<string, unknown>
}

export interface AppDependency {
  name: string
  vendor: string
  version: string
  required: boolean
}

export interface InstallResult {
  success: boolean
  app: string
  version: string
  workspace: string
  installTime: Date
  duration: number
  logs: string[]
  error?: Error
  warnings?: string[]
}

export interface PromoteResult {
  success: boolean
  workspace: string
  promotedAt: Date
  duration: number
  affectedApps: string[]
  logs: string[]
  error?: Error
}

export interface VTEXManifest {
  name: string
  vendor: string
  version: string
  title: string
  description: string
  defaultLocale?: string
  builders: Record<string, string>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  policies?: VTEXPolicy[]
  settingsSchema?: Record<string, unknown>
  credentialType?: string
  registries?: string[]
  billingOptions?: BillingOptions
}

export interface VTEXPolicy {
  name: string
  attrs?: Record<string, unknown>
}

export interface BillingOptions {
  type: 'free' | 'fixed' | 'calculated'
  availableCountries?: string[]
  setup?: {
    currency: string
    value: number
  }
  subscription?: {
    currency: string
    value: number
  }
}

export interface WorkspaceCreationOptions {
  name: string
  production?: boolean
  reset?: boolean
  promote?: boolean
  weight?: number
  description?: string
}

export interface AppInstallOptions {
  force?: boolean
  skipDependencies?: boolean
  registry?: string
  timeout?: number
  workspace?: string
}

export interface VTEXError {
  code: string
  message: string
  details?: Record<string, unknown>
  statusCode?: number
  timestamp: Date
}

export interface VTEXApiResponse<T = unknown> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string>
  timestamp: Date
}

export interface WorkspaceList {
  workspaces: Workspace[]
  total: number
  hasNext: boolean
  cursor?: string
}

export interface AppList {
  apps: App[]
  total: number
  installed: number
  available: number
}

export interface VTEXAccount {
  name: string
  id: string
  region: string
  tier: string
  status: 'active' | 'suspended' | 'inactive'
  createdAt: Date
  settings: AccountSettings
}

export interface AccountSettings {
  defaultWorkspace: string
  allowedWorkspaces: string[]
  maxWorkspaces: number
  features: string[]
  permissions: string[]
}

export interface VTEXRelease {
  version: string
  tag: 'beta' | 'stable'
  createdAt: Date
  createdBy: string
  changelog?: string
  assets: ReleaseAsset[]
  status: 'draft' | 'published' | 'deprecated'
}

export interface ReleaseAsset {
  name: string
  size: number
  downloadUrl: string
  checksum: string
}

export interface VTEXLogs {
  entries: LogEntry[]
  total: number
  hasNext: boolean
  cursor?: string
}

export interface LogEntry {
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source: string
  workspace?: string
  app?: string
  metadata?: Record<string, unknown>
}
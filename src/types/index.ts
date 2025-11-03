/**
 * Types Index
 * Central export point for all type definitions
 */

// Deploy Types
export * from './deploy.types'

// VTEX Types
export * from './vtex.types'

// Configuration Types
export * from './config.types'

// Validation Types
export * from './validation.types'

// Git Types
export * from './git.types'

// Common utility types
export type Nullable<T> = T | null
export type Optional<T> = T | undefined
export type Maybe<T> = T | null | undefined

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P]
}

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

export type Awaited<T> = T extends PromiseLike<infer U> ? U : T

export type NonEmptyArray<T> = [T, ...T[]]

export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never
}[keyof T]

export type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K
}[keyof T]

export type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never
}[keyof T]

export type PickByType<T, U> = Pick<T, KeysOfType<T, U>>

export type OmitByType<T, U> = Omit<T, KeysOfType<T, U>>

// API Response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: Date
  requestId?: string
}

// Pagination types
export interface PaginationParams {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

// Error types
export interface BaseError {
  code: string
  message: string
  details?: Record<string, unknown>
  timestamp: Date
  stack?: string
}

export interface ValidationErrorDetail extends BaseError {
  field: string
  value?: unknown
  constraint?: string
}

export interface NetworkError extends BaseError {
  statusCode?: number
  url?: string
  method?: string
}

// Event types
export interface BaseEvent {
  id: string
  type: string
  timestamp: Date
  source: string
  data: Record<string, unknown>
}

export interface DeploymentEvent extends BaseEvent {
  deploymentId: string
  environment: string
  status: string
}

// Audit types
export interface AuditLog {
  id: string
  userId: string
  action: string
  resource: string
  resourceId: string
  timestamp: Date
  metadata: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: Date
  checks: HealthCheck[]
  uptime: number
  version: string
}

export interface HealthCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  duration: number
  message?: string
  details?: Record<string, unknown>
}

// Metrics types
export interface Metric {
  name: string
  value: number
  unit: string
  timestamp: Date
  tags: Record<string, string>
}

export interface MetricSummary {
  name: string
  count: number
  sum: number
  min: number
  max: number
  avg: number
  percentiles: Record<string, number>
}
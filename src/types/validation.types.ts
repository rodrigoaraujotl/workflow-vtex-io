/**
 * Validation Types
 * Defines the structure for validation processes and results
 */

export interface ValidationResult {
  valid: boolean
  score: number
  errors: ValidationError[]
  warnings: ValidationWarning[]
  info: ValidationInfo[]
  executionTime: number
  timestamp: Date
  validatedBy: string
}

export interface ValidationError {
  code: string
  message: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  field?: string
  line?: number
  column?: number
  file?: string
  suggestion?: string
  documentation?: string
}

export interface ValidationWarning {
  code: string
  message: string
  field?: string
  line?: number
  column?: number
  file?: string
  suggestion?: string
  impact: 'low' | 'medium' | 'high'
}

export interface ValidationInfo {
  code: string
  message: string
  field?: string
  value?: unknown
  recommendation?: string
}

export interface ManifestValidation extends ValidationResult {
  manifest: {
    name: string
    vendor: string
    version: string
    valid: boolean
  }
  builders: BuilderValidation[]
  dependencies: DependencyValidation[]
  policies: PolicyValidation[]
  settings: SettingsValidation
}

export interface BuilderValidation {
  name: string
  version: string
  valid: boolean
  supported: boolean
  deprecated: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface DependencyValidation {
  name: string
  vendor: string
  version: string
  required: boolean
  available: boolean
  compatible: boolean
  deprecated: boolean
  security: SecurityValidation
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface PolicyValidation {
  name: string
  valid: boolean
  required: boolean
  deprecated: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface SettingsValidation {
  valid: boolean
  schema: SchemaValidation
  defaults: DefaultsValidation
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface SchemaValidation {
  valid: boolean
  properties: PropertyValidation[]
  required: string[]
  errors: ValidationError[]
}

export interface PropertyValidation {
  name: string
  type: string
  valid: boolean
  required: boolean
  hasDefault: boolean
  errors: ValidationError[]
}

export interface DefaultsValidation {
  valid: boolean
  properties: Record<string, unknown>
  errors: ValidationError[]
}

export interface SecurityValidation {
  passed: boolean
  vulnerabilities: Vulnerability[]
  score: number
  scanDate: Date
  scanner: string
  scanDuration: number
}

export interface Vulnerability {
  id: string
  title: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  cvss: number
  cwe?: string
  cve?: string
  package: string
  version: string
  fixedIn?: string
  publishedDate: Date
  modifiedDate?: Date
  references: string[]
}

export interface TestValidation extends ValidationResult {
  testSuite: string
  totalTests: number
  passedTests: number
  failedTests: number
  skippedTests: number
  coverage: TestCoverage
  results: TestResult[]
  performance: PerformanceMetrics
}

export interface TestResult {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  error?: string
  stackTrace?: string
  assertions: number
}

export interface TestCoverage {
  lines: CoverageMetric
  functions: CoverageMetric
  branches: CoverageMetric
  statements: CoverageMetric
}

export interface CoverageMetric {
  total: number
  covered: number
  percentage: number
}

export interface PerformanceMetrics {
  totalDuration: number
  averageTestDuration: number
  slowestTest: string
  slowestTestDuration: number
  memoryUsage: MemoryUsage
}

export interface MemoryUsage {
  peak: number
  average: number
  initial: number
  final: number
}

export interface CodeQualityValidation extends ValidationResult {
  linting: LintingResult
  formatting: FormattingResult
  complexity: ComplexityResult
  duplication: DuplicationResult
  maintainability: MaintainabilityResult
}

export interface LintingResult {
  passed: boolean
  totalIssues: number
  errors: number
  warnings: number
  fixableIssues: number
  rules: RuleResult[]
}

export interface RuleResult {
  rule: string
  severity: 'error' | 'warning' | 'info'
  occurrences: number
  fixable: boolean
}

export interface FormattingResult {
  passed: boolean
  totalFiles: number
  formattedFiles: number
  issues: FormattingIssue[]
}

export interface FormattingIssue {
  file: string
  line: number
  column: number
  message: string
  fixable: boolean
}

export interface ComplexityResult {
  passed: boolean
  averageComplexity: number
  maxComplexity: number
  threshold: number
  functions: FunctionComplexity[]
}

export interface FunctionComplexity {
  name: string
  file: string
  line: number
  complexity: number
  threshold: number
  passed: boolean
}

export interface DuplicationResult {
  passed: boolean
  duplicatedLines: number
  totalLines: number
  percentage: number
  threshold: number
  blocks: DuplicationBlock[]
}

export interface DuplicationBlock {
  lines: number
  tokens: number
  files: DuplicatedFile[]
}

export interface DuplicatedFile {
  file: string
  startLine: number
  endLine: number
}

export interface MaintainabilityResult {
  passed: boolean
  index: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  threshold: number
  factors: MaintainabilityFactor[]
}

export interface MaintainabilityFactor {
  name: string
  value: number
  weight: number
  impact: 'positive' | 'negative'
}

export interface ValidationConfig {
  manifest: ManifestValidationConfig
  security: SecurityValidationConfig
  tests: TestValidationConfig
  codeQuality: CodeQualityValidationConfig
  performance: PerformanceValidationConfig
}

export interface ManifestValidationConfig {
  enabled: boolean
  strictMode: boolean
  allowBetaBuilders: boolean
  allowDeprecatedDependencies: boolean
  requireDescription: boolean
  requirePolicies: boolean
}

export interface SecurityValidationConfig {
  enabled: boolean
  blockOnVulnerabilities: boolean
  allowedSeverities: string[]
  scanTimeout: number
  skipDevDependencies: boolean
  customRules: string[]
}

export interface TestValidationConfig {
  enabled: boolean
  requireTests: boolean
  minimumCoverage: number
  timeout: number
  parallel: boolean
  maxWorkers: number
}

export interface CodeQualityValidationConfig {
  enabled: boolean
  linting: LintingConfig
  formatting: FormattingConfig
  complexity: ComplexityConfig
  duplication: DuplicationConfig
}

export interface LintingConfig {
  enabled: boolean
  configFile: string
  failOnError: boolean
  failOnWarning: boolean
  autoFix: boolean
}

export interface FormattingConfig {
  enabled: boolean
  configFile: string
  checkOnly: boolean
  autoFix: boolean
}

export interface ComplexityConfig {
  enabled: boolean
  threshold: number
  failOnExceed: boolean
}

export interface DuplicationConfig {
  enabled: boolean
  threshold: number
  minLines: number
  minTokens: number
}

export interface PerformanceValidationConfig {
  enabled: boolean
  timeout: number
  memoryLimit: number
  cpuLimit: number
  benchmarks: BenchmarkConfig[]
}

export interface BenchmarkConfig {
  name: string
  threshold: number
  unit: 'ms' | 's' | 'mb' | 'gb'
  critical: boolean
}


export interface DependencyCheck {
  valid: boolean
  issues: string[]
  warnings: string[]
  checkedDependencies: Array<{
    name: string
    version: string
    status: 'compatible' | 'incompatible' | 'warning'
  }>
}

export interface SecurityScanResult {
  passed: boolean
  vulnerabilities: SecurityVulnerability[]
  summary: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
  scanDate?: Date
  scanDuration?: number
  scanner?: string
}

export interface SecurityVulnerability {
  id: string
  title: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  cvss: number
  cwe?: string
  cve?: string
  package: string
  version: string
  fixedIn?: string
  publishedDate: Date
  modifiedDate?: Date
  references: string[]
}
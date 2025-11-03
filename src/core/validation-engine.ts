import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as semver from 'semver'
import { Logger } from '../utils/logger'
import { 
  ValidationResult, 
  ValidationError,
  ValidationWarning,
  ManifestValidation, 
  SecurityScanResult, 
  TestResult,
  DependencyCheck,
  SecurityVulnerability
} from '../types/validation.types'
import { VTEXManifest } from '../types/vtex.types'

const execAsync = promisify(exec)

export class ValidationEngine {
  private logger: Logger
  private projectPath: string

  constructor(logger: Logger, projectPath: string = process.cwd()) {
    this.logger = logger
    this.projectPath = projectPath
  }

  /**
   * Validate VTEX app manifest
   */
  async validateManifest(): Promise<ManifestValidation> {
    try {
      this.logger.info('Validating VTEX manifest')
      
      const manifest = await this.getManifest()
      const errors: ValidationError[] = []
      const warnings: ValidationWarning[] = []

      // Required fields validation
      if (!manifest.name) {
        errors.push({
          code: 'MANIFEST_NAME_MISSING',
          message: 'Manifest must have a name field',
          severity: 'critical'
        })
      }

      if (!manifest.version) {
        errors.push({
          code: 'MANIFEST_VERSION_MISSING',
          message: 'Manifest must have a version field',
          severity: 'critical'
        })
      } else if (!semver.valid(manifest.version)) {
        errors.push({
          code: 'MANIFEST_VERSION_INVALID',
          message: `Invalid version format: ${manifest.version}`,
          severity: 'high'
        })
      }

      if (!manifest.vendor) {
        errors.push({
          code: 'MANIFEST_VENDOR_MISSING',
          message: 'Manifest must have a vendor field',
          severity: 'critical'
        })
      }

      // Builders validation
      if (manifest.builders) {
        for (const [builderName, builderVersion] of Object.entries(manifest.builders)) {
          if (!semver.validRange(builderVersion as string)) {
            errors.push({
              code: 'BUILDER_VERSION_INVALID',
              message: `Invalid builder version range: ${builderName}@${builderVersion}`,
              severity: 'high',
              field: `builders.${builderName}`
            })
          }
        }
      }

      // Dependencies validation
      if (manifest.dependencies) {
        for (const [depName, depVersion] of Object.entries(manifest.dependencies)) {
          if (!semver.validRange(depVersion as string)) {
            errors.push({
              code: 'DEPENDENCY_VERSION_INVALID',
              message: `Invalid dependency version range: ${depName}@${depVersion}`,
              severity: 'medium',
              field: `dependencies.${depName}`
            })
          }
        }
      }

      // Peer dependencies validation
      if (manifest.peerDependencies) {
        for (const [depName, depVersion] of Object.entries(manifest.peerDependencies)) {
          if (!semver.validRange(depVersion as string)) {
            warnings.push({
              code: 'PEER_DEPENDENCY_VERSION_INVALID',
              message: `Invalid peer dependency version range: ${depName}@${depVersion}`,
              field: `peerDependencies.${depName}`,
              impact: 'medium'
            })
          }
        }
      }

      const result: ManifestValidation = {
        valid: errors.length === 0,
        score: errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5)),
        errors,
        warnings,
        info: [],
        executionTime: 0,
        timestamp: new Date(),
        validatedBy: 'ValidationEngine',
        manifest: {
          name: manifest.name || '',
          vendor: manifest.vendor || '',
          version: manifest.version || '',
          valid: errors.length === 0
        },
        builders: [],
        dependencies: [],
        policies: [],
        settings: {
          valid: true,
          schema: { valid: true, properties: [], required: [], errors: [] },
          defaults: { valid: true, properties: {}, errors: [] },
          errors: [],
          warnings: []
        }
      }

      if (result.valid) {
        this.logger.info('Manifest validation passed')
      } else {
        this.logger.error('Manifest validation failed', { errors, warnings })
      }

      return result

    } catch (error) {
      this.logger.error('Manifest validation error', error as Error)
      return {
        valid: false,
        score: 0,
        errors: [{
          code: 'MANIFEST_VALIDATION_ERROR',
          message: `Failed to validate manifest: ${(error as Error).message}`,
          severity: 'critical'
        }],
        warnings: [],
        info: [],
        executionTime: 0,
        timestamp: new Date(),
        validatedBy: 'ValidationEngine',
        manifest: {
          name: '',
          vendor: '',
          version: '',
          valid: false
        },
        builders: [],
        dependencies: [],
        policies: [],
        settings: {
          valid: false,
          schema: { valid: false, properties: [], required: [], errors: [] },
          defaults: { valid: false, properties: {}, errors: [] },
          errors: [],
          warnings: []
        }
      }
    }
  }

  /**
   * Check dependencies compatibility
   */
  async checkDependencies(): Promise<DependencyCheck> {
    try {
      this.logger.info('Checking dependencies compatibility')
      
      const manifest = await this.getManifest()
      const issues: string[] = []
      const warnings: string[] = []

      if (!manifest.dependencies) {
        return {
          valid: true,
          issues: [],
          warnings: ['No dependencies found'],
          checkedDependencies: []
        }
      }

      const checkedDependencies: Array<{
        name: string
        version: string
        status: 'compatible' | 'incompatible' | 'warning'
      }> = []

      // Check each dependency
      for (const [depName, depVersion] of Object.entries(manifest.dependencies)) {
        try {
          // Check if dependency exists and is compatible
          const depStatus = await this.checkDependencyCompatibility(depName, depVersion)
          checkedDependencies.push({
            name: depName,
            version: depVersion,
            status: depStatus.compatible ? 'compatible' : 'incompatible'
          })

          if (!depStatus.compatible) {
            issues.push(`Dependency ${depName}@${depVersion} is incompatible: ${depStatus.reason}`)
          }

          if (depStatus.warning) {
            warnings.push(`Dependency ${depName}@${depVersion}: ${depStatus.warning}`)
          }

        } catch (error) {
          issues.push(`Failed to check dependency ${depName}: ${(error as Error).message}`)
          checkedDependencies.push({
            name: depName,
            version: depVersion,
            status: 'incompatible'
          })
        }
      }

      const result: DependencyCheck = {
        valid: issues.length === 0,
        issues,
        warnings,
        checkedDependencies
      }

      if (result.valid) {
        this.logger.info('Dependencies check passed')
      } else {
        this.logger.error('Dependencies check failed', { issues, warnings })
      }

      return result

    } catch (error) {
      this.logger.error('Dependencies check error', error as Error)
      return {
        valid: false,
        issues: [`Failed to check dependencies: ${(error as Error).message}`],
        warnings: [],
        checkedDependencies: []
      }
    }
  }

  /**
   * Run security scan
   */
  async securityScan(): Promise<SecurityScanResult> {
    try {
      this.logger.info('Running security scan')
      
      const vulnerabilities: SecurityVulnerability[] = []
      
      // Check for known vulnerable dependencies
      const auditResult = await this.runNpmAudit()
      vulnerabilities.push(...auditResult.vulnerabilities)

      // Check manifest for security issues
      const manifestSecurityIssues = await this.checkManifestSecurity()
      vulnerabilities.push(...manifestSecurityIssues)

      // Check for sensitive files
      const sensitiveFilesIssues = await this.checkSensitiveFiles()
      vulnerabilities.push(...sensitiveFilesIssues)

      const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length
      const highCount = vulnerabilities.filter(v => v.severity === 'high').length
      const mediumCount = vulnerabilities.filter(v => v.severity === 'medium').length
      const lowCount = vulnerabilities.filter(v => v.severity === 'low').length

      const result: SecurityScanResult = {
        passed: criticalCount === 0 && highCount === 0,
        vulnerabilities,
        summary: {
          total: vulnerabilities.length,
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: lowCount
        }
      }

      if (result.passed) {
        this.logger.info('Security scan passed', result.summary)
      } else {
        this.logger.warn('Security scan found issues', result.summary)
      }

      return result

    } catch (error) {
      this.logger.error('Security scan error', error as Error)
      return {
        passed: false,
        vulnerabilities: [{
          id: 'SCAN_ERROR',
          title: 'Security scan failed',
          description: `Failed to run security scan: ${(error as Error).message}`,
          severity: 'high',
          package: 'unknown',
          version: 'unknown',
          cvss: 0,
          publishedDate: new Date(),
          references: []
        }],
        summary: {
          total: 1,
          critical: 0,
          high: 1,
          medium: 0,
          low: 0
        }
      }
    }
  }

  /**
   * Run tests
   */
  async runTests(testType: 'unit' | 'integration' | 'all' = 'unit'): Promise<TestResult> {
    try {
      this.logger.info('Running tests', { testType })
      
      const results: TestResult[] = []

      let totalTests = 0
      let passedTests = 0
      let failedTests = 0
      let skippedTests = 0

      // Check if package.json has test scripts
      const packageJson = await this.getPackageJson()
      
      if (testType === 'unit' || testType === 'all') {
        if (packageJson.scripts?.test) {
          const unitResult = await this.runTestCommand('npm test')
          const testResult: TestResult = {
            name: unitResult.name,
            status: unitResult.status,
            duration: unitResult.duration,
            error: unitResult.error,
            assertions: 1
          }
          results.push(testResult)
          totalTests++
          if (unitResult.status === 'passed') passedTests++
          else if (unitResult.status === 'failed') failedTests++
          else skippedTests++
        } else {
          results.push({
            name: 'Unit Tests',
            status: 'skipped',
            duration: 0,
            error: 'No test script found in package.json',
            assertions: 0
          } as TestResult)
          totalTests++
          skippedTests++
        }
      }

      if (testType === 'integration' || testType === 'all') {
        if (packageJson.scripts?.['test:integration']) {
          const integrationResult = await this.runTestCommand('npm run test:integration')
          const testResult: TestResult = {
            name: integrationResult.name,
            status: integrationResult.status,
            duration: integrationResult.duration,
            error: integrationResult.error,
            assertions: 1
          }
          results.push(testResult)
          totalTests++
          if (integrationResult.status === 'passed') passedTests++
          else if (integrationResult.status === 'failed') failedTests++
          else skippedTests++
        } else {
          results.push({
            name: 'Integration Tests',
            status: 'skipped',
            duration: 0,
            error: 'No test:integration script found in package.json',
            assertions: 0
          } as TestResult)
          totalTests++
          skippedTests++
        }
      }

      // Return the first test result or a summary result
      if (results.length > 0) {
        const firstResult = results[0]
        if (firstResult) {
          return firstResult
        }
      }

      return {
        name: 'No Tests',
        status: 'skipped',
        duration: 0,
        error: 'No tests configured',
        assertions: 0
      }

    } catch (error) {
      this.logger.error('Test execution error', error as Error)
      return {
        name: 'Test Execution',
        status: 'failed',
        duration: 0,
        error: `Failed to run tests: ${(error as Error).message}`,
        assertions: 0
      }
    }
  }

  /**
   * Run smoke tests
   */
  async runSmokeTests(): Promise<TestResult> {
    try {
      this.logger.info('Running smoke tests')
      
      // Basic smoke tests
      const smokeTests = [
        { name: 'Manifest Validation', test: () => this.validateManifest() },
        { name: 'Dependencies Check', test: () => this.checkDependencies() },
        { name: 'Build Validation', test: () => this.validateBuild() }
      ]

      let passedTests = 0
      let failedTests = 0

      for (const smokeTest of smokeTests) {
        try {
          const result = await smokeTest.test()
          
          if ('valid' in result && result.valid) {
            passedTests++
          } else {
            failedTests++
          }
        } catch (error) {
          failedTests++
        }
      }

      return {
        name: 'Smoke Tests',
        status: failedTests === 0 ? 'passed' : 'failed',
        duration: 0,
        error: failedTests > 0 ? `${failedTests} smoke tests failed` : undefined,
        assertions: smokeTests.length
      }

    } catch (error) {
      this.logger.error('Smoke tests error', error as Error)
      return {
        name: 'Smoke Tests',
        status: 'failed',
        duration: 0,
        error: `Failed to run smoke tests: ${(error as Error).message}`,
        assertions: 0
      }
    }
  }

  /**
   * Validate production readiness
   */
  async validateProductionReadiness(): Promise<ValidationResult> {
    try {
      this.logger.info('Validating production readiness')
      
      const errors: string[] = []
      const warnings: string[] = []

      // Check manifest
      const manifestResult = await this.validateManifest()
      if (!manifestResult.valid) {
        errors.push(...manifestResult.errors.map(e => e.message))
      }
      warnings.push(...manifestResult.warnings.map(w => w.message))

      // Check dependencies
      const depsResult = await this.checkDependencies()
      if (!depsResult.valid) {
        errors.push(...depsResult.issues)
      }
      warnings.push(...depsResult.warnings)

      // Check security
      const securityResult = await this.securityScan()
      if (!securityResult.passed) {
        const criticalVulns = securityResult.vulnerabilities.filter(v => v.severity === 'critical')
        const highVulns = securityResult.vulnerabilities.filter(v => v.severity === 'high')
        
        if (criticalVulns.length > 0) {
          errors.push(`${criticalVulns.length} critical security vulnerabilities found`)
        }
        
        if (highVulns.length > 0) {
          warnings.push(`${highVulns.length} high severity security vulnerabilities found`)
        }
      }

      // Check for production-specific requirements
      const manifest = await this.getManifest()
      
      if (!manifest.policies || manifest.policies.length === 0) {
        warnings.push('No policies defined - consider adding security policies for production')
      }

      if (manifest.builders?.['node'] && !manifest.builders['node'].includes('18.x')) {
        warnings.push('Consider using Node.js 18.x for better performance and security')
      }

      const result: ValidationResult = {
        valid: errors.length === 0,
        score: errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5)),
        errors: errors.map(e => ({
          code: 'PRODUCTION_READINESS',
          message: e,
          severity: 'high' as const
        })),
        warnings: warnings.map(w => ({
          code: 'PRODUCTION_WARNING',
          message: w,
          field: undefined,
          impact: 'medium' as const
        })),
        info: [],
        executionTime: 0,
        timestamp: new Date(),
        validatedBy: 'ValidationEngine'
      }

      if (result.valid) {
        this.logger.info('Production readiness validation passed')
      } else {
        this.logger.error('Production readiness validation failed', { errors, warnings })
      }

      return result

    } catch (error) {
      this.logger.error('Production readiness validation error', error as Error)
      return {
        valid: false,
        score: 0,
        errors: [{
          code: 'PRODUCTION_VALIDATION_ERROR',
          message: `Failed to validate production readiness: ${(error as Error).message}`,
          severity: 'critical' as const
        }],
        warnings: [],
        info: [],
        executionTime: 0,
        timestamp: new Date(),
        validatedBy: 'ValidationEngine'
      }
    }
  }

  /**
   * Check security compliance
   */
  async checkSecurityCompliance(): Promise<ValidationResult> {
    try {
      this.logger.info('Checking security compliance')
      
      const errors: string[] = []
      const warnings: string[] = []

      // Run security scan
      const securityResult = await this.securityScan()
      
      // Critical and high vulnerabilities are errors
      const criticalVulns = securityResult.vulnerabilities.filter(v => v.severity === 'critical')
      const highVulns = securityResult.vulnerabilities.filter(v => v.severity === 'high')
      const mediumVulns = securityResult.vulnerabilities.filter(v => v.severity === 'medium')

      if (criticalVulns.length > 0) {
        errors.push(`${criticalVulns.length} critical security vulnerabilities must be fixed`)
      }

      if (highVulns.length > 0) {
        errors.push(`${highVulns.length} high severity security vulnerabilities must be fixed`)
      }

      if (mediumVulns.length > 0) {
        warnings.push(`${mediumVulns.length} medium severity security vulnerabilities should be reviewed`)
      }

      // Check for security best practices
      const manifest = await this.getManifest()
      
      if (!manifest.policies) {
        warnings.push('No security policies defined')
      }

      // Check for sensitive data in manifest
      const manifestStr = JSON.stringify(manifest, null, 2)
      if (manifestStr.includes('password') || manifestStr.includes('secret') || manifestStr.includes('key')) {
        errors.push('Potential sensitive data found in manifest')
      }

      const result: ValidationResult = {
        valid: errors.length === 0,
        score: errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5)),
        errors: errors.map(e => ({
          code: 'SECURITY_COMPLIANCE',
          message: e,
          severity: 'high' as const
        })),
        warnings: warnings.map(w => ({
          code: 'SECURITY_WARNING',
          message: w,
          field: undefined,
          impact: 'medium' as const
        })),
        info: [],
        executionTime: 0,
        timestamp: new Date(),
        validatedBy: 'ValidationEngine'
      }

      if (result.valid) {
        this.logger.info('Security compliance check passed')
      } else {
        this.logger.error('Security compliance check failed', { errors, warnings })
      }

      return result

    } catch (error) {
      this.logger.error('Security compliance check error', error as Error)
      return {
        valid: false,
        score: 0,
        errors: [{
          code: 'SECURITY_COMPLIANCE_ERROR',
          message: `Failed to check security compliance: ${(error as Error).message}`,
          severity: 'critical' as const
        }],
        warnings: [],
        info: [],
        executionTime: 0,
        timestamp: new Date(),
        validatedBy: 'ValidationEngine'
      }
    }
  }

  /**
   * Get VTEX manifest
   */
  async getManifest(): Promise<VTEXManifest> {
    try {
      const manifestPath = join(this.projectPath, 'manifest.json')
      const manifestContent = await fs.readFile(manifestPath, 'utf-8')
      return JSON.parse(manifestContent) as VTEXManifest
    } catch (error) {
      throw new Error(`Failed to read manifest.json: ${(error as Error).message}`)
    }
  }

  // Private helper methods

  private async getPackageJson(): Promise<any> {
    try {
      const packagePath = join(this.projectPath, 'package.json')
      const packageContent = await fs.readFile(packagePath, 'utf-8')
      return JSON.parse(packageContent)
    } catch (error) {
      return { scripts: {} }
    }
  }

  private async checkDependencyCompatibility(name: string, version: string): Promise<{
    compatible: boolean
    reason?: string
    warning?: string
  }> {
    // This is a simplified implementation
    // In a real system, this would check against VTEX's compatibility matrix
    
    // Check for known incompatible versions
    const incompatibleDeps = {
      'vtex.render-runtime': {
        incompatible: ['<8.0.0'],
        reason: 'Versions below 8.0.0 have security vulnerabilities'
      }
    }

    const incompatible = incompatibleDeps[name as keyof typeof incompatibleDeps]
    if (incompatible) {
      for (const incompatibleVersion of incompatible.incompatible) {
        if (semver.satisfies('1.0.0', incompatibleVersion)) { // Simplified check
          return {
            compatible: false,
            reason: incompatible.reason
          }
        }
      }
    }

    return { compatible: true }
  }

  private async runNpmAudit(): Promise<{ vulnerabilities: SecurityVulnerability[] }> {
    try {
      const { stdout } = await execAsync('npm audit --json', { cwd: this.projectPath })
      const auditResult = JSON.parse(stdout)
      
      const vulnerabilities: SecurityVulnerability[] = []
      
      if (auditResult.vulnerabilities) {
        for (const [name, vuln] of Object.entries(auditResult.vulnerabilities)) {
          const v = vuln as any
          vulnerabilities.push({
            id: v.id || `npm-${name}`,
            title: v.title || `Vulnerability in ${name}`,
            description: v.overview || 'No description available',
            severity: v.severity || 'medium',
            package: name,
            version: v.range || 'unknown',
            cvss: v.cvss || 0,
            publishedDate: v.publishedDate ? new Date(v.publishedDate) : new Date(),
            references: v.references || []
          })
        }
      }

      return { vulnerabilities }
    } catch (error) {
      // npm audit might fail if no package.json or no vulnerabilities
      return { vulnerabilities: [] }
    }
  }

  private async checkManifestSecurity(): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = []
    
    try {
      const manifest = await this.getManifest()
      
      // Check for overly permissive policies
      if (manifest.policies) {
        for (const policy of manifest.policies) {
          if (policy.name === 'outbound-access' && policy.attrs?.host === '*') {
            vulnerabilities.push({
              id: 'OVERLY_PERMISSIVE_OUTBOUND',
              title: 'Overly permissive outbound access',
              description: 'Outbound access policy allows access to all hosts',
              severity: 'medium',
              package: manifest.name,
              version: manifest.version,
              cvss: 5.0,
              publishedDate: new Date(),
              references: []
            })
          }
        }
      }

      // Check for debug configurations in production
      if (manifest.builders?.node && JSON.stringify(manifest.builders.node).includes('debug')) {
        vulnerabilities.push({
          id: 'DEBUG_IN_PRODUCTION',
          title: 'Debug configuration in production',
          description: 'Debug settings should not be enabled in production builds',
          severity: 'low',
          package: manifest.name,
          version: manifest.version,
          cvss: 2.0,
          publishedDate: new Date(),
          references: []
        })
      }

    } catch (error) {
      // Manifest issues will be caught by manifest validation
    }

    return vulnerabilities
  }

  private async checkSensitiveFiles(): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = []
    const sensitiveFiles = ['.env', '.env.local', '.env.production', 'config/secrets.json']
    
    for (const file of sensitiveFiles) {
      try {
        const filePath = join(this.projectPath, file)
        await fs.access(filePath)
        
        vulnerabilities.push({
          id: `SENSITIVE_FILE_${file.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`,
          title: `Sensitive file found: ${file}`,
          description: `Sensitive file ${file} should not be committed to version control`,
          severity: 'medium',
          package: 'project',
          version: 'unknown',
          cvss: 4.0,
          publishedDate: new Date(),
          references: []
        })
      } catch {
        // File doesn't exist, which is good
      }
    }

    return vulnerabilities
  }

  private async runTestCommand(command: string): Promise<{
    name: string
    status: 'passed' | 'failed' | 'skipped'
    duration: number
    error?: string
  }> {
    const startTime = Date.now()
    
    try {
      await execAsync(command, { cwd: this.projectPath, timeout: 300000 }) // 5 minutes timeout
      
      return {
        name: command,
        status: 'passed',
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        name: command,
        status: 'failed',
        duration: Date.now() - startTime,
        error: (error as Error).message
      }
    }
  }

  private async validateBuild(): Promise<ValidationResult> {
    try {
      // Check if build files exist
      const buildDirs = ['build', 'dist', 'public']
      let buildDirExists = false

      for (const dir of buildDirs) {
        try {
          const dirPath = join(this.projectPath, dir)
          await fs.access(dirPath)
          buildDirExists = true
          break
        } catch {
          // Directory doesn't exist
        }
      }

      if (!buildDirExists) {
        return {
          valid: false,
          score: 0,
          errors: [{
            code: 'NO_BUILD_DIR',
            message: 'No build directory found. Run build process first.',
            severity: 'high'
          }],
          warnings: [],
          info: [],
          executionTime: 0,
          timestamp: new Date(),
          validatedBy: 'validation-engine'
        }
      }

      return {
        valid: true,
        score: 100,
        errors: [],
        warnings: [],
        info: [],
        executionTime: 0,
        timestamp: new Date(),
        validatedBy: 'validation-engine'
      }
    } catch (error) {
      return {
        valid: false,
        score: 0,
        errors: [{
          code: 'BUILD_VALIDATION_ERROR',
          message: `Build validation failed: ${(error as Error).message}`,
          severity: 'high'
        }],
        warnings: [],
        info: [],
        executionTime: 0,
        timestamp: new Date(),
        validatedBy: 'validation-engine'
      }
    }
  }
}
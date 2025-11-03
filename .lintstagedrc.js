module.exports = {
  // TypeScript and JavaScript files
  '*.{ts,tsx,js,jsx}': [
    // Format with Prettier
    'prettier --write',
    
    // Lint with ESLint and auto-fix
    'eslint --fix --max-warnings=0',
    
    // Type check (only for TypeScript files)
    () => 'tsc --noEmit',
    
    // Run tests for changed files
    'jest --bail --findRelatedTests --passWithNoTests',
  ],
  
  // JSON files
  '*.json': [
    'prettier --write',
    
    // Validate JSON syntax
    'node -e "JSON.parse(require(\'fs\').readFileSync(process.argv[1], \'utf8\'))"',
  ],
  
  // Markdown files
  '*.{md,mdx}': [
    'prettier --write',
    
    // Lint markdown (if markdownlint is available)
    'markdownlint --fix || true',
  ],
  
  // YAML files
  '*.{yml,yaml}': [
    'prettier --write',
    
    // Validate YAML syntax
    'node -e "require(\'js-yaml\').load(require(\'fs\').readFileSync(process.argv[1], \'utf8\'))" || true',
  ],
  
  // Package.json specific checks
  'package.json': [
    'prettier --write',
    
    // Sort package.json
    'npx sort-package-json',
    
    // Validate package.json
    'npm pkg fix',
  ],
  
  // Docker files
  '{Dockerfile,Dockerfile.*,*.dockerfile}': [
    // Lint Dockerfile (if hadolint is available)
    'hadolint || true',
  ],
  
  // Shell scripts
  '*.{sh,bash}': [
    // Check shell script syntax
    'bash -n',
    
    // Lint shell scripts (if shellcheck is available)
    'shellcheck || true',
  ],
  
  // CSS/SCSS files
  '*.{css,scss,sass}': [
    'prettier --write',
    
    // Lint CSS (if stylelint is available)
    'stylelint --fix || true',
  ],
  
  // Configuration files
  '*.{eslintrc,prettierrc,commitlintrc}.{js,json,yml,yaml}': [
    'prettier --write',
  ],
  
  // GitHub Actions workflows
  '.github/workflows/*.{yml,yaml}': [
    'prettier --write',
    
    // Validate GitHub Actions syntax (if actionlint is available)
    'actionlint || true',
  ],
  
  // Environment files
  '.env*': [
    // Check for common security issues in env files
    'node -e "const content = require(\'fs\').readFileSync(process.argv[1], \'utf8\'); if (content.includes(\'password=123\') || content.includes(\'secret=test\')) { console.error(\'Potential security issue in env file\'); process.exit(1); }"',
  ],
  
  // All files - security and general checks
  '*': [
    // Check for secrets (if gitleaks is available)
    'gitleaks detect --source . --no-git || true',
    
    // Check file size (prevent large files)
    'node -e "const fs = require(\'fs\'); const stats = fs.statSync(process.argv[1]); if (stats.size > 1024 * 1024) { console.error(\'File too large:\', process.argv[1]); process.exit(1); }"',
    
    // Check for common issues
    'node -e "const content = require(\'fs\').readFileSync(process.argv[1], \'utf8\'); if (content.includes(\'console.log\') && process.argv[1].includes(\'src/\')) { console.warn(\'Warning: console.log found in source file:\', process.argv[1]); }"',
  ],
}

// Additional configuration for specific scenarios
const config = {
  // Concurrent execution
  concurrent: true,
  
  // Continue on error for non-critical checks
  continueOnError: false,
  
  // Glob options
  globOptions: {
    matchBase: true,
    dot: true,
  },
  
  // Ignore patterns
  ignore: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.git/**',
    '**/.husky/_/**',
    '**/logs/**',
    '**/*.log',
    '**/tmp/**',
    '**/.cache/**',
  ],
}

// Export the configuration
module.exports = {
  ...module.exports,
  ...config,
}
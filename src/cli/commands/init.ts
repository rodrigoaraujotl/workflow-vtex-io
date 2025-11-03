import { Command } from 'commander'
import chalk from 'chalk'
import inquirer from 'inquirer'
import * as ora from 'ora'
import fs from 'fs/promises'
import path from 'path'
import { Logger } from '../../utils/logger'
import { ConfigManager } from '../../core/config-manager'
import { GitOperations } from '../../core/git-operations'

const logger = new Logger({
  level: 'info',
  format: 'text',
  auditEnabled: false,
  retentionDays: 7,
  maxFileSize: '10MB',
  maxFiles: 5
})

export const initCommand = new Command('init')
  .description('Initialize VTEX IO deployment system in current project')
  .option('--force', 'Force initialization even if already initialized')
  .option('--template <template>', 'Use project template (basic|vtex-app|vtex-store)', 'basic')
  .option('--skip-git', 'Skip Git repository initialization')
  .option('--skip-config', 'Skip configuration setup')
  .option('--skip-validation', 'Skip initial validation')
  .action(async (options) => {
    const spinner = ora.default()
    
    try {
      console.log(chalk.blue('\n🚀 VTEX IO Deployment System Initialization'))
      console.log(chalk.blue('============================================'))
      
      // Check if already initialized
      if (!options.force) {
        const isInitialized = await checkIfInitialized()
        if (isInitialized) {
          const { proceed } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'proceed',
              message: 'Project appears to be already initialized. Continue anyway?',
              default: false
            }
          ])
          
          if (!proceed) {
            console.log(chalk.yellow('Initialization cancelled'))
            return
          }
        }
      }
      
      // Project information
      const projectInfo = await gatherProjectInfo()
      
      // Initialize Git repository
      if (!options.skipGit) {
        await initializeGitRepository(spinner)
      }
      
      // Create project structure
      await createProjectStructure(spinner, options.template, projectInfo)
      
      // Initialize configuration
      if (!options.skipConfig) {
        await initializeConfiguration(spinner, projectInfo)
      }
      
      // Validate setup
      if (!options.skipValidation) {
        await validateInitialization(spinner)
      }
      
      // Show completion message
      showCompletionMessage(projectInfo)
      
    } catch (error) {
      spinner.fail('Initialization failed')
      logger.error('Failed to initialize project', error as Error)
      console.log(chalk.red(`\n💥 Error: ${(error as Error).message}`))
      process.exit(1)
    }
  })

async function checkIfInitialized(): Promise<boolean> {
  try {
    // Check for configuration file
    const configManager = new ConfigManager()
    const configExists = await configManager.configExists()
    
    // Check for VTEX manifest
    const manifestExists = await fs.access('manifest.json').then(() => true).catch(() => false)
    
    // Check for deployment scripts
    const packageJsonExists = await fs.access('package.json').then(() => true).catch(() => false)
    
    return configExists || manifestExists || packageJsonExists
  } catch {
    return false
  }
}

async function gatherProjectInfo(): Promise<any> {
  console.log(chalk.cyan('\nProject Information:'))
  
  return await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Project name:',
      default: path.basename(process.cwd()),
      validate: (input) => {
        const nameRegex = /^[a-z0-9-]+$/
        return nameRegex.test(input) || 'Project name must contain only lowercase letters, numbers, and hyphens'
      }
    },
    {
      type: 'input',
      name: 'description',
      message: 'Project description:',
      default: 'VTEX IO application'
    },
    {
      type: 'input',
      name: 'version',
      message: 'Initial version:',
      default: '0.1.0',
      validate: (input) => {
        const versionRegex = /^\d+\.\d+\.\d+$/
        return versionRegex.test(input) || 'Version must follow semantic versioning (e.g., 1.0.0)'
      }
    },
    {
      type: 'input',
      name: 'vendor',
      message: 'Vendor name:',
      validate: (input) => input.length > 0 || 'Vendor name is required'
    },
    {
      type: 'list',
      name: 'type',
      message: 'Project type:',
      choices: [
        { name: 'React App', value: 'react' },
        { name: 'Node Service', value: 'node' },
        { name: 'Store Theme', value: 'store-theme' },
        { name: 'Pixel App', value: 'pixel' },
        { name: 'Admin App', value: 'admin' }
      ],
      default: 'react'
    },
    {
      type: 'input',
      name: 'vtexAccount',
      message: 'VTEX Account:',
      validate: (input) => input.length > 0 || 'VTEX Account is required'
    },
    {
      type: 'input',
      name: 'userEmail',
      message: 'Your email:',
      validate: (input) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(input) || 'Please enter a valid email'
      }
    }
  ])
}

async function initializeGitRepository(spinner: ora.Ora): Promise<void> {
  spinner.start('Initializing Git repository...')
  
  try {
    const gitOps = new GitOperations(logger)
    
    // Check if already a Git repository
    const isGitRepo = await gitOps.isGitRepository()
    
    if (!isGitRepo) {
      await gitOps.init()
      
      // Create .gitignore
      const gitignoreContent = `
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build outputs
dist/
build/
*.tgz

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# VTEX
.vtex/

# Logs
logs/
*.log

# Coverage
coverage/

# Temporary files
tmp/
temp/
`.trim()
      
      await fs.writeFile('.gitignore', gitignoreContent, 'utf8')
      
      spinner.succeed('Git repository initialized')
    } else {
      spinner.succeed('Git repository already exists')
    }
  } catch (error) {
    spinner.fail('Failed to initialize Git repository')
    throw error
  }
}

async function createProjectStructure(spinner: ora.Ora, template: string, projectInfo: any): Promise<void> {
  spinner.start('Creating project structure...')
  
  try {
    // Create directories
    const directories = [
      'src',
      'tests',
      'docs',
      '.vtex',
      'scripts'
    ]
    
    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true })
    }
    
    // Create manifest.json
    await createManifest(projectInfo)
    
    // Create package.json
    await createPackageJson(projectInfo, template)
    
    // Create deployment scripts
    await createDeploymentScripts()
    
    // Create README
    await createReadme(projectInfo)
    
    // Create template-specific files
    await createTemplateFiles(template, projectInfo)
    
    spinner.succeed('Project structure created')
  } catch (error) {
    spinner.fail('Failed to create project structure')
    throw error
  }
}

async function createManifest(projectInfo: any): Promise<void> {
  const manifest = {
    vendor: projectInfo.vendor,
    name: projectInfo.name,
    version: projectInfo.version,
    title: projectInfo.name,
    description: projectInfo.description,
    builders: getBuilders(projectInfo.type),
    dependencies: getDependencies(projectInfo.type),
    peerDependencies: getPeerDependencies(projectInfo.type),
    policies: getPolicies(projectInfo.type),
    billingOptions: {
      termsURL: "",
      support: {
        url: ""
      },
      free: true,
      type: "free",
      availableCountries: ["*"]
    }
  }
  
  await fs.writeFile('manifest.json', JSON.stringify(manifest, null, 2), 'utf8')
}

async function createPackageJson(projectInfo: any, template: string): Promise<void> {
  const packageJson = {
    name: projectInfo.name,
    version: projectInfo.version,
    description: projectInfo.description,
    main: "index.js",
    scripts: {
      "build": "vtex build",
      "test": "jest",
      "lint": "eslint src/",
      "deploy:qa": "vtex-deploy deploy:qa",
      "deploy:prod": "vtex-deploy deploy:prod",
      "status": "vtex-deploy status",
      "rollback": "vtex-deploy rollback"
    },
    dependencies: getPackageDependencies(template),
    devDependencies: getPackageDevDependencies(template),
    keywords: ["vtex", "vtex-io", projectInfo.type],
    author: projectInfo.userEmail,
    license: "MIT"
  }
  
  await fs.writeFile('package.json', JSON.stringify(packageJson, null, 2), 'utf8')
}

async function createDeploymentScripts(): Promise<void> {
  // Create deployment script
  const deployScript = `#!/bin/bash

# VTEX IO Deployment Script
# This script provides shortcuts for common deployment operations

set -e

case "$1" in
  "qa")
    echo "🚀 Deploying to QA..."
    vtex-deploy deploy:qa
    ;;
  "prod")
    echo "🚀 Deploying to Production..."
    vtex-deploy deploy:prod
    ;;
  "status")
    echo "📊 Checking deployment status..."
    vtex-deploy status
    ;;
  "rollback")
    echo "🔄 Rolling back deployment..."
    vtex-deploy rollback
    ;;
  *)
    echo "Usage: $0 {qa|prod|status|rollback}"
    exit 1
    ;;
esac
`
  
  await fs.writeFile('scripts/deploy.sh', deployScript, 'utf8')
  await fs.chmod('scripts/deploy.sh', 0o755)
  
  // Create CI/CD workflow
  await fs.mkdir('.github/workflows', { recursive: true })
  
  const workflow = `name: VTEX IO Deployment

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    - run: npm ci
    - run: npm test
    - run: npm run lint

  deploy-qa:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    steps:
    - uses: actions/checkout@v3
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    - run: npm ci
    - name: Deploy to QA
      run: npm run deploy:qa
      env:
        VTEX_AUTH_TOKEN: \${{ secrets.VTEX_AUTH_TOKEN }}

  deploy-prod:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - uses: actions/checkout@v3
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    - run: npm ci
    - name: Deploy to Production
      run: npm run deploy:prod
      env:
        VTEX_AUTH_TOKEN: \${{ secrets.VTEX_AUTH_TOKEN }}
`
  
  await fs.writeFile('.github/workflows/deploy.yml', workflow, 'utf8')
}

async function createReadme(projectInfo: any): Promise<void> {
  const readme = `# ${projectInfo.name}

${projectInfo.description}

## Getting Started

This project uses the VTEX IO Deployment System for automated deployments.

### Prerequisites

- Node.js 18+
- VTEX CLI
- Git

### Installation

1. Clone the repository
2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Initialize the deployment system:
   \`\`\`bash
   npx vtex-deploy init
   \`\`\`

### Configuration

Configure your VTEX account and deployment settings:

\`\`\`bash
npx vtex-deploy config init
\`\`\`

### Deployment

#### QA Deployment
\`\`\`bash
npm run deploy:qa
\`\`\`

#### Production Deployment
\`\`\`bash
npm run deploy:prod
\`\`\`

#### Check Status
\`\`\`bash
npm run status
\`\`\`

#### Rollback
\`\`\`bash
npm run rollback
\`\`\`

### Development

1. Create a new branch for your feature
2. Make your changes
3. Test locally
4. Push to QA for testing
5. Create a pull request for production deployment

### Project Structure

\`\`\`
${projectInfo.name}/
├── src/                 # Source code
├── tests/              # Test files
├── docs/               # Documentation
├── scripts/            # Deployment scripts
├── .vtex/              # VTEX configuration
├── manifest.json       # VTEX app manifest
├── package.json        # Node.js dependencies
└── README.md          # This file
\`\`\`

### Commands

- \`npm run build\` - Build the application
- \`npm test\` - Run tests
- \`npm run lint\` - Run linter
- \`npm run deploy:qa\` - Deploy to QA environment
- \`npm run deploy:prod\` - Deploy to production
- \`npm run status\` - Check deployment status
- \`npm run rollback\` - Rollback deployment

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### License

MIT License - see LICENSE file for details
`
  
  await fs.writeFile('README.md', readme, 'utf8')
}

async function createTemplateFiles(template: string, projectInfo: any): Promise<void> {
  switch (template) {
    case 'vtex-app':
      await createVTEXAppFiles(projectInfo)
      break
    case 'vtex-store':
      await createVTEXStoreFiles(projectInfo)
      break
    default:
      await createBasicFiles(projectInfo)
  }
}

async function createBasicFiles(projectInfo: any): Promise<void> {
  // Create basic TypeScript config
  const tsConfig = {
    compilerOptions: {
      target: "es2020",
      module: "commonjs",
      lib: ["es2020"],
      outDir: "./dist",
      rootDir: "./src",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist", "tests"]
  }
  
  await fs.writeFile('tsconfig.json', JSON.stringify(tsConfig, null, 2), 'utf8')
  
  // Create basic source file
  const indexContent = `// ${projectInfo.name}
// ${projectInfo.description}

export function main() {
  console.log('Hello from ${projectInfo.name}!')
}

if (require.main === module) {
  main()
}
`
  
  await fs.writeFile('src/index.ts', indexContent, 'utf8')
}

async function createVTEXAppFiles(projectInfo: any): Promise<void> {
  await createBasicFiles(projectInfo)
  
  // Create React component
  const componentContent = `import React from 'react'

interface Props {
  title?: string
}

const ${projectInfo.name.replace(/-/g, '')}Component: React.FC<Props> = ({ title = 'Hello VTEX!' }) => {
  return (
    <div>
      <h1>{title}</h1>
      <p>Welcome to ${projectInfo.name}</p>
    </div>
  )
}

export default ${projectInfo.name.replace(/-/g, '')}Component
`
  
  await fs.writeFile(`src/${projectInfo.name}.tsx`, componentContent, 'utf8')
}

async function createVTEXStoreFiles(projectInfo: any): Promise<void> {
  await createBasicFiles(projectInfo)
  
  // Create store configuration
  const storeConfig = {
    "store": {
      "blocks": {
        "header": {
          "children": ["header-layout.desktop", "header-layout.mobile"]
        }
      }
    }
  }
  
  await fs.mkdir('store', { recursive: true })
  await fs.writeFile('store/blocks.json', JSON.stringify(storeConfig, null, 2), 'utf8')
}

async function initializeConfiguration(spinner: ora.Ora, projectInfo: any): Promise<void> {
  spinner.start('Initializing configuration...')
  
  try {
    const configManager = new ConfigManager()
    
    const config = {
      vtex: {
        account: projectInfo.vtexAccount,
        workspace: 'master',
        userEmail: projectInfo.userEmail,
        authToken: '',
        timeout: 30000,
        retryAttempts: 3,
        apiVersion: 'v1',
        region: 'aws-us-east-1'
      },
      notifications: {
        enabled: false
      },
      deployment: {
        autoRollback: true,
        rollbackTimeout: 5,
        requireApproval: true,
        maxConcurrentDeployments: 1,
        defaultBranch: 'main'
      }
    }
    
    await configManager.saveConfig(config)
    
    spinner.succeed('Configuration initialized')
  } catch (error) {
    spinner.fail('Failed to initialize configuration')
    throw error
  }
}

async function validateInitialization(spinner: ora.Ora): Promise<void> {
  spinner.start('Validating initialization...')
  
  try {
    // Validate configuration
    const configManager = new ConfigManager()
    const validation = await configManager.validateConfig()
    
    if (!validation.valid) {
      spinner.warn('Configuration has warnings')
      console.log(chalk.yellow('\nConfiguration warnings:'))
      validation.warnings.forEach((warning: any) => {
        console.log(`  ⚠️  ${warning.message || warning}`)
      })
    } else {
      spinner.succeed('Initialization validated')
    }
  } catch (error) {
    spinner.fail('Validation failed')
    throw error
  }
}

function showCompletionMessage(projectInfo: any): void {
  console.log(chalk.green('\n✅ VTEX IO Deployment System initialized successfully!'))
  console.log(chalk.blue('\n📋 Next Steps:'))
  console.log(`   1. Configure your VTEX credentials: ${chalk.cyan('npx vtex-deploy config set vtex.authToken <your-token>')}`)
  console.log(`   2. Set up notifications (optional): ${chalk.cyan('npx vtex-deploy config init')}`)
  console.log(`   3. Install dependencies: ${chalk.cyan('npm install')}`)
  console.log(`   4. Start developing: ${chalk.cyan('npm run build')}`)
  console.log(`   5. Deploy to QA: ${chalk.cyan('npm run deploy:qa')}`)
  
  console.log(chalk.blue('\n📚 Documentation:'))
  console.log(`   - Configuration: ${chalk.cyan('npx vtex-deploy config --help')}`)
  console.log(`   - Deployment: ${chalk.cyan('npx vtex-deploy deploy --help')}`)
  console.log(`   - Status: ${chalk.cyan('npx vtex-deploy status --help')}`)
  
  console.log(chalk.gray(`\n🎉 Happy coding with ${projectInfo.name}!`))
}

// Helper functions for manifest creation
function getBuilders(type: string): Record<string, string> {
  const builders: Record<string, Record<string, string>> = {
    react: {
      "react": "3.x",
      "messages": "1.x",
      "store": "0.x"
    },
    node: {
      "node": "6.x",
      "graphql": "1.x"
    },
    "store-theme": {
      "store": "0.x",
      "styles": "2.x"
    },
    pixel: {
      "pixel": "0.x"
    },
    admin: {
      "admin": "0.x",
      "react": "3.x"
    }
  }
  
  return builders[type] || builders['react'] || {}
}

function getDependencies(type: string): Record<string, string> {
  const dependencies: Record<string, Record<string, string>> = {
    react: {
      "vtex.store-header": "2.x",
      "vtex.product-summary": "2.x",
      "vtex.store-footer": "2.x"
    },
    node: {
      "vtex.graphql-gateway": "0.x"
    },
    "store-theme": {
      "vtex.store": "2.x",
      "vtex.store-header": "2.x",
      "vtex.product-summary": "2.x"
    },
    pixel: {},
    admin: {
      "vtex.admin-ui": "0.x"
    }
  }
  
  return dependencies[type] || {}
}

function getPeerDependencies(type: string): Record<string, string> {
  return type === 'react' ? {
    "vtex.mega-menu": "2.x"
  } : {}
}

function getPolicies(type: string): any[] {
  const policies: Record<string, any[]> = {
    node: [
      {
        "name": "outbound-access",
        "attrs": {
          "host": "{{account}}.vtexcommercestable.com.br",
          "path": "/api/*"
        }
      }
    ]
  }
  
  return policies[type] || []
}

function getPackageDependencies(template: string): Record<string, string> {
  const base = {
    "typescript": "^4.9.0"
  }
  
  const templateDeps: Record<string, Record<string, string>> = {
    "vtex-app": {
      ...base,
      "react": "^18.0.0",
      "react-dom": "^18.0.0"
    },
    "vtex-store": {
      ...base
    }
  }
  
  return templateDeps[template] || base
}

function getPackageDevDependencies(template: string): Record<string, string> {
  return {
    "@types/node": "^18.0.0",
    "jest": "^29.0.0",
    "eslint": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^5.0.0",
    "@typescript-eslint/parser": "^5.0.0"
  }
}
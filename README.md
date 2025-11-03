# VTEX IO Deployment Automation Tool

[![CI/CD Pipeline](https://github.com/your-org/vtex-deploy-automation/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/vtex-deploy-automation/actions/workflows/ci.yml)
[![Security Scan](https://github.com/your-org/vtex-deploy-automation/actions/workflows/security.yml/badge.svg)](https://github.com/your-org/vtex-deploy-automation/actions/workflows/security.yml)
[![codecov](https://codecov.io/gh/your-org/vtex-deploy-automation/branch/main/graph/badge.svg)](https://codecov.io/gh/your-org/vtex-deploy-automation)
[![npm version](https://badge.fury.io/js/vtex-deploy-automation.svg)](https://badge.fury.io/js/vtex-deploy-automation)
[![Docker Image](https://img.shields.io/docker/v/your-org/vtex-deploy-automation?label=docker)](https://hub.docker.com/r/your-org/vtex-deploy-automation)

A comprehensive automation tool for VTEX IO application deployments with advanced validation, monitoring, and rollback capabilities.

## 🚀 Features

### Core Functionality
- **Automated Deployments**: Streamlined QA and Production deployments
- **Advanced Validation**: Pre-deployment checks for code quality, dependencies, and VTEX compatibility
- **Intelligent Rollback**: Automated rollback capabilities with deployment history tracking
- **Real-time Monitoring**: Health checks and performance monitoring during deployments
- **Multi-Environment Support**: Separate configurations for QA and Production environments

### Security & Quality
- **Security Scanning**: Integrated vulnerability scanning and secret detection
- **Code Quality Gates**: Automated linting, testing, and formatting validation
- **Compliance Checks**: VTEX IO best practices and policy enforcement
- **Audit Logging**: Comprehensive deployment and action logging

### DevOps Integration
- **GitHub Actions**: Complete CI/CD pipeline integration
- **Docker Support**: Containerized deployment with multi-stage builds
- **Notification System**: Slack, email, and webhook notifications
- **Monitoring Integration**: Prometheus metrics and Grafana dashboards

## 📋 Prerequisites

### System Requirements
- **Node.js**: Version 18.x or higher
- **npm/yarn**: Latest stable version
- **Git**: Version 2.x or higher
- **VTEX CLI**: Latest version (`npm install -g @vtex/cli`)

### VTEX Account Setup
- Active VTEX account with appropriate permissions
- Configured VTEX workspace access
- Valid VTEX authentication tokens

### Optional Dependencies
- **Docker**: For containerized deployments
- **Kubernetes**: For orchestrated deployments
- **Monitoring Tools**: Prometheus, Grafana for advanced monitoring

## 🛠️ Installation

### NPM Installation (Recommended)
```bash
# Install globally
npm install -g vtex-deploy-automation

# Or install locally in your project
npm install --save-dev vtex-deploy-automation
```

### Docker Installation
```bash
# Pull the latest image
docker pull your-org/vtex-deploy-automation:latest

# Or build from source
git clone https://github.com/your-org/vtex-deploy-automation.git
cd vtex-deploy-automation
docker build -t vtex-deploy-automation .
```

### From Source
```bash
# Clone the repository
git clone https://github.com/your-org/vtex-deploy-automation.git
cd vtex-deploy-automation

# Install dependencies
npm install

# Build the project
npm run build

# Link for global usage
npm link
```

## ⚙️ Configuration

### Environment Variables
Create a `.env` file in your project root:

```bash
# VTEX Configuration
VTEX_ACCOUNT=your-account-name
VTEX_WORKSPACE_QA=qa-workspace
VTEX_WORKSPACE_PROD=master
VTEX_AUTH_TOKEN=your-auth-token

# Git Configuration
GIT_REPOSITORY_URL=https://github.com/your-org/your-vtex-app.git
GIT_BRANCH_QA=develop
GIT_BRANCH_PROD=main

# Notification Configuration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url
EMAIL_SMTP_HOST=smtp.your-provider.com
EMAIL_SMTP_PORT=587
EMAIL_FROM=deployments@your-company.com
EMAIL_TO=team@your-company.com

# Monitoring Configuration
HEALTH_CHECK_URL=https://your-app.vtexcommercestable.com.br
HEALTH_CHECK_TIMEOUT=30000
PERFORMANCE_THRESHOLD_RESPONSE_TIME=2000

# Security Configuration
ENABLE_SECURITY_SCAN=true
SECURITY_SCAN_LEVEL=medium
VULNERABILITY_THRESHOLD=high
```

### Configuration File
Create `vtex-deploy.config.js` in your project root:

```javascript
module.exports = {
  // Deployment settings
  deployment: {
    timeout: 600000, // 10 minutes
    retries: 3,
    parallel: false,
    canary: {
      enabled: true,
      percentage: 10,
      duration: 300000, // 5 minutes
    },
  },

  // Validation settings
  validation: {
    enableLinting: true,
    enableTesting: true,
    enableSecurityScan: true,
    enableDependencyCheck: true,
    testCoverage: {
      threshold: 80,
      enforceOnProd: true,
    },
  },

  // Notification settings
  notifications: {
    slack: {
      enabled: true,
      channels: {
        qa: '#qa-deployments',
        prod: '#production-deployments',
        alerts: '#deployment-alerts',
      },
    },
    email: {
      enabled: true,
      onSuccess: true,
      onFailure: true,
      onRollback: true,
    },
  },

  // Monitoring settings
  monitoring: {
    healthCheck: {
      enabled: true,
      interval: 30000,
      retries: 5,
    },
    performance: {
      enabled: true,
      metrics: ['response_time', 'error_rate', 'throughput'],
    },
  },

  // Rollback settings
  rollback: {
    automatic: {
      enabled: true,
      triggers: ['health_check_failure', 'error_rate_threshold'],
      delay: 300000, // 5 minutes
    },
    retention: {
      maxDeployments: 10,
      maxAge: 2592000000, // 30 days
    },
  },
};
```

## 🎯 Usage

### CLI Commands

#### Deploy to QA
```bash
# Basic QA deployment
vtex-deploy qa

# Deploy specific branch with force flag
vtex-deploy qa --branch feature/new-feature --force

# Deploy with custom workspace
vtex-deploy qa --workspace custom-qa-workspace --verbose

# Skip validation (not recommended)
vtex-deploy qa --skip-validation --skip-tests
```

#### Deploy to Production
```bash
# Production deployment with canary
vtex-deploy prod --canary

# Deploy specific release tag
vtex-deploy prod --tag v1.2.3

# Force production deployment (requires confirmation)
vtex-deploy prod --force --confirm

# Deploy with custom configuration
vtex-deploy prod --config custom-config.js
```

#### Rollback Deployments
```bash
# Rollback last deployment
vtex-deploy rollback

# Rollback to specific deployment
vtex-deploy rollback --deployment-id abc123

# Rollback production to previous release
vtex-deploy rollback --env prod --steps 1

# List available deployments for rollback
vtex-deploy rollback --list

# Dry run rollback (preview only)
vtex-deploy rollback --dry-run
```

#### Check Status
```bash
# Check current deployment status
vtex-deploy status

# Check specific environment
vtex-deploy status --env qa

# Detailed health check
vtex-deploy status --health --detailed

# Watch mode (continuous monitoring)
vtex-deploy status --watch --interval 30

# Performance metrics
vtex-deploy status --metrics --history 24h
```

### Programmatic Usage

```javascript
const { DeployManager, ConfigManager } = require('vtex-deploy-automation');

async function deployToQA() {
  try {
    // Initialize configuration
    const config = new ConfigManager();
    await config.load();

    // Initialize deploy manager
    const deployManager = new DeployManager(config);

    // Deploy to QA
    const result = await deployManager.deployToQA({
      branch: 'develop',
      workspace: 'qa-workspace',
      skipValidation: false,
      force: false,
    });

    console.log('Deployment successful:', result);
  } catch (error) {
    console.error('Deployment failed:', error);
  }
}

deployToQA();
```

### Docker Usage

```bash
# Run with Docker
docker run -it --rm \
  -v $(pwd):/workspace \
  -v ~/.vtex:/root/.vtex \
  -e VTEX_ACCOUNT=your-account \
  your-org/vtex-deploy-automation:latest \
  vtex-deploy qa

# Using docker-compose
docker-compose up vtex-deploy
```

### GitHub Actions Integration

```yaml
name: VTEX Deployment

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [main]

jobs:
  deploy-qa:
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Install VTEX Deploy Tool
        run: npm install -g vtex-deploy-automation
      
      - name: Deploy to QA
        run: vtex-deploy qa --branch ${{ github.ref_name }}
        env:
          VTEX_ACCOUNT: ${{ secrets.VTEX_ACCOUNT }}
          VTEX_AUTH_TOKEN: ${{ secrets.VTEX_AUTH_TOKEN }}

  deploy-prod:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Deploy to Production
        run: vtex-deploy prod --canary --confirm
        env:
          VTEX_ACCOUNT: ${{ secrets.VTEX_ACCOUNT }}
          VTEX_AUTH_TOKEN: ${{ secrets.VTEX_AUTH_TOKEN }}
```

## 📊 Monitoring & Observability

### Health Checks
The tool provides comprehensive health monitoring:

- **Application Health**: Endpoint availability and response times
- **VTEX Services**: Workspace and app status validation
- **Dependencies**: External service connectivity checks
- **Performance Metrics**: Response times, error rates, throughput

### Logging
Structured logging with multiple levels:

```bash
# Enable debug logging
DEBUG=vtex-deploy:* vtex-deploy qa

# Log to file
vtex-deploy qa --log-file deployment.log --log-level info

# JSON formatted logs
vtex-deploy qa --log-format json
```

### Metrics Integration
Prometheus metrics endpoint available at `/metrics`:

- Deployment success/failure rates
- Deployment duration
- Rollback frequency
- Health check status
- Performance metrics

## 🔒 Security

### Security Features
- **Vulnerability Scanning**: Automated dependency and container scanning
- **Secret Detection**: Prevents accidental secret commits
- **Access Control**: Role-based deployment permissions
- **Audit Logging**: Complete deployment audit trail
- **Secure Configuration**: Environment-based secret management

### Security Best Practices
1. **Never commit secrets** to version control
2. **Use environment variables** for sensitive configuration
3. **Enable security scanning** in CI/CD pipelines
4. **Regularly update dependencies** to patch vulnerabilities
5. **Monitor deployment logs** for suspicious activity

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm run test:unit
npm run test:integration
npm run test:e2e

# Watch mode for development
npm run test:watch
```

### Test Structure
```
tests/
├── unit/           # Unit tests for individual modules
├── integration/    # Integration tests for workflows
├── e2e/           # End-to-end deployment tests
├── fixtures/      # Test data and mocks
└── helpers/       # Test utilities
```

## 🚀 Deployment Strategies

### Canary Deployments
Gradual rollout with automatic monitoring:

```bash
# Enable canary deployment
vtex-deploy prod --canary --percentage 10 --duration 5m

# Monitor canary metrics
vtex-deploy status --canary --metrics
```

### Blue-Green Deployments
Zero-downtime deployments with instant rollback:

```bash
# Blue-green deployment
vtex-deploy prod --strategy blue-green

# Switch traffic
vtex-deploy switch --to green
```

### Rolling Updates
Gradual instance replacement:

```bash
# Rolling update
vtex-deploy prod --strategy rolling --batch-size 2
```

## 🔧 Troubleshooting

### Common Issues

#### Authentication Errors
```bash
# Re-authenticate with VTEX
vtex auth

# Verify token
vtex whoami

# Check workspace access
vtex workspace list
```

#### Deployment Failures
```bash
# Check deployment logs
vtex-deploy status --logs --deployment-id abc123

# Validate configuration
vtex-deploy validate --config

# Test connectivity
vtex-deploy health --verbose
```

#### Performance Issues
```bash
# Check system resources
vtex-deploy status --system

# Monitor deployment progress
vtex-deploy status --watch --detailed

# Analyze performance metrics
vtex-deploy metrics --range 1h
```

### Debug Mode
Enable detailed debugging:

```bash
# Enable debug logging
export DEBUG=vtex-deploy:*
vtex-deploy qa --verbose

# Save debug logs
vtex-deploy qa --debug --log-file debug.log
```

## 📚 API Reference

### DeployManager
Main deployment orchestration class:

```javascript
const deployManager = new DeployManager(config);

// Deploy methods
await deployManager.deployToQA(options);
await deployManager.deployToProduction(options);
await deployManager.rollback(options);

// Status methods
await deployManager.getStatus(environment);
await deployManager.getDeploymentHistory();
await deployManager.getHealthStatus();
```

### ConfigManager
Configuration management:

```javascript
const config = new ConfigManager();
await config.load(configPath);
const value = config.get('deployment.timeout');
config.set('deployment.retries', 5);
```

### ValidationService
Pre-deployment validation:

```javascript
const validator = new ValidationService(config);
const result = await validator.validateDeployment({
  environment: 'qa',
  branch: 'develop',
});
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
```bash
# Clone the repository
git clone https://github.com/your-org/vtex-deploy-automation.git
cd vtex-deploy-automation

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build the project
npm run build
```

### Code Style
- Follow TypeScript best practices
- Use Prettier for formatting
- Maintain test coverage above 80%
- Write comprehensive documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help
- **Documentation**: [Full documentation](https://your-org.github.io/vtex-deploy-automation)
- **Issues**: [GitHub Issues](https://github.com/your-org/vtex-deploy-automation/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/vtex-deploy-automation/discussions)
- **Slack**: [#vtex-deploy-automation](https://your-org.slack.com/channels/vtex-deploy-automation)

### Enterprise Support
For enterprise support and custom implementations, contact: [enterprise@your-company.com](mailto:enterprise@your-company.com)

## 🗺️ Roadmap

### Upcoming Features
- [ ] Multi-region deployment support
- [ ] Advanced A/B testing capabilities
- [ ] Machine learning-based deployment optimization
- [ ] Enhanced security scanning with custom rules
- [ ] Integration with additional monitoring platforms
- [ ] Mobile app for deployment management
- [ ] Advanced analytics and reporting dashboard

### Version History
- **v1.0.0**: Initial release with core deployment features
- **v1.1.0**: Added canary deployment support
- **v1.2.0**: Enhanced monitoring and alerting
- **v1.3.0**: Security scanning integration
- **v2.0.0**: Complete architecture redesign (planned)

---

**Made with ❤️ by the VTEX DevOps Team**

For more information, visit our [website](https://your-company.com) or follow us on [Twitter](https://twitter.com/your-org).
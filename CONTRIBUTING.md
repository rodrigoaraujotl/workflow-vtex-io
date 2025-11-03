# Contributing to VTEX IO Deployment Automation Tool

Thank you for your interest in contributing to the VTEX IO Deployment Automation Tool! This document provides guidelines and information for contributors.

## 🤝 Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## 🚀 Getting Started

### Prerequisites
- Node.js 18.x or higher
- npm or yarn
- Git
- VTEX CLI
- Basic knowledge of TypeScript, Node.js, and VTEX IO

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/vtex-deploy-automation.git
   cd vtex-deploy-automation
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run Tests**
   ```bash
   npm test
   ```

5. **Start Development**
   ```bash
   npm run dev
   ```

## 📋 How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

**Bug Report Template:**
```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Environment:**
- OS: [e.g. macOS, Ubuntu]
- Node.js version: [e.g. 18.17.0]
- VTEX CLI version: [e.g. 3.x.x]
- Tool version: [e.g. 1.2.3]

**Additional context**
Add any other context about the problem here.
```

### Suggesting Features

Feature requests are welcome! Please provide:

1. **Clear description** of the feature
2. **Use case** and motivation
3. **Proposed implementation** (if you have ideas)
4. **Alternatives considered**

### Pull Requests

1. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make Changes**
   - Follow our coding standards
   - Add tests for new functionality
   - Update documentation as needed

3. **Test Your Changes**
   ```bash
   npm run test
   npm run lint
   npm run type-check
   ```

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add new deployment strategy"
   ```
   
   Follow [Conventional Commits](https://www.conventionalcommits.org/) format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `style:` for formatting changes
   - `refactor:` for code refactoring
   - `test:` for adding tests
   - `chore:` for maintenance tasks

5. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   
   Then create a Pull Request on GitHub.

## 🏗️ Development Guidelines

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### TypeScript Guidelines

- Use strict TypeScript configuration
- Provide proper type annotations
- Avoid `any` type when possible
- Use interfaces for object shapes
- Document complex types

```typescript
// Good
interface DeploymentOptions {
  environment: 'qa' | 'production';
  branch?: string;
  force?: boolean;
}

// Avoid
function deploy(options: any): any {
  // ...
}
```

### Testing Guidelines

We maintain high test coverage (>80%). Write tests for:

- **Unit Tests**: Individual functions and classes
- **Integration Tests**: Module interactions
- **E2E Tests**: Complete workflows

```typescript
// Example unit test
describe('DeployManager', () => {
  it('should deploy to QA successfully', async () => {
    const deployManager = new DeployManager(mockConfig);
    const result = await deployManager.deployToQA({
      branch: 'develop',
      environment: 'qa',
    });
    
    expect(result.success).toBe(true);
    expect(result.deploymentId).toBeDefined();
  });
});
```

### Documentation Guidelines

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Include examples in documentation
- Update CHANGELOG.md

```typescript
/**
 * Deploys application to specified environment
 * @param options - Deployment configuration options
 * @returns Promise resolving to deployment result
 * @example
 * ```typescript
 * const result = await deployManager.deploy({
 *   environment: 'qa',
 *   branch: 'develop'
 * });
 * ```
 */
async deploy(options: DeploymentOptions): Promise<DeploymentResult> {
  // Implementation
}
```

## 🧪 Testing

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Structure

```
tests/
├── unit/
│   ├── core/
│   ├── cli/
│   └── utils/
├── integration/
│   ├── deployment/
│   └── validation/
├── e2e/
│   ├── scenarios/
│   └── fixtures/
└── helpers/
    ├── mocks/
    └── utilities/
```

### Writing Tests

1. **Use descriptive test names**
   ```typescript
   it('should rollback deployment when health check fails', () => {
     // Test implementation
   });
   ```

2. **Follow AAA pattern** (Arrange, Act, Assert)
   ```typescript
   it('should validate deployment configuration', () => {
     // Arrange
     const config = createMockConfig();
     const validator = new ValidationService(config);
     
     // Act
     const result = validator.validate(deploymentOptions);
     
     // Assert
     expect(result.isValid).toBe(true);
   });
   ```

3. **Mock external dependencies**
   ```typescript
   jest.mock('../src/services/VtexService');
   const mockVtexService = VtexService as jest.Mocked<typeof VtexService>;
   ```

## 🔧 Project Structure

```
src/
├── core/           # Core business logic
├── cli/            # CLI commands and interface
├── utils/          # Utility functions
├── types/          # TypeScript type definitions
└── services/       # External service integrations

tests/              # Test files
docs/               # Documentation
scripts/            # Build and utility scripts
.github/            # GitHub workflows and templates
```

### Adding New Features

1. **Core Logic**: Add to `src/core/`
2. **CLI Commands**: Add to `src/cli/commands/`
3. **Types**: Define in `src/types/`
4. **Tests**: Mirror structure in `tests/`
5. **Documentation**: Update relevant docs

## 🚀 Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Steps

1. **Update Version**
   ```bash
   npm version patch|minor|major
   ```

2. **Update Changelog**
   ```bash
   npm run changelog
   ```

3. **Create Release PR**
   - Update version in package.json
   - Update CHANGELOG.md
   - Update documentation if needed

4. **Merge and Tag**
   - Merge release PR
   - GitHub Actions will handle the rest

## 🎯 Areas for Contribution

### High Priority
- [ ] Performance optimizations
- [ ] Additional deployment strategies
- [ ] Enhanced error handling
- [ ] Improved logging and monitoring

### Medium Priority
- [ ] UI/Dashboard development
- [ ] Additional integrations (Jenkins, GitLab)
- [ ] Mobile notifications
- [ ] Advanced analytics

### Documentation
- [ ] Video tutorials
- [ ] Best practices guide
- [ ] Troubleshooting guide
- [ ] API documentation improvements

## 🆘 Getting Help

### Communication Channels
- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Slack**: Real-time chat (#vtex-deploy-automation)
- **Email**: maintainers@your-company.com

### Mentorship
New contributors can request mentorship by:
1. Commenting on "good first issue" labeled issues
2. Joining our Slack channel
3. Attending our monthly contributor meetings

## 📚 Resources

### Learning Resources
- [VTEX IO Documentation](https://developers.vtex.com/vtex-developer-docs/docs/vtex-io-documentation-what-is-vtex-io)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Jest Testing Framework](https://jestjs.io/docs/getting-started)
- [Conventional Commits](https://www.conventionalcommits.org/)

### Tools and Extensions
- **VS Code Extensions**:
  - ESLint
  - Prettier
  - TypeScript Hero
  - Jest Runner
  - GitLens

## 🏆 Recognition

Contributors are recognized in:
- README.md contributors section
- Release notes
- Annual contributor awards
- Conference speaking opportunities

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to the VTEX IO Deployment Automation Tool! 🚀
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Type enum
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation changes
        'style',    // Code style changes (formatting, etc.)
        'refactor', // Code refactoring
        'perf',     // Performance improvements
        'test',     // Adding or updating tests
        'chore',    // Maintenance tasks
        'ci',       // CI/CD changes
        'build',    // Build system changes
        'revert',   // Revert previous commit
        'security', // Security fixes
        'deps',     // Dependency updates
      ],
    ],
    
    // Subject and body rules
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-min-length': [2, 'always', 3],
    'subject-max-length': [2, 'always', 72],
    
    // Header rules
    'header-max-length': [2, 'always', 100],
    'header-min-length': [2, 'always', 10],
    
    // Body rules
    'body-leading-blank': [1, 'always'],
    'body-max-line-length': [2, 'always', 100],
    
    // Footer rules
    'footer-leading-blank': [1, 'always'],
    'footer-max-line-length': [2, 'always', 100],
    
    // Scope rules
    'scope-case': [2, 'always', 'lower-case'],
    'scope-enum': [
      1,
      'always',
      [
        // Core modules
        'core',
        'cli',
        'utils',
        'types',
        
        // Specific components
        'deploy',
        'validation',
        'git',
        'vtex',
        'config',
        'logger',
        'notification',
        'health',
        
        // Infrastructure
        'docker',
        'ci',
        'github',
        'husky',
        
        // Documentation and tooling
        'docs',
        'readme',
        'changelog',
        'package',
        'deps',
        'security',
        
        // Testing
        'test',
        'e2e',
        'unit',
        'integration',
        
        // Environments
        'qa',
        'prod',
        'dev',
      ],
    ],
    
    // Type rules
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
  },
  
  // Custom plugins for additional validation
  plugins: [
    {
      rules: {
        'vtex-deploy-scope': (parsed) => {
          const { scope } = parsed;
          
          // Allow empty scope
          if (!scope) {
            return [true];
          }
          
          // Check for VTEX-specific scopes
          const vtexScopes = ['workspace', 'app', 'manifest', 'builder'];
          if (vtexScopes.includes(scope)) {
            return [true];
          }
          
          return [true]; // Let other rules handle scope validation
        },
      },
    },
  ],
  
  // Ignore patterns
  ignores: [
    (commit) => commit.includes('WIP'),
    (commit) => commit.includes('wip'),
    (commit) => /^Merge/.test(commit),
    (commit) => /^Revert/.test(commit),
  ],
  
  // Default ignore rules
  defaultIgnores: true,
  
  // Help URL
  helpUrl: 'https://github.com/conventional-changelog/commitlint/#what-is-commitlint',
  
  // Prompt configuration for interactive mode
  prompt: {
    questions: {
      type: {
        description: "Select the type of change that you're committing:",
        enum: {
          feat: {
            description: 'A new feature',
            title: 'Features',
            emoji: '✨',
          },
          fix: {
            description: 'A bug fix',
            title: 'Bug Fixes',
            emoji: '🐛',
          },
          docs: {
            description: 'Documentation only changes',
            title: 'Documentation',
            emoji: '📚',
          },
          style: {
            description: 'Changes that do not affect the meaning of the code',
            title: 'Styles',
            emoji: '💎',
          },
          refactor: {
            description: 'A code change that neither fixes a bug nor adds a feature',
            title: 'Code Refactoring',
            emoji: '📦',
          },
          perf: {
            description: 'A code change that improves performance',
            title: 'Performance Improvements',
            emoji: '🚀',
          },
          test: {
            description: 'Adding missing tests or correcting existing tests',
            title: 'Tests',
            emoji: '🚨',
          },
          build: {
            description: 'Changes that affect the build system or external dependencies',
            title: 'Builds',
            emoji: '🛠',
          },
          ci: {
            description: 'Changes to our CI configuration files and scripts',
            title: 'Continuous Integrations',
            emoji: '⚙️',
          },
          chore: {
            description: "Other changes that don't modify src or test files",
            title: 'Chores',
            emoji: '♻️',
          },
          revert: {
            description: 'Reverts a previous commit',
            title: 'Reverts',
            emoji: '🗑',
          },
          security: {
            description: 'Security improvements or fixes',
            title: 'Security',
            emoji: '🔒',
          },
        },
      },
      scope: {
        description: 'What is the scope of this change (e.g. component or file name)',
      },
      subject: {
        description: 'Write a short, imperative tense description of the change',
      },
      body: {
        description: 'Provide a longer description of the change',
      },
      isBreaking: {
        description: 'Are there any breaking changes?',
      },
      breakingBody: {
        description: 'A BREAKING CHANGE commit requires a body. Please enter a longer description of the commit itself',
      },
      breaking: {
        description: 'Describe the breaking changes',
      },
      isIssueAffected: {
        description: 'Does this change affect any open issues?',
      },
      issuesBody: {
        description: 'If issues are closed, the commit requires a body. Please enter a longer description of the commit itself',
      },
      issues: {
        description: 'Add issue references (e.g. "fix #123", "re #123".)',
      },
    },
  },
}
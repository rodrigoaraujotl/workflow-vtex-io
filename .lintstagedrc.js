module.exports = {
  // TypeScript and JavaScript files
  '*.{ts,tsx,js,jsx}': [
    'prettier --write',
    'eslint --fix --max-warnings=0',
  ],
  
  // JSON files
  '*.json': [
    'prettier --write',
  ],
  
  // Markdown files
  '*.{md,mdx}': [
    'prettier --write',
  ],
  
  // YAML files
  '*.{yml,yaml}': [
    'prettier --write',
  ],
  
  // Package.json specific checks
  'package.json': [
    'prettier --write',
  ],
}
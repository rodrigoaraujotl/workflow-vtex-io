# 🔗 Como Vincular ao Seu Projeto VTEX IO

Este guia mostra como integrar o sistema de automação de deployment ao seu projeto VTEX IO existente.

## 📋 Pré-requisitos

1. **Projeto VTEX IO** com `manifest.json` na raiz
2. **Node.js 18+** instalado
3. **VTEX CLI** instalado (`npm install -g @vtex/cli`)
4. **Git** configurado (opcional, mas recomendado)

## 🚀 Opção 1: Instalar como Dependência (Recomendado)

### Passo 1: Instalar no seu projeto

```bash
# No diretório do seu projeto VTEX IO
cd /caminho/do/seu/projeto-vtex-io

# Instalar como dependência de desenvolvimento
npm install --save-dev /Users/rodrigoaraujo/Projects/jnj-projects/workflow-vtex-io

# Ou se você publicar no npm:
# npm install --save-dev vtex-io-deployment-automation
```

### Passo 2: Adicionar scripts ao package.json

Adicione estes scripts ao `package.json` do seu projeto:

```json
{
  "scripts": {
    "deploy:qa": "vtex-deploy deploy:qa",
    "deploy:prod": "vtex-deploy deploy:prod",
    "rollback": "vtex-deploy rollback",
    "status": "vtex-deploy status",
    "validate": "vtex-deploy validate",
    "health": "vtex-deploy health"
  }
}
```

### Passo 3: Configurar o sistema

```bash
# Inicializar configuração
npx vtex-deploy config init

# Ou manualmente via comandos
npx vtex-deploy config set vtex.account seu-account
npx vtex-deploy config set vtex.workspace qa-workspace
npx vtex-deploy config set vtex.authToken seu-token-vtex
```

## 🔧 Opção 2: Link Global (Desenvolvimento)

### Passo 1: Linkar o projeto

```bash
# No diretório do workflow-vtex-io
cd /Users/rodrigoaraujo/Projects/jnj-projects/workflow-vtex-io
npm link

# No diretório do seu projeto VTEX IO
cd /caminho/do/seu/projeto-vtex-io
npm link vtex-io-deployment-automation
```

### Passo 2: Usar diretamente

```bash
# Agora pode usar diretamente
vtex-deploy validate
vtex-deploy deploy:qa
vtex-deploy status
```

## ⚙️ Opção 3: Configuração Manual

### Passo 1: Criar arquivo de configuração

Crie um arquivo `.vtex-deploy.config.json` na raiz do seu projeto:

```json
{
  "environment": "production",
  "vtex": {
    "account": "seu-account-vtex",
    "workspace": "master",
    "authToken": "seu-token-aqui",
    "userEmail": "seu-email@exemplo.com",
    "timeout": 30000,
    "retryAttempts": 3,
    "apiVersion": "v1",
    "region": "aws-us-east-1"
  },
  "app": {
    "vendor": "seu-vendor",
    "name": "seu-app-name",
    "versionPrefix": "v",
    "autoInstall": true,
    "autoPublish": true,
    "skipTests": false,
    "requireApproval": false
  },
  "deployment": {
    "timeout": 600000,
    "maxRetries": 3,
    "rollbackOnFailure": true,
    "healthCheckTimeout": 30000,
    "healthCheckRetries": 5,
    "parallelDeployments": false,
    "maxParallelJobs": 1
  },
  "workspace": {
    "createWorkspace": true,
    "workspacePrefix": "qa-",
    "workspaceCleanup": false,
    "workspaceTTL": "24h",
    "promoteRequiresApproval": true,
    "autoPromoteToMaster": false
  },
  "notifications": {
    "enabled": false,
    "slack": {
      "enabled": false,
      "webhookUrl": "",
      "channel": "#deployments"
    },
    "email": {
      "enabled": false,
      "smtpHost": "",
      "smtpPort": 587,
      "smtpSecure": false,
      "smtpUser": "",
      "smtpPassword": "",
      "from": "",
      "to": []
    },
    "teams": {
      "enabled": false,
      "webhookUrl": ""
    }
  },
  "git": {
    "enabled": true,
    "autoCommit": false,
    "autoPush": false,
    "branchPrefix": "deploy/",
    "requireCleanWorkingTree": true
  },
  "docker": {
    "enabled": false,
    "image": "",
    "registry": ""
  },
  "security": {
    "enabled": true,
    "scanDependencies": true,
    "scanCode": true,
    "failOnHigh": true
  },
  "monitoring": {
    "enabled": true,
    "healthCheckInterval": 30000,
    "metricsEnabled": true
  },
  "logging": {
    "level": "info",
    "format": "text",
    "auditEnabled": true,
    "retentionDays": 30,
    "maxFileSize": "10MB",
    "maxFiles": 5
  }
}
```

### Passo 2: Configurar variáveis de ambiente (Opcional)

Crie um arquivo `.env` na raiz do projeto:

```bash
# VTEX Configuration
VTEX_ACCOUNT=seu-account-vtex
VTEX_WORKSPACE_QA=qa-workspace
VTEX_WORKSPACE_PROD=master
VTEX_AUTH_TOKEN=seu-token-vtex
VTEX_USER_EMAIL=seu-email@exemplo.com

# Git Configuration (opcional)
GIT_REPOSITORY_URL=https://github.com/seu-org/seu-repo.git
GIT_BRANCH_QA=develop
GIT_BRANCH_PROD=main

# Notification Configuration (opcional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_CHANNEL=#deployments

EMAIL_SMTP_HOST=smtp.exemplo.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=usuario
EMAIL_SMTP_PASSWORD=senha
EMAIL_FROM=deploy@exemplo.com
EMAIL_TO=time@exemplo.com
```

## 🎯 Verificação e Teste

### 1. Validar o projeto

```bash
# No diretório do seu projeto VTEX IO
npx vtex-deploy validate

# Validar tipos específicos
npx vtex-deploy validate --type manifest
npx vtex-deploy validate --type dependencies
npx vtex-deploy validate --type security
```

### 2. Verificar health

```bash
npx vtex-deploy health

# Com watch mode
npx vtex-deploy health --watch
```

### 3. Verificar status

```bash
npx vtex-deploy status
```

## 📦 Estrutura do Projeto Esperada

O sistema detecta automaticamente projetos VTEX IO pela presença de `manifest.json`:

```
seu-projeto-vtex-io/
├── manifest.json          # ✅ Obrigatório - Detecta automaticamente
├── package.json           # ✅ Obrigatório
├── src/                  # Estrutura do seu app
├── .vtex-deploy.config.json  # Configuração (opcional)
├── .env                  # Variáveis de ambiente (opcional)
└── ...
```

## 🔄 Integração com CI/CD

### GitHub Actions

Adicione `.github/workflows/deploy.yml`:

```yaml
name: VTEX IO Deployment

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  deploy-qa:
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Install VTEX Deploy
        run: npm install --save-dev /path/to/workflow-vtex-io
      
      - name: Deploy to QA
        run: npm run deploy:qa
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
      
      - name: Install VTEX Deploy
        run: npm install --save-dev /path/to/workflow-vtex-io
      
      - name: Deploy to Production
        run: npm run deploy:prod
        env:
          VTEX_ACCOUNT: ${{ secrets.VTEX_ACCOUNT }}
          VTEX_AUTH_TOKEN: ${{ secrets.VTEX_AUTH_TOKEN }}
```

## 🛠️ Comandos Úteis

### Configuração

```bash
# Ver configuração atual
npx vtex-deploy config get

# Configurar account
npx vtex-deploy config set vtex.account seu-account

# Configurar workspace
npx vtex-deploy config set vtex.workspace qa-workspace

# Listar todas as configurações
npx vtex-deploy config list

# Validar configuração
npx vtex-deploy config validate
```

### Deployment

```bash
# Deploy para QA
npm run deploy:qa
# ou
npx vtex-deploy deploy:qa

# Deploy para produção
npm run deploy:prod
# ou
npx vtex-deploy deploy:prod --force

# Com opções
npx vtex-deploy deploy:qa --verbose --skip-tests
```

### Status e Monitoramento

```bash
# Ver status
npm run status

# Health check
npx vtex-deploy health

# Health check com detalhes
npx vtex-deploy health --detailed --watch
```

### Rollback

```bash
# Rollback automático (última versão)
npm run rollback

# Rollback para versão específica
npx vtex-deploy rollback --version 1.0.0

# Rollback em ambiente específico
npx vtex-deploy rollback --env production --version 1.0.0
```

## 🔍 Troubleshooting

### O projeto não detecta o manifest.json

```bash
# Certifique-se de estar na raiz do projeto VTEX IO
pwd  # Deve mostrar o diretório com manifest.json

# Verificar se manifest.json existe
ls -la manifest.json

# Se estiver em subdiretório, especifique o caminho
npx vtex-deploy --config /caminho/para/projeto validate
```

### Erro de autenticação VTEX

```bash
# Re-autenticar
vtex auth

# Verificar conta atual
vtex whoami

# Verificar workspaces
vtex workspace list

# Configurar token manualmente
npx vtex-deploy config set vtex.authToken seu-token
```

### Erro de configuração

```bash
# Validar configuração
npx vtex-deploy config validate

# Ver configuração atual
npx vtex-deploy config get

# Recriar configuração
npx vtex-deploy config init
```

## 📝 Checklist de Integração

- [ ] Projeto VTEX IO com `manifest.json` na raiz
- [ ] Node.js 18+ instalado
- [ ] VTEX CLI instalado e autenticado
- [ ] Dependência instalada no projeto
- [ ] Scripts adicionados ao `package.json`
- [ ] Configuração inicializada (`config init`)
- [ ] Account VTEX configurada
- [ ] Workspace configurado
- [ ] Token de autenticação configurado
- [ ] Primeira validação executada com sucesso
- [ ] Health check executado com sucesso
- [ ] Teste de deploy QA realizado

## 🎉 Pronto!

Agora seu projeto está integrado! Você pode usar:

```bash
npm run deploy:qa      # Deploy para QA
npm run deploy:prod    # Deploy para produção
npm run status         # Ver status
npm run rollback       # Rollback
npm run validate       # Validar projeto
npm run health         # Health check
```

## 📚 Próximos Passos

1. Configure notificações (Slack/Email) para receber alertas
2. Configure CI/CD para deploy automático
3. Configure health checks e monitoramento
4. Personalize configurações de deployment
5. Configure políticas de segurança

Para mais ajuda: `npx vtex-deploy --help` ou `npx vtex-deploy <comando> --help`


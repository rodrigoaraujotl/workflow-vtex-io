# 🚀 Guia Rápido de Integração

## Integração em 5 Passos

### 1️⃣ Instalar no seu projeto VTEX IO

```bash
# No diretório do SEU projeto VTEX IO
cd /caminho/do/seu/projeto-vtex-io

# Instalar como dependência local
npm install --save-dev /Users/rodrigoaraujo/Projects/jnj-projects/workflow-vtex-io
```

### 2️⃣ Adicionar scripts ao package.json

Edite o `package.json` do seu projeto e adicione:

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

### 3️⃣ Configurar credenciais VTEX

```bash
# No diretório do seu projeto
npx vtex-deploy config init

# Ou configure manualmente:
npx vtex-deploy config set vtex.account seu-account-vtex
npx vtex-deploy config set vtex.workspace qa-workspace
npx vtex-deploy config set vtex.authToken seu-token
```

**Como obter o token VTEX:**
```bash
# Instalar VTEX CLI
npm install -g @vtex/cli

# Autenticar (gera token automaticamente)
vtex auth

# Ou gerar token manualmente
vtex token --account seu-account
```

### 4️⃣ Validar configuração

```bash
# Validar se tudo está OK
npm run validate

# Verificar health do sistema
npm run health
```

### 5️⃣ Primeiro deploy

```bash
# Deploy para QA
npm run deploy:qa

# Ver status
npm run status
```

## ✅ Verificação Rápida

Execute este comando para verificar se está tudo configurado:

```bash
npx vtex-deploy validate && npx vtex-deploy health
```

## 📝 Estrutura Mínima Necessária

Seu projeto precisa ter:

```
seu-projeto/
├── manifest.json          # ✅ Obrigatório
├── package.json           # ✅ Obrigatório
└── (outros arquivos do seu app)
```

O sistema detecta automaticamente o `manifest.json` e usa essas informações.

## 🔧 Configuração via Variáveis de Ambiente (Alternativa)

Se preferir usar variáveis de ambiente, crie um `.env`:

```bash
VTEX_ACCOUNT=seu-account
VTEX_WORKSPACE_QA=qa-workspace
VTEX_WORKSPACE_PROD=master
VTEX_AUTH_TOKEN=seu-token
```

## 🎯 Pronto!

Agora você pode usar:

- `npm run deploy:qa` - Deploy para QA
- `npm run deploy:prod` - Deploy para produção
- `npm run status` - Ver status
- `npm run rollback` - Fazer rollback
- `npm run validate` - Validar projeto
- `npm run health` - Health check

## ❓ Precisa de Ajuda?

```bash
# Ver todos os comandos
npx vtex-deploy --help

# Ajuda específica
npx vtex-deploy deploy:qa --help
npx vtex-deploy config --help
```


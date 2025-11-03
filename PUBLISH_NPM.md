# 📦 Guia de Publicação no NPM

Este guia mostra passo a passo como publicar o projeto `vtex-io-deployment-automation` no npm (https://www.npmjs.com/).

## 📋 Pré-requisitos

1. **Conta no npm** - Criar em https://www.npmjs.com/signup
2. **npm CLI instalado** - Vem com Node.js
3. **Projeto buildado** - Sem erros de compilação
4. **Nome único** - Verificar se o nome do pacote está disponível

## 🔍 Passo 1: Verificar Disponibilidade do Nome

Antes de publicar, verifique se o nome está disponível:

```bash
# Verificar se o nome está disponível
npm view vtex-io-deployment-automation

# Se retornar erro 404, o nome está disponível!
# Se retornar informações, o nome já está em uso
```

**Se o nome estiver em uso**, você precisa alterar o nome no `package.json`:

```json
{
  "name": "@seu-usuario/vtex-io-deployment-automation",
  // ou
  "name": "vtex-io-deploy-automation",
  // ou qualquer outro nome único
}
```

## 🔧 Passo 2: Preparar o Projeto

### 2.1 Atualizar Informações do package.json

Edite o `package.json` e atualize as informações:

```json
{
  "name": "vtex-io-deployment-automation",  // Nome único no npm
  "version": "1.0.0",                       // Versão inicial
  "description": "Automated deployment tool for VTEX IO applications",
  "author": "Seu Nome <seu-email@exemplo.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/seu-usuario/vtex-io-deployment-automation.git"
  },
  "bugs": {
    "url": "https://github.com/seu-usuario/vtex-io-deployment-automation/issues"
  },
  "homepage": "https://github.com/seu-usuario/vtex-io-deployment-automation#readme",
  "keywords": [
    "vtex",
    "vtex-io",
    "deployment",
    "automation",
    "ci-cd",
    "devops",
    "cli"
  ]
}
```

### 2.2 Garantir que o build está correto

```bash
# Limpar build anterior
npm run clean

# Fazer build
npm run build

# Verificar se não há erros
npm run build 2>&1 | grep -E "error|Error" || echo "✅ Build OK"
```

### 2.3 Verificar arquivos que serão publicados

```bash
# Ver o que será incluído no pacote
npm pack --dry-run

# Ou ver o conteúdo do pacote
npm pack
tar -tzf vtex-io-deployment-automation-1.0.0.tgz | head -20
```

## 🔐 Passo 3: Login no NPM

### 3.1 Criar conta (se ainda não tiver)

Acesse: https://www.npmjs.com/signup

### 3.2 Fazer login

```bash
# Login no npm
npm login

# Você será solicitado:
# - Username: seu-usuario-npm
# - Password: sua-senha
# - Email: seu-email@exemplo.com
# - OTP (se tiver 2FA habilitado): código do autenticador
```

### 3.3 Verificar login

```bash
# Ver usuário logado
npm whoami

# Deve retornar seu username
```

## 📝 Passo 4: Preparar para Publicação

### 4.1 Verificar se está no diretório correto

```bash
pwd
# Deve estar em: /Users/rodrigoaraujo/Projects/jnj-projects/workflow-vtex-io
```

### 4.2 Verificar se não há arquivos não commitados

```bash
# Ver status do git
git status

# É recomendado commitar tudo antes de publicar
```

### 4.3 Testar o pacote localmente

```bash
# Criar pacote de teste
npm pack

# Instalar localmente para testar
npm install -g ./vtex-io-deployment-automation-1.0.0.tgz

# Testar o comando
vtex-deploy --help

# Desinstalar
npm uninstall -g vtex-io-deployment-automation
```

## 🚀 Passo 5: Publicar

### 5.1 Publicação Inicial

```bash
# Publicar no npm (público)
npm publish --access public

# Se for scoped package (@seu-usuario/...), use:
npm publish --access public
```

### 5.2 Verificar Publicação

Após a publicação, verifique:

```bash
# Ver informações do pacote publicado
npm view vtex-io-deployment-automation

# Ver versões publicadas
npm view vtex-io-deployment-automation versions

# Acessar no navegador
# https://www.npmjs.com/package/vtex-io-deployment-automation
```

### 5.3 Testar Instalação

```bash
# Testar instalação global
npm install -g vtex-io-deployment-automation

# Testar se funciona
vtex-deploy --help

# Desinstalar
npm uninstall -g vtex-io-deployment-automation
```

## 📈 Passo 6: Versionamento Futuro

Para atualizar o pacote no futuro:

### 6.1 Atualizar versão

```bash
# Versão patch (1.0.0 -> 1.0.1)
npm version patch

# Versão minor (1.0.0 -> 1.1.0)
npm version minor

# Versão major (1.0.0 -> 2.0.0)
npm version major

# Ou manualmente no package.json:
# "version": "1.0.1"
```

### 6.2 Publicar nova versão

```bash
# Build e publicar
npm run build
npm publish --access public
```

### 6.3 Usando standard-version (Recomendado)

```bash
# Instalar se ainda não tiver
npm install --save-dev standard-version

# Criar release
npm run release

# Isso vai:
# - Atualizar CHANGELOG.md
# - Atualizar versão no package.json
# - Criar git tag
# - Commit das mudanças

# Depois publicar
npm publish --access public
```

## 🔒 Passo 7: Configurações de Segurança

### 7.1 Habilitar 2FA (Recomendado)

```bash
# No site do npm:
# https://www.npmjs.com/settings/seu-usuario/profile

# Ou via CLI:
npm profile enable-2fa auth-and-writes
```

### 7.2 Configurar acesso restrito

Se quiser limitar quem pode publicar:

```bash
# Adicionar colaborador
npm owner add outro-usuario vtex-io-deployment-automation

# Ver proprietários
npm owner ls vtex-io-deployment-automation
```

## 📋 Checklist Completo Antes de Publicar

- [ ] Nome do pacote verificado e disponível
- [ ] package.json atualizado com informações corretas
- [ ] README.md completo e atualizado
- [ ] LICENSE presente
- [ ] Build executado sem erros (`npm run build`)
- [ ] Testes passando (`npm test`)
- [ ] .npmignore configurado
- [ ] Arquivos corretos no campo "files" do package.json
- [ ] Login no npm realizado (`npm whoami`)
- [ ] Pacote testado localmente (`npm pack` e `npm install -g`)
- [ ] Versão correta no package.json
- [ ] Git committado e tag criada (opcional)

## 🎯 Comandos Rápidos

```bash
# 1. Verificar build
npm run build

# 2. Testar pacote
npm pack --dry-run

# 3. Login
npm login

# 4. Publicar
npm publish --access public

# 5. Verificar
npm view vtex-io-deployment-automation

# 6. Testar instalação
npm install -g vtex-io-deployment-automation
vtex-deploy --help
```

## 📝 Exemplo de Fluxo Completo

```bash
# 1. Preparar
cd /Users/rodrigoaraujo/Projects/jnj-projects/workflow-vtex-io
npm run clean
npm run build

# 2. Verificar
npm pack --dry-run

# 3. Login
npm login

# 4. Publicar
npm publish --access public

# 5. Verificar publicação
npm view vtex-io-deployment-automation

# 6. Testar
npm install -g vtex-io-deployment-automation
vtex-deploy --version
```

## 🔄 Atualizações Futuras

### Release Automatizado

```bash
# Usar standard-version para releases
npm run release

# Isso vai:
# - Atualizar CHANGELOG.md automaticamente
# - Incrementar versão (patch/minor/major)
# - Criar git tag
# - Commit automático

# Depois publicar
npm publish --access public
```

### CI/CD para Publicação Automática

Crie `.github/workflows/publish.yml:

```yaml
name: Publish to NPM

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      
      - run: npm ci
      - run: npm run build
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## ⚠️ Problemas Comuns

### Erro: "You must verify your email"

```bash
# Verificar email no npm
# Acesse: https://www.npmjs.com/settings/seu-usuario/profile
# E verifique seu email
```

### Erro: "Package name already exists"

```bash
# Escolher outro nome
# Editar package.json
# "name": "vtex-io-deploy-automation"  # ou outro nome único
```

### Erro: "You do not have permission"

```bash
# Verificar se está logado
npm whoami

# Verificar se é o owner do pacote
npm owner ls vtex-io-deployment-automation

# Se não for, pedir acesso ao owner
```

### Publicar versão beta/pre-release

```bash
# Publicar como beta
npm version 1.0.0-beta.1
npm publish --tag beta --access public

# Instalar versão beta
npm install -g vtex-io-deployment-automation@beta
```

## 📚 Recursos Adicionais

- [Documentação NPM](https://docs.npmjs.com/)
- [Guia de Publicação NPM](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [standard-version](https://github.com/conventional-changelog/standard-version)

## ✅ Após Publicar

1. **Criar README atrativo** no npm (pode editar depois)
2. **Adicionar badges** de status, versão, etc.
3. **Configurar 2FA** para segurança
4. **Configurar CI/CD** para releases automáticos
5. **Divulgar** o pacote na comunidade

## 🎉 Pronto!

Seu pacote estará disponível em:
**https://www.npmjs.com/package/vtex-io-deployment-automation**

E pode ser instalado com:
```bash
npm install -g vtex-io-deployment-automation
# ou
npm install --save-dev vtex-io-deployment-automation
```


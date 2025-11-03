# 🚀 Publicação Rápida no NPM

## Guia Super Rápido (3 Passos)

### 1️⃣ Login no NPM

```bash
npm login
# Username: seu-usuario
# Password: sua-senha
# Email: seu-email@exemplo.com
```

### 2️⃣ Verificar e Publicar

```bash
# Verificar se tudo está OK
npm run build

# Publicar
npm publish --access public
```

### 3️⃣ Verificar

```bash
# Ver no npm
npm view vtex-io-deployment-automation

# Testar instalação
npm install -g vtex-io-deployment-automation
vtex-deploy --help
```

## 🎯 Usando o Script Helper

```bash
# Publicar versão atual
./scripts/publish.sh

# Publicar com bump de versão
./scripts/publish.sh patch   # 1.0.0 -> 1.0.1
./scripts/publish.sh minor    # 1.0.0 -> 1.1.0
./scripts/publish.sh major    # 1.0.0 -> 2.0.0
```

## ⚠️ Antes de Publicar

1. **Atualizar informações no package.json:**
   - `author`: Seu nome e email
   - `repository.url`: URL do seu repositório Git
   - `homepage`: URL da homepage
   - `bugs.url`: URL para reportar bugs

2. **Verificar nome do pacote:**
   ```bash
   npm view vtex-io-deployment-automation
   # Se retornar 404, o nome está disponível
   ```

3. **Build e teste:**
   ```bash
   npm run build
   npm pack --dry-run
   ```

## 📝 Checklist Rápido

- [ ] Login no npm (`npm whoami`)
- [ ] package.json atualizado
- [ ] Build OK (`npm run build`)
- [ ] Nome do pacote disponível
- [ ] README.md completo
- [ ] LICENSE presente

## 🚀 Publicar

```bash
npm publish --access public
```

## 🔄 Próximas Versões

```bash
# Atualizar versão e publicar
npm version patch && npm publish --access public
npm version minor && npm publish --access public
npm version major && npm publish --access public
```

## 📦 Após Publicar

Seu pacote estará em:
**https://www.npmjs.com/package/vtex-io-deployment-automation**

Instalar globalmente:
```bash
npm install -g vtex-io-deployment-automation
```

Instalar em projeto:
```bash
npm install --save-dev vtex-io-deployment-automation
```


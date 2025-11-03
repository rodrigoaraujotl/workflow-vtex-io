#!/bin/bash

# Script para publicar o pacote no NPM
# Uso: ./scripts/publish.sh [patch|minor|major]

set -e

echo "🚀 Preparando publicação no NPM..."

# Verificar se está logado no npm
if ! npm whoami &> /dev/null; then
    echo "❌ Você precisa estar logado no npm"
    echo "Execute: npm login"
    exit 1
fi

echo "✅ Logado como: $(npm whoami)"

# Verificar se o build está OK
echo "📦 Executando build..."
npm run build

# Verificar se há erros de build
if [ $? -ne 0 ]; then
    echo "❌ Build falhou. Corrija os erros antes de publicar."
    exit 1
fi

# Verificar se há erros de TypeScript
ERROR_COUNT=$(npm run build 2>&1 | grep -c "error TS" || echo "0")
if [ "$ERROR_COUNT" -gt "0" ]; then
    echo "⚠️  Aviso: Há $ERROR_COUNT erros de TypeScript. Prosseguindo mesmo assim..."
fi

# Verificar nome do pacote
PACKAGE_NAME=$(node -p "require('./package.json').name")
echo "📦 Nome do pacote: $PACKAGE_NAME"

# Verificar se o nome está disponível
if npm view "$PACKAGE_NAME" version &> /dev/null; then
    CURRENT_VERSION=$(npm view "$PACKAGE_NAME" version)
    echo "ℹ️  Versão atual no npm: $CURRENT_VERSION"
fi

# Atualizar versão se especificado
if [ -n "$1" ]; then
    case "$1" in
        patch|minor|major)
            echo "📝 Atualizando versão ($1)..."
            npm version "$1"
            ;;
        *)
            echo "❌ Tipo de versão inválido: $1"
            echo "Use: patch, minor ou major"
            exit 1
            ;;
    esac
fi

# Mostrar versão atual
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📌 Versão: $CURRENT_VERSION"

# Testar pacote
echo "🧪 Testando pacote..."
npm pack --dry-run > /dev/null
echo "✅ Pacote OK"

# Confirmar publicação
read -p "🤔 Publicar versão $CURRENT_VERSION no npm? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Publicação cancelada"
    exit 1
fi

# Publicar
echo "🚀 Publicando no npm..."
npm publish --access public

if [ $? -eq 0 ]; then
    echo "✅ Publicado com sucesso!"
    echo "📦 Pacote: https://www.npmjs.com/package/$PACKAGE_NAME"
    echo ""
    echo "🧪 Testar instalação:"
    echo "   npm install -g $PACKAGE_NAME"
    echo "   $PACKAGE_NAME --help"
else
    echo "❌ Erro na publicação"
    exit 1
fi


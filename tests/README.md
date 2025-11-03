# VTEX Workflow Tests

Este diretório contém uma suíte abrangente de testes para o sistema de automação de deployment VTEX IO.

## Estrutura dos Testes

```
tests/
├── unit/                    # Testes unitários
│   ├── core/               # Testes para módulos principais
│   ├── utils/              # Testes para utilitários
│   └── cli/                # Testes para comandos CLI
├── integration/            # Testes de integração
├── e2e/                   # Testes end-to-end
├── setup.ts               # Configuração comum dos testes
├── global-setup.ts        # Setup global
├── global-teardown.ts     # Teardown global
└── README.md              # Esta documentação
```

## Tipos de Testes

### 1. Testes Unitários (`tests/unit/`)

Testam componentes individuais de forma isolada:

- **Core Modules**: `DeployManager`, `ConfigManager`, `ValidationService`, `GitService`, `VtexService`
- **Utilities**: `Logger`, `NotificationService`, `HealthChecker`
- **CLI Commands**: `deploy`, `rollback`, `status`, `config`

### 2. Testes de Integração (`tests/integration/`)

Testam a interação entre múltiplos componentes:

- **Deployment Flow**: Fluxo completo de deployment
- **Configuration Flow**: Gerenciamento de configuração
- **Service Integration**: Integração entre serviços

### 3. Testes End-to-End (`tests/e2e/`)

Simulam cenários reais de uso:

- **CLI Workflows**: Interações completas via CLI
- **User Scenarios**: Cenários típicos de usuário

## Executando os Testes

### Todos os Testes
```bash
npm test
```

### Por Tipo
```bash
# Apenas testes unitários
npm run test:unit

# Apenas testes de integração
npm run test:integration

# Apenas testes E2E
npm run test:e2e
```

### Com Cobertura
```bash
# Cobertura geral
npm run test:coverage

# Cobertura por tipo
npm run test:coverage:unit
npm run test:coverage:integration
```

### Modo Watch
```bash
npm run test:watch
```

### Para CI/CD
```bash
npm run test:ci
```

### Debug
```bash
npm run test:debug
```

## Configuração dos Testes

### Jest Configuration

A configuração principal está em `jest.config.js` e inclui:

- **Projetos separados** para cada tipo de teste
- **Cobertura de código** com thresholds configuráveis
- **Relatórios** em múltiplos formatos (HTML, LCOV, JUnit)
- **Timeouts** apropriados para cada tipo de teste

### Mocks e Setup

- **Global Setup**: Configuração de ambiente de teste
- **Test Setup**: Mocks comuns e utilitários
- **Cleanup**: Limpeza automática após os testes

## Cobertura de Código

### Thresholds Configurados

- **Global**: 80% (branches, functions, lines, statements)
- **Core Modules**: 85% (maior rigor para componentes críticos)
- **Utilities**: 80%

### Relatórios de Cobertura

Os relatórios são gerados em:
- `coverage/lcov-report/index.html` - Relatório HTML interativo
- `coverage/lcov.info` - Formato LCOV para CI/CD
- `coverage/coverage-final.json` - Dados JSON da cobertura

## Mocks e Stubs

### Dependências Externas Mockadas

- **File System** (`fs`): Operações de arquivo
- **Child Process** (`child_process`): Execução de comandos
- **HTTP Requests** (`axios`): Chamadas de API
- **Git Operations** (`simple-git`): Operações Git
- **Email** (`nodemailer`): Envio de emails

### Dados de Teste

Utilitários para criar dados de teste consistentes:
- `createMockConfig()`: Configuração mock
- `createMockDeploymentResult()`: Resultado de deployment mock
- `mockAsyncFunction()`: Funções assíncronas mock

## Cenários de Teste Cobertos

### Deployment
- ✅ Deployment bem-sucedido (QA, Staging, Production)
- ✅ Deployment com canary
- ✅ Dry run deployment
- ✅ Falhas de validação
- ✅ Falhas de VTEX
- ✅ Falhas de health check
- ✅ Problemas de conectividade

### Configuration
- ✅ Carregamento e validação de configuração
- ✅ Modificação e persistência
- ✅ Configurações específicas por ambiente
- ✅ Migração de configuração
- ✅ Validação de segurança

### CLI
- ✅ Todos os comandos e opções
- ✅ Validação de entrada
- ✅ Confirmações interativas
- ✅ Formatação de saída
- ✅ Tratamento de erros

### Rollback
- ✅ Rollback por steps
- ✅ Rollback para deployment específico
- ✅ Listagem de histórico
- ✅ Confirmações de segurança

### Health Checks
- ✅ Verificações de aplicação
- ✅ Verificações de banco de dados
- ✅ Verificações de serviços externos
- ✅ Verificações abrangentes

### Notifications
- ✅ Notificações Slack
- ✅ Notificações por email
- ✅ Formatação de mensagens
- ✅ Tratamento de falhas

## Executando Testes Específicos

### Por Arquivo
```bash
npx jest tests/unit/core/DeployManager.test.ts
```

### Por Padrão
```bash
npx jest --testNamePattern="deployment"
```

### Por Tag
```bash
npx jest --testPathPattern="integration"
```

## Debugging

### Logs de Debug
```bash
DEBUG=vtex-workflow:* npm test
```

### Executar com Node Inspector
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Detectar Handles Abertos
```bash
npm run test:debug
```

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run Tests
  run: npm run test:ci

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

### Relatórios JUnit
Os testes geram relatórios JUnit em `coverage/junit.xml` para integração com sistemas de CI/CD.

## Contribuindo

### Adicionando Novos Testes

1. **Testes Unitários**: Adicione em `tests/unit/` seguindo a estrutura existente
2. **Testes de Integração**: Adicione em `tests/integration/` para testar fluxos completos
3. **Testes E2E**: Adicione em `tests/e2e/` para cenários de usuário

### Convenções

- Use `describe()` para agrupar testes relacionados
- Use `it()` para casos de teste específicos
- Sempre limpe mocks em `beforeEach()`
- Use dados de teste consistentes dos utilitários
- Documente cenários complexos

### Qualidade dos Testes

- **Cobertura**: Mantenha acima dos thresholds configurados
- **Isolamento**: Testes devem ser independentes
- **Clareza**: Nomes descritivos e asserções claras
- **Performance**: Testes rápidos e eficientes

## Troubleshooting

### Problemas Comuns

1. **Timeouts**: Ajuste timeouts em `jest.config.js`
2. **Mocks não funcionando**: Verifique se estão no `beforeEach()`
3. **Handles abertos**: Use `--detectOpenHandles` para debug
4. **Cobertura baixa**: Verifique arquivos não testados

### Logs e Debug

- Use `console.log()` temporariamente para debug
- Configure `DEBUG=*` para logs detalhados
- Use `--verbose` para saída detalhada do Jest

## Recursos Adicionais

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [TypeScript Testing](https://kulshekhar.github.io/ts-jest/)
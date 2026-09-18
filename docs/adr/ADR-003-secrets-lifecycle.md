# ADR-003: Armazenamento e Ciclo de Vida de Segredos

- **Status**: Aprovado
- **Data**: 18 de setembro de 2026
- **Decisores**: Francisco Taveira Rios (MCT LTDA) & Orchestrator MCT OS v2.0
- **Contexto**: Na V2, 16 módulos diferentes acessavam `public_config` com formatos e chaves históricas heterogêneas, havendo risco de credenciais ou tokens de acesso transitarem em logs ou serem expostos acidentalmente ao frontend.

---

## Decisão

1. **Extinção Completa do Padrão `public_config`**:
   - Nenhuma credencial de API, token Meta, token WAHA, chave de webhook ou segredo trafega em tabelas de configuração genérica ou aberta.

2. **Segregação Estrita de Segredos**:
   - **Nível 1 (Infraestrutura & Aplicação)**: Chaves do sistema (`DATABASE_URL`, `REDIS_URL`, `APP_MASTER_KEY`, `JWT_SECRET`) injetadas via variáveis de ambiente/Docker Secrets protegidas (`.env` local 0600 em dev; segredos no orchestrator em prod).
   - **Nível 2 (Credenciais de Provedores por Workspace)**:
     - Armazenadas na tabela `provider_credentials`.
     - Todos os tokens (`access_token`, `refresh_token`, `waha_api_key`, `meta_app_secret`) são criptografados em repouso usando **AES-256-GCM** com vetor de inicialização (IV) e tag de autenticação por registro.
     - A chave mestra de criptografia (`APP_MASTER_KEY`) reside exclusivamente no ambiente da API e Worker, nunca no banco de dados.
     - Versão da chave é persistida junto ao payload cifrado para suportar rotação atômica de chaves.

3. **Prevenção de Vazamento em Logs e Payloads de Resposta**:
   - Logger estruturado (Pino em `packages/observability`) configurado com regras ativas de **redaction** para campos como:
     `token`, `password`, `secret`, `authorization`, `cookie`, `apiKey`, `phone_number` (sanitizado para logs).
   - Contratos de saída Zod (`packages/contracts`) omitem campos sensíveis: o frontend recebe apenas o status operacional da credencial (`has_token: true`, `expires_at`, `scopes`), nunca o token bruto.

---

## Consequências

### Positivas
- Elimina vazamento de tokens em dumps de banco, logs do sistema ou DevTools do navegador.
- Suporte a rotação de tokens com registro de histórico e auditoria.
- Conformidade rígida com LGPD e diretrizes de parceiro de tecnologia Meta (Meta Tech Partner).

### Negativas / Mitigações
- Custo de CPU para criptografia/decriptografia de tokens. Mitigado por cache em memória curto e seguro (LRU) nos workers durante o processamento de envelopes em lote.

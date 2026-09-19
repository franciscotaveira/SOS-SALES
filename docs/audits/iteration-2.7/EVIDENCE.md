# Auditoria de Execução e Aceite Final — Iteração 2.7: Autenticação Explícita e Fechamento Delimitado do Runner de Testes

Data: 18 de setembro de 2026  
Repositório: `/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES`  
Branch de trabalho: `codex/iteration-2.7`  
Commit base: `a4d9cf1` (main)  
Estado da árvore: Alterações delimitadas e testadas (uncommitted working tree preservada).  
Natureza da Revisão: **Segunda leitura realizada pelo próprio implementador (Gemini)**. Não constitui auditoria independente nem troca de contexto externo; as análises críticas do revisor humano foram incorporadas com total transparência quanto às suas origens.

---

## 1. Identificação de Papéis e Ownership

Conforme o protocolo do Prompt A e as diretrizes de fechamento delimitado do runner de testes:

- **Coordenador**: Ownership de `scripts/test-db-runner.ts`, `package.json`, scripts de provisionamento de teste, preservação da integridade da base do laboratório `sos_sales_v3` e consolidação deste relatório de evidências.
- **Especialista A**: Ownership de lifecycle e guards em `packages/database/src/test-support.ts`. Implementou validação estática fail-closed de `disposeTestDatabase`, verificação obrigatória de marcador de teste (`MCT_TEST_ISOLATED_DB`) e de posse exata via `runId` antes de qualquer `DROP DATABASE`, isolamento da credencial administrativa de teste (`TEST_ADMIN_DATABASE_URL`), geração de nomes de banco com `RUN_ID` exclusivo por execução, desativação por política de segurança da limpeza de órfãos por idade (`cleanOrphanTestDatabases`), e runner de sessão com guarda antecipada contra sinais de término (`executeTestRunnerSession`).
- **Especialista B**: Ownership de `packages/database/src/__tests__/test-support.test.ts` e integração de `runSafeNegativeDdlTest` em `packages/database/src/__tests__/tenant-isolation.test.ts`. Validou rejeição de descarte sem marcador, rejeição de recriação com `runId` divergente, recusa de limpeza por idade, aborto pré-spawn por `SIGINT`/`SIGTERM` com descarte limpo em `finally`, concorrência de runners e integridade de tabelas após tentativas DDL negativas.
- **Revisor (Segunda Leitura do Implementador)**: Inspeção rigorosa do código congelado, conferência dos 90 testes automatizados, build/typecheck do monorepo e controles HTTP Docker.

---

## 2. Fechamento dos Problemas Concretos do Runner

Na revisão do fechamento, foram identificados e corrigidos três problemas concretos adicionais:

| Ponto | Problema Identificado | Correção Implementada | Evidência de Runtime | Estado |
|---|---|---|---|---|
| **P01** | **Limpeza de órfãos podia apagar execução ativa**: O critério de idade (>10 min) permitia apagar bancos de runners lentos ou pausados sem comprovar inatividade de processo. | `cleanOrphanTestDatabases` foi temporariamente desabilitada por política de segurança com exceção fail-closed (`SAFETY POLICY: Automated orphan cleanup based on age is temporarily disabled...`). O comando `clean-orphans` foi removido de `package.json` e bloqueado no CLI. | Teste unitário em `test-support.test.ts` valida rejeição imediata; CLI sai com código 1. | **CORRIGIDO** |
| **P02** | **Recriação não conferia o dono da execução**: Em `bootstrapTestDatabase` com `dropExisting: true`, o código verificava o marcador mas não comparava o `runId` antes de emitir `DROP DATABASE`. | Adicionada checagem obrigatória de `runId`: se o banco existente possuir `run_id` divergente do `runId` da execução solicitada (ou ausente), a exclusão é recusada com `FATAL SAFETY VIOLATION`. | Teste unitário comprova que banco com `run_owner_alpha` recusa re-criação solicitada por `run_foreign_beta` ou sem `runId`. | **CORRIGIDO** |
| **P03** | **Cancelamento durante o bootstrap não interrompia o fluxo**: Sinais (`SIGINT`/`SIGTERM`) durante o bootstrap assíncrono setavam `isTerminating`, mas o processo continuava e iniciava o Vitest. | O lifecycle foi encapsulado em `executeTestRunnerSession`: após o bootstrap e antes de qualquer criação de processo filho, o código verifica `isTerminating`. Se cancelado, **o processo filho jamais é spawnado**, e o fluxo desvia para o bloco `finally` executando descarte garantido. | Testes com simulação de `SIGINT` (exit 130) e `SIGTERM` (exit 143) comprovam 0 chamadas a `spawn` e descarte verificado no PostgreSQL. | **CORRIGIDO** |
| **P04** | `disposeTestDatabase` criava pool sem validar host/porta/protocolo antes. | `disposeTestDatabase` executa `validateTestDatabaseUrl` e `validateTestAdminDatabaseUrl` estaticamente antes de instanciar pools ou abrir sockets. | `test-support.test.ts` valida rejeição de host remoto e nome inválido sem abrir pool. | **CORRIGIDO** |
| **P05** | `run` encerrava o processo no evento `close` sem chamar descarte garantido. | O runner executa o processo filho como `Promise` e invoca `disposeTestDatabase` incondicionalmente no bloco `finally`. | Log confirma: `Database ... successfully disposed. No orphan resources remain.` | **CORRIGIDO** |
| **P06** | Banco padrão compartilhado podia sofrer concorrência destrutiva. | Particionamento dinâmico por `RUN_ID`. Cada execução aloca um banco isolado `sos_sales_v3_test_run_<timestamp>_<hash>`. | Teste de concorrência valida múltiplos runners paralelos sem colisão. | **CORRIGIDO** |
| **P07** | Testes DDL negativos podiam destruir tabelas se tivessem privilégios indevidos. | Integrado `runSafeNegativeDdlTest` que encapsula o comando perigoso em `BEGIN ... ROLLBACK`, impedindo efeitos colaterais. | Testes confirmam tabela `workspaces` e `audit_events` intactas. | **CORRIGIDO** |
| **P08** | Credencial de migração exigia `CREATEDB` manual no lab. | Credencial administrativa separada (`TEST_ADMIN_DATABASE_URL` / `sos_user`). Testado em container virgem sem qualquer concessão manual. | Prova em container virgem na porta 55449 aprovada com 100% de sucesso. | **CORRIGIDO** |

---

## 3. Matriz de Critérios de Aceite Final (R01 — R10)

| Critério | Descrição | Comportamento Observado | Estado |
|---|---|---|---|
| **R01** | **Matriz de URLs autorizadas** | Valida estritamente protocolo (`postgres(ql):`), loopback host (`localhost`, `127.0.0.1`, `::1`), porta esperada (`55440` ou `TEST_DB_PORT`), nome governado (`sos_sales_v3_test` ou prefixo `sos_sales_v3_test_*`), roles distintas (`sos_app_user` vs `sos_migration_owner`) e opt-in explícito (`ALLOW_TEST_DB_ADMIN_OPERATIONS=true`). Rejeita destinos divergentes e bancos de lab/produção. | **APROVADO** |
| **R02** | **Fail-closed sem conexão prévia** | Todas as validações estáticas de criação e descarte ocorrem em memória antes de instanciar pools ou abrir sockets. Casos rejeitados falham antes de qualquer handshake PostgreSQL. | **APROVADO** |
| **R03** | **Sanitização de credenciais e logs JWT** | `sanitizeUrl` substitui senhas por `***`. `sanitizeAuthError` extrai exclusivamente atributos permitidos (`name`, `code`, `provider`, `messageCategory`), eliminando claims, email, sub, tokens e payloads de logs e exceptions. Logger configurado com redação adicional. | **APROVADO** |
| **R04** | **Ciclo de vida reproduzível com descarte no finally** | Distinção estrita entre reset pré-suíte e descarte pós-suíte: o runner aloca DB com `RUN_ID`, executa os testes e descarta garantidamente em `finally`. Suíte rodou 2 vezes seguidas com exit code 0 sem fixtures acumuladas no DB permanente e sem recursos órfãos. | **APROVADO** |
| **R05** | **Integridade do DB Lab e rollback seguro em DDL** | Consulta direta ao PostgreSQL confirma que `trg_audit_events_immutable` permanece habilitado (`O`) no banco `sos_sales_v3`. Helper `runSafeNegativeDdlTest` garante transação com `ROLLBACK` incondicional no `finally`. | **APROVADO** |
| **R06** | **Controles HTTP e testes existentes** | 90 testes unitários/integração passaram (10 arquivos). Script `scripts/verify-docker-http.mjs` validou no Docker: sem token (401), chave legada (401), iss errado (401), aud errada (401), sub não-UUID (401), token expirado (401) e token válido (200). | **APROVADO** |
| **R07** | **Build e Typecheck sem cache** | `pnpm turbo run build typecheck --force` concluiu 18 tarefas com sucesso (0 erros de tipagem ou compilação). Nenhum teste foi adulterado para burlar restrições. | **APROVADO** |
| **R08** | **Script de teste e relatório no repositório** | `scripts/verify-docker-http.mjs` rastreado como comando `pnpm run test:docker:http`. Relatório detalhado mantido em `docs/audits/iteration-2.7/EVIDENCE.md`. | **APROVADO** |
| **R09** | **Governança e transparência de revisão** | Papéis sequenciais declarados e revisão identificada como segunda leitura pelo próprio implementador, sem alegação de auditoria externa independente. | **APROVADO** |
| **R10** | **Delimitação formal de AC15** | AC15 permanece delimitado como **não comprovado / bloqueado externamente** até que um projeto Supabase legítimo de homologação esteja disponível. Nenhuma chamada à produção ou V2 foi realizada. | **BLOQUEADO EXTERNAMENTE** |

---

## 4. Comandos e Evidências Reais de Execução

### 4.1 Suíte Completa de Testes com Runner Isolado (90 testes em 10 suites)
```bash
$ pnpm run test:db:run
[test-db-runner] Assigned isolated run database 'sos_sales_v3_test_run_1789761381150_6rasxo' (runId: 'run_1789761381150_6rasxo').
[test-db-runner] Bootstrapping fresh test database 'sos_sales_v3_test_run_1789761381150_6rasxo'...
[test-db-runner] Database 'sos_sales_v3_test_run_1789761381150_6rasxo' ready with test marker.

 ✓ packages/auth/src/__tests__/auth-logging.test.ts (4 tests)
 ✓ packages/auth/src/__tests__/auth.test.ts (20 tests)
 ✓ packages/auth/src/__tests__/supabase-jwks.test.ts (3 tests)
 ✓ packages/database/src/__tests__/database-client.test.ts (2 tests)
 ✓ packages/database/src/__tests__/domain-fixtures.test.ts (3 tests)
 ✓ packages/database/src/__tests__/rls-policies.test.ts (6 tests)
 ✓ packages/database/src/__tests__/tenant-isolation.test.ts (7 tests)
 ✓ apps/api/src/__tests__/api.test.ts (7 tests)
 ✓ apps/api/src/__tests__/auth-vertical-slice.test.ts (19 tests)
 ✓ packages/database/src/__tests__/test-support.test.ts (25 tests)

 Test Files  10 passed (10)
      Tests  90 passed (90)
   Start at  16:56:21
   Duration  1.79s

[test-db-runner] Initiating disposal of test database 'sos_sales_v3_test_run_1789761381150_6rasxo' (runId: 'run_1789761381150_6rasxo')...
[test-db-runner] Database 'sos_sales_v3_test_run_1789761381150_6rasxo' successfully disposed. No orphan resources remain.
[test-db-runner] Finished with exit code 0.
Exit code: 0
```

### 4.2 Idempotência Confirmada na Segunda Execução Consecutiva
```bash
$ pnpm run test:db:run
[test-db-runner] Assigned isolated run database 'sos_sales_v3_test_run_1789761388136_x5gu8d' (runId: 'run_1789761388136_x5gu8d').
[test-db-runner] Bootstrapping fresh test database 'sos_sales_v3_test_run_1789761388136_x5gu8d'...
[test-db-runner] Database 'sos_sales_v3_test_run_1789761388136_x5gu8d' ready with test marker.

 Test Files  10 passed (10)
      Tests  90 passed (90)
   Start at  16:56:28
   Duration  1.43s

[test-db-runner] Initiating disposal of test database 'sos_sales_v3_test_run_1789761388136_x5gu8d' (runId: 'run_1789761388136_x5gu8d')...
[test-db-runner] Database 'sos_sales_v3_test_run_1789761388136_x5gu8d' successfully disposed. No orphan resources remain.
[test-db-runner] Finished with exit code 0.
Exit code: 0
```

### 4.3 Bloqueio do Comando `clean-orphans` por Política de Segurança
```bash
$ ALLOW_TEST_DB_ADMIN_OPERATIONS=true pnpm exec tsx scripts/test-db-runner.ts clean-orphans
[test-db-runner] FATAL SAFETY ERROR: 'clean-orphans' is temporarily disabled by safety policy. Age alone does not authorize deletion without proving process inactivity.
Exit code: 1
```

### 4.4 Build e Typecheck do Monorepo sem Cache
```bash
$ pnpm turbo run build typecheck --force
 Tasks:    18 successful, 18 total
Cached:    0 cached, 18 total
  Time:    11.731s
Exit code: 0
```

### 4.5 Controles HTTP no Docker Lab Ativo
```bash
$ pnpm run test:docker:http
[verify-docker-http] Testing against Docker API at: http://localhost:4400
- No token provided: HTTP 401 (expected 401) -> PASS
- Old default secret rejection (AC08): HTTP 401 (expected 401) -> PASS
- Wrong issuer rejection (AC05): HTTP 401 (expected 401) -> PASS
- Wrong audience rejection (AC06): HTTP 401 (expected 401) -> PASS
- Non-UUID subject rejection before database cast (AC07): HTTP 401 (expected 401) -> PASS
- Expired token rejection (AC07): HTTP 401 (expected 401) -> PASS
- Valid token positive control (AC04): HTTP 200 (expected 200) -> PASS
[verify-docker-http] SUCCESS: All 7 Docker HTTP positive and negative controls passed!
Exit code: 0
```

### 4.6 Verificação de Integridade dos Triggers do Lab Permanente
```bash
$ docker exec sos-v3-postgres psql -U sos_user -d sos_sales_v3 -c \
  "SELECT tgname, tgenabled, relname FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE tgname = 'trg_audit_events_immutable';"
           tgname           | tgenabled |   relname    
----------------------------+-----------+--------------
 trg_audit_events_immutable | O         | audit_events
(1 row)
Exit code: 0
```

---

## 5. Procedimento Seguro de Rollback

As alterações locais encontram-se em working tree não commitada sobre o commit `a4d9cf1`. Para permitir reversão segura sem descarte destrutivo do trabalho:

1. **Preservação do estado atual em branch de backup**:
   ```bash
   git checkout -b backup/iteration-2.7-uncommitted
   git add -A
   git commit -m "chore: snapshot de backup antes de rollback"
   ```
2. **Retorno ao commit base**:
   ```bash
   git checkout codex/iteration-2.7
   git checkout a4d9cf1
   ```
3. **Reconstrução dos containers da API**:
   ```bash
   docker compose build api && docker compose up -d api
   ```
*(O esquema do banco permanente `sos_sales_v3` não sofreu migrações, mantendo rollback de dados nulo).*

---

## 6. Limitações e Delimitação de Escopo

1. **AC15 Permanece Bloqueado Externamente**: Não foi provisionado projeto Supabase em nuvem para homologação remota, em estrito cumprimento da regra P0 de isolamento de infraestrutura de produção/V2. O comportamento do provedor Supabase JWKS foi integralmente comprovado em testes locais determinísticos (indisponibilidade 503, assinatura inválida 401, cache de chaves, rotação de chaves).
2. **Desativação de `clean-orphans`**: A limpeza automática por idade foi desabilitada para evitar o risco de deleção acidental de bancos pertencentes a execuções ativas. Caso um runner seja encerrado via `SIGKILL` (`kill -9`, não interceptável pelo Node.js), a remoção de bancos de teste temporários deve ser manual até que seja introduzida prova de inatividade de processo do runner.
3. **Próximas Etapas (Iteração 3)**: O fechamento do runner de testes e do suporte isolado está concluído. A transição para a Iteração 3 (Design System e Estrutura Visual da V3) aguarda autorização explícita de Francisco, não sendo iniciada automaticamente.

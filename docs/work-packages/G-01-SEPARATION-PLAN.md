# G-01 — Plano Canônico de Separação e Reconstrução de Checkpoints

> **Status:** `IMPLEMENTED_PENDING_ORCHESTRATOR_ACCEPTANCE`  
> **Data de Emissão:** 19 de setembro de 2026  
> **Repositório:** `/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES`  
> **Commit Base de Partida:** `a4d9cf13ad8885f2948bf51e1048947845ec38b7` (Iteração 2.6)  
> **Snapshot de Segurança:** `G-00 (20260919T045737Z)`  
> **Objetivo:** Propor a estratégia técnica rigorosa para desmembrar o working tree atual em 4 checkpoints limpos e verificáveis, sem executar qualquer mutação nesta etapa.

---

## 1. Princípios Arquiteturais da Reconstrução

1. **Zero Mutação no Working Tree Original:** O diretório de trabalho ativo não sofrerá `git reset`, `git clean` ou descartes durante a concepção.
2. **Reconstrução Hermética e Isolada:** A reconstrução futura (pacote G-04) será realizada em uma branch limpa (`rebuild/checkpoints`) ou worktree secundário descartável ancorado no commit consolidado `a4d9cf1` (Iteração 2.6).
3. **Progressão Incremental de Checkpoints:** Cada checkpoint deve ser autocontido, compilável, testável e auditável de forma independente antes do avanço para o próximo estágio.
4. **Regeneração Determinística de Lockfile:** O arquivo `pnpm-lock.yaml` nunca será mesclado manualmente por diff; ele será recalculado via `pnpm install --lockfile-only` no final de cada checkpoint com base nas dependências estritas daquele estágio.
5. **Garantia de Rollback Imediato:** Qualquer anomalia permite retornar instantaneamente ao estado bruto preservado no snapshot `G-00`.

---

## 2. Estrutura dos Quatro Checkpoints Propostos

A reconstrução divide os 149 arquivos do working tree em 4 commits limpos e sequenciais:

```text
[ a4d9cf1 ] (Iteração 2.6 - Base Consolidada)
     │
     ▼
[ Checkpoint 1: CP-GOV ]  ──> Governança, Charters, Roadmaps e Pacotes G-00/G-01/G-02
     │
     ▼
[ Checkpoint 2: CP-2.7 ]  ──> Auth JWKS, Local-JWT Hardening, Runner Hermético e DB Test Support
     │
     ▼
[ Checkpoint 3: CP-3 ]    ──> Design System @sos-sales/ui, AppShell, Sessão Web e Browser QA
     │
     ▼
[ Checkpoint 4: CP-4 ]    ──> Motor de Canais WhatsApp Dual-Engine, Ingress, Inbox/Outbox e Keyring
```

---

## 3. Detalhamento dos Checkpoints

### 3.1 Checkpoint 1: Governança Canônica (`CP-GOV`)
- **Escopo Temático:** Toda a documentação formal de arquitetura, governança, matriz de aceite e especificações de pacotes.
- **Arquivos Incluídos (19 arquivos):**
  - `docs/project/README.md`
  - `docs/project/PRODUCT_CHARTER.md`
  - `docs/project/MASTER_ROADMAP.md`
  - `docs/project/EXECUTION_BOARD.md`
  - `docs/project/DEPENDENCY_MAP.md`
  - `docs/project/QUALITY_GATES.md`
  - `docs/project/DEFINITION_OF_DONE.md`
  - `docs/project/ACCEPTANCE_MATRIX.md`
  - `docs/project/RISK_REGISTER.md`
  - `docs/project/ARCHITECTURE_MAP.md`
  - `docs/project/PROJECT_EXECUTION_PLAN.md`
  - `docs/project/RELEASE_STRATEGY.md`
  - `docs/project/SLO_AND_ALERTS.md`
  - `docs/project/TEAM_OPERATING_MODEL.md`
  - `docs/project/EVIDENCE_INDEX.md`
  - `docs/work-packages/G-00-SNAPSHOT.md`
  - `docs/work-packages/G-01-REBASELINE.md`
  - `docs/work-packages/G-01-INVENTORY.md`
  - `docs/work-packages/TEMPLATE.md`
- **Hunks em Arquivos Compartilhados:**
  - `.gitignore`: adição de `.vitest/` e `dist-lab/`.
- **Estratégia de Aplicação:** Cópia direta dos arquivos para a árvore.
- **Portões de Validação (`Gates`):**
  - Validação de links markdown e estrutura de schemas JSON.
  - Ausência de arquivos de código ou dependências de runtime.
  - `git status` limpo ao final do commit.

### 3.2 Checkpoint 2: Iteração 2.7 — Auth, Runner Hermético e Test Support (`CP-2.7`)
- **Escopo Temático:** Provedores de autenticação (Local JWT e Supabase JWKS), sanitização de logs, framework de banco hermético de testes e isolamento multi-tenant.
- **Arquivos Exclusivos (17 arquivos):**
  - `apps/api/src/__tests__/auth-vertical-slice.test.ts`
  - `apps/api/src/plugins/auth.plugin.ts`
  - `packages/auth/src/__tests__/auth.test.ts`
  - `packages/auth/src/__tests__/auth-logging.test.ts`
  - `packages/auth/src/__tests__/supabase-jwks.test.ts`
  - `packages/auth/src/index.ts`
  - `packages/auth/src/jwt-provider.ts`
  - `packages/auth/src/provider-factory.ts`
  - `packages/auth/src/sanitization.ts`
  - `packages/auth/src/supabase-jwks-provider.ts`
  - `packages/auth/src/types.ts`
  - `packages/database/src/__tests__/tenant-isolation.test.ts`
  - `packages/database/src/__tests__/test-support.test.ts`
  - `packages/database/src/test-support.ts`
  - `scripts/test-db-runner.ts`
  - `scripts/verify-docker-http.mjs`
  - `docs/audits/iteration-2.7/EVIDENCE.md`
- **Hunks em Arquivos Compartilhados:**
  - `.env.example`: Hunk de configuração de Auth (`AUTH_PROVIDER`, `JWT_SECRET`, etc.).
  - `apps/api/src/index.ts`: Hunk com `await app.ready()`.
  - `docker-compose.yml`: Hunk com variáveis de Auth no serviço `api`.
  - `package.json`: Hunk com scripts `"test:db:bootstrap"`, `"test:db:dispose"`, `"test:db:run"`, `"test:docker:http"`.
  - `packages/database/package.json`: Adição de `@types/pg` em `devDependencies`.
  - `packages/database/src/client.ts`: Funções `getDatabasePool`, `withTenantTransaction` e `closeAllDatabasePools`.
  - `packages/database/src/index.ts`: `export * from "./test-support"`.
  - `packages/observability/src/logger.ts`: Redaction de claims, email, sub.
- **Estratégia de Aplicação:** Aplicação de patch cirúrgico dos hunks da 2.7 e cópia dos arquivos de auth/test-support.
- **Portões de Validação (`Gates`):**
  - `pnpm install --lockfile-only` (regeneração do lockfile para CP-2.7).
  - `pnpm typecheck` (todos os pacotes).
  - `pnpm --filter @sos-sales/auth test`.
  - `pnpm --filter @sos-sales/database test:db:run` (validação de isolamento tenant e runner hermético).
  - `pnpm --filter @sos-sales/api test`.

### 3.3 Checkpoint 3: Iteração 3 — Design System `@sos-sales/ui`, AppShell e Web (`CP-3`)
- **Escopo Temático:** Pacote UI completo, tokens de design, componentes acessíveis (Focus Trap, WCAG 2.2 AA), App Web React e automação browser QA via CDP.
- **Arquivos Exclusivos (64 arquivos):**
  - `DESIGN.md`
  - Todos os 18 arquivos em `apps/web/` (HTML, TSConfig, ViteConfig, App.tsx, CSS, páginas, componentes, hooks, services, testes, `.env.lab`).
  - Todos os 30 arquivos em `packages/ui/` (tokens, componentes, types, testes).
  - Todos os 15 arquivos de evidência em `docs/audits/iteration-3/` (markdowns e screenshots de viewports).
  - `scripts/verify-browser-qa.mjs`.
- **Hunks em Arquivos Compartilhados:**
  - `package.json`: Adição do script `"test:browser": "node scripts/verify-browser-qa.mjs"`.
  - `apps/web/package.json`: Dependência do workspace `@sos-sales/ui`.
- **Estratégia de Aplicação:** Aplicação do pacote `@sos-sales/ui` e `apps/web/`.
- **Portões de Validação (`Gates`):**
  - `pnpm install --lockfile-only` (regeneração do lockfile incluindo `happy-dom`).
  - `pnpm typecheck`.
  - `pnpm --filter @sos-sales/ui test` (testes de componentes e acessibilidade).
  - `pnpm --filter @sos-sales/web test` (testes de sessão e api-client).
  - `pnpm build` (garantia de build dos pacotes e bundle web do Vite).
  - Execução de `node scripts/verify-browser-qa.mjs` (validação em Google Chrome real nos 3 viewports).

### 3.4 Checkpoint 4: Iteração 4 — Motor de Canais WhatsApp Dual-Engine, Ingress e Filas (`CP-4`)
- **Escopo Temático:** Arquitetura de canais WhatsApp (Meta WABA e WAHA), Transactional Inbox/Outbox, blindagem de webhook ingress sob FORCE RLS, resolução de segredos de assinatura e worker poller.
- **Arquivos Exclusivos (38 arquivos):**
  - Contratos: `packages/contracts/src/channel.ts`, `webhook-ingress.ts`, `inbound.ts`.
  - Aplicação: adaptadores Meta WABA, WAHA e Mock, fixtures, normalizadores, políticas de retry, registry, ssrf-guard, serviços monotônicos e verificação de assinatura em `packages/application/src/channels/`.
  - Banco de Dados: `005_channel_foundation_inbox_outbox.sql`, `infrastructure/crypto-payload.ts`, `database-signing-secret-resolver.ts` e testes de segurança.
  - Worker: `apps/worker/src/index.ts`, processadores `inbox-processor.ts` e `outbox-dispatcher.ts`, e testes de concorrência/resiliência.
  - API Ingress: `apps/api/src/plugins/raw-body.plugin.ts`, `routes/webhook.routes.ts` e testes de segurança de webhook.
  - Arquitetura: `docs/adr/ADR-005-channel-gateway-and-inbox-outbox.md`.
- **Hunks em Arquivos Compartilhados:**
  - `apps/api/src/index.ts`: Registro de rotas de webhook e injeção do pool de ingress.
  - `docker-compose.yml`: Variáveis `INGRESS_DATABASE_URL`, `WORKER_DATABASE_URL` e serviço `worker`.
  - `packages/database/src/client.ts`: Pools dedicados `ingressPool`, `workerPool` e helpers transacionais.
  - `packages/database/src/index.ts`: Exports de crypto-payload e secret-resolver.
  - `packages/observability/src/logger.ts`: Redaction de rotas de webhooks e payloads.
  - `packages/contracts/src/index.ts`: Exports de channel e webhook-ingress.
- **Estratégia de Aplicação e Saneamento:**
  - Este checkpoint não será aplicado de forma cega. Ele será decomposto na sequência oficial de pacotes `CH-00` a `CH-12`.
  - Durante a execução de `CH-01`, a migration 005 será reescrita para remover senhas fixas e corrigir a restrição CHECK de retries.
  - Durante `CH-02/03`, o worker terá leases renováveis e fencing estrito.
  - Durante `CH-04..06`, o ingress e o keyring serão consolidados.
- **Portões de Validação (`Gates`):**
  - `pnpm install --lockfile-only` (regeneração final do lockfile).
  - `pnpm typecheck` global.
  - `pnpm test` em toda a monorepo (222+ testes unitários e de integração).
  - Validação de concorrência com `SELECT FOR UPDATE SKIP LOCKED`.

---

## 4. Tratamento dos Arquivos Compartilhados (Mapeamento de Hunks)

Para evitar que commits anteriores contenham código morto ou não compilável de fases futuras, os 11 arquivos compartilhados serão divididos cirurgicamente:

| Arquivo | Checkpoint 1 (CP-GOV) | Checkpoint 2 (CP-2.7) | Checkpoint 3 (CP-3) | Checkpoint 4 (CP-4) |
|---|---|---|---|---|
| `.env.example` | — | Hunk Auth (local-jwt, jwks) | — | Hunk Master Key & Canais |
| `.gitignore` | Hunk `.vitest/` e `dist-lab/` | — | — | — |
| `apps/api/src/index.ts` | — | Hunk `app.ready()` | — | Hunks Webhook Routes & Ingress Pool |
| `docker-compose.yml` | — | Hunk Auth Envs (API) | — | Hunks Ingress/Worker URLs & Worker Service |
| `package.json` | — | Hunk Scripts `test:db:*`, `docker:http` | Hunk Script `test:browser` | — |
| `pnpm-lock.yaml` | Regenerado limpo | Regenerado limpo | Regenerado limpo | Regenerado limpo |
| `packages/database/package.json` | — | Hunk `@types/pg` | — | — |
| `packages/database/src/client.ts` | — | Hunk `closeAllPools`, pool opcional | — | Hunks Ingress/Worker pools, lookups |
| `packages/database/src/index.ts` | — | Hunk `export * from "./test-support"` | — | Hunks crypto-payload & secret-resolver |
| `packages/observability/src/logger.ts` | — | Hunk Redaction Auth (claims/email/sub) | — | Hunk Serializers & Redaction Webhooks |
| `packages/contracts/src/index.ts` | — | — | — | Hunk `export * from "./channel", "./webhook-ingress"` |

---

## 5. Estratégia de Regeneração do Lockfile (`pnpm-lock.yaml`)

O arquivo `pnpm-lock.yaml` é frequentemente corrompido quando se tenta mesclar diffs de texto entre branches. Para garantir 100% de reproducibilidade:
1. **Regra de Ouro:** Nunca usar `git checkout --patch` ou resolver conflitos de texto em `pnpm-lock.yaml`.
2. **Procedimento Automatizado:**
   ```bash
   # Ao consolidar qualquer checkpoint:
   # 1. Aplica-se as alterações nos package.json
   # 2. Executa-se a regeneração limpa pelo próprio gerenciador de pacotes:
   pnpm install --lockfile-only
   # 3. Adiciona-se o lockfile recalculado ao commit do checkpoint
   git add pnpm-lock.yaml
   ```
3. Isso garante que cada checkpoint possua uma árvore de dependências válida, sem pacotes fantasmas de iterações posteriores.

---

## 6. Ordem Estrita de Execução (Fase G-04)

Quando o pacote `G-04 — Separação e Reconstrução` for iniciado, a execução seguirá obrigatoriamente os passos abaixo:

1. **Passo 1 (Criação do Worktree Limpo):**
   - Criação de um novo worktree a partir do commit `a4d9cf1` na branch `rebuild/checkpoints`.
2. **Passo 2 (Commit CP-GOV):**
   - Aplicação dos 19 arquivos de governança e atualização do `.gitignore`.
   - Commit: `docs(gov): establish canonical project governance and G-00..G-02 artifacts`.
3. **Passo 3 (Commit CP-2.7):**
   - Aplicação dos 17 arquivos da Iteração 2.7 e hunks correspondentes nos arquivos compartilhados.
   - Execução de `pnpm install --lockfile-only`.
   - Validação da suíte de testes de Auth e Tenancy.
   - Commit: `feat(auth): consolidate iteration 2.7 auth providers and hermetic test runner`.
4. **Passo 4 (Commit CP-3):**
   - Aplicação dos 64 arquivos da Iteração 3 (Design System, App Web e Browser QA).
   - Execução de `pnpm install --lockfile-only`.
   - Validação de build, testes de componentes e script CDP de browser.
   - Commit: `feat(ui): consolidate iteration 3 design system, appshell and web application`.
5. **Passo 5 (Preparação para Fase CH - Iteração 4):**
   - Como a Iteração 4 requer correções de segurança (P0/P1), os arquivos da Fase CH serão isolados na branch `feat/channels-foundation`.
   - Os pacotes `CH-00` a `CH-12` serão implementados sequencialmente, saneando a migration 005 e os processadores de worker com qualidade comprovada.

---

## 7. Procedimento de Rollback e Contingência

Caso qualquer etapa da reconstrução em G-04 apresente divergência irrecuperável:

1. **Descarte do Worktree Temporário:**
   ```bash
   git worktree remove /caminho/do/worktree-rebuild --force
   ```
2. **Restauração do Estado Bruto:**
   O snapshot em `/Users/franciscotaveira.ads/Downloads/FT/.chat-sales-recovery/G-00/20260919T045737Z` permanece 100% intocado. As instruções em `restore.md` permitem restaurar o working tree original em menos de 10 segundos a partir de `repository.bundle`, `staged.patch`, `unstaged.patch` e `untracked.tar`.

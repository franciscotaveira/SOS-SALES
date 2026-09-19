# G-01 — Portões de Qualidade Canônicos e Comandos de Validação (Quality Gates)

> **Status:** `IMPLEMENTED_PENDING_ORCHESTRATOR_ACCEPTANCE`  
> **Data de Emissão:** 19 de setembro de 2026  
> **Repositório:** `/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES`  
> **Objetivo:** Definir comandos reproduzíveis, estritos e verificados para cada checkpoint de reconstrução (Governança, Iteração 2.7, Iteração 3 e Iteração 4), separando os eixos de compilação, tipos, testes unitários, testes de banco, contratos, segurança e browser QA.  
> **Regra de Ouro:** Não executar suítes funcionais completas durante o pacote G-01. Apenas validar que os comandos existem, apontam para scripts válidos e correspondem à estrutura de pacotes da monorepo.

---

## 1. Visão Geral dos Portões por Checkpoint

| Checkpoint | Typecheck | Build | Unit Tests | DB Tests | Contract | Integration | Browser QA | Security |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **CP-GOV** | N/A | N/A | N/A | N/A | N/A | N/A | N/A | Validação de segredos |
| **CP-2.7** | Obrigatório | Obrigatório | Obrigatório | Obrigatório (Hermético) | Obrigatório | Obrigatório (Fastify) | N/A | Redaction & Sanitization |
| **CP-3** | Obrigatório | Obrigatório (Vite) | Obrigatório (Happy-DOM) | N/A | N/A | N/A | Obrigatório (CDP Real) | A11y WCAG 2.2 AA & Focus Trap |
| **CP-4** | Obrigatório | Obrigatório | Obrigatório | Obrigatório (Inbox/Outbox) | Obrigatório (Zod) | Obrigatório (Ingress/Worker) | N/A | HMAC, SSRF Guard & Roles |

---

## 2. Comandos Detalhados por Checkpoint

### 2.1 Checkpoint 1: Governança Canônica (`CP-GOV`)

O checkpoint de governança estabelece as fontes de verdade documental e de processos.

| Eixo | Comando de Validação | Condição de Aprovação | Evidência Gerada |
| :--- | :--- | :--- | :--- |
| **Markdown Lint & Links** | `find docs -name "*.md" -exec test -f {} \;` | Zero erros de sintaxe; todos os arquivos legíveis. | Logs no terminal |
| **Integridade de Schemas** | `find docs -name "*.json" -exec python3 -m json.tool {} > /dev/null \;` | Todos os manifests JSON (G-00, G-01, Evidence Index) 100% válidos. | Exit code 0 |
| **Security Audit** | `grep -rn -E "(password|secret|key): [^ ]+" docs/ \|\| true` | Nenhum segredo ou credencial real em plain text em markdown. | Zero ocorrências |

---

### 2.2 Checkpoint 2: Iteração 2.7 — Auth, Runner Hermético e DB Test Support (`CP-2.7`)

Valida o motor de autenticação, o provedor Supabase JWKS, o provedor local JWT e o runner hermético de banco de dados.

| Eixo | Comando de Validação | Condição de Aprovação | Evidência Gerada |
| :--- | :--- | :--- | :--- |
| **Typecheck** | `pnpm --filter @sos-sales/auth --filter @sos-sales/database typecheck` | Zero erros TypeScript (`tsc --noEmit`). | Saída do compilador |
| **Build** | `pnpm --filter @sos-sales/auth --filter @sos-sales/database build` | Geração limpa de bundles CJS/ESM em `dist/`. | Artefatos em `dist/` |
| **Unit Tests** | `pnpm --filter @sos-sales/auth test` | Suíte de testes unitários do provedor JWT e JWKS com 100% de sucesso. | Relatório Vitest |
| **Database Tests** | `ALLOW_TEST_DB_ADMIN_OPERATIONS=true pnpm --filter @sos-sales/database test:db:run` | Criação, migração e destruição limpa de banco hermético temporário; isolamento RLS entre workspaces validado. | Logs de test-support |
| **Integration Tests** | `pnpm --filter @sos-sales/api test apps/api/src/__tests__/auth-vertical-slice.test.ts` | Teste vertical Fastify autenticado via rotas `/v1/me` e `/v1/workspaces`. | Relatório Vitest |
| **Security (Redaction)** | `pnpm test packages/auth/src/__tests__/auth-logging.test.ts` | Tokens, emails e claims devidamente ofuscados nos logs estruturados. | Asserções de redaction |

---

### 2.3 Checkpoint 3: Iteração 3 — Design System `@sos-sales/ui`, AppShell e Web (`CP-3`)

Valida o pacote de componentes de interface, a responsividade universal e os critérios de acessibilidade.

| Eixo | Comando de Validação | Condição de Aprovação | Evidência Gerada |
| :--- | :--- | :--- | :--- |
| **Typecheck** | `pnpm --filter @sos-sales/ui --filter @sos-sales/web typecheck` | Zero erros de tipagem nos componentes e páginas. | Saída do compilador |
| **Build (UI Package)** | `pnpm --filter @sos-sales/ui build` | Tokens CSS e componentes empacotados com sucesso. | Diretório `dist/` |
| **Build (Web App)** | `pnpm --filter @sos-sales/web build` | Bundle de produção gerado pelo Vite sem avisos bloqueantes. | Diretório `apps/web/dist/` |
| **Unit Tests (UI)** | `pnpm --filter @sos-sales/ui test` | Testes de componentes React (Button, Alert, Dialog, Drawer, Badge) passando. | Relatório Vitest |
| **Unit Tests (Web)** | `pnpm --filter @sos-sales/web test` | Testes do cliente de API e gerenciador de sessão passando em `happy-dom`. | Relatório Vitest |
| **Browser QA (CDP Real)**| `node scripts/verify-browser-qa.mjs` | Execução em Google Chrome real: 0 overflow em 375, 768 e 1440px; Focus Trap aprovado; WCAG >= 4.5:1. | Screenshots e log |
| **Security (A11y)** | Validação no script CDP | Quarentena do catálogo em produção ativa (`VITE_DEV_LAB=false`). | Log de inspeção DOM |

---

### 2.4 Checkpoint 4: Iteração 4 — Motor de Canais WhatsApp, Ingress e Worker (`CP-4`)

Valida o fluxo transacional de mensageria (Inbox/Outbox), a proteção de webhooks e a integridade de filas.

| Eixo | Comando de Validação | Condição de Aprovação | Evidência Gerada |
| :--- | :--- | :--- | :--- |
| **Typecheck** | `pnpm --filter @sos-sales/contracts --filter @sos-sales/application --filter @sos-sales/worker typecheck` | Zero erros de tipagem em contratos, portas e adaptadores. | Saída do compilador |
| **Build** | `turbo build` (em toda a monorepo) | Compilação com sucesso de todos os pacotes e aplicações. | Diretórios `dist/` |
| **Contract Tests** | `pnpm --filter @sos-sales/contracts test` | Validação de schemas Zod para mensagens, eventos e receipts. | Relatório Vitest |
| **Unit Tests (Adapters)**| `pnpm --filter @sos-sales/application test` | Normalizadores WABA/WAHA, políticas de retry e monotonicity service aprovados. | Relatório Vitest |
| **Database Tests (005)** | `ALLOW_TEST_DB_ADMIN_OPERATIONS=true pnpm test packages/database/src/__tests__/channel-foundation-security.test.ts` | Migration 005 saneada (sem senhas hardcoded), permissões estritas de roles e RLS negativas. | Logs do runner |
| **Integration (Ingress)** | `pnpm test apps/api/src/__tests__/webhook-ingress.test.ts` | Ingress Fastify recebendo webhooks, validando assinaturas e inserindo no inbox. | Relatório Vitest |
| **Integration (Worker)**  | `pnpm test apps/worker/src/__tests__/inbox-and-outbox-processor.test.ts` | Processamento de inbox e outbox com recuo exponencial e leases renováveis. | Relatório Vitest |
| **Concurrency & Fencing**| `pnpm test apps/worker/src/__tests__/worker-operational-resilience.test.ts` | Concorrência segura via `SELECT FOR UPDATE SKIP LOCKED` e fencing de lease. | Asserções concorrentes |
| **Security (SSRF & Key)**| `pnpm test packages/application/src/__tests__/http-operational-security.test.ts packages/database/src/__tests__/crypto-keyring.test.ts` | SSRF guard bloqueando IPs privados; criptografia AES-256-GCM validada. | Relatório de testes |

---

## 3. Matriz de Correspondência de Scripts do `package.json`

Validação de que todos os comandos declarados no root `package.json` correspondem a alvos e arquivos existentes no repositório:

| Script no `package.json` | Comando Mapeado | Arquivo Alvo Existente | Status no Repositório |
| :--- | :--- | :--- | :---: |
| `"build"` | `turbo build` | `turbo.json` | Válido |
| `"dev"` | `turbo dev` | `turbo.json` | Válido |
| `"test"` | `vitest run` | `vitest.config.ts` (ou padrão) | Válido |
| `"test:db:bootstrap"` | `ALLOW_TEST_DB_ADMIN_OPERATIONS=true tsx scripts/test-db-runner.ts bootstrap` | `scripts/test-db-runner.ts` | Válido |
| `"test:db:dispose"` | `ALLOW_TEST_DB_ADMIN_OPERATIONS=true tsx scripts/test-db-runner.ts dispose` | `scripts/test-db-runner.ts` | Válido |
| `"test:db:run"` | `ALLOW_TEST_DB_ADMIN_OPERATIONS=true tsx scripts/test-db-runner.ts run` | `scripts/test-db-runner.ts` | Válido |
| `"test:docker:http"` | `node --env-file=.env scripts/verify-docker-http.mjs` | `scripts/verify-docker-http.mjs` | Válido |
| `"test:browser"` | `node scripts/verify-browser-qa.mjs` | `scripts/verify-browser-qa.mjs` | Válido |
| `"typecheck"` | `turbo typecheck` | `turbo.json` | Válido |
| `"lint"` | `turbo lint` | `turbo.json` | Válido |

---

## 4. Limitações e Regras Operacionais para Execução dos Gates

1. **Restrição Read-Only de G-01:** Os comandos descritos nesta matriz foram catalogados e validados conceitualmente. A execução completa das suítes de teste funcionais e mutações em banco efêmero será realizada estritamente durante o pacote de reconstrução `G-04`.
2. **Ambiente Hermético:** Os testes de banco de dados (`test:db:*`) dependem de um servidor PostgreSQL local acessível nas credenciais administrativas de desenvolvimento (porta 5432 ou 55440 conforme `.env`).
3. **Ambiente de Browser:** O script `test:browser` exige a presença do Google Chrome instalado no host para controle via CDP.

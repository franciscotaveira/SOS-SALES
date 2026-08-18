# Release Baseline — SOS Sales (MCT OS v2.0)

> **Data de Emissão**: 18 de Agosto de 2026  
> **Responsável**: Principal Software Engineer + Release Hardening Lead + QA/Security Reviewer  
> **Status da Missão**: FASE 0 CONCLUÍDA — FEATURE FREEZE ATIVO  

---

## 1. Identificação de Baseline do Código

* **Branch**: `main`
* **Commit Baseline**: `5966292` (`chore: add gstack skill routing rules to CLAUDE.md`)
* **Estado do Working Tree**: Modificações de polimento e componentes de controle isolados.
* **Política Operacional**: **FEATURE FREEZE ABSOLUTO**. Nenhuma feature nova será criada. Todo o foco é estabilização, hardening, segurança, eliminação de bugs/regressões e preparação de release segura para o VPS.

---

## 2. Topologia de Ambientes

| Ambiente | Host / URL | Papel | Estratégia de Deploy |
| :--- | :--- | :--- | :--- |
| **Produção (VPS)** | `https://crm.iaparavendas.tech` (IP: `179.197.72.221`) | Produção Oficial de Clientes | Caddy Proxy + Docker Compose (`sos-sales-api`, `sos-sales-waha`, `sos-sales-redis`) |
| **Laboratório / Staging** | `http://localhost:3333` (API: `4335`) | Staging & Hardening Lab | Docker Compose Isolado (`docker-compose.lab.yml`) |
| **Dev Local** | `http://localhost:3000` (Vite) | Desenvolvimento / Verificação Rápida | Vite Dev Server + Fastify TSX |

---

## 3. Stack Tecnológico Real

* **Frontend**:
  * React 19 (`19.0.1`) + Vite 6 (`6.2.3`) + TypeScript 5.8
  * TailwindCSS v4 (`@tailwindcss/vite` 4.1.14)
  * Lucide React Icons (`0.546.0`), Recharts (`3.10.1`), Motion (`12.23.24`)
  * Supabase Client (`@supabase/supabase-js` 2.112.3)
* **Backend**:
  * Node.js 20/22 ESM + Fastify 4 (`4.27.0`) + TSUP (`8.0.2`)
  * Zod (`3.23.8`) + Fastify Type Provider Zod (`1.1.9`)
  * Jose (`5.10.0` para JWT/JWKS verification)
  * Postgres (`pg` 8.11.5 com Connection Pooling)
  * IORedis (`5.4.1`) + BullMQ (`5.8.0`)
  * Pino Logger (`9.0.0`)
* **Banco de Dados & Autenticação**:
  * Supabase PostgreSQL (Remote: `yiiuebhyqixzluguxsqi` via Transaction Pooler na porta `6543`)
  * 34 Tabelas protegidas com Row-Level Security (RLS) baseadas em `current_user_workspace_ids()`
  * Supabase GoTrue Auth (JWT RS256/HS256)
* **Engines de WhatsApp & Comunicação**:
  * **WABA (Meta Cloud API v20.0)**: Canal oficial com latência de 150ms, Templates HSM homologados, Botões Interativos, Listas, WhatsApp Flows e Meta CAPI.
  * **WAHA (`devlikeapro/waha:latest`)**: Instância de WhatsApp Web para chat em tempo real dos operadores humanos e monitoramento de grupos.
* **Inteligência Artificial & Copilot**:
  * Router OpenRouter / Google GenAI SDK (`@google/genai` 2.4.0)
  * Semantic Intent Parser (`universalToolVisionEngine.ts`)
  * Human-in-the-Loop Supervisor (`AutonomousSupervisorPanel.tsx`)

---

## 4. Integrações Externas & Webhooks

1. **Meta Graph API v20.0**:
   * Endpoint de Webhook: `/webhooks/waba` (Validação de `hub.verify_token` e assinatura `X-Hub-Signature-256`)
   * Gestão de Templates HSM: `/api/v1/workspaces/:wsId/channels/whatsapp/templates`
   * Conversões Server-side Meta CAPI: `/api/v1/workspaces/:wsId/traffic-proof/capi`
2. **WAHA Gateway**:
   * Endpoint de Webhook: `/webhooks/waha` (Eventos: `message`, `message.any`, `session.status`)
   * Dispatch Outbound: `/api/v1/workspaces/:wsId/channels/whatsapp/send`
3. **Trinks Agenda (Haven Escovaria)**:
   * Leitura e cálculo de janelas contínuas de tempo (`freeWindowMinutes >= duration`)
   * Mapeamento de 8 profissionais e regras de expediente (08:00 às 20:00)
4. **AbacatePay**:
   * Geração de Pix dinâmico e conciliação de pagamentos com as jornadas

---

## 5. Fluxos Críticos de Negócio

1. **Fluxo 1 — Ingestão e Atribuição de Lead (Meta Ads CTWA / WhatsApp)**
   * Recebe payload do anúncio com ID da campanha e termo de busca.
   * Cria ou vincula contato, inicializa jornada comercial no estágio `LEAD` com deduplicação de mensagens.
2. **Fluxo 2 — Cockpit Comercial & Atendimento 1:1**
   * Feed de mensagens ao vivo, fila de prioridades, dossiê do lead.
   * Protocolo Antiban de 24h: aviso visual e bloqueio de envio livre fora da janela de 24h (exige HSM).
3. **Fluxo 3 — Agendamento Inteligente & Checagem de Grade**
   * Extração de procedimento, dia, turno e profissional da conversa.
   * Seleção e inserção de proposta de vaga confirmada em 1 clique.
4. **Fluxo 4 — Funil Comercial Kanban & Pipeline Financeiro**
   * Movimentação de leads entre 5 etapas (`LEAD`, `QUALIFICADO`, `PROPOSTA`, `NEGOCIACAO`, `GANHO`).
   * Cálculo em tempo real do valor financeiro do pipeline e taxa de conversão.
5. **Fluxo 5 — Fechamento Comercial & Registro de Outcome**
   * Confirmação de desfecho (`WON` / `LOST`), gravação de valor em centavos e disparo de evento de conversão.

---

## 6. Inventário de Testes Existentes

* **Testes Unitários (Backend)**: 8 arquivos em `apps/api/tests/unit/`
* **Testes de Integração (Backend)**: 30 arquivos em `apps/api/tests/integration/`
* **Auditoria E2E de Rotas de Produção**: `test-e2e-all-routes.js` (9 rotas críticas testadas com 100% de sucesso)
* **Auditoria de Isolamento RLS**: `test-rls-validation.js`

---

## 7. Riscos Iniciais & Matriz de Atenção para Hardening

1. **Risco P0/P1 — Isolamento Multi-Tenant**: Garantir que nenhum ID manipulado no frontend consiga ler ou atualizar jornadas, contatos ou mensagens de outro workspace.
2. **Risco P0/P1 — Idempotência de Webhooks**: Garantir que webhooks duplicados (da Meta ou do WAHA) não gerem mensagens ou jornadas duplicadas.
3. **Risco P1 — Antiban & Janela de 24h**: Garantir que o backend rejeite rigorosamente disparos não-HSM após 24h do último contato do lead.
4. **Risco P1 — Observabilidade & Recovery**: Garantir logs estruturados e capacidade de rollback limpo no VPS.

---

## 8. Decisão do Gate 0

* **Status**: **PASS (APROVADO)**
* **Bloqueadores para Fase 1**: Nenhum bloqueador identificado.
* **Ação Imediata**: Avançar para a **FASE 1 — PROTEÇÃO E RECUPERAÇÃO**.

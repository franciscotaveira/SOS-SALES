# AGENTS.md — Bússola Universal SOS Vendas
> Leia este arquivo PRIMEIRO. Ele orienta qualquer IA (Claude, Gemini, Hermes, GPT) sobre onde está o projeto, o que está feito e o que fazer agora.
> Atualizado: 05 Set 2026 | MCT OS v2.0

---

## 1. IDENTIDADE DO PROJETO

**SOS Vendas** — CRM operacional de alta performance para vendas via WhatsApp.
- **URL Produção:** https://crm.iaparavendas.tech
- **VPS:** 179.197.72.221 (Ubuntu 24.04, Docker, Caddy)
- **Supabase:** yiiuebhyqixzluguxsqi (aws-0-ca-central-1.pooler.supabase.com:6543)
- **Stack:** React 19 + Vite + TypeScript + TailwindCSS v4 + Fastify 4 + PostgreSQL + Redis + WAHA + Meta Cloud API v20.0
- **Filosofia:** Poder invisível, simplicidade visível.

---

## 2. ESTADO ATUAL (05 Set 2026)

### ✅ FUNCIONANDO EM PRODUÇÃO
- Release ativa: `cdd115f961378098b731f3ec3d1c2ca590c43773` (SOS Vendas Mobile Edge-to-Edge & Ergonomia Nativa PWA)
- Layout 100% responsivo e padrão de app nativo (Apple HIG + WhatsApp Native):
  - Fim das molduras cinzas e bordas flutuantes no celular: contêineres preenchem 100% da tela (`p-0 md:p-3`).
  - Cockpit Master-Detail estrito: Alternância fluida entre Fila de Oportunidades e Chat 1:1 com botão `< Voltar`.
  - Cabeçalho do Chat em linha única de 56px (`h-14 flex-nowrap`): Nome com `truncate` e ações rápidas táteis (`Dossiê`, `Concluir` e `Mais (...)`).
  - Composer com prevenção de auto-zoom no iOS (fonte 16px) e alternância nativa entre Microfone e Enviar ao digitar.
  - Funil Kanban e Central de Conversas sem overflow horizontal, com seletor de etapas por pills e cartões edge-to-edge.
- Todos os agentes e módulos de IA padronizados no motor soberano **NVIDIA NIM** (`NvidiaNimEngine`):
  - **Receptionist 24/7:** `meta/llama-3.1-70b-instruct` / `nvidia/llama-3.3-nemotron-super-49b-v1`
  - **Copilot Comercial & Dossiê do Lead:** `meta/llama-3.1-70b-instruct`
  - **Visão & OCR Multimodal:** `meta/llama-3.2-11b-vision-instruct`
  - **Reanimação de Vácuo / Ghosting:** `meta/llama-3.1-70b-instruct`
  - **Evolução de Playbook:** `meta/llama-3.1-70b-instruct` / `deepseek-ai/deepseek-r1`
  - **Retenção & LTV Pós-Venda:** `meta/llama-3.1-70b-instruct`
- Experiência mobile nativa: Bottom Navigation Bar com safe-area insets, Cockpit master-detail (Lista ↔ Chat 1:1), Funil Kanban com seletor de etapas por pills e Dossiê IA acessível via modal/bottom sheet.
- Sistema de cores padronizado (`--sos-action: #00A884`, `--sos-operational: #2563EB`, `--sos-ai: #7C3AED`, `--sos-warning: #D97706`, `--sos-danger: #DC2626`, `--sos-dark: #0B132B`).
- Ícones Lucide alinhados: `Mais` (Menu), `Dossiê` (Sparkles), `Assumir` (UserCheck), `Concluir` (CheckCircle2), `Agora` (Flame), `Conversas` (MessageSquare), `Funil` (Columns3).
- Interface operacional enxuta: Cockpit 1:1, Funil Kanban, Configurações de Canais & Traqueamento.
- Espelhamento de Agenda Web (Trinks / Portal do Salão) destravado no Cockpit (`Alt + A`).
- API: rotas E2E OK, auth Supabase + RLS multi-tenant, 44 tabelas no schema público.
- WhatsApp WAHA + Meta WABA (Arsenal completo: Pix, SPM/MPM, Location, Flows, Carousel, OTP).
- Docker Lab local: http://localhost:3333 (frontend) + http://localhost:4335 (API).

### 🔄 EM ANDAMENTO (TAREFA ATIVA)
- **Auditoria e Homologação dos 5 Pilares do MVP Canônico:**
  1. Gestão Operacional de WhatsApp (Cockpit Agora + Funil Kanban)
  2. Traqueamento Meta Ads ↔ Conversions API (CAPI loop fechado)
  3. Agente 24/7 & Handoff Humano (Receptionist worker)
  4. Espelhamento de Agenda Externa (Trinks / {{horarios}} no Cockpit)
  5. Conexão Dual-Engine WAHA + Meta WABA (Arsenal Interativo)
  - **Roteiro de execução:** `PROMPT_VALIDACAO_5_PILARES_MVP.md`

### ❌ PENDENTE (não iniciar sem aprovação do Francisco)
- Deploy de novas features no VPS sem passar pelo Docker Lab
- Qualquer mudança em produção sem build + rsync completo

---

## 3. FLUXO DE TRABALHO OBRIGATÓRIO (MCT OS)

```
1. npm run dev          → localhost:5173 (desenvolvimento com hot-reload)
       ↓
2. Docker Lab           → localhost:3333 (validação integrada)
   docker compose -f docker-compose.lab.yml up --build -d
       ↓
3. Build + Deploy VPS   → crm.iaparavendas.tech
   APP_ENV=production npm run build
   APP_ENV=production npm --prefix apps/api run build
   bash scripts/preflight-production-deploy.sh
   bash scripts/stage-production-release.sh
   bash scripts/promote-production-release.sh "$(git rev-parse HEAD)"  # exige aprovação humana
```

**REGRA ABSOLUTA:** Nunca testar diretamente no VPS. Sempre Docker Lab primeiro.

---

## 4. MAPA DE ARQUIVOS — O QUE LER PARA CADA TAREFA

| Tarefa | Arquivo a ler |
|--------|---------------|
| Auditoria 5 Pilares MVP (Ativa) | `PROMPT_VALIDACAO_5_PILARES_MVP.md` |
| Especificação Funcional Canônica | `docs/SPEC_FUNCIONAL_SOS_SALES.md` |
| Contexto técnico geral | `CODEBASE.md` |
| Decisões arquiteturais | `DECISION_LOG.md` |
| Visão de produto / roadmap | `BLUEPRINT_SOS_SALES.md` |
| Manuais & Runbooks de Operação | `docs/runbooks/` |
| Relatórios de Auditoria Passados | `docs/audits/` |
| Skills do Claude/Hermes | `CLAUDE.md` |
| Design system (tokens CSS) | `src/index.css` |
| Rotas da API | `openapi.json` / `openapi.yaml` |
| Componentes UI | `src/components/` (17 módulos) |
| Backend API | `apps/api/src/` |
| Scripts de teste | `scripts/` |
| Screenshots das telas | `docs/screenshots/` |

---

## 5. COMANDOS RÁPIDOS

```bash
# Dev local
npm run dev

# Docker Lab (subir)
docker compose -f docker-compose.lab.yml up --build -d

# Docker Lab (logs API)
docker logs sos-sales-lab-api --tail 50 -f

# Docker Lab (parar)
docker compose -f docker-compose.lab.yml down

# Build completo + verificação dos artefatos de release
APP_ENV=production npm run build && APP_ENV=production npm --prefix apps/api run build
bash scripts/preflight-production-deploy.sh

# Deploy VPS (só depois do lab!)
bash scripts/stage-production-release.sh
bash scripts/promote-production-release.sh "$(git rev-parse HEAD)"  # só após aprovação

# Rollback atômico de frontend + API + runtime + CA + compose
bash scripts/rollback-production-release.sh

# Auditoria E2E (9 rotas)
node scripts/test-e2e-all-routes.js

# Health checks
curl http://localhost:4335/health          # lab
curl https://crm.iaparavendas.tech/health  # produção

# VPS: status containers
ssh vps "docker ps --format 'table {{.Names}}\t{{.Status}}'"

# VPS: logs produção
ssh vps "docker logs sos-sales-api --tail 50"

# Redis flush (idempotência)
ssh vps "docker exec sos-sales-redis redis-cli FLUSHALL"
```

---

## 6. ARQUITETURA RÁPIDA

```
src/components/
├── cockpit/       ← Tela principal 3 colunas (fila | chat WhatsApp | dossiê IA)
├── kanban/        ← Funil comercial 5 etapas com KPI financeiro
├── conversations/ ← Hub unificado lista/funil/TV
├── agenda/        ← Calendário dia/semana/mês
├── groups/        ← Monitor de grupos WhatsApp
├── results/       ← Analytics, CTWA, Broadcast, Templates WABA
├── intelligence/  ← Sales AI Playbook, Knowledge Base, Agentes
├── settings/      ← Canais, Equipe, API, Feature Flags
├── notes/         ← Anotações da equipe
└── layout/        ← AppShell (sidebar dark + topbar)

apps/api/src/
├── domain/               ← Entidades puras (DDD)
├── application/services/ ← Serviços de negócio + Meta Partner
├── infrastructure/       ← Gateways Postgres + Clientes Meta
└── interfaces/http/      ← Rotas Fastify + Webhooks
```

---

## 7. REGRAS INVIOLÁVEIS (MCT OS P0)

- ❌ Nunca usar n8n
- ❌ Nunca dados mock em produção (estado vazio = "Sem dados ainda", nunca simulação)
- ❌ Nunca alterar lógica de negócio durante refinamento visual
- ✅ Stack preferencial: Evolution/WAHA + Supabase + OpenRouter + Docker
- ✅ Toda decisão técnica relevante → DECISION_LOG.md
- ✅ Toda sessão com descoberta importante → perguntar "registrar no CODEBASE.md?"
- ✅ Francisco decide — IAs recomendam

---

## 8. CONTATOS DE SISTEMA

```yaml
supabase_project: yiiuebhyqixzluguxsqi
supabase_url: https://yiiuebhyqixzluguxsqi.supabase.co
vps_ip: 179.197.72.221
vps_alias: vps (configurado em ~/.ssh/config)
prod_url: https://crm.iaparavendas.tech
lab_frontend: http://localhost:3333
lab_api: http://localhost:4335
lab_waha: http://localhost:3005
```

---
_MCT OS v2.0 | SOS Sales | Francisco Taveira Rios — MCT LTDA | Chapecó, BR_
_Atualizado automaticamente pela AGY (Antigravity) em 18 Ago 2026_


<claude-mem-context>
# Memory Context

# [SOS-SALES] recent context, 2026-09-05 2:52am GMT-3

No previous sessions found.
</claude-mem-context>

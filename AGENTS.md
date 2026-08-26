# AGENTS.md — Bússola Universal SOS Sales
> Leia este arquivo PRIMEIRO. Ele orienta qualquer IA (Claude, Gemini, Hermes, GPT) sobre onde está o projeto, o que está feito e o que fazer agora.
> Atualizado: 18 Ago 2026 | MCT OS v2.0

---

## 1. IDENTIDADE DO PROJETO

**SOS Sales** — CRM operacional de alta performance para vendas via WhatsApp.
- **URL Produção:** https://crm.iaparavendas.tech
- **VPS:** 179.197.72.221 (Ubuntu 24.04, Docker, Caddy)
- **Supabase:** yiiuebhyqixzluguxsqi (aws-0-ca-central-1.pooler.supabase.com:6543)
- **Stack:** React 19 + Vite + TypeScript + TailwindCSS v4 + Fastify 4 + PostgreSQL + Redis + WAHA + Meta Cloud API v20.0
- **Filosofia:** Poder invisível, simplicidade visível.

---

## 2. ESTADO ATUAL (18 Ago 2026)

### ✅ FUNCIONANDO EM PRODUÇÃO
- Frontend completo: 82 componentes TSX, 10 módulos de tela
- API: 9/9 rotas E2E OK, auth Supabase + RLS multi-tenant
- WhatsApp WAHA + Meta WABA (Arsenal completo: Pix, SPM/MPM, Location, Flows, Carousel, OTP)
- Meta Omnichannel: Messenger, Instagram DM, Wit.ai NLP, Private Reply
- Docker Lab local: http://localhost:3333 (frontend) + http://localhost:4335 (API)

### 🔄 EM ANDAMENTO
- **Refinamento visual "menos é mais"** — prompt em `PROMPT_REFINAMENTO_VISUAL.md`
  - Interface funcional mas visualmente sobrecarregada
  - Objetivo: reduzir ruído, corrigir erros visuais, hierarquia de informação
  - Testar SEMPRE no Docker Lab (http://localhost:3333) ANTES do VPS

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
   npm run build
   npm --prefix apps/api run build
   rsync -avz --delete dist/ vps:/opt/sos-sales/dist/
   rsync -avz --delete apps/api/dist/ vps:/opt/sos-sales/api/dist/
   ssh vps "docker restart sos-sales-api"
```

**REGRA ABSOLUTA:** Nunca testar diretamente no VPS. Sempre Docker Lab primeiro.

---

## 4. MAPA DE ARQUIVOS — O QUE LER PARA CADA TAREFA

| Tarefa | Arquivo a ler |
|--------|---------------|
| Contexto técnico geral | `CODEBASE.md` |
| Decisões arquiteturais | `DECISION_LOG.md` |
| Visão de produto / roadmap | `BLUEPRINT_SOS_SALES.md` |
| Refinamento visual (tarefa ativa) | `PROMPT_REFINAMENTO_VISUAL.md` |
| Skills do Claude/Hermes | `CLAUDE.md` |
| Tarefas pendentes organizadas | `.gemini_tasks/README.md` |
| Design system (tokens CSS) | `src/index.css` |
| Rotas da API | `openapi.json` / `openapi.yaml` |
| Componentes UI | `src/components/` (17 módulos) |
| Backend API | `apps/api/src/` |
| Scripts de teste | `scripts/` |
| Docs históricos | `docs/` |
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

# Build completo
npm run build && npm --prefix apps/api run build

# Deploy VPS (só depois do lab!)
rsync -avz --delete dist/ vps:/opt/sos-sales/dist/
rsync -avz --delete apps/api/dist/ vps:/opt/sos-sales/api/dist/
ssh vps "docker restart sos-sales-api"

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

# [SOS-SALES] recent context, 2026-08-26 12:30pm GMT-3

No previous sessions found.
</claude-mem-context>
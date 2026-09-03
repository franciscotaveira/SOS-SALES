<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# SOS Sales — Operational Sales Operating System

> **MCT OS — Sovereign Kernel | Poder invisível, simplicidade visível**  
> **Ambiente de Produção:** `https://crm.iaparavendas.tech`  
> **Docker Lab Local:** `http://localhost:3333` (Frontend) + `http://localhost:4335` (API)  
> **Especificação Funcional Completa:** [`docs/SPEC_FUNCIONAL_SOS_SALES.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/SPEC_FUNCIONAL_SOS_SALES.md)

CRM operacional de alta performance para vendas no WhatsApp, projetado sob a filosofia de ferramenta **enxuta, funcional e sem ruído visual**. O repositório é composto por dois ambientes intencionalmente isolados:

- `./` — Frontend React 19 + TypeScript + Vite + TailwindCSS v4;
- `./apps/api` — API Fastify 4 + Node.js 20 ESM + Supabase PostgreSQL + Redis.

---

## 📚 Documentação & Especificações do Sistema

O SOS Sales possui documentação funcional e técnica detalhada para cada um de seus 8 módulos operacionais:

| Módulo | Especificação Funcional |
|---|---|
| **Master Index** | [`docs/SPEC_FUNCIONAL_SOS_SALES.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/SPEC_FUNCIONAL_SOS_SALES.md) |
| **01. Cockpit de Atendimento ao Vivo (`/agora`)** | [`docs/specs/01_cockpit_agora.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/01_cockpit_agora.md) |
| **02. Funil Comercial Kanban & Conversas (`/kanban`, `/conversas`)** | [`docs/specs/02_kanban_conversas.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/02_kanban_conversas.md) |
| **03. Motor Dual-Engine & Meta Omnichannel (`/configuracoes/canais`)** | [`docs/specs/03_waba_arsenal_canais.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/03_waba_arsenal_canais.md) |
| **04. Agenda Comercial, Anotações & Hub de Grupos (`/agenda`, `/grupos`)** | [`docs/specs/04_agenda_anotacoes_grupos.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/04_agenda_anotacoes_grupos.md) |
| **05. Gestão de Clientes, Resultados CAPI & Playbook (`/clientes`, `/resultados`)** | [`docs/specs/05_clientes_resultados_playbook.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/05_clientes_resultados_playbook.md) |
| **06. Backend Fastify API, Webhooks & RLS (`apps/api`)** | [`docs/specs/06_backend_api_and_webhooks.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/06_backend_api_and_webhooks.md) |
| **07. Infraestrutura, Docker Lab & Pipeline de Deploy** | [`docs/specs/07_deploy_and_docker_lab.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/07_deploy_and_docker_lab.md) |
| **08. Design System, Tokens & Refinamento Visual** | [`docs/specs/08_design_system_and_ui_components.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/08_design_system_and_ui_components.md) |

---

## 🛠️ Pré-requisitos & Instalação

### Pré-requisitos:
- Node.js 20 LTS e npm 10+;
- Docker Desktop (somente para validação no Docker Lab).

### Instalação:
```bash
# Frontend (raiz)
npm install

# API Fastify
npm --prefix apps/api install
```

---

## 🚀 Desenvolvimento Local & Docker Lab

```bash
# 1. Desenvolvimento com Hot-Reload
npm run dev                          # Frontend: http://localhost:5173

# 2. Docker Lab (Homologação Integrada antes de Deploy)
docker compose -f docker-compose.lab.yml up --build -d
# Frontend Lab: http://localhost:3333
# API Lab:      http://localhost:4335
```

---

## 🔒 Segurança & Operação Autenticada

- **Zero Mock Data em Produção:** Dados 100% reais via PostgreSQL Supabase com RLS ativado (`SET LOCAL ROLE sos_sales_runtime`).
- **Antiban Protocol:** Janela de atendimento de 24h Meta obedecida rigorosamente.

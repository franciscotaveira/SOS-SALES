# Especificação Funcional Completa — SOS Sales (v2.0 Master Index)
> **MCT OS — Sovereign Kernel | Poder invisível, simplicidade visível**  
> **Diretriz de Produto:** Meta-first MVP — Operação Comercial Enxuta, Funcional e Sem Ruído  
> **Data de Homologação:** 03 de Setembro de 2026  
> **Stack:** React 19 + TypeScript + Vite + TailwindCSS v4 + Fastify 4 (ESM) + PostgreSQL (Supabase) + Redis + WAHA + Meta Cloud API v20.0

---

## 1. Visão Geral & Filosofia ("Meta-First MVP Enxuto & Funcional")

O **SOS Sales** é um CRM operacional de alta performance para vendas no WhatsApp, projetado para fechar com máxima previsibilidade o ciclo comercial:

$$\text{Anúncio Meta (CTWA)} \longrightarrow \text{Conversa WhatsApp} \longrightarrow \text{Atendimento Humano/IA} \longrightarrow \text{Resultado Comercial} \longrightarrow \text{Feedback à Meta (CAPI)}$$

### Princípios Invioláveis da Especificação Canônica:
1. **Verdade nos Dados (Truth in Data):** Zero dados simulados ou fictícios em produção. Estado sem dados exibe "Sem dados ainda".
2. **Cadeia de Prova Completa:** Nenhuma funcionalidade é declarada ativa sem comprovar a cadeia:
   $$\text{UI Autenticada} \longrightarrow \text{API Fastify} \longrightarrow \text{RBAC/RLS} \longrightarrow \text{Banco PostgreSQL} \longrightarrow \text{Fila/Worker} \longrightarrow \text{Provedor Meta/WAHA} \longrightarrow \text{Reload}$$
3. **Coexistência Dual-Engine Rígida:**
   - **Meta Cloud API (WABA v20.0):** Canal primário de vendas, anúncios CTWA, CAPI, templates HSM e mensagens interativas.
   - **WAHA (WhatsApp Web):** Atendimento humano 1:1 livre, áudios PTT, grupos e contingência explícita.
   - **Proibição de Fallback Silencioso:** Falha em WABA gera `FAILED/RETRYABLE`; nunca troca de provedor sem autorização expressa do operador.
4. **Isolamento de Segurança Multi-Tenant:** RLS nativo no PostgreSQL garantindo segregação total entre workspaces.

---

## 2. Matriz Canônica de Especificação por Módulo (66 Funções Auditadas)

| Módulo | Escopo & Descrição | Status Canônico | Arquivo de Especificação |
|---|---|:---:|---|
| **Módulo 1: Cockpit ao Vivo** | Central 1:1 de 3 colunas, fila SLA, feed de mensagens, PTT player, temporizador 24h, Arsenal WABA supervisionado, Dossiê e Agenda Externa. | 11 `MANTER`<br>1 `CONSOLIDAR`<br>1 `CORRIGIR`<br>1 `CAPABILITY_PENDENTE` | [`docs/specs/01_cockpit_agora.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/01_cockpit_agora.md) |
| **Módulo 2: Funil Kanban & Conversas** | Funil comercial 5 etapas, KPI ribbon financeiro em tempo real, seletor multi-funil adaptável e central unificada (Lista, Kanban, Torre NOC). | 7 `MANTER`<br>1 `CONSOLIDAR`<br>1 `CORRIGIR` | [`docs/specs/02_kanban_conversas.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/02_kanban_conversas.md) |
| **Módulo 3: Dual-Engine & Meta Omnichannel** | Conexão WAHA + Meta WABA v20.0, Embedded Signup FBE, criador in-app de templates HSM, Facebook Messenger, Instagram Direct e Wit.ai NLP. | 5 `MANTER`<br>1 `CONSOLIDAR`<br>1 `REALOCAR` | [`docs/specs/03_waba_arsenal_canais.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/03_waba_arsenal_canais.md) |
| **Módulo 4: Agenda, Anotações & Grupos** | Calendário comercial Dia/Semana/Mês, bloco de anotações internas colaborativas e monitor de saúde/disparo em grupos do WhatsApp. | 8 `MANTER` | [`docs/specs/04_agenda_anotacoes_grupos.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/04_agenda_anotacoes_grupos.md) |
| **Módulo 5: Clientes, Resultados & Playbook** | Onboarding de clientes/sub-contas multi-tenant, atribuição CTWA, Meta CAPI server-side, gerador de QR Code e Sales AI Playbook com Knowledge Base. | 8 `MANTER`<br>1 `CONSOLIDAR` | [`docs/specs/05_clientes_resultados_playbook.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/05_clientes_resultados_playbook.md) |
| **Módulo 6: Backend API Fastify & Webhooks** | Clean Architecture DDD, rotas Fastify 4, webhooks multi-engine, Redis Idempotency Gate e isolamento RLS PostgreSQL Supabase. | 10 `MANTER` | [`docs/specs/06_backend_api_and_webhooks.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/06_backend_api_and_webhooks.md) |
| **Módulo 7: Deploy & Docker Lab** | Docker Lab local (`docker-compose.lab.yml`), ambiente VPS (`docker-compose.prod.yml`), scripts de preflight, stage, promoção e rollback atômico. | 6 `MANTER` | [`docs/specs/07_deploy_and_docker_lab.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/07_deploy_and_docker_lab.md) |
| **Módulo 8: Design System & Visual** | Tokens CSS semânticos (`src/index.css`), TailwindCSS v4, navegação recolhível AppShell e diretrizes do refinamento visual "menos é mais". | 5 `MANTER` | [`docs/specs/08_design_system_and_ui_components.md`](file:///Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/specs/08_design_system_and_ui_components.md) |

---

## 3. Catálogo de Rotas Principais da API Fastify 4

* `GET /health` & `GET /ready`: Diagnóstico de saúde e prontidão (PostgreSQL + Redis).
* `GET /api/v1/workspaces/:id/contacts`: Busca de contatos com filtros.
* `POST /api/v1/workspaces/:id/conversations/start`: Início de jornada comercial.
* `GET /api/v1/workspaces/:id/channels/whatsapp/status`: Health check da conexão WhatsApp.
* `GET /api/v1/workspaces/:id/channels/waba/templates`: Lista de templates homologados pela Meta.
* `POST /api/v1/workspaces/:id/channels/waba/create-template`: Submissão de novo template HSM para a Graph API.
* `POST /api/v1/workspaces/:id/channels/waba/send-template`: Disparo de template homologado via outbox.
* `POST /api/v1/workspaces/:id/channels/waba/send-buttons`: Disparo de botões de resposta rápida.
* `POST /api/v1/workspaces/:id/channels/waba/send-list`: Disparo de menu interativo de seções.
* `POST /api/v1/workspaces/:id/channels/waba/send-flow`: Disparo de formulário interativo WhatsApp Flow.
* `POST /api/v1/workspaces/:id/tracking/test-capi`: Envio de evento de conversão server-side com hash SHA-256.

---

## 4. Governança de Release & Ambientes

* **Ambiente de Homologação (Docker Lab):** `http://localhost:3333` (Web) e `http://localhost:4335` (API).
* **Ambiente de Produção (VPS):** `https://crm.iaparavendas.tech` (Ubuntu 24.04, Caddy 2, Docker Compose).
* **Comandos Canônicos de Validação:**
  ```bash
  npm run lint                           # Validação TypeScript (tsc --noEmit)
  npm run build                          # Build do Frontend (Vite)
  APP_ENV=production npm --prefix apps/api run build  # Build da API (tsup)
  bash scripts/preflight-production-deploy.sh        # Gate zero de release
  ```


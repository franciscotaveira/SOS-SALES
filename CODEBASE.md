# SOS-SALES — Codebase & Architecture Guide (MCT OS v2.0)

> **Ambiente de Produção**: `https://crm.iaparavendas.tech`  
> **VPS IP**: `179.197.72.221` (Ubuntu 24.04, Docker, Caddy, API, WAHA, Redis)  
> **Supabase**: `yiiuebhyqixzluguxsqi` (`aws-0-ca-central-1.pooler.supabase.com:6543`)  
> **WhatsApp Engine**: WAHA (`devlikeapro/waha:latest`, Sessão: `default`)  
> **Última Atualização**: 16 de Agosto de 2026

---

## 1. Stack Tecnológico

```yaml
frontend:
  framework: React 18 + Vite + TypeScript
  styling: TailwindCSS (Utility tokens) + Lucide Icons
  state_management: LocalStorage + Realtime Polling + Supabase JWT Claims
  bundler: Vite (dist/ servido estaticamente pelo Caddy)

backend:
  runtime: Node.js 20 ESM (Fastify)
  builder: tsup (apps/api/dist/ servido no container sos-sales-api)
  database: PostgreSQL (Supabase Remoto via Session Pooler)
  caching_events: Redis (sos-sales-redis)
  whatsapp_gateway: WAHA REST API + Meta WABA Cloud API

infra:
  reverse_proxy: Caddy (TLS automático Let's Encrypt para crm.iaparavendas.tech)
  orchestration: Docker Compose (docker-compose.prod.yml)
```

---

## 2. Padrões de Arquitetura & Segurança

- **Clean Architecture + DDD**:
  - `apps/api/src/domain`: Entidades e regras de negócio puras (Journeys, Messages, Handoffs, Outcomes, Facts, Appointments).
  - `apps/api/src/application/ports`: Interfaces de gateways e casos de uso.
  - `apps/api/src/infrastructure`: Implementações de banco (Postgres), cache (Redis), IA (OpenRouter) e canais (WAHA/WABA).
  - `apps/api/src/interfaces/http`: Rotas Fastify e middlewares de autenticação JWT.

- **Multi-Tenancy & Row-Level Security (RLS)**:
  - 34 tabelas protegidas com `rowsecurity = true`.
  - **Gateway Pattern Soberano**: A API conecta via pooler e executa transações com `SET LOCAL ROLE sos_sales_runtime` + injeção de `request.jwt.claims`.
  - Isolamento rigoroso entre múltiplos workspaces (`current_user_workspace_ids()`).

- **Truth in Data**:
  - Zero dados mock em produção.
  - Estados vazios informam a realidade ("Sem dados ainda").
  - Métricas de atribuição e tráfego calculadas a partir de desfechos auditáveis (`commercial_outcomes`) e coortes de aquisição.

---

## 3. Estrutura de Módulos do Front-End

1. **Agora (`LiveCockpitView.tsx`)**:
   - Cockpit comercial 1:1 de 3 colunas (Fila de Prioridades, Feed de Mensagens WhatsApp com balão verde/tiques duplos e Dossiê Vivo com Copilot de IA).
   - Ações rápidas: envio de texto, Botões Interativos Quick Reply (WABA), Templates HSM Meta, Follow-Up, Desfecho e Handoff.

2. **Kanban (`LiveCommercialKanbanView.tsx`)**:
   - Funil visual com 5 estágios padronizados: `LEAD`, `QUALIFICADO`, `PROPOSTA`, `NEGOCIACAO`, `GANHO`.
   - Transição ágil de etapas e cálculo de valor financeiro acumulado.

3. **Conversas (`LiveConversationsView.tsx` / `ConversationsHubView.tsx`)**:
   - Listagem completa de conversas com busca em tempo real por nome, telefone e chips por estágio.

4. **Grupos (`GroupsHubView.tsx`)**:
   - Hub de monitoramento de grupos de WhatsApp sincronizados com o WAHA.
   - Resposta rápida em 1 clique e envio direto aos grupos com atalho `Cmd+Enter`.

5. **Agenda (`AgendaView.tsx`)**:
   - Agendamento de consultas e atendimentos com data/hora dinâmicas e integração com o status do lead.

6. **Anotações (`NotesView.tsx`)**:
   - Caderno de roteiros, scripts de objeção e notas estratégicas persistidas por workspace.

7. **Resultados & ROI (`LiveTrafficProofView.tsx` / `ResultsHubView.tsx`)**:
   - Proof of Traffic auditável por período e campanha de anúncios.

8. **Configurações (`LiveSettingsView.tsx` / `CanaisView.tsx`)**:
   - Pareamento e status do WhatsApp via QR Code, conexão WABA Cloud API e parâmetros de SLA.

---

## 4. Comandos de Operação e Deploy

```bash
# Build e Deploy Local -> VPS
npm run build
npm --prefix apps/api run build
rsync -avz --delete dist/ vps:/opt/sos-sales/dist/
rsync -avz --delete apps/api/dist/ vps:/opt/sos-sales/api/dist/
ssh vps "docker restart sos-sales-api"

# Validação RLS no Supabase Remoto
ssh vps "docker exec -i sos-sales-api node" < scripts/full-tstack-rls-test.cjs
```

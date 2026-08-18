# SOS-SALES — Codebase & Architecture Guide (MCT OS v2.0)

> **Ambiente de Produção**: `https://crm.iaparavendas.tech`  
> **VPS IP**: `179.197.72.221` (Ubuntu 24.04, Docker, Caddy, API, WAHA, Redis)  
> **Supabase**: `yiiuebhyqixzluguxsqi` (`aws-0-ca-central-1.pooler.supabase.com:6543`)  
> **WhatsApp Engines**: WAHA (`devlikeapro/waha:latest`, Sessão: `default`) + Meta Cloud API v20.0 (WABA)  
> **Titularidade & Arquitetura**: Francisco Taveira Rios (MCT LTDA)  
> **Última Atualização**: 18 de Agosto de 2026 (Release v2.0 Soberana - Níveis 1 a 5 + Kit Jurídico Completo)  

---

## 1. Stack Tecnológico

```yaml
frontend:
  framework: React 19 + Vite + TypeScript
  styling: TailwindCSS (Utility tokens) + Lucide Icons
  state_management: LocalStorage + Realtime Polling + Supabase WebSockets
  bundler: Vite (dist/ servido estaticamente pelo Caddy)

backend:
  runtime: Node.js 20 ESM (Fastify 4)
  builder: tsup (apps/api/dist/ servido no container sos-sales-api)
  database: PostgreSQL (Supabase Remoto via Session Pooler)
  caching_events: Redis (sos-sales-redis)
  whatsapp_gateway: WAHA REST API + Meta WABA Cloud API v20.0

infra:
  reverse_proxy: Caddy (TLS automático Let's Encrypt para crm.iaparavendas.tech)
  orchestration: Docker Compose (docker-compose.prod.yml para VPS / docker-compose.lab.yml para Testes Locais)
  ambientes:
    vps_producao: "https://crm.iaparavendas.tech (Congelado para novas features - apenas estabilidade e refinamento sob aprovação)"
    docker_lab: "http://localhost:3333 (Laboratório de Teste / Sandbox para validação de features do Nível 5 antes de qualquer deploy)"
```

---

## 2. Padrões de Arquitetura & Multi-Engine WhatsApp

- **Coexistência Multi-Engine:**
  - **WAHA (WhatsApp Web):** Cuida do chat em tempo real dos operadores humanos, mensagens livres na janela de 24h, áudios PTT e grupos.
  - **Meta Cloud API (WABA Oficial):** Cuida de atribuição de anúncios Meta Ads (CTWA), mensuração CAPI server-side, reabertura de contatos com Templates HSM aprovados, Botões Interativos, Listas e WhatsApp Flows.
  - Ambas as conexões alimentam o mesmo banco com **deduplicação automática de mensagens**.

- **Clean Architecture + DDD**:
  - `apps/api/src/domain`: Entidades e regras de negócio puras (Journeys, Messages, Handoffs, Outcomes, Facts, Appointments).
  - `apps/api/src/application/ports`: Interfaces de gateways e casos de uso.
  - `apps/api/src/infrastructure`: Implementações de banco (Postgres), cache (Redis), IA (OpenRouter) e canais (`waba-client.ts`, `waha-client.ts`).
  - `apps/api/src/interfaces/http`: Rotas Fastify e middlewares de autenticação JWT.

- **Multi-Tenancy & Row-Level Security (RLS)**:
  - 34 tabelas protegidas com `rowsecurity = true`.
  - **Gateway Pattern Soberano**: A API conecta via pooler e executa transações com `SET LOCAL ROLE sos_sales_runtime` + injeção de `request.jwt.claims`.
  - Isolamento rigoroso entre múltiplos workspaces (`current_user_workspace_ids()`).

- **Truth in Data & Antiban Protocol**:
  - Zero dados mock em produção.
  - Obediência rigorosa à janela de 24h da Meta: envio livre dentro de 24h; obrigatoriedade de templates HSM homologados após 24h para risco zero de ban.

---

## 3. Estrutura de Módulos do Front-End

1. **Agora / Cockpit ao Vivo (`LiveCockpitView.tsx`)**:
   - Cockpit comercial 1:1 de 3 colunas (Fila de Prioridades/Todas, Feed de Mensagens WhatsApp com balão verde/tiques duplos e Dossiê Vivo com Copilot de IA).
   - **Novo Iniciar Conversa (`+ Nova`)**: Modal de busca instantânea no banco de dados de contatos ou inserção de novo telefone.
   - **Ações Rápidas & Suíte Interativa WABA**:
     - 🔘 Botões Rápidos (Quick Replies até 3 botões).
     - 📑 Menu de Lista Interativo (Seções e Linhas de Serviços).
     - ⚡ WhatsApp Flows (Formulários nativos de agendamento no WhatsApp).
     - 📋 Templates HSM Oficiais com variáveis `{{1}}`, `{{2}}`.
     - 📁 Sales Media Vault (PDFs, Áudios PTT, Fotos, Vídeos).
     - 📅 **Agenda Externa & IA de Vagas (`ExternalAgendaDrawer.tsx` & `src/types/externalTools.ts`)**:
        - **Visual Integration Moat**: Ponte híbrida entre IA Copilot e sistemas web legados (Trinks, Bling, Tiny, Omie, SimplesAgenda).
        - Multi-tenant e contextual por workspace (Perfil Trinks Haven Escovaria vs Customizável).
        - Leitura visual de grade (Branco = Vaga Livre, Azul = Indisponível, Cinza = Ausência, Linha Vermelha = Horário Atual).
        - Motor de Avaliação de Janela Contínua (`freeWindowMinutes >= service.minDurationMinutes`): Escova/Manicure (45-60m), Modelada (60-75m), Hidratação Ozônio (60-90m), Gel/Russa (90-120m), Combos (90-120m).
        - **Antecipação Cognitiva Profunda (`parseConversationIntent`)**: Extrai simultaneamente procedimento, turno/corte de horário, profissional e dia da conversa do cliente.
        - **Hero Recommendation Card**: Destaca a vaga perfeita no topo e gera a proposta no WhatsApp em 1 clique.
        - **Filtros Multi-Dimensionais**: Turnos (Manhã 8h-12h, Tarde 12h-18h, Noite 18h-20h), corte de horário mínimo e filtro por profissional com cores próprias.
        - Visão de 3 dias (`Hoje`, `Amanhã`, `Próximo Dia`).

2. **Kanban (`LiveCommercialKanbanView.tsx` / `CommercialKanbanView.tsx`)**:
    - Funil visual com 5 estágios padronizados: `LEAD`, `QUALIFICADO`, `PROPOSTA`, `NEGOCIACAO`, `GANHO`.
    - **KPI Ribbon Financeiro**: Pipeline Ativo (R$), Fechados/Ganho (R$), Taxa de Conversão (%) e Ticket Médio por Lead em tempo real.
    - Badges de preço automático por procedimento nos cards (R$ 59 a R$ 380).
    - Totalizador financeiro por coluna no header de cada etapa.
    - Transição ágil de etapas e drag-and-drop.

3. **Conversas (`LiveConversationsView.tsx` / `ConversationsHubView.tsx` / `AllConversationsView.tsx`)**:
   - Central unificada com alternância em 1 clique entre Lista, Funil e Torre TV (NOC).
   - Botão **"+ Nova Conversa"** com busca em contatos do banco.

4. **Canais & WABA Manager (`CanaisView.tsx`)**:
   - Painel dual de monitoramento (WAHA Web + Meta WABA).
   - **Criador de Templates In-App**: Formulário direto para submeter templates à aprovação na Graph API da Meta.
   - Sincronização em tempo real de modelos aprovados (`APPROVED`, `PENDING`, `REJECTED`).
   - Guia visual do Protocolo Antiban (Janela de 24h vs Disparos Ativos).

5. **Grupos (`GroupsHubView.tsx`)**:
   - Hub de monitoramento e broadcast para grupos de WhatsApp sincronizados com o WAHA.

6. **Agenda Comercial (`AgendaView.tsx`)**:
   - Agendamento de atendimentos com data/hora dinâmicas e integração com o status do lead.

7. **Tracking & Atribuição (`LiveTrafficProofView.tsx` / `TrackingSettings.tsx`)**:
   - Ingestão de anúncios CTWA (Click-to-WhatsApp), Pixel/Dataset Meta e eventos server-side CAPI.

8. **Financeiro (`AbacatePayView.tsx` / `financial-routes.ts`)**:
   - Geração de Pix dinâmico e conciliação de pagamentos com as jornadas.

---

## 4. Sincronização em Tempo Real (Supabase WebSockets)

Todas as áreas operacionais possuem subscrições ativas via `supabase.channel('live-*')` com fallback de polling silencioso a cada 5s:
- **Cockpit**: `commercial_journeys` e `conversation_messages`
- **Kanban**: `commercial_journeys`
- **Conversas**: `commercial_journeys`
- **Agenda**: `workspace_appointments`
- **Anotações**: `workspace_notes`
- **Resultados / Traffic Proof**: `commercial_outcomes` e `campaign_spend_daily_facts`
- **Grupos**: `conversation_messages`

---

## 5. Comandos de Operação, Teste e Deploy

```bash
# Build do Frontend e da API
npm run build
npm --prefix apps/api run build

# Deploy Local -> VPS
rsync -avz --delete dist/ vps:/opt/sos-sales/dist/
rsync -avz --delete apps/api/dist/ vps:/opt/sos-sales/api/dist/
ssh vps "docker restart sos-sales-api"

# Auditoria Geral de Rotas de Produção (9 Rotas E2E)
node test-e2e-all-routes.js

# Teste de Endpoints WABA & Contatos
curl https://crm.iaparavendas.tech/api/v1/workspaces/22222222-2222-2222-2222-222222222222/contacts
```


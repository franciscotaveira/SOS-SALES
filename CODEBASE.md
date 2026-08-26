# SOS-SALES — Codebase & Architecture Guide (MCT OS v2.0)

> **Ambiente de Produção**: `https://crm.iaparavendas.tech`  
> **VPS IP**: `179.197.72.221` (Ubuntu 24.04, Docker, Caddy, API, WAHA, Redis)  
> **Supabase**: `yiiuebhyqixzluguxsqi` (`aws-0-ca-central-1.pooler.supabase.com:6543`)  
> **Meta Tech Partner Omnichannel**: Meta Cloud API v20.0 (WABA, Facebook Messenger, Instagram Direct, Wit.ai NLP) + WAHA (`devlikeapro/waha:latest`, Sessão: `default`)  
> **Titularidade & Arquitetura**: Francisco Taveira Rios (MCT LTDA)  
> **Última Atualização**: 22 de Agosto de 2026 (Fechamento da Fase B & Homologação Estrita do Docker Lab)  

---

## 0. Estado Operacional & Baseline Oficial de Segurança (22 Ago 2026)

```yaml
seguranca_governanca:
  fase_b_lab: "APPROVED_LOCAL — 100% CONCLUÍDA"
  producao_vps: "CONTAINED (Edge Caddy bloqueando rotas sensíveis com 403 Forbidden)"
  promocao_e_push: "NO-GO (Travado até conclusão da Fase A e Restore Drill)"
  baseline_commit: "64d42a6efbceda088d04c2809e189ced21f035a0"
  bundle_sha256: "sha256:399a81dd0d28b13fb690399158baa8371b2a423fe36aed57b372a4f4a5cf047f"
  release_manifest: "v2.0.0-lab (cleanTree: true)"
  test_suite: "49/49 arquivos, 327/327 testes Vitest aprovados com teardown automático"
  e2e_matrix: "10/10 rotas operacionais no Docker Lab"

dependencias_fase_a:
  - "Rotação de banco Supabase e atualização de /opt/sos-sales/.env.production (0600 root:root) via editor seguro/temp 0600"
  - "Revogação e regeneração dos tokens Meta, OpenRouter e NVIDIA nos dashboards oficiais"
  - "Emissão de evidência por fornecedor no schema booleano sanitizado (sem tokens/senhas em chat/relatório)"

criterios_entrada_fase_c:
  - "Aprovação das evidências sanitizadas da Fase A"
  - "Backup criptografado off-host e restore drill comprovado do banco de produção"
  - "Aplicação das migrations forward-only (20260822091851 e 20260822100000) após backup"
  - "Deploy canário do bundle auditado (commit e release-manifest.json correspondentes)"
  - "Liberação progressiva do edge Caddy com testes negativos (anônimo, fake, viewer, cross-tenant) e rollback pronto"
```

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
  caching_events: Redis (sos-sales-redis) + IdempotencyGate (Redis + In-Memory Fallback)
  omnichannel_gateway:
    whatsapp_waba: Meta Cloud API v20.0 (WabaClient)
    whatsapp_web: WAHA REST API (WahaClient)
    facebook_messenger: Meta Graph API v20.0 (MessengerClient)
    instagram_direct: Meta Graph API v20.0 (InstagramDmClient)
    nlp_semantic_ai: Meta Wit.ai Real-Time Entity Extraction (NlpEnrichmentService)
    capi_server_side: Meta Conversions API (CapiClient)

infra:
  reverse_proxy: Caddy (TLS automático Let's Encrypt para crm.iaparavendas.tech)
  orchestration: Docker Compose (docker-compose.prod.yml para VPS / docker-compose.lab.yml para Testes Locais)
  ambientes:
    vps_producao: "https://crm.iaparavendas.tech (Congelado para novas features - apenas estabilidade e refinamento sob aprovação)"
    docker_lab: "http://localhost:3333 (Laboratório de Teste / Sandbox para validação de features antes de deploy)"
```

---

## 2. Padrões de Arquitetura & Multi-Engine Omnichannel

- **Coexistência Multi-Engine & Omnichannel Soberano:**
  - **WAHA (WhatsApp Web):** Cuida do chat em tempo real dos operadores humanos, mensagens livres na janela de 24h, áudios PTT e grupos.
  - **Meta Cloud API (WABA Oficial v20.0):**
    - 💳 **Native WhatsApp Payments (Pix Brasil):** Mensagens interativas `order_details` com chave Pix para liquidação instantânea no app.
    - 🛍️ **Single Product (SPM) & Multi-Product (MPM):** Vitrines com até 30 produtos integradas ao Meta Commerce Manager.
    - 📍 **Location Request:** Solicitação do GPS nativo do cliente em 1 toque.
    - ⚡ **WhatsApp Interactive Flows:** Formulários nativos em tela cheia para agendamento e orçamento.
    - 🎠 **Carousel HSM Templates:** Carrosséis de marketing com cards deslizantes.
    - 🔐 **Authentication OTP Templates:** Envio de tokens com botão nativo "Copiar código".
    - 📊 **CAPI Server-Side & CTWA:** Rastreamento ponta a ponta de anúncios de Clique para o WhatsApp.
  - **Facebook Messenger & Instagram Direct:**
    - Atendimento centralizado com identificadores Page-Scoped (PSID) e Instagram-Scoped (IGSID).
    - 💬 **Private Replies:** Resposta privada automática no Direct/Messenger para comentários de posts.
    - 🧠 **Wit.ai NLP Real-Time:** Extração de datas, valores, sentimentos e intenções para popular `known_facts`.
    - 🔗 **m.me Tracking Links:** Geração e rastreamento de links curtos de alta conversão.
  - **Idempotency Gate:** Proteção contra disparos e webhooks duplicados da Meta (Redis TTL 180s + fallback in-memory).

- **Clean Architecture + DDD**:
  - `apps/api/src/domain`: Entidades e regras de negócio puras (Journeys, Messages, Handoffs, Outcomes, Facts, Appointments).
  - `apps/api/src/application/ports`: Interfaces de gateways e casos de uso.
  - `apps/api/src/application/services`: Serviços de domínio (`PrivateReplyService`, `NlpEnrichmentService`, `MmeLinkService`, `AttributionService`).
  - `apps/api/src/infrastructure/channels/meta`: Clientes oficiais Meta (`WabaClient`, `MessengerClient`, `InstagramDmClient`, `MessengerInsightsClient`, `ConversationsApiClient`).
  - `apps/api/src/infrastructure/database`: Gateways Postgres com isolamento RLS.
  - `apps/api/src/interfaces/http`: Rotas Fastify, webhooks Meta e middlewares de autenticação.

- **Multi-Tenancy & Row-Level Security (RLS)**:
  - Tabelas protegidas com `rowsecurity = true`.
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
   - **Ações Rápidas & Arsenal WABA Nativo (`WabaActionsModal.tsx` & `SupervisedComposer.tsx`)**:
     - 💳 **Cobrança Pix Oficial**: Dispara checkout nativo `order_details` com chave Pix para liquidação instantânea no WhatsApp.
     - 📍 **Pedir Localização GPS**: Dispara `location_request_message` via popup nativo do GPS.
     - 🛍️ **Single Product (SPM) / Vitrine MPM**: Envio direto de produtos do catálogo do Meta Commerce Manager.
     - ⚡ **WhatsApp Interactive Flows**: Formulários nativos de agendamento e orçamento em tela cheia.
     - 🎠 **Carrossel HSM Interativo**: Envio de marketing com cards dinâmicos horizontais.
     - 🔐 **Autenticação OTP**: Envio de código de verificação com botão nativo "Copiar código".
     - 🔘 Botões Rápidos (Quick Replies até 3 botões) e Menus de Lista.
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

4. **Canais & Meta Omnichannel Manager (`CanaisView.tsx` & `ConnectionManager.tsx`)**:
   - **Abas de Controle**: Alternância entre *WhatsApp (WABA & WAHA)* e *Meta Omnichannel (Messenger, IG Direct & Wit.ai NLP)*.
   - **Meta Embedded Signup (`EmbeddedSignupModal.tsx`)**: Fluxo oficial de onboarding de novos clientes com FBE (Facebook Business Extension) e Graph API em 1 clique.
   - **Messenger & Instagram Insights (`MessengerInsightsPanel.tsx`)**: Painel de engajamento, mensagens recebidas, respostas de Private Replies e entidades semânticas extraídas pelo Wit.ai.
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

## 5. Estrutura de Arquivos Raiz (após limpeza Aug 2026)

```
/                          ← Apenas arquivos essenciais para IAs e deploy
├── CODEBASE.md            ← Este arquivo — fonte de verdade técnica
├── CLAUDE.md              ← Contexto para Claude/Hermes
├── DECISION_LOG.md        ← Decisões arquiteturais permanentes
├── BLUEPRINT_SOS_SALES.md ← Visão de produto e roadmap
├── PROMPT_REFINAMENTO_VISUAL.md  ← Prompt ativo de refinamento visual
├── docker-compose.lab.yml ← Lab local (localhost:3333)
├── docker-compose.prod.yml← VPS produção
├── Dockerfile.api         ← Build da API
├── Dockerfile.lab.web     ← Build do frontend para lab
├── openapi.json/yaml      ← Contrato da API
├── apps/api/              ← Backend Fastify
├── src/                   ← Frontend React
├── scripts/               ← Scripts de teste e auditoria
│   ├── test-e2e-all-routes.js  ← Auditoria 9 rotas E2E
│   ├── test-rls-validation.js  ← Validação RLS multi-tenant
│   ├── test-all-system-features.js
│   └── test-waba-arsenal.mjs
└── docs/                  ← Documentação histórica e screenshots
    └── screenshots/       ← Previews de UI (39 PNGs)
```

---

## 6. Comandos de Operação, Teste e Deploy

```bash
# ══════════════════════════════════════════════════
# FLUXO OBRIGATÓRIO MCT OS: Lab → VPS (nunca pular)
# ══════════════════════════════════════════════════

# 1. Desenvolvimento local (hot-reload, sem Docker)
npm run dev                          # Frontend: http://localhost:5173

# 2. Docker Lab (validação integrada antes do deploy)
docker compose -f docker-compose.lab.yml up --build -d
# Frontend Lab:  http://localhost:3333
# API Lab:       http://localhost:4335
# WAHA Lab:      http://localhost:3005

# Parar o lab
docker compose -f docker-compose.lab.yml down

# Ver logs da API no lab
docker logs sos-sales-lab-api --tail 50 -f

# 3. Build de produção
npm run build
npm --prefix apps/api run build

# 4. Deploy Lab → VPS
rsync -avz --delete dist/ vps:/opt/sos-sales/dist/
rsync -avz --delete apps/api/dist/ vps:/opt/sos-sales/api/dist/
ssh vps "docker restart sos-sales-api"

# ══════════════════════════════════════════════════
# AUDITORIA & TESTES
# ══════════════════════════════════════════════════

# Auditoria 9 rotas E2E (aponta para VPS por padrão)
node scripts/test-e2e-all-routes.js

# Validação RLS multi-tenant
node scripts/test-rls-validation.js

# Health check rápido do VPS
curl https://crm.iaparavendas.tech/health
curl https://crm.iaparavendas.tech/ready

# Health check do lab
curl http://localhost:4335/health

# ══════════════════════════════════════════════════
# VPS — OPERAÇÕES DIRETAS
# ══════════════════════════════════════════════════

# Status dos containers no VPS
ssh vps "docker ps --format 'table {{.Names}}\t{{.Status}}'"

# Logs da API em produção
ssh vps "docker logs sos-sales-api --tail 50"

# Flush Redis (cache de idempotência)
ssh vps "docker exec sos-sales-redis redis-cli FLUSHALL"
```


# ATLAS SOBERANO — SOS SALES & MCT OS

> Francisco Rios | MCT LTDA | Chapecó, BR  
> Filosofia: Poder invisível, simplicidade visível. Truth in Data.  
> Hierarquia: P0 (Kernel Soberano) > P1 (Atlas & CODEBASE) > P2 (Agentes & Skills).

---

## 1. Topologia de Infraestrutura Soberana

- **VPS Próprio:** `179.197.72.221` (Ubuntu Linux x86_64, Docker Compose).
- **Acesso SSH:** `ssh -i ~/.ssh/tx-crm-codex-deploy root@179.197.72.221`
- **Diretório da Aplicação em Produção:** `/opt/chat-sales-v3`
- **Domínio Ativo:** `https://crm.iaparavendas.tech`
- **Reverse Proxy & SSL:** Caddy (`sos-sales-caddy`) com emissão TLS automática Let's Encrypt para `crm.iaparavendas.tech`.
- **Topologia de Portas Internas & Contêineres:**
  - `chat-sales-web`: Porta interna 80 (Nginx servindo build SPA otimizada).
  - `chat-sales-api`: Porta interna 4400 (Fastify 5 gateway HTTP).
  - `chat-sales-worker`: Background processing (BullMQ, InboxProcessor, OutboxDispatcher, CapiDispatcher).
  - `sos-sales-postgres`: PostgreSQL 16 (Porta 5432 interna, banco `sos_sales_v3`).
  - `sos-sales-redis`: Redis 7 (Porta 6379 interna, cache e filas operacionais).
  - `sos-sales-waha`: WAHA Core (Porta 3000 interna mapeada para 3006 no host).

---

## 2. Decisões Arquiteturais Macro & Milestones (P0)

### 2.1 Motor de Inteligência Artificial Soberano (Dual-Engine)
- **NVIDIA NIM como Padrão Soberano:**
  - Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`.
  - **Decisão Crítica (Outubro/2026):** O modelo `meta/llama-3.3-70b-instruct` atingiu EOL oficial na infraestrutura da NVIDIA em 26/08/2026 (HTTP 410 Gone). O modelo de referência soberano foi migrado para `nvidia/nemotron-3-super-120b-a12b`, entregando capacidade superior de raciocínio, aderência estrita a restrições e latência reduzida.
  - Modelos rápidos certificados: `nvidia/nemotron-3.5-lightning-30b-a3b` e `nvidia/llama-3.1-nemotron-70b-instruct`.
- **OpenRouter como Provedor Alternativo Aberto:**
  - Endpoint: `https://openrouter.ai/api/v1/chat/completions`.
  - Modelos homologados: `anthropic/claude-3.5-sonnet`, `google/gemini-2.5-flash`, `deepseek/deepseek-chat`.
  - Cabeçalhos de rastreabilidade: `HTTP-Referer` e `X-Title` obrigatórios.
- **Chaves de API Isoladas:** Cada tenant pode utilizar a credencial central da empresa ou definir sua própria chave em `workspaces.ai_api_key`.

### 2.2 Truth in Data & Anti-Alucinação Estrito
- **Zero Mock / Zero Alucinação:** A IA nunca inventa preços, prazos ou políticas comerciais.
- **Grounding Dinâmico em 4 Camadas:** Todo atendimento ancora diretamente nos dados de `public.products`, `ai_business_rules` e `ai_faq`.
- **Protocolo de Ignorância & Transbordo Humano:** Dúvidas fora do escopo geram a tag `[TRANSBORDO_HUMANO: motivo]`. O sistema transiciona a thread para `waiting_human`, grava `handoff_reason` e gera alerta executivo no Cockpit para o atendente humano assumir com um clique.

### 2.3 Memória de Aquisição Meta CTWA (Click-to-WhatsApp Ads)
- Leads originados de anúncios trazem metadados de anúncio (`headline`, `body`).
- Ingestão contínua em `commercial_journeys` e injeção contextual em `<origem_do_lead_anuncio_meta>`. A IA inicia a conversa ciente da dor e da promessa do criativo específico clicado pelo lead.

### 2.4 Fronteira do n8n (Regra Inquebrável)
- O n8n é utilizado unicamente como acervo de pesquisa, scrapers e testes exploratórios de laboratório.
- Toda lógica core de produto, despacho de mensageria, transações financeiras e controle de filas reside exclusivamente no monorepo SOS Sales.

---

## 3. Diretrizes de Segurança e Isolamento

- **PostgreSQL RLS:** `FORCE ROW LEVEL SECURITY` em todas as tabelas comerciais. Nenhuma query executa sem o tenant contextual (`SET LOCAL app.current_tenant_id`).
- **Autenticação Segura:** Sessões de usuário autenticadas por JWT HS256 criptograficamente seguro via `JwtIdentityProvider`.
- **Mascaramento de PII:** Ausência de telefone e segredos em texto puro em logs de aplicação e despacho.

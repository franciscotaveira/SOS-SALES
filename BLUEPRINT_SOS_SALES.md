# SOS-SALES — Complete System Architecture & Operational Blueprint

> **Version:** 2.4.0 (Production-Ready)  
> **Repository:** SOS-SALES  
> **Philosophy:** *MCT OS — Sovereign Kernel | Poder invisível, simplicidade visível*  
> **Core Objective:** High-performance, multi-engine conversational CRM and sales orchestration platform built for high-ticket businesses on WhatsApp.

---

## 1. EXECUTIVE SUMMARY & PHILOSOPHY

SOS-SALES is an enterprise-grade Sales Operating System engineered to replace fragmented legacy tools (Kommo, ManyChat, Z-API, RD Station) with a **sovereign, local-first, unified platform**.

### Guiding Principles:
1. **Multi-Engine WhatsApp Architecture:** Coexistence of **WhatsApp Web (WAHA Multi-Device)** for continuous human operator chat and groups, alongside **Meta Cloud API (WABA Oficial)** for Click-to-WhatsApp (CTWA) ads attribution, Meta Conversions API (CAPI), and HSM approved templates.
2. **Zero Mock Data (Truth in Data):** All charts, pipelines, contacts, journeys, and metrics query direct PostgreSQL state. Empty states show honest zero data.
3. **Anti-Ban Native Protocol:** Strict compliance with Meta's 24-hour customer service window. Free-form text within 24h of inbound messages; mandatory approved HSM templates for re-engagement past 24h.
4. **Sovereignty & Privacy:** Self-hosted infrastructure on Docker + Caddy + PostgreSQL, eliminating third-party automation vendors like n8n.

---

## 2. TECHNOLOGY STACK

```
+-------------------------------------------------------------------------+
|                              FRONTEND                                   |
|   React 19 | TypeScript | Tailwind CSS | Vite | Lucide Icons | Recharts  |
+-------------------------------------------------------------------------+
                                    │ (HTTP / SSE / Supabase Realtime)
                                    ▼
+-------------------------------------------------------------------------+
|                           API GATEWAY / PROXY                           |
|                      Caddy 2 (Automatic TLS / SSL)                      |
+-------------------------------------------------------------------------+
                                    │
                                    ▼
+-------------------------------------------------------------------------+
|                            BACKEND API                                  |
|          Fastify 4 | Node.js 20 ESM | TypeScript | pg Pool | Redis       |
+-------------------------------------------------------------------------+
                 │                                        │
        ┌────────┴────────┐                      ┌────────┴────────┐
        ▼                 ▼                      ▼                 ▼
+---------------+ +---------------+      +---------------+ +---------------+
|  Engine A:    | |  Engine B:    |      |   Database:   | |  AI & Cache:  |
|  WAHA (Web)   | |  Meta Cloud   |      |  PostgreSQL   | |  Redis 7 +    |
|  Multi-Device | |  API (WABA)   |      |  (Supabase)   | |  OpenRouter   |
+---------------+ +---------------+      +---------------+ +---------------+
```

* **Frontend:** Single Page App built with React 19, TypeScript, Tailwind CSS, Lucide Icons, and Recharts.
* **Backend API:** Fastify 4, Node.js 20 ESM runtime, typed TypeScript, PostgreSQL native client pool (`pg`), and Redis caching.
* **Database:** PostgreSQL with partial unique indexes, foreign keys, and row-level audit columns.
* **WhatsApp Engines:**
  * **WAHA Plus (Port 3000):** Multi-device WhatsApp Web emulation for instant chat, audio playback/recording, and support groups.
  * **Meta Graph API v20.0 (WABA):** Cloud API integration for HSM Templates, Interactive Buttons, Interactive Lists, WhatsApp Flows, and CAPI.
* **Infrastructure:** Docker Compose orchestrated on Linux VPS with Caddy reverse proxy serving `crm.iaparavendas.tech`.

---

## 3. FULL CAPABILITY BREAKDOWN: BUILT & OPERATIONAL

### 3.1. Central Comercial & Live Cockpit (`/agora`)
* **3-Pane Operational Interface:**
  * **Left Pane (Queue):** Instant switch between *Todas as Conversas* and *Prioridades (SLA)*, live text search, unread badge counter, and **"+ Nova Conversa"** CTA.
  * **Center Pane (Chat & Direct Dispatch):**
    * Multi-engine message stream with automatic deduplication.
    * 24-hour Meta service window live countdown timer.
    * Outbound draft composer with instant WhatsApp dispatch.
    * PTT Voice note player with waveform and speed toggle ($1\times$, $1.5\times$, $2\times$).
    * Fast macro pills (Pix chave, Horários de Agenda Externa, Ofertas).
    * Embedded **Sales Media Vault** (PDFs, Audios, Photos, Videos).
    * Handoff management (Assumir Atendimento, Devolver para IA, Resolver Caso).
  * **Right Pane (Cognitive Dossier & Client Card):**
    * Live behavioral analyzer detecting buying temperature, detected pain points, objections, and transition points.
    * Pipeline stage switcher (Novo Lead $\to$ Qualificado $\to$ Proposta $\to$ Negociação $\to$ Ganho).
    * Known facts key-value storage.
    * Operator notes & follow-up scheduler.

### 3.2. Database-Driven "Nova Conversa" (Start Conversation)
* **Instant DB Contact Lookup:** `GET /api/v1/workspaces/:workspaceId/contacts` searches stored leads by name, phone, or latest message.
* **Direct Initiation:** `POST /api/v1/workspaces/:workspaceId/conversations/start` creates contact, opens commercial journey, and sends initial greeting via free-text or approved WABA template.

### 3.3. Multi-Engine Channels Hub & Antiban Engine (`/canais`)
* **Dual Channel Cards:** Live latency, connection health, battery level, and phone number for both WAHA and Meta WABA.
* **WABA OAuth / Embedded Signup:** Auto-discovery of WABAs, phone numbers, and permanent System User token storage.
* **Native In-App Message Template Manager:**
  * Syncs real-time templates from Meta Graph API.
  * Displays status (`APPROVED`, `PENDING`, `REJECTED`), category (`UTILITY`, `MARKETING`, `AUTHENTICATION`), and variable previews (`{{1}}`, `{{2}}`).
  * **In-App Template Creator:** Modal enabling operators to submit new templates directly to Meta for validation.
  * Template deletion and instant testing.

### 3.4. Advanced WABA Capabilities
* **Interactive Quick Reply Buttons:** `POST /api/v1/workspaces/:workspaceId/channels/waba/send-buttons` (up to 3 clickable buttons).
* **Interactive Section Lists:** `POST /api/v1/workspaces/:workspaceId/channels/waba/send-list` (structured menu lists).
* **WhatsApp Flows Engine:** `POST /api/v1/workspaces/:workspaceId/channels/waba/send-flow` (native in-app interactive forms and booking).
* **Rich Media Delivery:** Audio PTT voice notes, high-res images, PDF documents, and videos.

### 3.5. Meta Ads Tracking & Conversions API (CAPI) (`/tracking`)
* **Click-to-WhatsApp (CTWA) Attribution:** Ingests `referral` ad payloads, identifying Ad ID, Campaign ID, and UTM parameters.
* **Server-Side CAPI Dispatcher:** Sends hashed events (`Lead`, `Schedule`, `Purchase`) directly to Meta Pixel / Dataset ID.
* **Live Attribution Simulator:** Validates conversion pipelines and ROAS calculations.

### 3.6. Commercial Funnel & Wallboard (`/conversas`, `/wallboard`)
* **Kanban Board:** Drag-and-drop opportunity cards grouped by revenue and pipeline stage.
* **Wallboard (NOC):** Large-screen monitoring dashboard displaying active conversations, operator response times, and conversion rates.

### 3.7. Financial Engine & Dynamic Billing (`/financeiro`)
* **AbacatePay / Pix Ledger:** Generates dynamic Pix QR codes with webhook confirmation and revenue association to journeys.

---

## 4. REST API CATALOG

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/workspaces/:id/contacts` | Search and list workspace contacts from DB |
| `POST` | `/api/v1/workspaces/:id/conversations/start` | Start new conversation with contact/phone |
| `GET` | `/api/v1/workspaces/:id/channels/whatsapp/status` | Get live multi-engine connection status |
| `GET` | `/api/v1/workspaces/:id/channels/whatsapp/qr` | Fetch WAHA QR code for pairing |
| `POST` | `/api/v1/workspaces/:id/channels/whatsapp/sync` | Sync and backfill chats from WhatsApp Web |
| `POST` | `/api/v1/workspaces/:id/channels/waba/configure` | Save WABA credentials and token |
| `POST` | `/api/v1/workspaces/:id/channels/waba/list-accounts` | List WABA accounts and phone numbers from Meta |
| `GET` | `/api/v1/workspaces/:id/channels/waba/templates` | List approved templates from Meta |
| `POST` | `/api/v1/workspaces/:id/channels/waba/create-template` | Submit new message template to Meta Graph API |
| `DELETE` | `/api/v1/workspaces/:id/channels/waba/templates/:name` | Delete template from Meta account |
| `POST` | `/api/v1/workspaces/:id/channels/waba/send-template` | Dispatch approved HSM template |
| `POST` | `/api/v1/workspaces/:id/channels/waba/send-buttons` | Dispatch interactive quick reply buttons |
| `POST` | `/api/v1/workspaces/:id/channels/waba/send-list` | Dispatch interactive section list menu |
| `POST` | `/api/v1/workspaces/:id/channels/waba/send-flow` | Dispatch interactive WhatsApp Flow |
| `POST` | `/api/v1/workspaces/:id/channels/waba/send-media` | Dispatch rich media (audio PTT, image, PDF) |
| `POST` | `/api/v1/channels/waha/webhook` | Ingest live inbound/outbound WAHA webhooks |
| `POST` | `/api/v1/channels/waba/webhook` | Ingest live Meta Cloud API delivery webhooks |
| `POST` | `/api/v1/workspaces/:id/journeys/:jId/send-message` | Send real-time operator chat message |
| `GET` | `/api/v1/workspaces/:id/tracking` | Get CAPI and Pixel tracking configuration |
| `POST` | `/api/v1/workspaces/:id/tracking` | Save CAPI and Pixel credentials |
| `POST` | `/api/v1/workspaces/:id/tracking/test-capi` | Dispatch test conversion event to Meta CAPI |

---

## 5. DATABASE SCHEMA SUMMARY

### Core Tables:
1. **`workspaces`**: Tenancy root (`id`, `name`, `slug`, `created_at`).
2. **`contacts`**: Lead registry (`id`, `workspace_id`, `phone`, `name`, `whatsapp_id`, `email`, `created_at`, `updated_at`). Unique on `(workspace_id, phone)`.
3. **`channel_connections`**: Provider credentials and engine status (`id`, `workspace_id`, `provider`, `phone_number`, `name`, `public_config`, `status`).
4. **`commercial_journeys`**: Active commercial cycles (`id`, `workspace_id`, `contact_id`, `channel_connection_id`, `status`, `pipeline_stage`, `total_revenue_minor`, `started_at`). Partial unique index on `(workspace_id, contact_id) WHERE status = 'OPEN'`.
5. **`conversation_messages`**: Chat timeline (`id`, `workspace_id`, `channel_connection_id`, `journey_id`, `contact_id`, `direction`, `sender_type`, `provider_message_id`, `text_content`, `media_url`, `sent_at`). Unique on `(channel_connection_id, provider_message_id)`.
6. **`handoff_cases`**: Operator intervention state (`id`, `workspace_id`, `journey_id`, `status`, `reason`, `assigned_operator_id`).
7. **`appointments`**: Bookings & external agenda events (`id`, `workspace_id`, `journey_id`, `title`, `scheduled_for`, `status`).
8. **`known_facts`**: Extracted lead intelligence (`id`, `workspace_id`, `journey_id`, `key`, `value`, `source`).

---

## 6. CURRENT STATE & PENDING ROADMAP

### Completed in Current Sprint:
- [x] Multi-engine WAHA + WABA architectural coexistence with zero duplicate journeys.
- [x] Resilient WABA authentication supporting manual IDs and System User Tokens.
- [x] Fixed PostgreSQL partial index `ON CONFLICT` constraints during live webhook ingestion.
- [x] Database-backed **"Nova Conversa"** modal supporting contact search and phone initiation.
- [x] Full WABA Template suite: listing, in-app creator, deletion, and interactive HSM dispatch.
- [x] WhatsApp Flows backend dispatcher (`/send-flow`).
- [x] Interactive buttons and section lists endpoints.

### Pending / Next Sprints:
- [ ] **WhatsApp Flows Visual Builder:** Drag-and-drop canvas in UI to construct JSON layouts for Flows (booking, lead gen forms).
- [ ] **WhatsApp Product Catalog Sync:** Sync Meta Commerce catalogs directly into the chat composer for 1-click product cards.
- [ ] **Automated Multi-Step Broadcasts:** Scheduled mass outbound dispatch engine respecting rate limits and template compliance.
- [ ] **Webhook Signature Verification for AbacatePay:** Enforce HMAC-SHA256 signature checks on production payment callbacks.
- [ ] **Multi-Agent Voice Synthesis:** Audio generation for automated voice notes sent via WABA PTT.

---

*SOS-SALES Architecture Blueprint | Generated for MCT LTDA & Engineering Handover*

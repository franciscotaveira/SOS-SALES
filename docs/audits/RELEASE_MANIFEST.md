# RELEASE MANIFEST — SOS Sales v2.0

> **Status:** Local Build Artefact (Unreleased to Remote VPS)  
> **Gerado em:** 22 de Agosto de 2026  
> **Arquitetura:** React 19 + Fastify 4 + TypeScript + Supabase + WAHA + Meta WABA v20.0  

---

## 1. Identificação do Release

| Metadado | Valor Observado | Descrição |
|---|---|---|
| **Produto** | SOS Sales | CRM Operacional de WhatsApp Multi-Tenant |
| **Edição** | Enterprise Multi-Tenant WhatsApp CRM | Continuidade Comercial & Tráfego Pago |
| **Versão** | `2.0.0` | Major release após auditoria profunda |
| **Release Tag** | `v2.0.0-prod` | Tag de produção |
| **Kernel** | `TX Commercial Core v2.0` | Motor assíncrono de eventos |
| **Commit SHA Atual** | `f07ecadc73c7a252789f048bc493a303f4e1f1c5` | Hash imutável do Git local |
| **Short SHA** | `f07ecad` | 7 caracteres |
| **Status da Árvore Git** | `DIRTY (Local Uncommitted Edits)` | Modificações locais pendentes de commit |
| **Ambiente Alvo** | `production` (`https://crm.iaparavendas.tech`) | VPS `179.197.72.221` |

---

## 2. Artefatos de Build Compilados & Hashes SHA-256

| Artefato | Localização | Hash SHA-256 | Formato |
|---|---|---|---|
| **Backend API Core** | `apps/api/dist/index.js` | `sha256:cc24f0dfa740d9d1d1059d336de9cd38cec9eaa69352bea0aa2a8138b94430e0` | ESM Bundle (369.19 KB) |
| **Release Manifest API** | `apps/api/dist/release-manifest.json` | — | JSON imutável lido por `/version` |
| **Frontend Bundle** | `dist/assets/index-CjoSq6Jy.js` | — | React 19 SPA (954.10 KB) |
| **Frontend Styles** | `dist/assets/index-Cx5HJfiR.css` | — | Tailwind v4 (194.65 KB) |
| **Caddyfile Versionado** | `deploy/Caddyfile` | — | Proxy reverso com `/version` e `/health` |

---

## 3. Superfícies de Exposição e Autenticação

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. ROTAS OPERACIONAIS HUMANAS (Exigem Bearer JWT Supabase + Validação de Tenant)       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ • /api/v1/cockpit/* (priorities, journeys)                                             │
│ • /api/v1/workspaces/:workspaceId/channels/whatsapp/* (qr, status, logout, sync)      │
│ • /api/v1/workspaces/:workspaceId/channels/waba/* (configure, templates, send, flows)  │
│ • /api/v1/workspaces/:workspaceId/groups/* (broadcast, send-message, resolve)          │
│ • /api/v1/workspaces/:workspaceId/tracking/* (meta datasets, capi, attribution)        │
│ • /api/v1/ai/* (vision/analyze, copilot-suggestion)                                    │
│ • /api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/* (status, pause, resume)    │
│ • /api/v1/workspaces/:workspaceId/channels/messenger/* (links, nlp, private-replies)   │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. WEBHOOKS DE FORNECEDORES (Sem JWT Humano, Autenticação de Fornecedor Obrigatória)    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ • POST /api/v1/channels/waha/webhook (x-api-key timing-safe fail-closed + persistência)│
│ • POST /webhooks/waba (X-Hub-Signature-256 HMAC SHA-256)                               │
│ • POST /api/v1/channels/waba/flows/data-exchange (Meta RSA/AES Flow Cryptography)      │
│ • POST /webhooks/abacatepay (Chave de webhook AbacatePay)                              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

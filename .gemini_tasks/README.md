# 📋 SOS Sales — Gemini Tasks Index (Completo)

> **Como usar no Gemini:** Digite `@` seguido do caminho relativo do arquivo.
> Exemplo: `@.gemini_tasks/01-backend-core/01-waha-outbound-worker.md`

---

## 🗂️ Estrutura de Pastas

```
.gemini_tasks/
├── MASTER_ORCHESTRATION_PROMPT.md    # 🎯 PROMPT MESTRE — Inicia tudo
├── README.md                          # Índice + como usar @
├── 01-backend-core/              # MVP Semana 1 (5 tasks)
│   ├── 01-waha-outbound-worker.md
│   ├── 02-meta-spend-import.md
│   ├── 03-capi-dispatch-worker.md
│   ├── 17-appointments-notes-api.md      # Backend para Agenda/Notes
│   └── 18-calendar-gateway-rrule.md      # Calendar + RRULE sync
├── 02-frontend-views/            # MVP Semana 1-2 (4 tasks)
│   ├── 04-live-commercial-kanban.md
│   ├── 05-live-conversations-view.md
│   ├── 06-live-settings-view.md
│   └── 19-agenda-notes-backend.md        # Conectar UI existente ao backend
├── 03-provisioning/              # MVP Semana 2 (2 tasks)
│   ├── 07-workspace-init-api.md
│   └── 08-frontend-auto-redirect.md
├── 04-docs-validation/           # MVP Semana 2 (4 tasks)
│   ├── 09-api-contract-openapi.md
│   ├── 10-smoke-test-script.md
│   ├── 11-production-runbook.md
│   └── 12-full-validation.md
├── 05-integrations/              # Onda 1 Pós-MVP
│   └── 13-integration-registry-mcp.md
├── 06-billing-collections/       # Onda 1 Pós-MVP
│   └── 14-billing-gateway-asaas.md
├── 07-calendar-recurring/        # Onda 1 Pós-MVP
│   └── 15-calendar-recurring-followups.md
└── 08-advanced-ai/               # Ondas 2-3 Futuro
    └── 16-advanced-ai-agent.md
```

---

## ✅ MVP 100% LOCAL (Tasks 1-15) — **FOCO ATUAL**

### 01-backend-core (Semana 1 — Riskiest First)
| # | Task | Arquivo | Status |
|---|------|---------|--------|
| 1 | **WAHA Outbound Worker** | `01-waha-outbound-worker.md` | 📋 PRONTO |
| 2 | **Meta Ads Spend Import** | `02-meta-spend-import.md` | 📋 PRONTO |
| 3 | **CAPI Dispatch Worker** | `03-capi-dispatch-worker.md` | 📋 PRONTO |
| 4 | **Appointments & Notes API** | `17-appointments-notes-api.md` | 📋 PRONTO |
| 5 | **Calendar Gateway + RRULE** | `18-calendar-gateway-rrule.md` | 📋 PRONTO |

### 02-frontend-views (Semana 1-2 — Conectar Existente)
| # | Task | Arquivo | Status |
|---|------|---------|--------|
| 6 | **LiveCommercialKanbanView** | `04-live-commercial-kanban.md` | 📋 PRONTO |
| 7 | **LiveConversationsView** | `05-live-conversations-view.md` | 📋 PRONTO |
| 8 | **LiveSettingsView** | `06-live-settings-view.md` | 📋 PRONTO |
| 9 | **Agenda & Notes → Backend Real** | `19-agenda-notes-backend.md` | 📋 PRONTO |

### 03-provisioning (Semana 2 — Controlado)
| # | Task | Arquivo | Status |
|---|------|---------|--------|
| 10 | **API `/workspaces/init`** | `07-workspace-init-api.md` | 📋 PRONTO |
| 11 | **Frontend Auto-Redirect** | `08-frontend-auto-redirect.md` | 📋 PRONTO |

### 04-docs-validation (Semana 2 — Finalização)
| # | Task | Arquivo | Status |
|---|------|---------|--------|
| 12 | **API Contract (OpenAPI)** | `09-api-contract-openapi.md` | 📋 PRONTO |
| 13 | **Smoke Test Script** | `10-smoke-test-script.md` | 📋 PRONTO |
| 14 | **Runbook Atualizado** | `11-production-runbook.md` | 📋 PRONTO |
| 15 | **Validação Completa** | `12-full-validation.md` | 📋 PRONTO |

---

## 🚀 PÓS-MVP — ONDA 1 (Tasks 16-18) — **Próximas após MVP**

### 05-integrations
| # | Task | Arquivo | Status |
|---|------|---------|--------|
| 16 | **Integration Registry + MCP** | `13-integration-registry-mcp.md` | 📋 PRONTO |

### 06-billing-collections
| # | Task | Arquivo | Status |
|---|------|---------|--------|
| 17 | **Billing Gateway + Asaas** | `14-billing-gateway-asaas.md` | 📋 PRONTO |

### 07-calendar-recurring
| # | Task | Arquivo | Status |
|---|------|---------|--------|
| 18 | **Calendar + Recurring Follow-ups** | `15-calendar-recurring-followups.md` | 📋 PRONTO |

---

## 🔮 FUTURO — ONDAS 2-3 (Task 19+)

### 08-advanced-ai
| # | Task | Arquivo | Status |
|---|------|---------|--------|
| 19 | **Advanced AI Agent** | `16-advanced-ai-agent.md` | 📋 PRONTO |

---

## 🎯 Ordem de Execução Completa (tstack Riskiest First)

```
MVP (AGORA)                              PÓS-MVP (ONDA 1)              FUTURO (ONDAS 2-3)
├── 01 WAHA Outbound ────────────────►   ├── 16 Integration Registry ──────►
├── 02 Meta Spend Import                 ├── 17 Billing Gateway             │
├── 03 CAPI Dispatch                     ├── 18 Calendar/Recurring          │
├── 04 Appointments & Notes API          │                                  ▼
├── 05 Calendar Gateway + RRULE          │                          19 Advanced AI Agent
├── 06 LiveCommercialKanbanView          │
├── 07 LiveConversationsView             │
├── 08 LiveSettingsView                  │
├── 09 Agenda & Notes → Backend          │
├── 10 Workspace Init                    │
├── 11 Frontend Auto-Redirect            │
├── 12 API Contract                      │
├── 13 Smoke Test                        │
├── 14 Runbook                           │
└── 15 Full Validation                   │
```

---

## 📌 Convenção de Nomenclatura

| Padrão | Exemplo |
|--------|---------|
| Pastas | `01-backend-core`, `05-integrations` |
| Arquivos | `NN-nome-da-task.md` (NN = número sequencial global) |
| Referência no Gemini | `@.gemini_tasks/01-backend-core/01-waha-outbound-worker.md` |

---

## ✅ Checklist de Progresso Global

### MVP (1-15) — **BLOQUEIO ZERO — RODAR AGORA**
- [ ] 01 WAHA Outbound Worker
- [ ] 02 Meta Ads Spend Import
- [ ] 03 CAPI Dispatch Worker
- [ ] 04 Appointments & Notes API
- [ ] 05 Calendar Gateway + RRULE
- [ ] 06 LiveCommercialKanbanView
- [ ] 07 LiveConversationsView
- [ ] 08 LiveSettingsView
- [ ] 09 Agenda & Notes → Backend Real
- [ ] 10 Workspace Init API
- [ ] 11 Frontend Auto-Redirect
- [ ] 12 API Contract (OpenAPI)
- [ ] 13 Smoke Test Script
- [ ] 14 Production Runbook
- [ ] 15 Full Validation

### Onda 1 (16-18) — **APÓS MVP + BLOQUEIOS EXTERNOS RESOLVIDOS**
- [ ] 16 Integration Registry + MCP
- [ ] 17 Billing Gateway + Asaas
- [ ] 18 Calendar + Recurring Follow-ups

### Ondas 2-3 (19+) — **ROADMAP ESTRATÉGICO**
- [ ] 19 Advanced AI Agent
- [ ] 20 NF-e Integration (FocusNFe/NFe.io)
- [ ] 21 Multi-ERP Connectors (Tiny, Bling, Omie)
- [ ] 22 White-label Contabilidade
- [ ] 23 Marketplace de Integrações
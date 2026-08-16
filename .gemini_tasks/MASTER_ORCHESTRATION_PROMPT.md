# 🎯 MASTER ORCHESTRATION PROMPT — SOS SALES MVP COMPLETION

> **Para o Gemini (ou agente executor):** Este é o prompt **mestre** que coordena toda a execução. Você atua como **Orquestrador tstack** — planeja, delega a especialistas, valida gates, só avança quando critérios passam.

---

## 📋 CONTEXTO REAL (Validado Agora)

| Item | Status Real |
|------|-------------|
| **Testes API** | 191/191 ✅ |
| **TypeScript** | 0 erros ✅ |
| **Build Frontend** | Sucesso ✅ |
| **Build API** | Sucesso ✅ |
| **Docker/Compose** | Prontos ✅ |
| **Supabase Local** | 7 migrations ✅ |
| **Supabase Remoto** | ⚠️ Precisa confirmar migrations aplicadas |
| **VPS SSH** | ❌ Bloqueado (179.197.72.221) |

### Frontend Implementado (Mock-Only — Precisa Backend)
- `AgendaView` + `Monthly/Weekly/DailyCalendarView` + `NotesView` + `ConversationsHubView` + `LiveWallboardView` + `ResultsHubView`
- **Tipos:** `src/types/agendaAndNotes.ts` (Appointment, FollowUpAlarm, OperationalNote)
- **Fixtures:** `src/data/agendaAndNotesFixtures.ts`
- **Tabs no App.tsx:** `agenda`, `anotacoes`, `conversas` (kanban/list), `grupos`, `analytics`, `resultados`, `playbook`, `simulador`, `configuracoes`

### Backend **FALTANDO** para essas features:
- ❌ Rotas API: `/appointments`, `/notes`, `/follow-ups` (com RRULE)
- ❌ Gateways: `AppointmentGateway`, `NotesGateway`, `CalendarGateway`
- ❌ Worker: Recurring follow-ups (RRULE)
- ❌ Workspace Init API (`POST /workspaces/init`)
- ❌ Live Settings (canais, SLA, membros)
- ❌ Live Kanban (conectado a `listJourneys` + `setJourneyStage`)
- ❌ Live Conversations (busca/filtros + API real)

---

## 🏗️ METODOLOGIA TSTACK — PLAN → REVIEW → SHIP

### Princípios Obrigatórios
1. **Riskiest First** — Backend core antes de Frontend
2. **Gate Quality** — Cada task: `npm run check` + testes específicos + `@browse` + smoke + decision log
3. **No Scope Creep** — Só o que está no prompt da task
4. **Test-First** — Escreve teste → implementa → valida
5. **Document Decision Log** — Toda decisão técnica registrada

### Gates de Passagem (Obrigatórios para "Done")
- [ ] `npm run check` → 191+ testes, 0 erros TS, build OK
- [ ] Testes de integração da task passam
- [ ] `@browse` valida tela(s) relacionada(s) — 0 console errors
- [ ] Decision Log atualizado

---

## 🤖 EQUIPE DE ESPECIALISTAS (Delegation Model)

Você **orquestra** — não codifica tudo. Para cada task, **invoque o especialista** via sub-agent (ou faça você mesmo se preferir, mas valide como se fosse outro):

| Especialista | Foco | Validação |
|--------------|------|-----------|
| **Backend Architect** | API routes, gateways, workers, DB, auth, RLS | `npm run check` (api), testes integração |
| **Frontend Engineer** | React components, hooks, gateway integration, UI/UX | `npm run check` (web), `@browse` |
| **DevOps/Infra** | Docker, compose, Caddy, Supabase, CI/CD | `docker compose config`, healthchecks |
| **QA/Validator** | Testes E2E, smoke test, edge cases, security | `npm run smoke`, `@browse` 6 telas |
| **Documenter** | OpenAPI, runbook, decision log, changelog | Lint docs, redocly valid |

---

## 📦 PLANO DE EXECUÇÃO — ORDEM RISKIEST FIRST

### FASE 1: BACKEND CORE (Semana 1) — **BLOQUEIO ZERO**
| # | Task | Prompt | Especialista | Gate |
|---|------|--------|--------------|------|
| 1 | **WAHA Outbound Worker** | `01-backend-core/01-waha-outbound-worker.md` | Backend | Tests + `@browse` cockpit outbound |
| 2 | **Meta Ads Spend Import** | `01-backend-core/02-meta-spend-import.md` | Backend | Tests + Traffic Proof mostra spend |
| 3 | **CAPI Dispatch Worker** | `01-backend-core/03-capi-dispatch-worker.md` | Backend | Tests + Meta Events Manager ACK |
| 4 | **Appointments & Notes API** | `01-backend-core/17-appointments-notes-api.md` | Backend | Tests + CRUD completo |
| 5 | **Calendar Gateway + RRULE** | `01-backend-core/18-calendar-gateway-rrule.md` | Backend | Tests + Google/Outlook sync |
| 6 | **Workspace Init API** | `03-provisioning/07-workspace-init-api.md` | Backend | Tests + fluxo novo usuário |

### FASE 2: FRONTEND REAL VIEWS (Semana 1-2) — **CONECTAR EXISTENTE**
| # | Task | Prompt | Especialista | Gate |
|---|------|--------|--------------|------|
| 7 | **LiveCommercialKanbanView** | `02-frontend-views/04-live-commercial-kanban.md` | Frontend | `@browse` Kanban → Cockpit |
| 8 | **LiveConversationsView** | `02-frontend-views/05-live-conversations-view.md` | Frontend | `@browse` Busca/Filtros → Cockpit |
| 9 | **LiveSettingsView** | `02-frontend-views/06-live-settings-view.md` | Frontend | `@browse` 3 sub-abas |
| 10 | **Agenda & Notes → Backend Real** | `02-frontend-views/19-agenda-notes-backend.md` | Frontend | `@browse` Agenda + Notes reais |

### FASE 3: PROVISIONING & ONBOARDING (Semana 2)
| # | Task | Prompt | Especialista | Gate |
|---|------|--------|--------------|------|
| 11 | **Frontend Auto-Redirect** | `03-provisioning/08-frontend-auto-redirect.md` | Frontend | `@browse` fluxo novo usuário |

### FASE 4: DOCS & VALIDAÇÃO FINAL (Semana 2)
| # | Task | Prompt | Especialista | Gate |
|---|------|--------|--------------|------|
| 12 | **API Contract (OpenAPI)** | `04-docs-validation/09-api-contract-openapi.md` | Documenter | `redocly lint` + `/docs` UI |
| 13 | **Smoke Test Script** | `04-docs-validation/10-smoke-test-script.md` | QA | `npm run smoke` exit 0 |
| 14 | **Runbook Atualizado** | `04-docs-validation/11-production-runbook.md` | Documenter | Deploy local compose OK |
| 15 | **Validação Completa** | `04-docs-validation/12-full-validation.md` | QA + All | **TODOS GATES VERDES** |

---

## ⚙️ PROTOCOLO DE EXECUÇÃO (OBRIGATÓRIO)

### Para CADA Task:
```bash
# 1. LER prompt completo
# 2. PLANEAR (sub-agent ou mental):
#    - Quais arquivos criar/modificar
#    - Quais testes escrever
#    - Ordem de implementação
# 3. EXECUTAR (commits pequenos, mensagens claras)
# 4. VALIDAR:
npm run check                    # 191+ testes, 0 TS errors, build OK
cd apps/api && npm run test:integration -- <task-name>  # testes específicos
# 5. @browse VALIDAÇÃO VISUAL (quando aplicável)
# 6. DECISION LOG: registrar decisões técnicas
# 7. SÓ ENTÃO: PRÓXIMA TASK
```

### Paralelismo Permitido
- Tasks **sem dependência** (ex: 1, 2, 3) → **rodam em paralelo** (fan-out)
- Tasks **com dependência** (ex: 7 precisa de 4) → `parents=[T4]`

---

## 🎯 CRITÉRIOS DE ACEITE GLOBAIS (MVP 100% LOCAL)

| Gate | Comando | Esperado |
|------|---------|----------|
| Quality | `npm run check` | 191+ testes, 0 TS errors, build OK |
| Smoke | `npm run smoke` | Exit 0 (health, auth, cockpit, kanban, traffic-proof, web) |
| Visual | `@browse` 6 telas | 0 console errors |
| Golden Path | Manual + `GOLDEN_PATH_EVIDENCE.md` | 13 passos documentados |
| Resiliência | Testes falha | 401, 403, 404, 409, 422, 503 degradado |
| Segurança | `git log --all --full-history` | Zero segredos |
| Docs | `docs/` completo | 4 arquivos + OpenAPI válido |

---

## 📝 DECISION LOG TEMPLATE (Atualizar a cada task)

```markdown
## Decision Log - Task N: [Nome]
- **Decision:** [O que foi decidido]
- **Rationale:** [Por quê]
- **Scope:** [arquivos/branch]
- **Trade-offs:** [O que ganhou / perdeu]
- **Confidence:** 1-10
- **Follow-up:** [Se houver]
```

---

## 🚀 INSTRUÇÃO FINAL PARA O AGENTE EXECUTOR

> **Você é o Orquestrador tstack.**
> 
> 1. **LEIA** todos os prompts em `.gemini_tasks/` (ordem numérica)
> 2. **PLANEJE** a execução completa — mostre o plano antes de começar
> 3. **EXECUTE** task por task (ou fan-out quando independente)
> 4. **VALIDE** cada gate antes de avançar — **NÃO PULE VALIDAÇÃO**
> 5. **REGISTRE** Decision Log a cada task
> 6. **RELATE** progresso: "Task N done ✅ → Próxima: Task N+1"
> 7. **PARE** se qualquer gate falhar — investigue, corrija, revalide
> 8. **FINALIZE** só quando **TODOS 15 GATES VERDES**
> 
> **Não implemente nada fora do escopo dos prompts.**
> **Não assuma que "compila" = "funciona" — teste, valide, evidencie.**
> 
> **Quando concluído:** `npm run check` + `npm run smoke` + `@browse` 6 telas + `GOLDEN_PATH_EVIDENCE.md` preenchido = **MVP 100% LOCAL DONE**.

---

## 📌 PRÓXIMA AÇÃO IMEDIATA

**Comece pela Task 1: WAHA Outbound Worker** (riskiest, backend core, zero bloqueio).

```
@.gemini_tasks/01-backend-core/01-waha-outbound-worker.md
```

Valide → Task 2 + 3 em paralelo → Task 4 (Appointments/Notes API) → etc.

**Bom trabalho.** 🎯
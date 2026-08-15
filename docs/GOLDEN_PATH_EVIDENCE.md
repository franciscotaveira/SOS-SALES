# SOS Sales — Evidência do Golden Path (E2E)

> **Objetivo:** Registrar cada etapa do fluxo principal com IDs sanitizados, timestamps e resultado.  
> **Critério:** Uma linha por evento real executado em ambiente de staging/produção.  
> **Formato:** `Evento → Registro Bruto → Normalização → Jornada → Frontend → Ação Humana → Outcome → Traffic Proof`

---

## Template de Registro (Preencher durante validação em staging/produção)

| # | Etapa | Evento de Entrada | Registro Bruto (ID) | Normalização | Jornada (ID) | Frontend (View) | Ação Humana | Outcome | Traffic Proof | Timestamp | Status |
|---|-------|-------------------|---------------------|--------------|--------------|-----------------|-------------|---------|---------------|-----------|--------|
| 1 | Login | Operator autentica via Supabase | `auth:session:{uuid}` | JWT validado | — | Login → Workspace Select | Seleciona workspace | — | — | `2026-08-15T...` | ⬜ PENDING |
| 2 | Inbound Real | WAHA webhook `/webhooks/waha` | `inbound_event:{uuid}` | `conversation_messages` + `commercial_journey` | `journey:{uuid}` | Priority Queue → Cockpit | — | — | — | `2026-08-15T...` | ⬜ PENDING |
| 3 | Prioridade | `listPriorities` retorna item | `priority:{uuid}` | SLA calculado | `journey:{uuid}` | QueueCard (SLA badge) | Operador clica | — | — | `2026-08-15T...` | ⬜ PENDING |
| 4 | Cockpit | `getCockpit` carrega contexto | `cockpit:{uuid}` | `DecisionContext` + `KnownFacts` + `Handoff` | `journey:{uuid}` | LiveJourneyBody | Visualiza dossier | — | — | `2026-08-15T...` | ⬜ PENDING |
| 5 | Handoff Accept | `POST /handoffs/{id}/accept` | `handoff_case:{uuid}` | Status `ACCEPTED` | `journey:{uuid}` | Botão "Assumir" | Operador assume | — | — | `2026-08-15T...` | ⬜ PENDING |
| 6 | Registrar Fato | `POST /journeys/{id}/facts` | `known_fact:{uuid}` | Append-only + supersession | `journey:{uuid}` | Modal "Registrar Fato" | Operador insere | — | — | `2026-08-15T...` | ⬜ PENDING |
| 7 | Follow-up | `POST /journeys/{id}/follow-ups` | `follow_up:{uuid}` | Due date + reason | `journey:{uuid}` | Modal "Agendar Follow-up" | Operador agenda | — | — | `2026-08-15T...` | ⬜ PENDING |
| 8 | Stage Change | `PATCH /journeys/{id}/stage` | `journey:{uuid}` | Stage atualizado | `journey:{uuid}` | Seletor de estágio | Operador altera | — | — | `2026-08-15T...` | ⬜ PENDING |
| 9 | Outcome WON | `POST /journeys/{id}/outcomes` | `commercial_outcome:{uuid}` | Revenue minor + CAPI queued | `journey:{uuid}` | Modal "Registrar Ganho" | Operador confirma | `WON` + revenue | Cohort updated | `2026-08-15T...` | ⬜ PENDING |
| 10 | Traffic Proof | `GET /traffic-proof` | `traffic_proof:{uuid}` | Spend/ROAS nullable | — | LiveTrafficProofView | Visualiza | — | Dados consolidados | `2026-08-15T...` | ⬜ PENDING |

---

## Evidências de Resiliência (Testes de Falha)

| Cenário | Comando / Ação | Resultado Esperado | Evidência | Status |
|---------|----------------|-------------------|-----------|--------|
| 401 sem JWT | `curl /api/v1/workspaces` | 401 Unauthorized | — | ⬜ PENDING |
| 403 por role | `viewer` tenta `POST /facts` | 403 Forbidden | — | ⬜ PENDING |
| 404 cross-tenant | `operatorA` acessa `workspaceB` | 404 Not Found | — | ⬜ PENDING |
| 409 idempotency drift | Mesmo `Idempotency-Key`, payload diferente | 409 Conflict | — | ⬜ PENDING |
| 422 payload inválido | `POST /facts` sem `confidence` | 422 Unprocessable | — | ⬜ PENDING |
| Webhook duplicado | Reenviar mesmo `providerEventId` | `isDuplicate: true`, 202 Accepted | — | ⬜ PENDING |
| Dependência degradada | Parar Redis → `GET /ready` | 503 degraded (redis) | — | ⬜ PENDING |
| DB indisponível | Parar Postgres → `GET /ready` | 503 degraded (database) | — | ⬜ PENDING |
| Restart containers | `docker compose restart` | Dados persistem, sessão WAHA mantida | — | ⬜ PENDING |
| Backup/Restore | `scripts/backup-db.sh` → `restore-db.sh` | Schema + dados íntegros | — | ⬜ PENDING |
| Rollback imagem | `docker compose up -d --force-recreate` | Versão anterior funcional | — | ⬜ PENDING |

---

## Checklist de Validação Final (P12)

- [ ] Todas as 10 etapas do Golden Path executadas com sucesso
- [ ] Todos os 11 cenários de resiliência validados
- [ ] Zero falhas não tratadas (no error swallowing)
- [ ] Logs estruturados disponíveis (Pino JSON)
- [ ] Métricas de latência P50/P95 dentro do SLA (<200ms P95)
- [ ] Zero secrets em logs, código, ou responses
- [ ] TLS A+ no SSL Labs (se domínio real)
- [ ] Firewall: apenas 80/443 expostos
- [ ] Healthchecks: `/health` 200, `/ready` 200 (todas deps OK)

---

## Observações

> Preencher durante a validação em staging (após P0-B + P0-E + P0-F).  
> Cada linha deve ter **evidência executada** (log, screenshot, DB query, response JSON).  
> "OK" ou "pronto" sem evidência = **não validado**.
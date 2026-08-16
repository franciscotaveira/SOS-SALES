# PROMPT PARA GEMINI — Task 12: Validação Completa (Final Gate)

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Branch: `codex/import-latest-zip`
Todas as tasks 1-11 concluídas
Objetivo: **Validação final end-to-end** antes de liberar para deploy na VPS

## CHECKLIST DE VALIDAÇÃO (Todos Devem Passar)

### 1. Quality Gates (Automatizados)
```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES

# Typecheck + Testes + Build
npm run check
# ✅ 191+ testes passando
# ✅ 0 erros TypeScript
# ✅ Build API (tsup) + Web (Vite) OK
```

### 2. Smoke Test Automatizado
```bash
# Requer: API + Web + Supabase local + WAHA local rodando
npm run smoke
# ✅ Exit code 0
# ✅ Health, Ready, Auth, Workspaces, Cockpit, Traffic Proof, Web
```

### 3. Validação Visual @browse (6 Telas)
Navegar e capturar screenshot de cada tela:

| Tela | Rota | Validações |
|------|------|------------|
| **Login/Workspace** | `/` | Auth → seleção workspace → redirect |
| **Cockpit (Agora)** | `/agora` | Fila prioridades, jornada, dossiê, ações (handoff, fact, follow-up, stage, outcome, outbound) |
| **Kanban (Funil)** | `/funil` | 5 colunas, cards com dados reais, avançar/recuar etapa, clique → cockpit |
| **Conversas** | `/conversas` | Busca nome/telefone, filtros (handoff, SLA, estágio), paginação, abrir → cockpit |
| **Traffic Proof** | `/analytics` | Cohorts, spend/ROAS, date range, "Não importado" → valores reais |
| **Configurações** | `/configuracoes` | 3 abas: Canais (QR, conectar), SLA (owner edita), Membros (owner convida/promove) |

**Critério:** 0 erros no console do browser em **todas** as 6 telas.

### 4. Fluxo Golden Path Completo (Manual)
Executar e documentar no `docs/GOLDEN_PATH_EVIDENCE.md`:

```
1. Login → Workspace Select
2. Inbound Real (simulado via API) → Jornada criada na fila
3. Prioridade aparece no Cockpit (SLA badge)
4. Operador clica → Cockpit abre com contexto completo
5. Assume Handoff (se pendente)
6. Registra Fato Conhecido (confirmedByCustomer=true)
7. Agenda Follow-up (dueAt + reason)
8. Altera Estágio (NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION)
9. Registra Outcome WON (revenueMinor > 0)
10. Traffic Proof atualiza cohort com revenue
11. Outbound: Cria Draft → Aprova → Worker envia → Callback delivered/read
12. CAPI: Outcome WON → Worker envia Purchase → Meta ACK
13. Meta Spend Import: Job roda → spend populado → Traffic Proof mostra ROAS
```

### 5. Resiliência (Testes de Falha)
| Cenário | Comando | Esperado |
|---------|---------|----------|
| 401 sem JWT | `curl /api/v1/workspaces` | 401 |
| 403 role | `viewer` POST `/facts` | 403 |
| 404 cross-tenant | `operatorA` GET `workspaceB` | 404 |
| 409 idempotency | Mesmo key, payload diferente | 409 |
| Webhook dup | Reenviar mesmo `providerEventId` | 202 `isDuplicate: true` |
| Redis down | `docker stop redis` → `/ready` | 503 degraded |
| DB down | `docker stop postgres` → `/ready` | 503 degraded |

### 6. Documentação Completa
- [ ] `docs/FINAL_IMPLEMENTATION_STATUS.md` — tabela componentes ✅
- [ ] `docs/GOLDEN_PATH_EVIDENCE.md` — preenchido com evidências reais
- [ ] `docs/API_CONTRACT.md` — OpenAPI gerado + resumo humano
- [ ] `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` — atualizado com Docker/Caddy/backup
- [ ] `openapi.yaml` / `openapi.json` — válidos (redocly lint)

### 7. Zero Segredos / Segurança
```bash
# Verificar
git log --all --full-history --source -- "**/.env*" "**/*secret*" "**/*password*" "**/*key*"
# ✅ Nenhum segredo no histórico

grep -r "sk_live\|sk_test\|service_role\|password.*=" --include="*.ts" --include="*.js" .
# ✅ Zero matches
```

## CRITÉRIO DE ACEITE FINAL (Definition of Done - MVP 100% Local)

| Gate | Status |
|------|--------|
| ✅ Quality Gates (`npm run check`) | PASS |
| ✅ Smoke Test (`npm run smoke`) | PASS |
| ✅ @browse 6 telas (0 console errors) | PASS |
| ✅ Golden Path manual completo | DOCUMENTADO |
| ✅ Resiliência testada | PASS |
| ✅ Documentação completa | PASS |
| ✅ Zero segredos | PASS |

**Se TODOS verdes → MVP 100% LOCAL CONCLUÍDO → Liberar para P0-B (Supabase remoto) + P0-F (VPS deploy)**

## COMANDOS FINAIS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES

# 1. Quality gates
npm run check

# 2. Smoke test (subir serviços antes)
npm run smoke

# 3. @browse - pedir ao supervisor para rodar nas 6 telas

# 4. Verificar docs
ls -la docs/
cat docs/FINAL_IMPLEMENTATION_STATUS.md
cat docs/GOLDEN_PATH_EVIDENCE.md
cat docs/API_CONTRACT.md

# 5. OpenAPI válido
cd apps/api && npx redocly lint openapi.yaml
```

---

## 🎯 PRÓXIMO PASSO APÓS VALIDAÇÃO

**NÃO FAZER DEPLOY AINDA.**

Aguardar Francisco resolver:
1. **Supabase Remoto** — migrations 00001-00007 aplicadas em `yiiuebhyqixzluguxsqi`
2. **VPS SSH** — `179.197.72.221` acesso funcional
3. **WAHA Real** — QR Code lido, sessão `CONNECTED`, webhook HTTPS

Depois: `@ship` → `@land-and-deploy` → `@canary`
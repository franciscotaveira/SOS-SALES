# TSTACK CORRECTION PLAN — SOS Sales Infra para Produção

> **Contexto**: Código 100% pronto (218/218 testes, 0 TS errors, Golden Path validado). Bloqueios são **exclusivamente infraestrutura**.
> **Metodologia**: tstack = PLAN → REVIEW → SHIP | Riskiest First | Gates obrigatórios

---

## FASE 0: BASELINE VALIDATION (Já Concluído ✅)

| Check | Status | Evidência |
|-------|--------|-----------|
| `npm run check` | ✅ PASS | 218/218 testes, 0 erros TS, build OK |
| `npm run smoke` | ✅ PASS | 13/13 checks OK |
| Golden Path | ✅ VALIDADO | 13 passos cobertos por testes integração |
| Segredos no Git | ✅ ZERO | `git log --all --full-history` limpo |
| Dockerfiles/Compose | ✅ PRONTOS | Multi-stage, healthchecks, Caddy TLS |

---

## FASE 1: INFRAESTRUTURA — RISKIEST FIRST (Ordem Obrigatória)

### Task INFRA-1: VPS SSH Access — **BLOQUEIO CRÍTICO #1**
**Risco**: Sem SSH, nada mais avança. Firewall, key rotation, IP change.

**Deliverable**: `ssh deploy@179.197.72.221` funcional com key-based auth, sudo sem senha.

**Passos**:
1. Testar conectividade: `nc -zv 179.197.72.221 22`
2. Verificar firewall VPS (cloud provider security groups + ufw/iptables local)
3. Validar/rotacionar SSH keys: `ssh-keygen -t ed25519 -C "sos-sales-deploy"` → adicionar em `~/.ssh/authorized_keys`
4. Configurar `deploy` user com `NOPASSWD:ALL` em `/etc/sudoers.d/deploy`
5. Testar: `ssh -o BatchMode=yes deploy@179.197.72.221 'echo OK'`

**Gate**: `ssh -o ConnectTimeout=5 deploy@179.197.72.221 true` → exit 0

---

### Task INFRA-2: Supabase Remoto Migrations + RLS — **BLOQUEIO CRÍTICO #2**
**Risco**: Banco é single source of truth. Migrations não aplicadas = deploy impossível.

**Deliverable**: 7 migrations (0001-0007) aplicadas no project `yiiuebhyqixzluguxsqi` + RLS validado com 2 workspaces isolados.

**Passos**:
1. Link local ao remoto: `supabase link --project-ref yiiuebhyqixzluguxsqi`
2. Aplicar migrations: `supabase db push --linked` (forward-only, sem rollback destrutivo)
3. Verificar tabelas: `supabase db diff --linked` → deve mostrar "No differences"
4. Criar 2 workspaces de teste via API `/workspaces/init` com usuários diferentes
5. Testar RLS: Inserir jornada no WS1 → consultar no WS2 → deve retornar vazio (zero vazamento)
6. Testar membership roles: owner/supervisor/operator/viewer permissions

**Gate**: 
```bash
# Teste automatizado RLS
curl -H "Authorization: Bearer $WS1_TOKEN" "$API/journeys" | jq '.data | length'  # > 0
curl -H "Authorization: Bearer $WS2_TOKEN" "$API/journeys" | jq '.data | length'  # = 0
```

---

### Task INFRA-3: WAHA Homologação Isolada — **BLOQUEIO CRÍTICO #3**
**Risco**: Runbook proíbe reutilizar sessão/volume do CRM TX. Outbound só habilita após prova.

**Deliverable**: WAHA `devlikeapro/waha:latest` isolado na rede Docker, sessão `CONNECTED`, webhook HTTPS assinado, ciclo completo provado, kill switch funcional.

**Passos**:
1. Subir compose apenas WAHA + Redis: `docker compose -f docker-compose.prod.yml up -d waha redis`
2. Acessar UI WAHA: `http://VPS_IP:3000` → ler QR Code → aguardar `CONNECTED`
3. Configurar webhook: `WAHA_WEBHOOK_URL=https://crm.iaparavendas.tech/webhooks/waha` (HTTPS via Caddy)
4. Testar inbound: enviar msg WhatsApp → verificar log `/webhooks/waha` recebe payload
5. Testar ciclo outbound (com `is_outbound_enabled=true` temporário):
   - `POST /api/v1/dispatches` → status `QUEUED`
   - Worker processa → `SENT` → `DELIVERED` → `READ`
   - Simular falha (número inválido) → `FAILED` com reason
6. Provar idempotency: reenviar mesmo `idempotency-key` → NÃO duplica
7. Kill switch: `UPDATE channels SET is_outbound_enabled=false` → dispatch fica `DRAFT` sem ir para WAHA
8. **Só então**: manter `is_outbound_enabled=false` no workspace/canal padrão

**Gate**: Logs mostram ciclo completo + kill switch bloqueia antes do provider.

---

### Task INFRA-4: DNS/SSL Caddy — **BLOQUEIO OPERACIONAL**
**Risco**: Sem DNS+TLS, webhooks HTTPS falham, Caddy não emite certificado.

**Deliverable**: `crm.iaparavendas.tech` e `sos.mct.com.br` resolvendo para IP VPS, TLS válido (Let's Encrypt), Caddy proxy funcionando.

**Passos**:
1. No provedor DNS: criar A records → IP VPS (179.197.72.221)
2. Aguardar propagação: `dig +short crm.iaparavendas.tech` → IP correto
3. Verificar Caddyfile domínios batem com DNS
4. Subir stack completo: `docker compose -f docker-compose.prod.yml up -d`
5. Verificar Caddy logs: `docker logs sos-sales-caddy` → "certificate obtained successfully"
6. Testar HTTPS: `curl -I https://crm.iaparavendas.tech/health` → 200 + TLS válido
7. Testar webhook HTTPS: `curl -X POST https://crm.iaparavendas.tech/webhooks/waha -d '{}'` → 200/400 (não 502/timeout)

**Gate**: `openssl s_client -connect crm.iaparavendas.tech:443 -servername crm.iaparavendas.tech </dev/null | grep "Verify return code: 0"`

---

## FASE 2: DEPLOY PRODUÇÃO (Após FASE 1 Verde)

### Task DEPLOY-1: Deploy Controlado + Golden Path Piloto
**Deliverable**: Stack rodando, healthchecks green, Golden Path 13 passos executados por operador piloto assinado.

**Passos**:
1. `docker compose -f docker-compose.prod.yml up -d` (todos serviços)
2. Verificar healthchecks: `docker ps` → todos `healthy`
3. `/health` → `{"status":"ok"}`
4. `/ready` → `{"status":"ready","checks":{"database":"ok","redis":"ok","worker":"ok"}}`
5. Golden Path piloto (operador real):
   - Login Supabase → Workspace Select
   - Inbound msg → Jornada criada no Cockpit
   - Prioridade/SLA badge calculado
   - Operador assume (handoff) → Follow-up agendado
   - Estágio NEW→WON → Outcome registrado (revenue)
   - Traffic Proof atualizado (cohort + ROAS)
   - Outbound draft → aprovação humana (outbound DESABILITADO)
6. Operador assina checklist: `GOLDEN_PATH_PILOTO_SIGNED.md`

**Gate**: `npm run smoke` (apontando para produção) → 13/13 OK + Golden Path assinado.

---

## FASE 3: CANARY & OPERAÇÃO

### Task CANARY-1: Monitoramento + Backup/Restore + Liberação
**Deliverable**: Observabilidade ativa, restore testado, primeiros operadores liberados.

**Passos**:
1. Logs centralizados: `docker logs -f sos-sales-api` + `sos-sales-caddy` + `sos-sales-waha`
2. Métricas: `/ready` polling a cada 30s (alert se degraded > 2min)
3. Backup Redis: `redis-cli -a $REDIS_PASSWORD --rdb /backup/redis-$(date +%F).rdb`
4. Testar restore: subir Redis separado → `redis-cli -a $REDIS_PASSWORD --pipe < backup.rdb` → validar chaves
5. Backup Supabase: `supabase db dump --linked > backup-$(date +%F).sql` (point-in-time recovery nativo)
6. Liberar operadores gradualmente: 1 → 3 → equipe completa
7. Documentar runbook operacional: incident response, scaling, rollback

**Gate**: Restore testado com sucesso + 48h sem incidentes críticos.

---

## GATES TSTACK (Obrigatórios para Avançar)

| Fase | Gate Comando | Critério Sucesso |
|------|--------------|------------------|
| INFRA-1 | `ssh -o ConnectTimeout=5 deploy@179.197.72.221 true` | exit 0 |
| INFRA-2 | `supabase db diff --linked` + RLS test | "No differences" + WS isolados |
| INFRA-3 | WAHA logs ciclo completo + kill switch | SENT→DELIVERED→READ→FAILED + block |
| INFRA-4 | `curl -I https://crm.iaparavendas.tech/health` | 200 + TLS válido |
| DEPLOY-1 | `npm run smoke` (prod) + Golden Path assinado | 13/13 OK + assinatura |
| CANARY-1 | Restore testado + 48h clean | Backup válido + zero crítico |

---

## DECISION LOG (Pré-registrado)

| Decisão | Rationale |
|---------|-----------|
| Outbound DESABILITADO no deploy inicial | Runbook exige homologação WAHA isolada primeiro; inbound + cockpit + handoff + outcome + traffic proof funcionam sem outbound |
| WAHA volume isolado (`waha_data`) | Não reutilizar sessão/volume do CRM TX — sessão nova, credenciais novas |
| Caddy TLS automático (Let's Encrypt) | Zero config manual, renovação automática, `trustProxy=1` atrás do proxy |
| Migrations forward-only no Supabase | Runbook proíbe rollback destrutivo; migrations são idempotentes por design |
| Redis privado na rede Docker | Não exposto publicamente; só API + WAHA acessam via `redis://:${REDIS_PASSWORD}@redis:6379` |

---

## PRÓXIMA AÇÃO IMEDIATA

```bash
# INFRA-1: Testar SSH agora
nc -zv 179.197.72.221 22
ssh -o ConnectTimeout=5 -o BatchMode=yes deploy@179.197.72.221 'echo "SSH OK"'
```

**Se SSH falhar** → resolver no provedor cloud (security groups) + VPS (ufw/sshd_config) antes de qualquer outra coisa.

---

*Documento gerado via tstack methodology — PLAN phase completa. Próximo: REVIEW (validar com usuário) → SHIP (executar INFRA-1).*
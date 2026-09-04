# RUNBOOK DE CONTENÇÃO P0 NO EDGE (VPS CADDY & FORENSICS)

> **Severidade:** P0 / CONTENÇÃO DE ACESSO IMEDIATA  
> **Estratégia:** Bloqueio incondicional no Edge Caddy antes de qualquer deploy funcional.  
> **Alvo:** VPS `179.197.72.221` (`crm.iaparavendas.tech`)  
> **Arquivo Host:** `/opt/sos-sales/Caddyfile`  
> **Serviço Compose:** `caddy` (Container: `sos-sales-caddy`)  

---

## 1. Congelar Deploy Funcional
* ❌ Zero envio de bundles de API (`apps/api/dist/`).
* ❌ Zero migrations ou modificações de banco.
* ✅ Apenas substituição do Caddyfile e recriação do container Caddy.

---

## 2. Preservação Forense com umask 077 & Inventário de Backups

```bash
# 2.1 Criar diretório de incidente com permissão 0700 e umask restritivo 077
ssh vps "umask 077 && mkdir -p /opt/sos-sales/incident-2026-08-22 && chmod 700 /opt/sos-sales/incident-2026-08-22"

# 2.2 Capturar logs atuais e metadados de execução com permissão 0600
ssh vps "umask 077 && docker logs sos-sales-api > /opt/sos-sales/incident-2026-08-22/api-runtime-\$(date +%Y%m%d_%H%M%S).log"
ssh vps "umask 077 && docker logs sos-sales-caddy > /opt/sos-sales/incident-2026-08-22/caddy-runtime-\$(date +%Y%m%d_%H%M%S).log 2>/dev/null || true"
ssh vps "umask 077 && docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}' > /opt/sos-sales/incident-2026-08-22/containers-before.txt"
ssh vps "chmod 600 /opt/sos-sales/incident-2026-08-22/*"

# 2.3 Inventariar dumps de backup e aplicar permissão 0600
ssh vps "ls -la /opt/sos-sales/backups/"
ssh vps "chmod 600 /opt/sos-sales/backups/*.sql 2>/dev/null || true"
```

---

## 3. Rollback Explícito & Cópia Datada

```bash
# 3.1 Criar backup com nome exato do Caddyfile ativo
ssh vps "cp /opt/sos-sales/Caddyfile /opt/sos-sales/Caddyfile.backup.20260822_055355"
ssh vps "chmod 600 /opt/sos-sales/Caddyfile.backup.20260822_055355"
```

---

## 4. Envio e Validação do Candidato de Contenção

```bash
# 4.1 Enviar o candidato construído a partir do Caddyfile remoto
rsync -avz deploy/Caddyfile vps:/opt/sos-sales/Caddyfile.containment.tmp

# 4.2 Validar sintaxe no VPS usando container temporário isolado (--network none)
ssh vps "docker run --rm --network none -v /opt/sos-sales/Caddyfile.containment.tmp:/etc/caddy/Caddyfile:ro caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile"
```

---

## 5. Aplicação Atômica & Recriação do Serviço Caddy

```bash
# 5.1 Substituição atômica no host
ssh vps "mv /opt/sos-sales/Caddyfile.containment.tmp /opt/sos-sales/Caddyfile"

# 5.2 Recriar o container Caddy para aplicar o novo bind-mount
ssh vps "cd /opt/sos-sales && docker compose up -d --force-recreate caddy"
```

---

## 6. Verificação Externa Completa (Matriz de Sucesso)

Executar no terminal local:

```bash
echo "=== VERIFICAÇÃO DE CONTENÇÃO P0 NO EDGE ==="

# 1. Logout sem token (Esperado: 403)
curl -s -o /dev/null -w "1. Logout sem Auth: %{http_code}\n" -X POST https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/whatsapp/logout

# 2. Logout com token falso (Esperado: 403)
curl -s -o /dev/null -w "2. Logout com Fake Auth: %{http_code}\n" -X POST -H "Authorization: Bearer invalid_token" https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/whatsapp/logout

# 3. Clear History sem token (Esperado: 403)
curl -s -o /dev/null -w "3. Clear-History sem Auth: %{http_code}\n" -X POST https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/whatsapp/clear-history

# 4. Clear History com token falso (Esperado: 403)
curl -s -o /dev/null -w "4. Clear-History com Fake Auth: %{http_code}\n" -X POST -H "Authorization: Bearer invalid_token" https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/whatsapp/clear-history

# 5. Contatos sem token (Esperado: 403)
curl -s -o /dev/null -w "5. Contatos sem Auth: %{http_code}\n" https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/contacts

# 6. Contatos com token falso (Esperado: 403)
curl -s -o /dev/null -w "6. Contatos com Fake Auth: %{http_code}\n" -H "Authorization: Bearer invalid_token" https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/contacts

# 7. Status WhatsApp sem token (Esperado: 403)
curl -s -o /dev/null -w "7. Status WhatsApp: %{http_code}\n" https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/whatsapp/status

# 8. Tracking sem token (Esperado: 403)
curl -s -o /dev/null -w "8. Tracking Config: %{http_code}\n" https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/tracking

# 9. SLA Reports sem token (Esperado: 403)
curl -s -o /dev/null -w "9. Performance SLA: %{http_code}\n" https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/reports/performance-sla

# 10. WABA Channel Info sem token (Esperado: 403)
curl -s -o /dev/null -w "10. WABA Channel Info: %{http_code}\n" https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/waba/channel-info

# 11. Acesso direto por IP HTTP (Esperado: 403)
curl -s -o /dev/null -w "11. IP Direto Contacts: %{http_code}\n" http://179.197.72.221/api/v1/workspaces/11111111-1111-1111-1111-111111111111/contacts

# 12. Health Probe (Esperado: 200 OK)
curl -s -o /dev/null -w "12. Health Probe: %{http_code}\n" https://crm.iaparavendas.tech/health

# 13. Ready Probe (Esperado: 200 OK)
curl -s -o /dev/null -w "13. Ready Probe: %{http_code}\n" https://crm.iaparavendas.tech/ready

# 14. Frontend Landing & Assets (Esperado: 200 OK)
curl -s -o /dev/null -w "14. Landing Page: %{http_code}\n" https://iaparavendas.tech/
curl -s -o /dev/null -w "15. CRM Frontend: %{http_code}\n" https://crm.iaparavendas.tech/
```

### 6.1 Plugins operacionais encontrados sem guarda no bundle implantado

Os testes abaixo são deliberadamente não destrutivos: usam somente `HEAD` e
`OPTIONS`. Todos devem retornar `403`, sem atingir Fastify nem fornecedores.

```bash
curl -s -o /dev/null -w "16. Billing HEAD: %{http_code}\n" -I https://crm.iaparavendas.tech/api/v1/billing/abacatepay/charges
curl -s -o /dev/null -w "17. Billing OPTIONS: %{http_code}\n" -X OPTIONS https://crm.iaparavendas.tech/api/v1/billing/abacatepay/charges
curl -s -o /dev/null -w "18. Messenger HEAD: %{http_code}\n" -I https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/messenger/welcome-screen
curl -s -o /dev/null -w "19. Messenger OPTIONS: %{http_code}\n" -X OPTIONS https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/channels/messenger/welcome-screen
curl -s -o /dev/null -w "20. Agent HEAD: %{http_code}\n" -I https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/journeys/22222222-2222-2222-2222-222222222222/bot/pause
curl -s -o /dev/null -w "21. Agent OPTIONS: %{http_code}\n" -X OPTIONS https://crm.iaparavendas.tech/api/v1/workspaces/11111111-1111-1111-1111-111111111111/journeys/22222222-2222-2222-2222-222222222222/bot/pause
```

---

## 7. Procedimento de Rollback Imediato (Se Houver Anomalia)

```bash
# 7.1 Restaurar o backup exato
ssh vps "cp /opt/sos-sales/Caddyfile.backup.20260822_055355 /opt/sos-sales/Caddyfile"

# 7.2 Recriar o container Caddy
ssh vps "cd /opt/sos-sales && docker compose up -d --force-recreate caddy"

# 7.3 Validar restauração
curl -s -o /dev/null -w "Health pós-rollback: %{http_code}\n" https://crm.iaparavendas.tech/health
```

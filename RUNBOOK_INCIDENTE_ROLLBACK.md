# RUNBOOK DE INCIDENTE E PROCEDIMENTO DE ROLLBACK

> **Produto:** SOS Sales (CRM WhatsApp)  
> **Host de Produção:** `179.197.72.221` (`crm.iaparavendas.tech`)  
> **Gatilhos de Rollback:** Falha no health probe (`/health` ou `/ready`), aumento de taxa de erro 5xx > 1%, quebra de isolamento multi-tenant ou falha de entrega de webhooks.  

---

## 1. Monitoramento e Detecção de Anomalias

### Comandos de Diagnóstico Imediato (Somente Leitura)
```bash
# 1. Health & Readiness do Sistema
curl -s -w "\nHTTP_STATUS: %{http_code}\n" https://crm.iaparavendas.tech/health
curl -s -w "\nHTTP_STATUS: %{http_code}\n" https://crm.iaparavendas.tech/ready
curl -s https://crm.iaparavendas.tech/version

# 2. Status dos 4 Containers no Host
ssh vps "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# 3. Logs de Erro da API (Últimas 100 linhas)
ssh vps "docker logs sos-sales-api --tail 100 --since 15m"

# 4. Logs de Conexão do Caddy
ssh vps "docker logs sos-sales-caddy --tail 50"
```

---

## 2. Matriz de Severidade e Resposta a Incidentes

| Severidade | Descrição | Ação Imediata | Tempo Máximo de Resposta |
|---|---|---|:---:|
| **SEV-0 (Crítico)** | Queda total do CRM ou vazamento cruzado de dados | Acionar Rollback Imediato | < 5 minutos |
| **SEV-1 (Alto)** | Desconexão em massa do WhatsApp ou falha de envio | Reiniciar container WAHA / API | < 15 minutos |
| **SEV-2 (Médio)** | Degradação de latência em visão computacional ou IA | Alternar para modelo fallback | < 1 hora |

---

## 3. Procedimento Operacional Padrão de Rollback (Passo a Passo)

### Passo 1: Notificação e Congelamento
* Avisar a equipe sobre a ativação do protocolo de rollback.
* Congelar novas tentativas de deploy.

### Passo 2: Restauração Atômica do Release Anterior
```bash
# Alterna /opt/sos-sales/current e /opt/sos-sales/previous e recria API + Caddy.
# O conjunto restaurado inclui frontend, API, runtime, CA e compose compatíveis.
bash scripts/rollback-production-release.sh
```

### Passo 3: Confirmar Release e Containers
```bash
ssh vps "readlink -f /opt/sos-sales/current && docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

### Passo 4: Validação Pós-Rollback (Smoke Test)
```bash
# 1. Verificar retorno HTTP 200 no Liveness e Readiness
curl -f https://crm.iaparavendas.tech/health
curl -f https://crm.iaparavendas.tech/ready

# 2. Confirmar versão anterior ativa
curl -s https://crm.iaparavendas.tech/version
```

### Passo 5: Registro Post-Mortem
* Documentar causa raiz, impacto temporal e lições aprendidas no `DECISION_LOG.md`.

> Não restaure somente `api/dist` ou somente o frontend. O runtime importa
> símbolos do bundle da mesma versão; misturar artefatos pode impedir o startup.

# Atlas Tools - Deployment & Integration Guide

## Visão Geral

O **Atlas Tools** é um conjunto de 4 endpoints read-only que permitem ao **Hermes Orchestrator** consultar o estado real da conta no SOS Sales antes de propor mudanças. É a **Fase 1** da arquitetura "Atlas como Orquestrador Soberano".

---

## O que foi implementado

### Backend (SOS-SALES/apps/api)

| Arquivo | Descrição |
|---------|-----------|
| `src/interfaces/http/routes/atlas-tools.ts` | **Novo** - 4 endpoints GET read-only |
| `src/interfaces/http/routes/operator-auth.ts` | **Modificado** - Registra as rotas do atlas-tools |

### Endpoints Disponíveis

```
GET /api/v1/atlas/tools/read/dossier/:workspaceId
GET /api/v1/atlas/tools/read/known-facts/:workspaceId
GET /api/v1/atlas/tools/read/pipeline/:workspaceId
GET /api/v1/atlas/tools/read/whatsapp-health/:workspaceId
```

### Hermes Skill

| Arquivo | Descrição |
|---------|-----------|
| `~/.hermes/skills/atlas-tools/SKILL.md` | Skill com 4 tools registradas para function calling |

---

## Como fazer o deploy no VPS

### Pré-requisitos no VPS

- Docker + Docker Compose
- Registry configurado (Docker Hub, GHCR, ou registry privado)
- Variáveis de ambiente do `.env` configuradas

### Opção A: Build local + Push registry (RECOMENDADO)

```bash
# ============================================
# NO MAC LOCAL (onde está o código)
# ============================================
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES/apps/api

# 1. Build multi-arch para linux/amd64 (VPS)
docker buildx build \
  --platform linux/amd64 \
  -t seu-usuario/sos-sales-api:atlas-tools-v1 \
  -f Dockerfile \
  --push .

# 2. Tag também como latest se quiser
docker buildx build \
  --platform linux/amd64 \
  -t seu-usuario/sos-sales-api:latest \
  -f Dockerfile \
  --push .

# ============================================
# NO VPS
# ============================================
# 1. Atualizar docker-compose.yml para usar a nova imagem
# Editar: image: seu-usuario/sos-sales-api:atlas-tools-v1

# 2. Pull e restart apenas da API
docker pull seu-usuario/sos-sales-api:atlas-tools-v1
docker compose -f docker-compose.yml up -d --force-recreate api

# 3. Verificar saúde
docker logs sos-sales-api -f --tail 50
curl -f http://localhost:4334/health || echo "API não respondeu"
```

### Opção B: rsync direto + Build no VPS

```bash
# ============================================
# NO MAC LOCAL
# ============================================
rsync -avz --exclude node_modules --exclude .git --exclude dist \
  /Users/franciscotaveira.ads/Projetos/SOS-SALES/apps/api/ \
  root@SEU_VPS_IP:/opt/sos-sales-api/

# ============================================
# NO VPS
# ============================================
cd /opt/sos-sales-api

# Build local
docker build -t sos-sales-api:atlas-tools-v1 -f Dockerfile .

# Restart
docker compose -f docker-compose.yml up -d --force-recreate api

# Verificar
docker logs sos-sales-api -f --tail 50
```

### Opção C: Git (se repo já clonado no VPS)

```bash
# NO VPS
cd /opt/sos-sales-api
git pull origin main
docker compose -f docker-compose.yml build --no-cache api
docker compose -f docker-compose.yml up -d --force-recreate api
```

---

## Variáveis de Ambiente Necessárias

No VPS, arquivo `.env` (ou `.env.production`):

```env
# Database (Supabase local no VPS)
DATABASE_URL=postgresql://postgres:senha@supabase_db_sos-sales:5432/postgres
SUPABASE_URL=http://supabase_kong_sos-sales:8000
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# WAHA
WAHA_BASE_URL=http://tx-commercial-waha:3000
WAHA_API_KEY=mct_sos_waha_master_2026
PUBLIC_API_URL=https://sos.mct.com.br

# Auth
JWT_SECRET=...
NODE_ENV=production
PORT=4334

# AI (OpenRouter/NVIDIA)
OPENROUTER_API_KEY=sk-or-...
NVIDIA_API_KEY=...
```

---

## Validação Pós-Deploy

### 1. Health Check da API

```bash
curl -s http://localhost:4334/health
# Esperado: {"status":"ok","timestamp":"..."}
```

### 2. Testar endpoints do Atlas (com token válido)

```bash
# Pegar token do Supabase (via login no frontend ou script)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

WORKSPACE_ID="11111111-1111-1111-1111-111111111111"

# Dossier
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4334/api/v1/atlas/tools/read/dossier/$WORKSPACE_ID" | jq .

# Known Facts
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4334/api/v1/atlas/tools/read/known-facts/$WORKSPACE_ID" | jq .

# Pipeline
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4334/api/v1/atlas/tools/read/pipeline/$WORKSPACE_ID" | jq .

# WhatsApp Health
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4334/api/v1/atlas/tools/read/whatsapp-health/$WORKSPACE_ID" | jq .
```

### 3. Verificar no Hermes (local)

```bash
# No terminal onde roda o Hermes
hermes skill load atlas-tools

# Testar tools
hermes tool get_workspace_dossier --workspaceId "11111111-1111-1111-1111-111111111111"
hermes tool fetch_known_facts --workspaceId "11111111-1111-1111-1111-111111111111"
hermes tool read_pipeline_bottlenecks --workspaceId "11111111-1111-1111-1111-111111111111"
hermes tool read_whatsapp_health --workspaceId "11111111-1111-1111-1111-111111111111"
```

---

## Estrutura de Respostas (Contrato)

### GET /dossier/:workspaceId

```json
{
  "workspaceId": "uuid",
  "summary": {
    "totalJourneys": 42,
    "openJourneys": 12,
    "wonJourneys": 25,
    "lostJourneys": 5,
    "overdueSla": 3,
    "dueSla": 2
  },
  "priorities": [...],
  "recentJourneys": [...]
}
```

### GET /known-facts/:workspaceId

```json
{
  "workspaceId": "uuid",
  "facts": [
    {
      "id": "uuid",
      "journeyId": "uuid",
      "key": "cliente.prefere_horario.manha",
      "value": true,
      "confidence": 0.9,
      "confirmedByCustomer": true,
      "source": "human_operator",
      "observedAt": "2026-08-16T10:30:00Z"
    }
  ]
}
```

### GET /pipeline/:workspaceId

```json
{
  "workspaceId": "uuid",
  "pipeline": {
    "journeysByStage": {
      "NOVO_LEAD": 5,
      "QUALIFICACAO": 3,
      "PROPOSTA": 2,
      "SEM_ESTAGIO": 2
    },
    "openJourneysWithFriction": 4,
    "openJourneysWithRecommendation": 7,
    "totalOpen": 12
  }
}
```

### GET /whatsapp-health/:workspaceId

```json
{
  "workspaceId": "uuid",
  "session": "default",
  "status": "WORKING",
  "connected": true,
  "phoneNumber": "5511999999999",
  "profileName": "Escovaria Haven",
  "message": "WhatsApp conectado e operacional"
}
```

---

## Troubleshooting

### Erro: "Service Unavailable - Cockpit read service"
- Verificar se `cockpitReadGateway` está injetado no `operator-auth.ts`
- Logs: `docker logs sos-sales-api | grep -i cockpit`

### Erro: "Service Unavailable - Known facts service"
- Verificar conexão com Postgres (Supabase)
- Verificar se migration `20260814000007_known_fact_audit_hardening.sql` rodou
- Logs: `docker logs sos-sales-api | grep -i known_fact`

### Erro: "permission denied for function..."
- RLS policies não aplicadas ou JWT inválido
- Verificar `SET LOCAL ROLE sos_sales_runtime` no gateway

### WAHA retorna "UNKNOWN" ou falha
- Verificar se `tx-commercial-waha` container está healthy
- `docker logs tx-commercial-waha -f --tail 50`
- Verificar `WAHA_BASE_URL` e `WAHA_API_KEY` no `.env`

---

## Rollback

```bash
# Voltar versão anterior
docker pull seu-usuario/sos-sales-api:previous-tag
docker compose -f docker-compose.yml up -d --force-recreate api
```

---

## Próximas Fases (Roadmap)

| Fase | Descrição | Status |
|------|-----------|--------|
| **Fase 1** | Read-only tools (dossier, facts, pipeline, whatsapp) | ✅ **CONCLUÍDA** |
| **Fase 2** | Write com confirmação (propose_appointment, propose_note, propose_known_fact) | 📋 Planejada |
| **Fase 3** | Catálogo CRUD + AI Rules dinâmicos | 📋 Planejada |
| **Fase 4** | Job noturno de aprendizado contínuo | 📋 Planejada |

---

## Contatos

- **Dev**: Francisco Taveira
- **Arquitetura**: Hermes Agent + SOS Sales (TX Commercial Core)
- **Branch**: `codex/import-latest-zip` (HEAD: 081634e)
# PROMPT PARA GEMINI — Task 11: Production Runbook Atualizado

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Branch: `codex/import-latest-zip`
Arquivo alvo: `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` (já existe, precisa atualizar)
Objetivo: Documentar deploy com **novos Dockerfiles, Caddy, backup/restore, runtime factory**

## SEÇÕES A ATUALIZAR / ADICIONAR

### 1. Arquitetura de Deploy (Nova)
```markdown
## Arquitetura de Produção

```
                    ┌─────────────┐
                    │   Caddy     │ ← TLS automático (Let's Encrypt)
                    │  :80/:443   │
                    └──────┬──────┘
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    ┌────────────┐ ┌──────────┐ ┌────────────┐
    │   Web      │ │   API    │ │   WAHA     │
    │  (Nginx)   │ │ (Fastify)│ │  (3000)    │
    │   :80      │ │  :4334   │ │            │
    └────────────┘ └────┬─────┘ └────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
   ┌──────────┐  ┌────────────┐ ┌──────────┐
   │PostgreSQL│  │   Redis    │ │  Volumes │
   │(Supabase)│  │  (Cache)   │ │ (WAHA,   │
   │          │  │            │ │  Caddy)  │
   └──────────┘  └────────────┘ └──────────┘
```

### 2. Variáveis de Ambiente Obrigatórias (`.env.production`)
```bash
# Copiar de .env.production.example e preencher
DOMAIN=sos.mct.com.br

DATABASE_URL=postgresql://postgres:***@db.xxx.supabase.co:5432/postgres?sslmode=require
DATABASE_POOL_MAX=20

REDIS_PASSWORD=<gerar_forte>

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=<anon_public>
SUPABASE_JWT_ISSUER=https://xxx.supabase.co/auth/v1
SUPABASE_JWKS_URL=https://xxx.supabase.co/auth/v1/.well-known/jwks.json

WAHA_API_KEY=<gerar_forte>
WAHA_WEBHOOK_SECRET=<gerar_forte>
```

### 3. Build & Deploy Steps
```bash
# 1. Build imagens
docker compose -f docker-compose.prod.yml build

# 2. Validar config
docker compose -f docker-compose.prod.yml config

# 3. Subir stack (detached)
docker compose -f docker-compose.prod.yml up -d

# 4. Health checks
curl -f https://sos.mct.com.br/health
curl -f https://sos.mct.com.br/ready

# 5. Verificar logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f caddy
```

### 4. Runtime Factory (Novo)
- Arquivo: `deploy/production-runtime.mjs` (copiado de `production-runtime.example.mjs` na VPS)
- Referenciado por `SOS_SALES_RUNTIME_FACTORY` no compose
- Cria pools Postgres + Redis + gateways + health providers **sem fallbacks dev**

### 5. Backup & Restore (Novos Scripts)
```bash
# Backup (rodar na VPS ou via CI)
DATABASE_URL=$DATABASE_URL ./scripts/backup-db.sh
# Gera: ./backups/sos_sales_backup_YYYYMMDD_HHMMSS.dump

# Restore (cuidado: destrutivo)
DATABASE_URL=$DATABASE_URL ./scripts/restore-db.sh ./backups/sos_sales_backup_20260815_120000.dump
```

### 6. Rollback Strategy
```bash
# Rollback por tag de imagem
docker compose -f docker-compose.prod.yml pull api:v1.2.3 web:v1.2.3
docker compose -f docker-compose.prod.yml up -d --force-recreate

# Ou rollback via git + rebuild
git checkout v1.2.3
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

### 7. Troubleshooting Comum
| Sintoma | Comando | Ação |
|---------|---------|------|
| API 503 | `docker logs sos-sales-api` | Verificar `DATABASE_URL`, `SUPABASE_JWT_*` |
| Caddy não emite TLS | `docker logs sos-sales-caddy` | Verificar `DOMAIN`, DNS A record, porta 80/443 abertas |
| WAHA não conecta | `docker logs sos-sales-waha` | Verificar `WAHA_API_KEY`, volume `waha_data` |
| Redis auth fail | `docker logs sos-sales-redis` | Verificar `REDIS_PASSWORD` igual em api + redis |

### 8. Checklist Pré-Deploy (Obrigatório)
- [ ] `npm run check` verde (191 testes)
- [ ] `docker compose -f docker-compose.prod.yml config` sem erros
- [ ] `.env.production` preenchido na VPS (não versionado)
- [ ] Supabase remoto: migrations 00001-00007 aplicadas
- [ ] DNS `sos.mct.com.br` → IP da VPS
- [ ] Portas 80/443 abertas no firewall da VPS
- [ ] WAHA QR Code lido e sessão `CONNECTED`
- [ ] Backup anterior salvo (se update)

## CRITÉRIO DE ACEITE

1. `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` atualizado com todas seções acima
2. Comandos testados localmente com `docker compose -f docker-compose.prod.yml`
3. Runbook permite deploy do zero por outro engenheiro sem ambiguidades

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
# Validar compose local
docker compose -f docker-compose.prod.yml config
# Ver runbook
cat docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md
```
# PLANO DE BACKUP E RESTAURAÇÃO — SOS SALES

> **Ambiente:** VPS `179.197.72.221` + Supabase (`yiiuebhyqixzluguxsqi`)  
> **Objetivo:** Rastreabilidade, integridade de dados e recuperação de desastres para multi-tenancy comercial.  

---

## 1. Mapeamento de Ativos e Dados Persistentes

| Componente | Tipo de Dado | Localização | Estratégia de Backup | RPO Alvo | RTO Alvo |
|---|---|---|---|:---:|:---:|
| **PostgreSQL (Supabase)** | Workspaces, Membros, Contatos, Mensagens, Jornadas, Notas, Provas de Tráfego | Supabase Cloud (`aws-0-ca-central-1`) | Snapshots diários nativos + pg_dump lógico automatizado | 1 hora | 30 min |
| **Redis (Cache & Idempotência)** | Deduplicação de webhooks, rate limit, locks de dispatch | Container `sos-sales-redis` (`/data/dump.rdb`) | Volume persistente Docker `sos-sales-redis-data` | 24 horas | 5 min |
| **Sessões WhatsApp (WAHA)** | Chaves de sessão, tokens SQLite/Chromium de pareamento QR | Container `sos-sales-waha` (`/app/.waha`) | Volume persistente Docker `waha-data` | 6 horas | 15 min |
| **Configuração Caddy & Certificados** | Certificados TLS/SSL Let's Encrypt, regras de proxy | Container `sos-sales-caddy` (`/data`) | Volume persistente `caddy_data` + backup de `/opt/sos-sales/Caddyfile` | 24 horas | 10 min |
| **Release da aplicação** | Frontend, API, runtime, CA e compose compatíveis | `/opt/sos-sales/releases/<commit>` | Release imutável + ponteiros atômicos `current`/`previous` | 0 min | 2 min |

---

## 2. Frequência e Políticas de Retenção

* **Backups Diários (Postgres + Volumes WAHA):** Executados às 03:00 UTC. Retenção: 30 dias.
* **Backups Pré-Deploy (Snapshot de Artefatos & Banco):** Executados imediatamente antes de qualquer rollout no VPS. Retenção: 5 últimos deploys.
* **Criptografia:** Backups comprimidos criptografados via AES-256 (`gpg` ou `openssl`) antes de transferência externa.

---

## 3. Comandos de Extração de Backup

### 3.1. Backup do Banco de Dados (Supabase / Postgres)
```bash
# Dump lógico do schema público com dados
pg_dump "postgres://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ca-central-1.pooler.supabase.com:6543/postgres" \
  --format=custom --file=/opt/sos-sales/backups/db_backup_$(date +%Y%m%d_%H%M%S).dump
```

### 3.2. Backup dos Volumes Docker (WAHA + Redis + Caddy)
```bash
# Snapshot do diretório WAHA (sessões ativas de clientes)
tar -czvf /opt/sos-sales/backups/waha_sessions_$(date +%Y%m%d_%H%M%S).tar.gz /var/lib/docker/volumes/sos-sales_waha-data/_data
```

### 3.3. Stage Pré-Deploy dos Artefatos
```bash
# Valida e envia um release completo, sem alterar produção.
bash scripts/stage-production-release.sh

# O release ativo e o anterior devem sempre ser resolvíveis.
ssh vps "readlink -f /opt/sos-sales/current; readlink -f /opt/sos-sales/previous"
```

---

## 4. Procedimento de Restauração (Disaster Recovery)

> [!IMPORTANT]
> A restauração NUNCA deve ser testada diretamente no banco de produção. Sempre utilizar um schema isolado ou container local de teste.

```bash
# 1. Para rollback de aplicação, restaurar o release completo
bash scripts/rollback-production-release.sh

# 2. Restauração de banco é procedimento separado e somente para desastre de dados
pg_restore -d "postgres://..." --clean --if-exists /opt/sos-sales/backups/db_backup_TIMESTAMP.dump

# 3. Restaurar sessões WAHA se necessário
tar -xzvf /opt/sos-sales/backups/waha_sessions_TIMESTAMP.tar.gz -C /

# 4. Executar health check e probe de readiness
curl -f https://crm.iaparavendas.tech/health
curl -f https://crm.iaparavendas.tech/ready
```

---

## 5. Critério de Validação do Backup
Um backup é classificado como **VÁLIDO** apenas após restauração com sucesso em container descartável (`test-postgres`) e verificação de integridade das tabelas `workspaces`, `contacts`, `channel_connections` e `commercial_journeys`.

# Especificação Detalhada — Módulo 7: Infraestrutura, Docker Lab & Pipeline de Deploy (`docker-compose`)
> **SOS Sales v2.0 | MCT OS**  
> **Arquivos de Referência:** `docker-compose.lab.yml`, `docker-compose.prod.yml`, `scripts/preflight-production-deploy.sh`, `scripts/stage-production-release.sh`, `scripts/promote-production-release.sh`, `scripts/rollback-production-release.sh`

---

## 1. Visão Geral da Infraestrutura

O SOS Sales adota uma filosofia **local-first e auto-hospedada (self-hosted)**. Ele opera em contêineres Docker orquestrados por Docker Compose e gerenciados pelo servidor de proxy reverso **Caddy 2** com emissão automática de certificados SSL/TLS da Let's Encrypt.

---

## 2. Fluxo de Trabalho de Deploy (MCT OS Standard Flow)

```
1. npm run dev          → localhost:5173 (desenvolvimento com hot-reload)
       ↓
2. Docker Lab           → localhost:3333 (validação integrada em sandbox)
   docker compose -f docker-compose.lab.yml up --build -d
       ↓
3. Preflight & Build    → Artefatos de release validados
   APP_ENV=production npm run build && APP_ENV=production npm --prefix apps/api run build
   bash scripts/preflight-production-deploy.sh
       ↓
4. Stage VPS            → Copia artefato imutável para a VPS sem alterar produção
   bash scripts/stage-production-release.sh
       ↓
5. Promoção Atômica     → Exige aprovação humana explícita
   bash scripts/promote-production-release.sh "$(git rev-parse HEAD)"
```

---

## 3. Ambiente Docker Lab Local (`docker-compose.lab.yml`)

* **Objetivo:** Sandbox de homologação local para testar a integração integrada entre Frontend, API Fastify, Redis e WAHA antes de qualquer alteração no VPS.
* **Serviços no Lab:**
  - `sos-sales-lab-web`: Servidor estático Vite/Nginx servindo o frontend na porta `3333` (`http://localhost:3333`).
  - `sos-sales-lab-api`: Container da API Fastify rodando na porta `4335` (`http://localhost:4335`).
  - `sos-sales-lab-redis`: Container Redis para cache e idempotência na porta `6380`.
  - `sos-sales-lab-waha`: Container WAHA Plus na porta `3005` (`http://localhost:3005`).

---

## 4. Ambiente de Produção VPS (`docker-compose.prod.yml`)

* **VPS IP:** `179.197.72.221` (Ubuntu 24.04 LTS).
* **Domínio de Produção:** `https://crm.iaparavendas.tech`.
* **Serviços Ativos no VPS:**
  - `caddy`: Proxy reverso escutando as portas 80/443 com roteamento automático HTTPS.
  - `sos-sales-api`: Container Node.js 20 servindo a API Fastify no isolamento interno do Docker.
  - `sos-sales-redis`: Container Redis para gate de idempotência.
  - `sos-sales-waha`: Container WAHA Plus com sessão `default` conectada ao WhatsApp Web.

---

## 5. Scripts de Automação & Protocolos de Segurança

### F7.1 — Script de Preflight (`scripts/preflight-production-deploy.sh`)
- Executa testes Vitest da API (`327/327` aprovados).
- Garante que a árvore Git esteja limpa (`cleanTree: true`).
- Calcula o SHA256 do bundle de produção e gera o `release-manifest.json`.

### F7.2 — Script de Stage (`scripts/stage-production-release.sh`)
- Envia os artefatos compilados via rsync criptografado para o diretório `/opt/sos-sales/releases/` na VPS.
- Não altera os contêineres que estão atendendo o tráfego de produção.

### F7.3 — Promoção Atômica (`scripts/promote-production-release.sh`)
- Atualiza o link simbólico do release ativo na VPS.
- Executa restart gracioso dos contêineres via `docker compose reload`.
- Realiza verificação de saúde chamando `curl https://crm.iaparavendas.tech/health`.

### F7.4 — Rollback Atômico (`scripts/rollback-production-release.sh`)
- Se qualquer teste pós-deploy falhar, o script reverte instantaneamente o link simbólico para o release anterior sem downtime de banco de dados.

# Runbook: Diagnóstico e Correção de Bundle Antigo no Caddy (G1)

> **AVISO DE SEGURANÇA E CONFORMIDADE:**  
> Nenhum comando abaixo deve ser executado sem autorização explícita do operador do sistema.  
> **Cada passo operacional possui a etiqueta expressa `[REQUER AUTORIZAÇÃO VPS]`.**

---

## 1. Contexto do Problema

O proxy reverso Caddy na VPS continuava servindo assets estáticos de um build anterior (`index-*.js` antigo) em vez das páginas recentes compiladas (como a nova rota `/opportunities`).  
Possíveis causas identificadas:
1. O container do Caddy monta um diretório estático persistido (ex: `/var/www/sos-sales/dist`) que não foi atualizado no último deploy.
2. O pipeline de build gerou os novos artefatos em `apps/web/dist` localmente, mas a transferência (rsync/scp/docker cp) ou o build dentro da VPS não foi acionado.
3. Cache HTTP agressivo no Caddy ou no navegador dos clientes.

---

## 2. Procedimento de Diagnóstico

### Passo 2.1 — Inspecionar o Caddyfile e o Root de Arquivos
**Tag:** `[REQUER AUTORIZAÇÃO VPS]`
```bash
# REQUER AUTORIZAÇÃO VPS
# Localizar e inspecionar o bloco que atende o frontend no Caddyfile
docker exec -it caddy cat /etc/caddy/Caddyfile | grep -A 10 "app.sfrancisco.com.br"
```
*Verificar qual é o caminho configurado na diretiva `root * /path/to/dist`.*

---

### Passo 2.2 — Comparar Hash dos Arquivos Servidos vs. Compilados
**Tag:** `[REQUER AUTORIZAÇÃO VPS]`
```bash
# REQUER AUTORIZAÇÃO VPS
# Verificar quais arquivos JS existem no diretório que o Caddy está servindo:
docker exec -it caddy ls -la /srv/dist/assets/
```

Comparar com a saída local gerada pelo build do Vite (`apps/web/dist/assets/`).

---

## 3. Procedimento de Correção

### Passo 3.1 — Gerar Build Atualizado do Frontend
*(Executado no ambiente de compilação ou na VPS)*
**Tag:** `[REQUER AUTORIZAÇÃO VPS]` (se executado na VPS)
```bash
# Executado na raiz do projeto
pnpm --filter @sos-sales/web build
```
*Gera os artefatos finais em `apps/web/dist`.*

---

### Passo 3.2 — Sincronizar Artefatos com o Volume do Caddy
**Tag:** `[REQUER AUTORIZAÇÃO VPS]`
```bash
# REQUER AUTORIZAÇÃO VPS
# Se o Caddy monta um volume local (ex: /opt/sos-sales/apps/web/dist):
# Garantir permissões de leitura
chmod -R 755 apps/web/dist

# Se o Caddy usa container isolado com volume nomeado ou cópia direta:
docker cp apps/web/dist/. caddy:/srv/dist/
```

---

### Passo 3.3 — Recarregar a Configuração do Caddy
**Tag:** `[REQUER AUTORIZAÇÃO VPS]`
```bash
# REQUER AUTORIZAÇÃO VPS
# Recarregar o Caddy sem downtime
docker exec -w /etc/caddy caddy caddy reload
```

---

## 4. Validação Pós-Deploy

### Passo 4.1 — Verificar Cabeçalhos e Hash Remoto
**Tag:** `[REQUER AUTORIZAÇÃO VPS]`
```bash
# REQUER AUTORIZAÇÃO VPS
# Verificar se o index.html servido aponta para o novo bundle de scripts
curl -s https://app.sfrancisco.com.br | grep -o 'assets/index-[^"]*\.js'
```

### Passo 4.2 — Teste de Rota SPA (Direcionamento para index.html)
**Tag:** `[REQUER AUTORIZAÇÃO VPS]`
```bash
# REQUER AUTORIZAÇÃO VPS
# Garantir que rotas internas do cliente (ex: /opportunities) retornam HTTP 200 via try_files
curl -sI https://app.sfrancisco.com.br/opportunities | head -n 5
```
*(Deve retornar HTTP 200 com Content-Type text/html).*

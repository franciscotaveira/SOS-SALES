# CH-05 — Rate Limiting Distribuído com Redis e Proxy Confiável

> Nome do arquivo: `CH-05-RATE-LIMITING.md`  
> Estado: `ACCEPTED` — Concluído e homologado em 19 de setembro de 2026.

---

## Identidade

- **Parent objective:** Programa SOS Sales V3 — Motor de Comunicação (Fase CH)
- **Estado:** `ACCEPTED`
- **Owner:** Gemini 3.8 (Executor Principal)
- **Reviewer:** Agente SRE & Security Independente
- **Dependências:** `CH-00` (Modelos Mínimos), `CH-01` (RLS Fail-Closed), `CH-02` (Fencing Concorrente), `CH-03` (Reconciliação e Resiliência), `CH-04` (Ingress Seguro)
- **ADRs Vinculadas:** ADR-002 (Auth Strategy & Tenancy), ADR-005 (Channel Gateway & Inbox/Outbox)

---

## Objetivo único

Implementar proteção perimetral distribuída com cotas consistentes entre múltiplas réplicas da API do SOS Sales V3 e mitigar riscos de falsificação de IP via proxy reverso:
1. **Sliding Window Distribuído com Script Lua Atômico em Redis:**
   - Implementação de `RedisTwoTierRateLimiter` sob a interface canônica `IRateLimiter`.
   - Execução de script Lua atômico no Redis (`SLIDING_WINDOW_LUA`) utilizando `ZREMRANGEBYSCORE`, `ZCARD`, `ZADD`, `INCR` para sequenciamento de micro-hits no mesmo milissegundo, e `PEXPIRE` para TTL automático das estruturas.
   - Complexidade temporal $O(\log N)$ para inserção e limpeza de janelas expiradas, eliminando condições de corrida entre réplicas concorrentes da API sem bloqueios distribuídos pesados.
2. **Arquitetura em Dois Níveis (Two-Tier Rate Limiting):**
   - **Nível 1 (IP):** Avaliado imediatamente no início do handshake do webhook antes de qualquer consulta ao PostgreSQL, protegendo o banco contra varreduras e ataques de exaustão de conexões.
   - **Nível 2 (Canal):** Avaliado após a resolução do canal e da credencial de assinatura, assegurando que nenhum canal monopolize a capacidade de processamento do worker ou do banco de dados.
3. **Degradação Graciosa (Graceful Degradation / Fallback):**
   - Em caso de falha de conexão, timeout ou erro no nó Redis, o `RedisTwoTierRateLimiter` degrada de forma transparente e imediata para uma instância interna de `BoundedTwoTierRateLimiter` em memória.
   - Emite alerta de warning estruturado nos logs sem lançar exceções não tratadas ou descartar webhooks legítimos de parceiros (Meta WABA / WAHA).
4. **Headers RFC 6585 em HTTP 429 Too Many Requests:**
   - Injeção obrigatória dos cabeçalhos padronizados:
     - `Retry-After: <segundos>`
     - `X-RateLimit-Limit: <cota_maxima>`
     - `X-RateLimit-Remaining: <restante>`
   - Corpo da resposta padronizado em conformidade com RFC 9457 (`application/problem+json`), com status HTTP 429 e `title: "Too Many Requests"`.
5. **Endurecimento de Proxy Confiável (Anti-Spoofing de IP):**
   - Substituição da permissividade irrestrita (`trustProxy: true`) por resolução determinística de blocos CIDR privados e de loopback (`["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]`).
   - Suporte a parametrização via `options.trustProxy` no `buildApp` ou variável de ambiente `TRUST_PROXY`.
   - Clientes externos não confiáveis têm cabeçalhos forjados `X-Forwarded-For` ignorados pelo Fastify/proxy-addr, associando o rate limiting ao IP real de conexão.
6. **Homologação Hermética Completa:** Comprovação integral através de `apps/api/src/__tests__/redis-rate-limiter.test.ts` (9 testes) e execução total do monorepo (26 suítes, 321 asserções).

---

## Fora do escopo

- Rotação dinâmica de chaves mestras e keyring E2E (escopo estrito de `CH-06`);
- Mitigação de SSRF em downloads de mídia remota (escopo estrito de `CH-07`);
- Gestão e orquestração de contêineres Redis em cluster de alta disponibilidade (escopo de infra/deploy).

---

## Arquivos sob ownership

1. `apps/api/src/services/redis-rate-limiter.ts` (implementação de `IRateLimiter`, `RedisTwoTierRateLimiter`, `BoundedTwoTierRateLimiter`, script Lua atômico e fallback gracioso)
2. `apps/api/src/routes/webhook.routes.ts` (integração do limitador assíncrono em 2 níveis e injeção de headers RFC 6585 em HTTP 429)
3. `apps/api/src/index.ts` (helper `resolveTrustProxy`, opções de `buildApp` com `trustProxy`, `rateLimiter`, `keyPrefix` e inicialização de Redis)
4. `apps/api/src/__tests__/redis-rate-limiter.test.ts` (suíte canônica de testes de consistência distribuída, sliding window, fallback, anti-spoofing e headers RFC 6585)
5. `docs/work-packages/CH-05-RATE-LIMITING.md` (especificação canônica deste pacote)
6. `docs/work-packages/CH-05-EVIDENCE.json` (manifesto canônico de evidência `EV-CH05-001`)

---

## Fatos confirmados

- `[KNOWN]` Em arquiteturas multi-réplica, limitadores baseados puramente em memória local permitem amplificação de tráfego proporcional ao número de nós da API (N réplicas = N vezes a cota tolerada).
- `[KNOWN]` O script Lua executado no Redis é estritamente atômico (single-threaded), eliminando deadlocks e condições de corrida entre réplicas paralelas sem requerer lock distribuído explícito (Redlock).
- `[KNOWN]` Provedores de webhook como a Meta realizam retentativas automáticas ao receberem HTTP 429 e dependem do cabeçalho `Retry-After` para calibrar o backoff de reenvio.
- `[KNOWN]` Configurar `trustProxy: true` cegamente permite que qualquer atacante forje seu IP enviando `X-Forwarded-For: 1.2.3.4`, contornando limitadores por IP ou forçando bloqueio de terceiros (denial of service cruzado).

---

## Invariantes

1. **Zero Dropped Webhooks on Redis Failure:** Falhas temporárias ou desconexões do nó Redis NUNCA derrubam o endpoint com HTTP 500 nem descartam webhooks; o tráfego é protegido pelo fallback em memória.
2. **Atomicidade da Cota:** O consumo de cota no Redis por uma réplica é instantaneamente visível para todas as outras réplicas da mesma janela temporal.
3. **Imutabilidade de Headers RFC 6585:** Toda rejeição por rate limit (HTTP 429) inclui `Retry-After`, `X-RateLimit-Limit` e `X-RateLimit-Remaining: 0`.
4. **Anti-Spoofing de Origem:** Clientes diretos sem proxy reverso intermediário de rede privada homologada não conseguem ditar seu IP via cabeçalhos arbitrários.

---

## Critérios de aceitação

- [x] **AC-CH05-001:** `RedisTwoTierRateLimiter` utiliza script Lua sliding-window garantindo consistência estrita de cotas entre múltiplas réplicas da API.
- [x] **AC-CH05-002:** Rate limiting opera em dois níveis: nível 1 por IP antes da consulta a banco de dados e nível 2 por canal após a resolução do segredo.
- [x] **AC-CH05-003:** Na indisponibilidade do Redis, o limitador realiza fallback gracioso para `BoundedTwoTierRateLimiter` com log de advertência sem lançar exceções não tratadas.
- [x] **AC-CH05-004:** Respostas HTTP 429 incluem cabeçalhos RFC 6585 (`Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`) e corpo RFC 9457.
- [x] **AC-CH05-005:** `trustProxy` resolve blocos CIDR privados confiáveis por padrão (`127.0.0.1`, `::1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), ignorando `X-Forwarded-For` forjados quando desabilitado ou de proxies não confiáveis.
- [x] **AC-CH05-006:** Suíte hermética `redis-rate-limiter.test.ts` (9 testes) e todas as 26 suítes do monorepo (321 asserções) 100% aprovadas.

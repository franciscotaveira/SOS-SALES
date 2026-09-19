# CH-04 — Ingress Seguro e Verificação Criptográfica

> Nome do arquivo: `CH-04-INGRESS.md`  
> Estado: `ACCEPTED` — Concluído e homologado em 19 de setembro de 2026.

---

## Identidade

- **Parent objective:** Programa SOS Sales V3 — Motor de Comunicação (Fase CH)
- **Estado:** `ACCEPTED`
- **Owner:** Gemini 3.8 (Executor Principal)
- **Reviewer:** Agente SRE & Security Independente
- **Dependências:** `CH-00` (Modelos Mínimos), `CH-01` (RLS do Worker Fail-Closed e Saneamento da Migration 005), `CH-02` (Claims, Retry, Lease e Fencing Distribuído), `CH-03` (Reconciliação e Resiliência com Provedores)
- **ADRs Vinculadas:** ADR-002 (Auth Strategy & Tenancy), ADR-005 (Channel Gateway & Inbox/Outbox)

---

## Objetivo único

Consolidar o perímetro de ingresso público HTTP da API do SOS Sales V3, garantindo autenticação criptográfica rigorosa de mensagens recebidas, mitigação de ataques de repetição, sanitização de logs e isolamento de banco de dados:
1. **Raw Body Preservado em Bytes:** Captura integral e inalterada do corpo da requisição HTTP (`Buffer`) via `rawBodyPlugin` com teto de tamanho estrito de 512 KB (`bodyLimit: 524288`), garantindo fidelidade byte-a-byte para cálculo de HMACs sem divergências de formatação ou truncamento.
2. **Verificação Criptográfica de Assinatura (Meta WABA & WAHA):**
   - **Meta WABA:** Validação criptográfica de cabeçalho `X-Hub-Signature-256: sha256=<hmac>` calculado sobre o buffer bruto com o `app_secret` decifrado sob callback efêmero de `DatabaseSigningSecretResolver`, comparado em tempo constante via `crypto.timingSafeEqual`.
   - **WAHA:** Validação de token em tempo constante através de digests SHA-256 para cabeçalhos `x-api-key`, `authorization: Bearer <secret>` ou `x-webhook-secret`, prevenindo vazamentos por canal lateral de tempo.
   - **Fail-Closed:** Qualquer payload sem assinatura, com assinatura forjada, ou adulterado em trânsito é rejeitado com HTTP 401 Unauthorized e **jamais é persistido no banco de dados**.
3. **Desafio de Inscrição Meta WhatsApp (GET Challenge Handshake):**
   - Validação estrita via Zod dos parâmetros de query `hub.mode === 'subscribe'`, `hub.challenge` e `hub.verify_token`.
   - Lookup do canal sob a role restrita `sos_ingress_user` e comparação em tempo constante contra o `verify_token_hash` independente do canal.
   - Rejeição obrigatória com HTTP 403 Forbidden caso o cliente tente utilizar o `endpointToken`, `app_secret` ou `access_token` como token de validação.
   - Resposta com HTTP 200 OK e corpo em texto puro (`text/plain`) contendo o desafio numérico.
4. **Proteção Anti-Replay e Idempotência:**
   - Hashing SHA-256 do payload bruto gerando a chave determinística `provider_event_key = "sha256:" + rawPayloadHash`.
   - Inserção atômica idempotente em `channel_webhook_inbox` via cláusula `ON CONFLICT (channel_instance_id, provider_event_key) DO NOTHING`.
   - Retorno imediato de HTTP 200 OK com payload `{ received: true, status: inserted ? "accepted" : "duplicate" }`, satisfazendo contratos de webhook dos provedores sem duplicar enfileiramento.
5. **Criptografia de Envelope e Isolamento de Banco:**
   - Criptografia simétrica com AES-256-GCM do payload cru utilizando chave mestra de 64 caracteres hexadecimais com AAD explícito (`${workspaceId}:${channelInstanceId}:${rawPayloadHash}`) e especificação de `key_version`.
   - Mutação executada sob transação com o papel restrito `sos_ingress_user` (sem acesso a dados de negócio e sem permissões de exclusão).
6. **Higiene Operacional e Redaction de Logs:**
   - Redação automática do `endpointToken` em todas as instâncias de erro e respostas RFC 9457 / RFC 7807 (`instance: "/v1/webhooks/whatsapp/[redacted]"`).
   - Sanitização de URLs nos logs de erro do Fastify, impedindo vazamento de tokens em tentativas de estouro de tamanho ou falhas de parse JSON.
   - Limitador de taxa local em memória de dois níveis (`BoundedTwoTierRateLimiter`) com teto de cardinalidade máxima (10.000 chaves) e evicção LRU, protegendo contra exaustão de RAM por varredura de endpoints antes do lookup no PostgreSQL.
7. **Homologação Hermética Completa:** Comprovação integral através das suítes `apps/api/src/__tests__/webhook-ingress.test.ts` (18 testes) e `apps/api/src/__tests__/ingress-operational-security.test.ts` (6 testes).

---

## Fora do escopo

- Rate limiting distribuído em Redis compartilhado entre múltiplas réplicas da API (escopo estrito de `CH-05`);
- Restrição avançada de `trustProxy` para blocos CIDR confiáveis (escopo estrito de `CH-05`);
- Rotação dinâmica de chaves mestras e keyring E2E (escopo estrito de `CH-06`);
- Mitigação de SSRF em downloads de mídia remota (escopo estrito de `CH-07`).

---

## Arquivos sob ownership

1. `apps/api/src/plugins/raw-body.plugin.ts` (captura de `rawBody` em Buffer e integração com parsers do Fastify)
2. `apps/api/src/routes/webhook.routes.ts` (rotas de GET challenge e POST ingress, dois níveis de rate limit e envelope encryption)
3. `apps/api/src/index.ts` (integração de plugins, `bodyLimit: 524288`, manipulador de erro RFC 9457 e sanitização de URLs)
4. `packages/contracts/src/webhook-ingress.ts` (schemas Zod para validação de challenge e resposta de ingress)
5. `packages/application/src/channels/services/signature-verification.service.ts` (validação criptográfica de assinaturas WABA e WAHA)
6. `packages/database/src/infrastructure/database-signing-secret-resolver.ts` (resolução isolada de segredos sob callback efêmero)
7. `apps/api/src/__tests__/webhook-ingress.test.ts` (suíte canônica de testes de webhook GET e POST para Meta WABA e WAHA)
8. `apps/api/src/__tests__/ingress-operational-security.test.ts` (suíte de testes de redação de logs, memória do limitador e erros RFC 9457)
9. `docs/work-packages/CH-04-INGRESS.md` (especificação canônica deste pacote)
10. `docs/work-packages/CH-04-EVIDENCE.json` (manifesto canônico de evidência `EV-CH04-001`)

---

## Fatos confirmados

- `[KNOWN]` Webhooks públicos de canais de mensageria estão expostos à internet e são alvos prioritários de varreduras automatizadas, ataques de negação de serviço e injeções de payloads forjados.
- `[KNOWN]` A Meta exige que respostas ao GET challenge sejam entregues em `text/plain` contendo exclusivamente o parâmetro `hub.challenge` recebido, e que POSTs de webhook recebam HTTP 200 rapidamente para não suspender a subscrição.
- `[KNOWN]` A role `sos_ingress_user` possui permissões estritamente limitadas para lookup de canal, resolução de segredo e `INSERT` em `channel_webhook_inbox`. Ela não possui permissão de leitura sobre tabelas de mensagens ou clientes.
- `[KNOWN]` Armazenar payloads em texto claro no inbox representaria grave falha de privacidade; a criptografia AES-256-GCM com AAD atrela indissociavelmente o conteúdo ao canal e workspace de origem.
- `[KNOWN]` Ataques de replay enviando o mesmo payload repetidamente são neutralizados deterministicamente através da restrição UNIQUE `(channel_instance_id, provider_event_key)`.

---

## Invariantes

1. **Zero Persistência sem Assinatura Válida:** Um webhook com assinatura ausente, inválida ou adulterada JAMAIS gera inserção no banco de dados.
2. **Zero Token Leakage:** O `endpointToken` jamais é emitido em instâncias de RFC 9457, corpos de resposta ou registros de log do servidor.
3. **Imutabilidade e Idempotência:** Repetições do mesmo payload geram HTTP 200 com status `duplicate` e não afetam o estado de processamento de mensagens existentes.
4. **Memória Delimitada do Rate Limiter Local:** O limitador em memória nunca ultrapassa 10.000 chaves de rastreamento, descartando chaves expiradas ou aplicando evicção de mais antigas.

---

## Critérios de aceitação

- [x] **AC-CH04-001:** `GET /v1/webhooks/whatsapp/:endpointToken` valida query params, valida token independente via hash constante, e responde HTTP 200 com o challenge numérico.
- [x] **AC-CH04-002:** `GET /v1/webhooks/whatsapp/:endpointToken` rejeita tentativas de validação com tokens arbitrários, endpointToken ou app_secret com HTTP 403 Forbidden.
- [x] **AC-CH04-003:** `POST /v1/webhooks/whatsapp/:endpointToken` valida assinatura HMAC-SHA256 para Meta WABA e tokens constantes para WAHA, rejeitando assinaturas forjadas com HTTP 401 Unauthorized.
- [x] **AC-CH04-004:** Webhooks autênticos são criptografados com envelope AES-256-GCM + AAD e inseridos atomicamente em `channel_webhook_inbox` sob a role `sos_ingress_user`.
- [x] **AC-CH04-005:** Entregas repetidas do mesmo payload retornam HTTP 200 `{ received: true, status: "duplicate" }` sem duplicar linhas no banco de dados.
- [x] **AC-CH04-006:** O `endpointToken` é estritamente redigido em respostas de erro RFC 9457 e logs de execução.
- [x] **AC-CH04-007:** Suítes `webhook-ingress.test.ts` (18 testes) e `ingress-operational-security.test.ts` (6 testes) 100% aprovadas em banco hermético.

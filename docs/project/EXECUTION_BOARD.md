# Execution Board — Estado Factual

> Atualizado em 19 de setembro de 2026.  
> O board descreve fatos do repositório, não intenção.

## Snapshot atual

- Repositório: `/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES`
- Branch: `codex/iteration-2.7`
- Último checkpoint consolidado: `a4d9cf1` — Iteração 2.6
- Working tree inicial observado antes destes documentos: 32 arquivos modificados e 30 caminhos não rastreados
- Iterações misturadas: 2.7, 3 e 4
- Produção: V2 permanece ativa; V3 não foi promovida

## Pacote ativo

| ID | Estado | Objetivo | Bloqueio/Gate |
|---|---|---|---|
| G-00 | ACCEPTED | snapshot bruto recuperável | EV-G00-001-v3 validado; bundle, 200 hashes e restauração aprovados |
| G-01 | ACCEPTED | inventariar e rebaselinar o projeto | EV-G01-001 validado; 149 arquivos catalogados individualmente sem agrupamento cego |
| G-02 | ACCEPTED | implantar governança canônica | EV-G02-001 validado; 15 documentos de governança canônica homologados e alinhados |
| G-03 | ACCEPTED | planejar reconstrução e separação | EV-G03-001 validado; arquitetura de 4 checkpoints, isolamento em worktree e matriz de gates |
| G-04 | ACCEPTED | separar 2.7, 3 e 4 | EV-G04-001 validado; 4 checkpoints atômicos isolados sobre commit a4d9cf1; 124 testes passando |
| G-05 | ACCEPTED | auditar 1–2.6 e revalidar 2.7/3 | EV-G05-001 validado; 6 commits auditados com rastreabilidade por SHA |
| G-06 | ACCEPTED | CI mínimo e evidence manifest | EV-G06-001 validado; 6 gates locais automatizados (pnpm ci:gate), 21 arquivos e 256 asserções aprovados com exit code 0 |
| CH-00 | ACCEPTED | modelo mínimo de contato, thread e mensagem | EV-CH00-001 validado; persistência tenant-safe (contacts, threads, messages), composite FKs e RLS negativos aprovados (17 asserções) |
| CH-01 | ACCEPTED | RLS fail-closed e saneamento de lease | EV-CH01-001 validado; worker_user restrito a itens claimable, lease recovery e mitigação de retry ceiling (16 asserções) |
| CH-02 | ACCEPTED | claims, retry, lease e fencing | EV-CH02-001 validado; particionamento SKIP LOCKED, pre-send fencing validation e heartbeat abort com AbortController (6 asserções) |
| CH-03 | ACCEPTED | reconciliação e resiliência com provedores | EV-CH03-001 validado; late webhook auto-reconciliation, poller reconcileBatch com carência TTL, reschedule e dead-letter (8 asserções) |
| CH-04 | ACCEPTED | ingress seguro e verificação criptográfica | EV-CH04-001 validado; raw body 512KB, HMAC Meta WABA, tokens WAHA, replay protection, AES-256-GCM + AAD, zero token leakage (24 asserções) |
| CH-05 | ACCEPTED | rate limiting distribuído e proxy confiável | EV-CH05-001 validado; cotas Redis multi-réplica com Lua sliding window, fallback gracioso em memória, headers RFC 6585 e anti-spoofing CIDR (9 asserções) |
| CH-06 | ACCEPTED | keyring E2E e rotatividade de chaves mestras | EV-CH06-001 validado; keyring versionado (Keyring), rotação zero-downtime, processamento heterogêneo de lotes no worker e fail-closed para versão desconhecida (36 asserções) |
| CH-07 | ACCEPTED | SSRF guard e download seguro de mídia | EV-CH07-001 validado; mitigação de SSRF contra IPs privados/loopback/CGNAT/benchmarking, stream piping com teto de tamanho rígido (maxSizeBytes), verificação de magic bytes e zero bypass ambiental (79 asserções) |
| CH-08 | ACCEPTED | WABA operacional | EV-CH08-001 validado; janela 24h, templates multilíngues com SSRF guard, documentos com filename, getMediaUrl seguro contra CDN Meta, classificação determinística de erros e mensagens interativas (70 asserções) |
| CH-09 | ACCEPTED | WAHA operacional | EV-CH09-001 validado; contido no Integration Checkpoint IC-01 (`9577e17`), com digest de escopo próprio e 110 asserções aprovadas |
| CH-10 | READY | Docker dual-engine | desbloqueado após fechamento formal e homologação do CH-09; pronto para execução |

## Estado por macrofase

| Fase | Estado | Evidência/limite |
|---|---|---|
| Fase 0 — Charter/ADRs | ACCEPTED | EV-IT01-001; 5 ADRs integradas e alinhadas ao Product Charter |
| Iteração 1 — Fundação | ACCEPTED | EV-IT01-001; commit `2f6a134` auditado retrospectivamente |
| Iteração 2 — Tenant-first | ACCEPTED | EV-IT02-001; commit `28b9843` auditado com FORCE RLS e papéis DB |
| Iteração 2.5 — Auth vertical | ACCEPTED | EV-IT25-001; commit `4483f49` auditado com 37 testes de integração |
| Iteração 2.6 — Hardening | ACCEPTED | EV-IT26-001; commit `a4d9cf1` auditado com biblioteca jose e trigger imutável |
| Iteração 2.7 — Runner | ACCEPTED | EV-IT27-001; commit `a41e1ab` revalidado com 90 testes em DB hermético |
| Iteração 3 — Design/AppShell | ACCEPTED | EV-IT03-001; commit `0605dff` revalidado com @sos-sales/ui e web app |
| Iteração 4 — Canais | IN_PROGRESS | commit `d4de6ca` isolado; saneamento ativo na esteira CH-00..CH-12 (CH-00..CH-04 ACCEPTED) |
| CRM Core | PLANNED | não iniciar antes de CH-12 |
| Cockpit real | PLANNED | UI atual é fundação, não operação real |
| Meta/CAPI | PLANNED | sem loop fechado comprovado |
| IA supervisionada | PLANNED | sem ativação V3 |
| Onboarding | PLANNED | EXT-01/02/03 continuam dependências externas |
| Haven piloto | PLANNED | não autorizado |
| Produção V3 | PLANNED | proibida antes dos gates |

## Débito bloqueante conhecido da Fase CH

- RLS do worker permite superfície global além do claim mínimo (resolvido no CH-01).
- Itens no limite de retry podem ficar sem transição terminal (resolvido no CH-01).
- Perda de ownership da lease não aborta envio externo (resolvido no CH-02 via pre-send fencing e heartbeat AbortController).
- Crash na última tentativa pode não chegar à reconciliação (resolvido no CH-01/CH-02).
- Recuperação de comandos ambíguos e reconciliação com webhooks tardios sem terminalidade (resolvido no CH-03 via auto-reconciliation e reconcileBatch).
- SSRF guard não está integrado aos adapters reais (resolvido no CH-07, CH-08 e CH-09 via validateMediaUrl e validateWahaBaseUrl).
- `mediaUrl` ainda pode induzir SSRF no WAHA (resolvido no CH-07 e CH-09 via guarda perimétrica em baseUrl e downloadMediaStream seguro).
- Rate limiting distribuído Redis não está integrado (resolvido no CH-05 via RedisTwoTierRateLimiter e Lua sliding window).
- `trustProxy` precisa ser restrito (resolvido no CH-05 via resolveTrustProxy e CIDRs privados padrão).
- keyring existe como primitive, não E2E (resolvido no CH-06 via Keyring versionado, activeKeyVersion no ingress e worker heterogêneo).
- Docker dual-engine não está comprovado (objeto do CH-10).
- não existe produtor runtime transacional de outbound (objeto do CH-11).
- templates não foram comprovados de serviço de aplicação até HTTP (objeto do CH-12).

## Próxima fila

```text
G-00 → G-01/G-02 → G-03 → G-04 → G-05 → G-06
→ CH-00 → CH-01 → CH-02 → CH-03
→ CH-04 → CH-05 → CH-06 → CH-07
→ CH-08/CH-09 → CH-10 → CH-11 → CH-12
```

## Atualização obrigatória

Ao final de cada pacote:

1. registrar commit/digest;
2. atualizar critérios e evidências;
3. registrar revisão independente;
4. atualizar riscos e limitações;
5. mover o estado;
6. selecionar o próximo pacote `READY`.

## Cadência e ownership

- triagem do board: diária enquanto G-00..G-06 estiverem ativos;
- revisão técnica e de riscos: ao fechar cada pacote;
- revisão de produto: semanal e antes de qualquer mudança de escopo;
- owners e reviewers são registrados quando o pacote entra em `READY`;
- janela-alvo é registrada no pacote, sem converter estimativa em promessa;
- trabalho externo, piloto, cutover e produção exigem autorização explícita do Product Owner.

## Mapeamento histórico provisório

| Pacote | Referência observada | Limite |
|---|---|---|
| P-01 | `2f6a134` | fundação a confirmar em G-05 |
| P-02/P-03 | `28b9843` e `4483f49` | auth/RBAC a decompor por evidence manifest |
| P-04/P-06 | `a4d9cf1` | RLS/hardening/auditoria a confirmar em G-05 |
| P-05 | primitive de keyring no working tree | ainda não é keyring E2E de canal; CH-06 permanece separado |

## Últimos aceites formais

1. **Pacote G-00:**
   - Snapshot: `20260919T045737Z`.
   - Manifest: `EV-G00-001-v3.json`.
   - Evidência: bundle válido, 32 tracked modificados, 117 arquivos untracked, 200 hashes íntegros e restauração independente aprovada.
2. **Pacote G-01:**
   - Manifest: `docs/work-packages/G-01-EVIDENCE.json` (`EV-G01-001`).
   - Evidência: 149 arquivos catalogados individualmente (32 tracked + 117 untracked), plano de hunks para 11 arquivos compartilhados e matriz de gates sem agrupamento cego.
3. **Pacote G-02:**
   - Manifest: `docs/work-packages/G-02-EVIDENCE.json` (`EV-G02-001`).
   - Evidência: 15 documentos de governança em `docs/project/` homologados, indexados e auditados quanto a integridade referencial.
4. **Pacote G-03:**
   - Manifest: `docs/work-packages/G-03-EVIDENCE.json` (`EV-G03-001`).
   - Evidência: Roteiro operacional de 4 checkpoints, alocação unívoca de 149 arquivos, protocolo de lockfile e contenção em worktree estéril.
5. **Pacote G-04:**
   - Manifest: `docs/work-packages/G-04-EVIDENCE.json` (`EV-G04-001`).
   - Evidência: Separação física e atômica dos 4 checkpoints (`a5ffb41`, `a41e1ab`, `0605dff`, `d4de6ca`) sobre `a4d9cf1`, 124 testes passando, regeneração determinística de lockfile e paridade total com o baseline.
6. **Pacote G-05:**
   - Manifest: `docs/work-packages/G-05-EVIDENCE.json` (`EV-G05-001`).
   - Evidência: Auditoria retrospectiva de 6 commits históricos (IT-01 a IT-03); zero não conformidade; evidências individuais vinculadas por commit SHA.
7. **Pacote G-06:**
   - Manifest: `docs/work-packages/G-06-EVIDENCE.json` (`EV-G06-001`).
   - Evidência: Pipeline unificado de CI local (`scripts/ci-gate-runner.ts` / `pnpm ci:gate`) validando 6 portões de qualidade com execução fail-closed em 5.8s, zero erros de tipo ou build, 21 arquivos de teste e 256 asserções aprovados em banco hermético e encerramento formal da Fase G.
8. **Pacote CH-00:**
   - Manifest: `docs/work-packages/CH-00-EVIDENCE.json` (`EV-CH00-001`).
   - Evidência: Modelos canônicos de Contact, CommercialThread e Message formalizados com schemas Zod e tipos TypeScript em `@sos-sales/contracts`; helpers de repositório em `@sos-sales/database`; suíte hermética de 17 asserções aprovada sob `sos_app_user` com FORCE RLS e composite FKs comprovando zero vazamento cross-tenant.
9. **Pacote CH-01:**
   - Manifest: `docs/work-packages/CH-01-EVIDENCE.json` (`EV-CH01-001`).
   - Evidência: Políticas de RLS da role `sos_worker_user` tornadas estritamente fail-closed na Migration 005 (zero acesso a dados de negócio sem `app.current_workspace_id`); superfície de fila global limitada a itens claimable/ativos ocultando finalizados; saneamento do teto de retentativas via `LEAST(retry_count + 1, max_retries)` garantindo recuperação de leases expiradas e transições terminais sem violação de CHECK; 16 asserções de teste hermético aprovadas em `worker-rls-fail-closed.test.ts`.
10. **Pacote CH-02:**
   - Manifest: `docs/work-packages/CH-02-EVIDENCE.json` (`EV-CH02-001`).
   - Evidência: Particionamento estrito `FOR UPDATE SKIP LOCKED` em `claimBatch` garantindo concorrência multi-worker sem overlap; validação pre-send fencing assegurando perda de lease antes de despacho externo; AbortController heartbeat abortando conexões ativas em caso de perda de lease; 6 asserções aprovadas em `dispatcher-fencing-operational.test.ts`.
11. **Pacote CH-03:**
   - Manifest: `docs/work-packages/CH-03-EVIDENCE.json` (`EV-CH03-001`).
   - Evidência: Auto-reconciliação de webhooks tardios de status de entrega (`delivery_status`) para comandos em `reconciliation_required` (tanto com `provider_message_id` conhecido quanto inicialmente nulo via correlação por telefone do destinatário); poller periódico `reconcileBatch` com carência TTL, reschedule com backoff para `pending` e transição terminal para `dead_letter` no teto de tentativas; saneamento de RLS da `sos_worker_user` para updates de lease em contexto global; 8 asserções canônicas 100% aprovadas em `reconciliation-operational.test.ts`.
12. **Pacote CH-04:**
   - Manifest: `docs/work-packages/CH-04-EVIDENCE.json` (`EV-CH04-001`).
   - Evidência: Perímetro de ingresso público consolidado com Fastify `rawBodyPlugin` (512 KB ceiling); validação criptográfica de assinatura para Meta WABA (HMAC-SHA256 em tempo constante) e WAHA (tokens constantes com digests SHA-256); handshake de desafio Meta GET com `verify_token` independente (HTTP 403 em tokens indevidos); proteção anti-replay via `provider_event_key` e `ON CONFLICT DO NOTHING`; criptografia de envelope AES-256-GCM com AAD (`workspace:channel:hash`) sob o papel restrito `sos_ingress_user`; redação integral de `endpointToken` em erros RFC 9457 e logs; limitador de taxa local de dois níveis limitado a 10.000 chaves; 24 asserções aprovadas em `webhook-ingress.test.ts` (18 testes) e `ingress-operational-security.test.ts` (6 testes).
13. **Pacote CH-05:**
   - Manifest: `docs/work-packages/CH-05-EVIDENCE.json` (`EV-CH05-001`).
   - Evidência: `RedisTwoTierRateLimiter` com script Lua atômico sliding window ($O(\log N)$) garantindo cotas consistentes entre múltiplas réplicas da API; rate limiting em dois níveis (IP antes do lookup no Postgres e canal após a resolução); fallback transparente e gracioso para `BoundedTwoTierRateLimiter` em memória diante de falhas do Redis; injeção obrigatória dos cabeçalhos RFC 6585 (`Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`) em HTTP 429 com payload RFC 9457; mitigação de IP spoofing via `resolveTrustProxy` restringindo proxies a CIDRs de redes privadas e loopback (`127.0.0.1`, `::1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`); 9 asserções aprovadas em `redis-rate-limiter.test.ts` e 321 asserções no monorepo.
14. **Pacote CH-06:**
   - Manifest: `docs/work-packages/CH-06-EVIDENCE.json` (`EV-CH06-001`).
   - Evidência: Implementação do tipo canônico `Keyring = Record<number, string>`, normalização transparente de versões string e numéricas (`normalizeKeyVersion`), resolução da versão ativa (`getActiveKeyVersion`) e parser estrito de ambiente (`parseKeyringFromEnv`); zeramento de buffers sensíveis na memória (`keyBuffer.fill(0)`, `decryptedBuffer.fill(0)`) em `finally`; ingestão de webhooks Fastify com encriptação pela chave ativa e persistência explícita de `key_version` no `channel_webhook_inbox`; decriptação multi-chave com fallback transparente no `DatabaseSigningSecretResolver` e `decryptPayload`; processamento contínuo de lotes mistos contendo itens v1 e v2 no worker sem interrupção de serviço; tratamento fail-closed para chaves desconhecidas com erro `UNKNOWN_KEY_VERSION` e retentativa segura; 36 asserções canônicas aprovadas em `crypto-keyring.test.ts` (13 testes), `keyring-e2e-rotation.test.ts` (4 testes) e `webhook-ingress.test.ts` (19 testes) e total de 332 asserções no monorepo (27 suítes).
15. **Pacote CH-07:**
   - Manifest: `docs/work-packages/CH-07-EVIDENCE.json` (`EV-CH07-001`).
   - Evidência: Mitigação estrita contra SSRF cobrindo todas as faixas IPv4/IPv6 reservadas (Carrier-Grade NAT RFC 6598 `100.64.0.0/10`, Benchmarking RFC 2544 `198.18.0.0/15`, IETF `192.0.0.0/24`, IPv6 Translation `64:ff9b::/96`, documentation `2001:db8::/32`); bloqueio irrestrito de cloud metadata e notações alternativas (decimais puros, octais com zeros à esquerda, hexadecimais, codificação mista de URL); re-validação obrigatória a cada salto de redirecionamento HTTP 3xx (até 3 saltos); implementação do `downloadMediaStream` e `downloadMediaToStream` com controle estrito de teto de tamanho (`maxSizeBytes`, default 16MB) e cancelamento atômico de stream (`reader.cancel()`) prevenindo exaustão de memória; checagem pre-flight de `Content-Length`; allowlist de tipos MIME canônicos e inspeção de assinatura binária de arquivos (*magic bytes*) bloqueando executáveis (`MZ` do Windows PE, `\x7fELF` do Linux) e scripts/HTML; cálculo incremental em tempo real de SHA-256; eliminação de bypass implícito de `NODE_ENV === "test"` em adaptadores (`WahaAdapter`) em favor de `allowLocalTest: true` explícito; 79 asserções de canais aprovadas (26 em `http-operational-security.test.ts`, 18 em `channel-adapters.test.ts`, 35 em `channel-gateway.test.ts`) e 347 asserções em 27 arquivos no monorepo.
16. **Pacote CH-08:**
   - Manifest: `docs/work-packages/CH-08-EVIDENCE.json` (`EV-CH08-001`).
   - Evidência: Adaptador `MetaWabaAdapter` operacional com validação de janela de 24 horas (`OUTSIDE_24H_WINDOW_ERROR` para texto livre com janela desconhecida ou expirada), permissão a templates multilíngues com componentes e validação perimetral SSRF em parâmetros de mídia de cabeçalho; suporte a envio de mídia (`image`, `audio` sem caption, `video`, `document` com extração de `filename` a partir do pathname da URL); resolução segura de mídia inbound (`getMediaUrl` e `getMediaMetadata`) consumindo `GET /v21.0/${mediaId}` com bearer token no escopo seguro do `secretResolver` (zero vazamento de credenciais); classificação determinística de erros da Meta Graph API (transient 429/130429 com `Retry-After`, 5xx; permanent 131026, 132000, 190; ambiguous 408, `EMPTY_MESSAGE_ID`, `NETWORK_TIMEOUT`) e re-lançamento de `FENCING_IN_FLIGHT_ABORT`; `WabaWebhookNormalizer` com extração completa de metadados de mídia (`mediaId`, `mimeType`, `fileSha256`, `filename`) e normalização de mensagens interativas (`button_reply`, `list_reply`); 70 asserções de teste aprovadas em `channel-adapters.test.ts` (30 testes) e `channel-gateway.test.ts` (40 testes), e total de 364 asserções no monorepo (27 suítes) com 100% de sucesso nos 6 portões de qualidade (`pnpm ci:gate`).
17. **Pacote CH-09:**
   - Manifest: `docs/work-packages/CH-09-EVIDENCE.json` (`EV-CH09-001`).
   - Evidência: Adaptador `WahaAdapter` operacional com gestão de ciclo de vida de sessões (`startSession`, `stopSession`, `getSession`, `getQrCode`) consumindo credenciais estritamente no escopo isolado de `ISigningSecretResolver` sem vazamento; parsing robusto de QR Code com leitura única via `arrayBuffer`, suporte a JSON (`qr`/`raw`), texto plano, SVG, data URI binária (PNG/JPEG/WebP) e erro tipado `WAHA_UNSUPPORTED_QR_FORMAT` com teto de 512KB; roteamento de mídia para endpoints dedicados da WAHA (`/api/sendImage`, `/api/sendVideo`, `/api/sendVoice`, `/api/sendFile`, `/api/sendText`) com validação defensiva SSRF perimétrica contra URLs maliciosas e notações ofuscadas; re-lançamento de `FENCING_IN_FLIGHT_ABORT` em caso de cancelamento em voo ou perda de lease e classificação determinística de status HTTP 404 (`SESSION_NOT_FOUND`), 429 (com parsing de `Retry-After`), 502/503/504 (transient) e 408/425/`EMPTY_MESSAGE_ID` (ambiguous); `WahaWebhookNormalizer` com normalização de eventos de ciclo de vida (`session.status`, `session.qr`, `session.auth_failure`) gerando eventos canônicos do tipo `lifecycle` (`connected`, `disconnected`, `qr_received`, `auth_failure`), detecção precisa de mídias inbound (`image`, `video`, `audio`, `document`) e tratamento de ACKs negativos como `status: "failed"`; serviço `waha` adicionado ao `docker-compose.yml` sob `profiles: ["waha"]` preservando a hermeticidade da base de CI; 110 asserções de teste aprovadas em `channel-adapters.test.ts` (59 testes) e `channel-gateway.test.ts` (51 testes), e total de 404 asserções no monorepo (27 suítes) com 100% de sucesso nos 6 portões de qualidade (`pnpm ci:gate`); artefatos consolidados no Integration Checkpoint IC-01 (`9577e17b5508efe671d195756a27b6948c908f5b`) com proveniência em `INTEGRATION_CHECKPOINT_IC-01.md`, manifest de máquina `IC-01-MANIFEST.json` e digest de escopo próprio em `CH-09-EVIDENCE.json`.




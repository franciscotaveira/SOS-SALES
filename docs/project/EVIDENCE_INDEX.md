# Evidence Index

## Política

Evidência é válida apenas para o SHA/digest executado. Relatório do executor é candidato a evidência, não aceite.

| Evidence-ID | Pacote | Tipo | SHA/Digest | Ambiente | Resultado | Limitação | Reviewer |
|---|---|---|---|---|---|---|---|
| EV-G00-001-v3 | G-00 | snapshot + restore drill | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | preserva o working tree observado; não valida funcionalidade | Sol/QA independente |
| EV-G01-001 | G-01 | inventário e rebaseline | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | catalogou 149 arquivos; não executa separação ou código | QA Independente / Security |
| EV-G02-001 | G-02 | governança canônica | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | homologa 15 documentos de governança; zero desvio do baseline | QA Independente / Security |
| EV-G03-001 | G-03 | planejamento de reconstrução | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | roteiro de 4 checkpoints, isolamento em worktree e matriz de gates | QA Independente / Security |
| EV-G04-001 | G-04 | separação e reconstrução | `d4de6ca` (branch rebuild/checkpoints) | local hermético | aceito | 4 checkpoints atômicos (a5ffb41, a41e1ab, 0605dff, d4de6ca); 100% testes passando | QA Independente / Security |
| EV-G05-001 | G-05 | auditoria retrospectiva e revalidação | `d4de6ca` | local hermético | aceito | auditou 6 commits históricos (IT-01 a IT-03); zero não conformidade | QA Independente / Security |
| EV-G06-001 | G-06 | CI mínimo e evidence manifest | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | 6 gates automatizados (pnpm ci:gate); 21 arquivos e 256 asserções 100% aprovados | QA Independente / SRE |
| EV-CH00-001 | CH-00 | modelo mínimo de contato, thread e mensagem | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | persistência tenant-safe (contacts, threads, messages), composite FKs e RLS negativo (17 asserções) | QA Independente / Security |
| EV-CH01-001 | CH-01 | RLS do worker fail-closed e saneamento 005 | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | RLS fail-closed estrito em sos_worker_user, saneamento de lease recovery no teto de retries e 16 asserções de segurança aprovadas | QA Independente / Security |
| EV-CH02-001 | CH-02 | claims, retry, lease e fencing distribuído | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | concorrência multi-worker sem overlap (SKIP LOCKED), pre-send fencing validation e cancelamento em voo via AbortController (6 asserções) | QA Independente / Security |
| EV-CH03-001 | CH-03 | reconciliação e resiliência com provedores | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | late webhook auto-reconciliation (com e sem ID prévio), poller reconcileBatch com carência TTL, reschedule e dead-letter (8 asserções) | QA Independente / Security |
| EV-CH04-001 | CH-04 | ingress seguro e verificação criptográfica | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | raw body 512KB, HMAC Meta WABA, tokens WAHA, replay protection, AES-256-GCM + AAD, zero token leakage (24 asserções) | QA Independente / Security |
| EV-CH05-001 | CH-05 | rate limiting distribuído e proxy confiável | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | cotas Redis multi-réplica com Lua sliding window, fallback gracioso em memória, headers RFC 6585 e anti-spoofing CIDR (9 asserções) | QA Independente / Security |
| EV-CH06-001 | CH-06 | keyring E2E e rotatividade de chaves mestras | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | suporte a keyring versionado (Keyring), normalização string/numérica, rotação zero-downtime, decriptação heterogênea no worker e fail-closed para versão desconhecida (36 asserções) | QA Independente / Security |
| EV-CH07-001 | CH-07 | SSRF guard e download seguro de mídia | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | mitigação SSRF estrita (CGNAT, Benchmarking, IPv6 translation), streaming piping com teto de tamanho rígido (maxSizeBytes), verificação de magic bytes (JPEG/PNG/PDF/OGG) e zero bypass de ambiente (79 asserções) | QA Independente / Security |
| EV-CH08-001 | CH-08 | WABA operacional (janela 24h, mídia, template, getMediaUrl) | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` | local hermético | aceito | validação de janela 24h (OUTSIDE_24H_WINDOW_ERROR), templates multilíngues com validação SSRF em cabeçalho, envio de documentos com filename, getMediaUrl seguro para CDN Meta, classificação de erros determinística e normalizador com metadados de mídia e mensagens interativas (70 asserções, 364 no monorepo) | QA Independente / Security |
| EV-CH09-001 | CH-09 | WAHA operacional (sessão, QR, status, ack, reconexão e endpoints dedicados) | IC-01 (`9577e17b5508efe671d195756a27b6948c908f5b`) | local hermético | aceito | CH-09 contido no Integration Checkpoint IC-01, com digest de escopo próprio; ciclo de vida de sessões, endpoints dedicados, QR parsing single-read, SSRF guard perimétrico (110 asserções locais, 404 no monorepo) | QA Independente / Security |
| EV-CH10-001 | CH-10 | Docker dual-engine (coexistência WABA/WAHA, ChannelDispatchService, ChannelHealthService, concorrência e monotonicidade pós-envio) | `6126ab6` | local hermético | aceito | dual-engine operacional, dispatch explícito fail-closed, concorrência atômica com lock FOR UPDATE, eliminação de regressão de estado terminal em post-send reconciliation, fencing e 526 asserções aprovadas (35 suítes); EXT-05 permanece BLOCKED_EXTERNAL | QA Independente / Security |
| EV-CH11-001 | CH-11 | produtor transacional de outbound (atomicity message + command + audit, idempotência com payload_fingerprint exato, fail-closed identity, distributed rate limiter, trust boundary .strict(), SSRF guard, RLS) | `5f5570f` | local hermético | aceito | atomicity transacional { message + command + audit }, replay determinístico com INNER JOIN, identidade estrita sem fallback role, limitador distribuído dois níveis (IP e workspace+actor+channel), concorrência race-safe ON CONFLICT, SSRF mitigado pre-DB, 571 testes aprovados (38 suítes); EXT-05 e CH-12 permanecem separados | QA Independente / Security |
| EV-CH12-001 | CH-12 | E2E técnico de mensageria e ciclo de vida omnichannel (webhook ingress -> inbox queue -> worker claim -> thread genesis -> HTTP API outbound -> transactional producer -> outbox queue -> worker dispatch -> delivery events -> status ACK delivered/read -> cross-tenant rejection -> SSRF barrier) | `172aa07` | local hermético | aceito | ciclo de vida completo E2E validado hermeticamente sob RLS; upstream simulado via adapter mock com paridade aos contratos upstream; homologação física de hardware celular real mantida isolada como dependência EXT-05 (584 asserções, 40 suítes) | QA Independente / Security |
| EV-CRM01-001 | CRM-01 | CRM Core, Fechamento de Venda no Cockpit e Meta CAPI Return Loop | `c7e1aafa3a84a65b40fb6f846ecaa084fb4d4cd2` | local hermético | aceito | ciclo comercial completo E2E (Ad attribution -> WhatsApp thread -> Cockpit real -> Outcome Won/Lost -> Meta CAPI PurchaseCompleted); 599 asserções herméticas passando sob RLS (43 suítes) | QA Independente / Security |
| EV-CH13-001 | CH-13 | Adaptador Nativo Evolution API v2 (Soberania MCT OS) | `7ffb5711364487300a1e8fd9d0a9c126c046e1ad` | local hermético | aceito | motor soberano Evolution API v2 operacional; normalizador determinístico, adapter com SSRF guard, verifyEvolution em tempo constante (610 asserções, 45 suítes) | QA Independente / Security |
| EV-IT01-001 | Iteração 1 | fundação monorepo | `2f6a134` | local hermético | aceito | monorepo Turbo, workspaces pnpm, API Fastify básica e Migration 001 | QA Independente / Security |
| EV-IT02-001 | Iteração 2 | tenant-first isolation | `28b9843` | local hermético | aceito | Migration 002 (FORCE RLS) e papéis dedicados Postgres | QA Independente / Security |
| EV-IT25-001 | Iteração 2.5 | auth vertical slice | `4483f49` | local hermético | aceito | rotas /v1/me, /v1/workspaces, header X-Workspace-Id e Migration 003 | QA Independente / Security |
| EV-IT26-001 | Iteração 2.6 | hardening e ADR-002 | `a4d9cf1` | local hermético | aceito | biblioteca jose RFC 7519, Supabase JWKS e Migration 004 (imutabilidade) | QA Independente / Security |
| EV-IT27-001 | Iteração 2.7 | runner hermético e DB support | `a41e1ab` | local hermético | aceito | runner hermético, DB descartável, sanitização; 90 testes passando | QA Independente / Security |
| EV-IT03-001 | Iteração 3 | design system e web | `0605dff` | local hermético | aceito | pacote @sos-sales/ui (WCAG 2.2 AA), app Web Vite e testes de sessão | QA Independente / Security |
| EV-IT04-001 | Iteração 4 | motor de canais raw | `172aa07` | local hermético | aceito | saneamento completo da esteira CH-00..CH-12 concluído com 584 asserções herméticas passando sob RLS e dual-engine WABA/WAHA | QA Independente / Security |

## Manifest por pacote

Cada `docs/work-packages/<ID>-EVIDENCE.json` deverá conter:

```json
{
  "package_id": "G-00",
  "commit_sha": "",
  "image_digest": "",
  "timestamp": "",
  "environment": {},
  "commands": [
    { "command": "", "exit_code": 0, "artifact": "" }
  ],
  "acceptance": [
    { "ac_id": "AC-XXX", "result": "PASS", "evidence": "" }
  ],
  "limitations": [],
  "executor": "",
  "reviewer": ""
}
```

## Validade

- unitários e DB: até alteração do código/schema relacionado;
- contrato externo: revalidar antes de release e após mudança de API;
- browser: revalidar após mudança visual ou de dados;
- homologação WABA/WAHA/CAPI: validade curta e refresh antes do piloto;
- produção: smoke 24h/72h/7d no mesmo digest.

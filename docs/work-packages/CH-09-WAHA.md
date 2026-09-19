# CH-09 — WAHA Operacional

> Nome do arquivo: `CH-09-WAHA.md`  
> Estado: `ACCEPTED` — Homologado e consolidado no Integration Checkpoint IC-01 (commit `9577e17b5508efe671d195756a27b6948c908f5b`), com digest de escopo próprio e 110 testes aprovados.

---

## Identidade

- **Parent objective:** Programa SOS Sales V3 — Motor de Comunicação (Fase CH)
- **Estado:** `ACCEPTED`
- **Owner:** Gemini 3.8 (Executor Principal)
- **Reviewer:** Agente Independente de Auditoria de Segurança e Qualidade de Código (ver `docs/audits/ch-09/INDEPENDENT_REVIEW.md`)
- **Dependências:** `CH-00` (Modelos Mínimos), `CH-01` (RLS Fail-Closed), `CH-02` (Fencing Concorrente), `CH-03` (Reconciliação e Resiliência), `CH-04` (Ingress Seguro), `CH-05` (Rate Limiting Distribuído), `CH-06` (Keyring E2E), `CH-07` (SSRF Guard & Mídia Segura)
- **ADRs Vinculadas:** ADR-002 (Auth Strategy & Tenancy), ADR-005 (Channel Gateway & Inbox/Outbox)
- **Roadmap Gate:** `| CH-09 | WAHA operacional | CH-02/06/07 | sessão, QR, status, ack, reconexão e endpoints dedicados |`
- **Risco Mitigado:** `R-005` (Desconexão não monitorada de sessões WAHA, vazamento de credenciais na gestão de sessão, falha de roteamento de mídias por endpoint genérico, e poluição de infraestrutura de CI)

---

## Objetivo único

Implementar e homologar a camada operacional completa para o canal **WhatsApp HTTP API (WAHA)**, cobrindo ciclo de vida completo de sessões (inicialização, parada, consulta de status e obtenção de QR Code), roteamento de mídia para endpoints dedicados da API WAHA, normalização bidirecional de eventos (mensagens tipadas, confirmações de entrega incluindo falha, e transições de ciclo de vida de sessão), proteção SSRF perimetral e isolamento seguro de credenciais via `ISigningSecretResolver`:

1. **Adaptador Operacional WAHA (`WahaAdapter`):**
   - **Gestão de Sessões Sem Vazamento de Segredos:** Implementação dos métodos `startSession`, `stopSession`, `getSession` e `getQrCode`. O acesso a `apiKey` e `baseUrl` ocorre exclusivamente dentro dos callbacks com escopo restrito do `ISigningSecretResolver` (`useWahaOutboundCredentials` ou `useCredentials`), com fail-closed imediato se a API key estiver ausente.
   - **Parsing Robusto de QR Code com Consumo Único:** O método `getQrCode` consome o body da resposta exatamente uma vez via `arrayBuffer`, inspeciona o `Content-Type` e suporta `application/json` (extraindo campo `qr` ou `raw`), `text/plain`, `image/svg+xml`, e imagens binárias (`image/png`, `image/jpeg`, `image/webp` convertidos para data URI base64). Aplica teto de 512 KB (`WAHA_MAX_QR_PAYLOAD_BYTES`), rejeição tipada (`WAHA_UNSUPPORTED_QR_FORMAT`) para binários desconhecidos, e nunca vaza payloads de QR ou credenciais em logs ou mensagens de erro.
   - **Roteamento de Mídia para Endpoints Dedicados:** Em vez de enviar todas as mídias para um único endpoint genérico, o adaptador inspeciona o tipo de mídia via `detectMediaType` e despacha para os endpoints dedicados da WAHA:
     - Vídeo (`.mp4`, etc.) -> `/api/sendVideo`
     - Áudio / Voz (`.ogg`, `.mp3`, etc.) -> `/api/sendVoice`
     - Documentos / Arquivos (`.pdf`, etc.) -> `/api/sendFile`
     - Imagens (`.jpg`, `.png`, etc.) -> `/api/sendImage`
     - Texto puro -> `/api/sendText`
   - **Validação Defensiva SSRF (Perímetro Estático vs Stream Dinâmico):**
     - `validateWahaBaseUrl` aplica guarda perimétrica estática na URL base da WAHA: rejeita credenciais embutidas (`user:pass@host`), notações de IP alternativas/ofuscadas (hex, octal, dword), metadados de nuvem (`169.254.169.254`, `metadata.google.internal`, `instance-data`), e IPs literais privados/reservados IPv4 e IPv6 em produção, exigindo HTTPS fora de ambiente de teste ou allowlist interna de Docker (`INTERNAL_SERVICE_ALLOWLIST`).
     - Resolução dinâmica de DNS, controle estrito de redirects HTTP e pinning contra DNS rebinding são aplicados aos downloads de mídia em tempo de execução via `downloadMediaStream` (CH-07).
   - **Fencing In-Flight Abort:** Caso a lease do worker expire ou o sinal seja abortado durante o despacho ou chamada de sessão (`params.signal?.aborted`), o erro `FENCING_IN_FLIGHT_ABORT` é relançado imediatamente para garantir integridade e contenção de zumbis.
   - **Classificação Determinística de Erros HTTP:**
     - *Transient:* HTTP `429` (com parsing do header `Retry-After`), HTTP `502`, `503`, `504` (reinicialização ou proxy temporário).
     - *Permanent:* HTTP `404` (`SESSION_NOT_FOUND`), HTTP `4xx` em geral, ausência de API key (`API_KEY_REQUIRED`), violação de SSRF (`SSRF_VIOLATION`), formato de QR incompatível (`WAHA_UNSUPPORTED_QR_FORMAT`).
     - *Ambiguous:* HTTP `408` (Request Timeout), HTTP `425` (Too Early), HTTP 200 OK sem ID (`EMPTY_MESSAGE_ID`), timeout de rede.

2. **Normalizador Canônico WAHA (`WahaWebhookNormalizer`):**
   - **Eventos de Ciclo de Vida de Sessão (`session.status`, `session.qr`, `session.auth_failure`):**
     - Mapeia `WORKING`, `CONNECTED`, `ONLINE` para `eventType: "connected"`.
     - Mapeia `STOPPED`, `DISCONNECTED`, `FAILED`, `OFFLINE` para `eventType: "disconnected"`.
     - Mapeia `SCAN_QR_CODE` para `eventType: "qr_received"`.
     - Processa evento `session.qr` extraindo a string de QR code para `details.qr` como `eventType: "qr_received"`.
     - Processa `session.auth_failure` / `session.unpaired` mapeando para `eventType: "auth_failure"`.
   - **Detecção Precisa de Tipos de Mídia Inbound:** Mensagens com `hasMedia: true` passam por `detectMediaType(payload.mediaUrl)` para classificar confiavelmente em `image`, `video`, `audio` ou `document` (evitando suposição ingênua de que toda mídia é imagem).
   - **Normalização de Confirmações de Entrega (ACKs):**
     - `ack: 1` -> `sent`
     - `ack: 2` -> `delivered`
     - `ack: 3` -> `read`
     - `ack < 0` -> `failed`
     - Geração de `externalEventId` versionado: `v1:waha:${externalMessageId}:${ackValue}:${epochSec}`.

3. **Orquestração Hermética no `docker-compose.yml`:**
   - Adição do serviço `waha` sob `profiles: ["waha"]`, permitindo inicialização sob demanda (`docker compose --profile waha up`) sem sobrecarregar ou interferir na suíte de testes herméticos e no pipeline padrão de CI.

---

## Fora do escopo

- Configuração de multi-instâncias dinâmicas e balanceamento de carga dual-engine (coberto no pacote subsequente `CH-10`);
- Envio transacional unificado a partir da tabela `outbox` do banco (coberto no `CH-11`).

---

## Arquivos sob ownership e Proveniência (Integration Checkpoint IC-01)

O código deste pacote foi consolidado no **Integration Checkpoint IC-01** (`9577e17b5508efe671d195756a27b6948c908f5b`), documentado em `docs/project/INTEGRATION_CHECKPOINT_IC-01.md` e manifesto `docs/project/IC-01-MANIFEST.json`.

### Escopo Estável do Digest Criptográfico (`scoped-digest-v1`)

O digest executável do CH-09 incide estritamente sobre os **6 arquivos funcionais** de implementação, suítes de teste e orquestração de infraestrutura:

1. `packages/application/src/channels/adapters/waha.adapter.ts` (métodos de sessão startSession, stopSession, getSession, getQrCode com single-read e tipagem estrita, roteamento de mídias para endpoints dedicados, SSRF guard perimétrico e classificação determinística de erros)
2. `packages/application/src/channels/normalizers/waha-normalizer.ts` (normalização de ciclo de vida de sessão, detecção precisa de mídias inbound e tratamento de ACKs incluindo falhas negativas)
3. `packages/application/src/channels/fixtures/waha-fixtures.ts` (fixtures autênticas para áudio, vídeo, documento, ACK com falha, status de sessão, QR code e auth_failure)
4. `packages/application/src/__tests__/channel-adapters.test.ts` (testes de startSession, stopSession, getSession, getQrCode em múltiplos formatos, limite de payload, single body read, abort em voo e erros HTTP)
5. `packages/application/src/__tests__/channel-gateway.test.ts` (testes de ciclo de vida de sessão, mídias inbound tipadas e ACKs negativos)
6. `docker-compose.yml` (definição do serviço waha sob profiles: ["waha"])

- **Fórmula Canônica de Composição:** `<path>:<sha256>\n` em codificação UTF-8 sobre a lista ordenada estável.
- **Digest Composto Canônico:** `f1227d2ae0015ced5e9a9af3a18abe7af5fccd9d1720bc1cc34bbb336fb262e5` (validado e verificado automaticamente pelo script `scripts/verify-evidence-digests.ts` no Gate 6).

### Arquivos de Governança Documental

Os seguintes arquivos são artefatos de governança e rastreabilidade, versionados e protegidos pelo histórico do Git, permanecendo fora do cálculo do digest composto para evitar dependência circular autorreferente:

7. `docs/work-packages/CH-09-WAHA.md` (este documento de especificação)
8. `docs/work-packages/CH-09-EVIDENCE.json` (manifesto estruturado de evidência e hashes)

---

## Critérios de Aceite Homologados

- **AC-CH09-001 (PASS):** `WahaAdapter` executa `startSession`, `stopSession`, `getSession` e `getQrCode` consumindo segredos estritamente dentro do escopo isolado de `ISigningSecretResolver`, com leitura única do body da resposta, suporte a JSON/texto/SVG/imagens, teto de 512KB e fail-closed sem API key.
- **AC-CH09-002 (PASS):** `WahaAdapter` roteia mídias para os endpoints dedicados `/api/sendImage`, `/api/sendVideo`, `/api/sendVoice` e `/api/sendFile`, com validação defensiva perimétrica contra SSRF na URL base e nos URLs de mídia.
- **AC-CH09-003 (PASS):** `WahaAdapter` trata aborto em voo (`params.signal?.aborted`) relançando `FENCING_IN_FLIGHT_ABORT` e classifica deterministamente códigos HTTP 404, 429 (com Retry-After), 502/503/504 e 408/425/EMPTY_MESSAGE_ID.
- **AC-CH09-004 (PASS):** `WahaWebhookNormalizer` normaliza eventos de ciclo de vida (`session.status`, `session.qr`, `session.auth_failure`) gerando eventos canônicos do tipo `lifecycle` (`connected`, `disconnected`, `qr_received`, `auth_failure`).
- **AC-CH09-005 (PASS):** `WahaWebhookNormalizer` detecta tipos de mídia inbound (`image`, `video`, `audio`, `document`) e normaliza ACKs negativos (`ack: -1`) como `failed`.
- **AC-CH09-006 (PASS):** Serviço `waha` adicionado ao `docker-compose.yml` sob `profiles: ["waha"]`, preservando a hermeticidade da base de CI.
- **AC-CH09-007 (PASS):** 110/110 asserções em testes de adaptadores (59 testes) e gateway de canal (51 testes) aprovadas; 27/27 suítes do monorepo (404 asserções) e todos os 6 gates de CI (`pnpm ci:gate`) homologados.

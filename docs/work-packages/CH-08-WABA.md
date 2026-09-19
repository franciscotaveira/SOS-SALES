# CH-08 — WABA Operacional

> Nome do arquivo: `CH-08-WABA.md`  
> Estado: `ACCEPTED` — Concluído e homologado em 19 de setembro de 2026.

---

## Identidade

- **Parent objective:** Programa SOS Sales V3 — Motor de Comunicação (Fase CH)
- **Estado:** `ACCEPTED`
- **Owner:** Gemini 3.8 (Executor Principal)
- **Reviewer:** Agente SRE & Security Independente
- **Dependências:** `CH-00` (Modelos Mínimos), `CH-01` (RLS Fail-Closed), `CH-02` (Fencing Concorrente), `CH-03` (Reconciliação e Resiliência), `CH-04` (Ingress Seguro), `CH-05` (Rate Limiting Distribuído), `CH-06` (Keyring E2E), `CH-07` (SSRF Guard & Mídia Segura)
- **ADRs Vinculadas:** ADR-002 (Auth Strategy & Tenancy), ADR-005 (Channel Gateway & Inbox/Outbox)
- **Roadmap Gate:** `| CH-08 | WABA operacional | CH-02/06/07 | texto, mídia, template, janela e status |`
- **Risco Mitigado:** `R-004` (Descompasso de políticas da Meta, violação de janela 24h, SSRF em mídias de template, perda de status de entrega e falha em resolução de CDN)

---

## Objetivo único

Implementar e homologar a camada operacional completa para o canal **WhatsApp Business Platform / Meta Cloud API (WABA)**, garantindo conformidade rigorosa com as políticas de atendimento ao cliente da Meta (janela de 24 horas), proteção perimetral contra SSRF em mensagens de mídia e cabeçalhos de template, resolução segura de CDN para mídias inbound (`getMediaUrl`), suporte a mensagens interativas e classificação determinística de erros da Graph API v21.0:

1. **Adaptador Operacional Meta WABA (`MetaWabaAdapter`):**
   - **Enforçamento da Janela de 24 Horas:** Mensagens de texto livre (`free-form`) exigem categoricamente que `lastInboundMessageAt` esteja presente e tenha ocorrido há no máximo 24 horas (`Date.now() - lastInboundMessageAt <= 24h`). Caso a janela esteja expirada ou seja desconhecida (`null`/ausente), a mensagem é rejeitada com categoria `permanent` e erro `OUTSIDE_24H_WINDOW_ERROR` antes de qualquer despacho de rede externo, exigindo o uso de um template aprovado.
   - **Despacho de Templates Aprovados:** Permite envio fora da janela de 24h com especificação de linguagem (`language.code`) e componentes (`header`, `body`, `button`).
   - **Validação Defensiva SSRF em Templates:** Todo parâmetro de mídia em componentes de cabeçalho de template (`header` com links de `image`, `video` ou `document`) é inspecionado com `validateMediaUrl` antes do envio, bloqueando tentativas de SSRF indireto contra cloud metadata ou redes privadas.
   - **Despacho de Mídia com Extração de Filename:** Suporte a tipos de mídia `image`, `audio`, `video` e `document`. Para documentos, extrai automaticamente o `filename` original a partir da URL (ignorando query strings) e o transmite explicitamente no payload da Meta (`document.filename`). Para áudio, suprime legendas (`caption`) conforme exigência da Meta.
   - **Resolução Segura de Mídia Inbound (`getMediaUrl` e `getMediaMetadata`):** Como os webhooks da Meta fornecem apenas o identificador opaco `mediaId`, o adaptador implementa a resolução autenticada `GET /v21.0/${mediaId}` contra o endpoint Graph API, retornando a URL temporária de download no CDN do Facebook (`lookaside.fbsbx.com`) com metadados de tamanho (`file_size`), hash SHA-256 e MIME type. As credenciais (`access_token`) são acessadas estritamente dentro do callback seguro de `ISigningSecretResolver`, impedindo vazamento de tokens.
   - **Exigência Estrita de `phone_number_id` Numérico:** Validação regex `^\d+$`, rejeitando terminantemente valores vazios ou o fallback proibido `"me"`.
   - **Fencing In-Flight Abort:** Caso a lease expire durante o despacho externo e o `params.signal?.aborted` seja acionado pelo heartbeat do worker, relança `FENCING_IN_FLIGHT_ABORT` garantindo contenção imediata e evitando estados zumbis.
   - **Classificação Determinística de Erros:**
     - *Transient:* HTTP `429` e código Meta `130429` (Rate limit com parsing de header `Retry-After`), HTTP `5xx` (500, 502, 503, 504).
     - *Permanent:* `131026` (Mensagem não entregue / usuário inválido), `131047` (Janela de 24h expirada na Meta), `131051` (Tipo não suportado), `132000` (Template inexistente), `132001` (Incompatibilidade de parâmetros de template), `190` (Token inválido/expirado), `100` (Parâmetro inválido), `400`, `401`, `403`, `404`.
     - *Ambiguous:* HTTP `408` (Request Timeout), HTTP `425` (Too Early), HTTP 200 OK sem ID no corpo (`EMPTY_MESSAGE_ID`), timeout de rede, `ECONNRESET`.

2. **Normalizador Canônico WABA (`WabaWebhookNormalizer`):**
   - **Extração de Metadados de Mídia:** Mensagens inbound de `image`, `audio`, `video` e `document` extraem `mediaId`, `mimeType`, `fileSha256` e `filename` para o campo `event.metadata`.
   - **Normalização de Mensagens Interativas (`interactive`):** Respostas de botões (`button_reply`) e de listas (`list_reply`) são normalizadas para `contentType: "interactive"`, mapeando o título selecionado para `body` e preservando `buttonId` ou `listRowId` em `metadata`.
   - **Deduplicação Determinística com Formato Versionado:** Eventos de status de entrega recebem `externalEventId = "v1:waba:${externalMessageId}:${status}:${epochSec}"`.
   - **Zero Descarte de Eventos:** Varredura completa de todas as entradas (`entry`), alterações (`changes`), mensagens e status recebidos no lote.

---

## Fora do escopo

- Transmissão via protocolo WAHA / Web-Sockets (coberto no pacote irmão `CH-09`);
- Orquestração de contêineres Docker simultâneos (dual-engine, coberto no `CH-10`);
- Envio transacional unificado a partir da tabela `outbox` do banco (coberto no `CH-11`).

---

## Arquivos sob ownership

1. `packages/application/src/channels/adapters/meta-waba.adapter.ts` (implementação de getMediaUrl, validação de mídia em templates, extração de filename e classificação de erros)
2. `packages/application/src/channels/normalizers/waba-normalizer.ts` (extração de metadados de mídia e normalização de mensagens interativas)
3. `packages/application/src/channels/fixtures/waba-fixtures.ts` (fixtures autênticas de áudio, vídeo, documento, button_reply e list_reply)
4. `packages/application/src/channels/security/ssrf-guard.ts` (suporte a detecção de mídia com query parameters em detectMediaType)
5. `packages/application/src/__tests__/channel-adapters.test.ts` (testes de getMediaUrl, template SSRF, document filename e classificação de erros)
6. `packages/application/src/__tests__/channel-gateway.test.ts` (testes de normalização de mídia com metadados e mensagens interativas)
7. `docs/work-packages/CH-08-WABA.md` (especificação canônica deste pacote)
8. `docs/work-packages/CH-08-EVIDENCE.json` (manifesto canônico de evidência `EV-CH08-001`)

---

## Fatos confirmados

- `[KNOWN]` A Meta Cloud API v21.0 não retorna a URL do arquivo de mídia no payload do webhook; apenas disponibiliza o `mediaId`, exigindo uma requisição GET autenticada subsequente.
- `[KNOWN]` O envio de documentos sem a propriedade `filename` faz com que o cliente WhatsApp exiba nomes genéricos (ex: `document.pdf`), prejudicando a experiência do lead.
- `[KNOWN]` Respostas a botões interativos (`button_reply`) chegam sob o tipo `interactive` com payload aninhado; expor o título legível no `body` simplifica a leitura por agentes e CRM preservando o `buttonId` em `metadata`.

---

## Invariantes

1. **Strict 24h Window Enforcement:** Textos livres não podem ser enviados para clientes fora da janela de 24 horas, falhando com `OUTSIDE_24H_WINDOW_ERROR` antes da chamada externa.
2. **Zero Secret Leakage in Media Resolution:** O método `getMediaUrl` e `getMediaMetadata` nunca devem retornar ou registrar em log o token de acesso Bearer.
3. **No Unvalidated Media URLs:** Nenhuma URL de mídia fornecida em parâmetros de template pode escapar à validação do SSRF Guard.
4. **Deterministic Delivery Status Event IDs:** Todo status de entrega Meta deve gerar um `externalEventId` unívoco e versionado no formato `v1:waba:${externalMessageId}:${status}:${epochSec}`.

---

## Critérios de aceitação

- [x] **AC-CH08-001:** `MetaWabaAdapter.sendMessage` rejeita textos livres fora da janela de 24 horas (`OUTSIDE_24H_WINDOW_ERROR`) e permite templates aprovados.
- [x] **AC-CH08-002:** `MetaWabaAdapter` extrai e transmite `filename` para mensagens de documento e valida componentes de mídia em cabeçalhos de templates contra SSRF.
- [x] **AC-CH08-003:** `MetaWabaAdapter.getMediaUrl` e `getMediaMetadata` resolvem `mediaId` em URL do CDN da Meta através do `ISigningSecretResolver` sem vazar credenciais.
- [x] **AC-CH08-004:** `MetaWabaAdapter` classifica deterministamente erros transitórios (429/130429 com `Retry-After`, 5xx), permanentes (131026, 132000, 190) e ambíguos (408, EMPTY_MESSAGE_ID, timeouts), relançando `FENCING_IN_FLIGHT_ABORT` em caso de aborto.
- [x] **AC-CH08-005:** `WabaWebhookNormalizer` extrai metadados completos de mídia (`mediaId`, `mimeType`, `fileSha256`, `filename`) e normaliza mensagens interativas (`button_reply`, `list_reply`).
- [x] **AC-CH08-006:** Suítes `channel-adapters.test.ts` (30 testes), `channel-gateway.test.ts` (40 testes) e todos os 6 gates de CI (`pnpm ci:gate`) passam com 100% de sucesso.

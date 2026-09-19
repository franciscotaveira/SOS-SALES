# CH-06 — Keyring E2E e Rotatividade de Chaves Mestras

> Nome do arquivo: `CH-06-KEYRING-E2E.md`  
> Estado: `ACCEPTED` — Concluído e homologado em 19 de setembro de 2026.

---

## Identidade

- **Parent objective:** Programa SOS Sales V3 — Motor de Comunicação (Fase CH)
- **Estado:** `ACCEPTED`
- **Owner:** Gemini 3.8 (Executor Principal)
- **Reviewer:** Agente SRE & Security Independente
- **Dependências:** `CH-00` (Modelos Mínimos), `CH-01` (RLS Fail-Closed), `CH-02` (Fencing Concorrente), `CH-03` (Reconciliação e Resiliência), `CH-04` (Ingress Seguro), `CH-05` (Rate Limiting Distribuído)
- **ADRs Vinculadas:** ADR-002 (Auth Strategy & Tenancy), ADR-005 (Channel Gateway & Inbox/Outbox)
- **Roadmap Gate:** `| CH-06 | keyring E2E | CH-04 | item v1 processado após ativar v2 |`

---

## Objetivo único

Implementar e validar de ponta a ponta o gerenciamento de keyring criptográfico versionado (`key_version`), permitindo rotatividade de chaves mestras com zero downtime entre ingestão de webhooks, persistência em banco e processamento assíncrono pelo worker:

1. **Keyring Criptográfico Versionado (`Keyring = Record<number, string>`):**
   - Suporte a múltiplas chaves mestras de 256 bits (hex de 64 caracteres) indexadas por versão numérica.
   - Normalização bidirecional e transparente de formatos de versão numéricos e strings (`1`, `"1"`, `"v1"`, `"v2"`).
   - Resolução determinística da versão ativa (`getActiveKeyVersion`), selecionando automaticamente a versão de maior valor ordinal na ausência de override explícito.
   - Parser estrito de variáveis de ambiente (`parseKeyringFromEnv`), reconhecendo `MCT_KEYRING_JSON`, `KEYRING_JSON`, `MCT_ACTIVE_KEY_VERSION` e `ACTIVE_KEY_VERSION`.
   - Limpeza e zeramento garantido de buffers sensíveis na memória (`keyBuffer.fill(0)`, `decryptedBuffer.fill(0)`) em blocos `finally`.

2. **Ingress com Criptografia de Versão Ativa:**
   - As rotas de webhook do Fastify (`webhook.routes.ts`) e o construtor `buildApp` aceitam `keyring?: Keyring` e `activeKeyVersion?: number`.
   - Criptografa o payload bruto do webhook com AES-256-GCM + AAD usando a chave ativa do keyring.
   - Persiste o registro em `channel_webhook_inbox` com a coluna `key_version` exatamente vinculada à versão utilizada para cifrar o registro.

3. **Resolução de Segredos e Decriptação com Fallback de Keyring:**
   - O resolvedor de credenciais `DatabaseSigningSecretResolver` suporta `keyring?: Keyring` além de chave única, permitindo validar assinaturas de webhooks cujas credenciais foram cifradas com versões legadas ou ativas.
   - A função canônica `decryptPayload` adota estratégia de alta performance: tenta a chave ativa primeiro ($O(1)$) e, mediante falha de autenticação do tag GCM, percorre as chaves remanescentes do keyring em ordem decrescente quando nenhuma versão específica foi solicitada.

4. **Processamento Heterogêneo em Lote no Worker:**
   - O `InboxProcessor` e o `WorkerRuntime` recebem `keyring?: Keyring`.
   - O worker reivindica lotes que podem conter simultaneamente itens históricos (`key_version = 1`) e itens novos (`key_version = 2`), decriptando cada payload com a sua respectiva chave de versão sem interrupção de serviço.

5. **Falha Fechada Segura para Chaves Desconhecidas:**
   - Itens com versões de chave não configuradas no keyring do worker (e.g. versão 99) disparam exceção identificada `UNKNOWN_KEY_VERSION`.
   - O processador captura a falha, programa o agendamento de retentativa governado por `QueueRetryPolicy`, registra log de erro estruturado e não causa crash no loop do runtime.

---

## Fora do escopo

- Mitigação de SSRF em downloads de mídia remota (escopo estrito de `CH-07`);
- Rotação de chaves assimétricas de provedores externos (Meta / WAHA) que dependem de painéis de terceiros;
- Re-encriptação massiva em segundo plano de tabelas históricas completas (escopo de batch migration tooling).

---

## Arquivos sob ownership

1. `packages/database/src/infrastructure/crypto-payload.ts` (implementação de `Keyring`, `normalizeKeyVersion`, `getActiveKeyVersion`, `parseKeyringFromEnv`, `resolveKeyFromKeyring`, zeramento de buffers e `decryptPayload` com fallback)
2. `packages/database/src/infrastructure/database-signing-secret-resolver.ts` (suporte a `keyring` na resolução e decriptação de credenciais)
3. `packages/database/src/__tests__/crypto-keyring.test.ts` (13 testes unitários cobrindo todas as operações de keyring e normalização)
4. `apps/api/src/routes/webhook.routes.ts` & `apps/api/src/index.ts` (propagação de opções de `keyring` e `activeKeyVersion`, criptografia no ingress)
5. `apps/api/src/__tests__/webhook-ingress.test.ts` (teste de integração de ingestão com versão ativa de keyring)
6. `apps/worker/src/processors/inbox-processor.ts` & `apps/worker/src/index.ts` (processamento de lotes multi-versão e fallback seguro para env)
7. `apps/worker/src/__tests__/keyring-e2e-rotation.test.ts` (suíte E2E de rotatividade: itens v1, v2, lote misto e falha fechada para versão 99)
8. `docs/work-packages/CH-06-KEYRING-E2E.md` (especificação canônica deste pacote)
9. `docs/work-packages/CH-06-EVIDENCE.json` (manifesto canônico de evidência `EV-CH06-001`)

---

## Fatos confirmados

- `[KNOWN]` Bancos de produção acumulam registros cifrados ao longo do tempo sob diferentes chaves mestras; descartar uma chave antiga antes da migração total causa corrupção lógica de dados.
- `[KNOWN]` `provider_credentials` armazena `key_version` como `varchar(20)` (default `'v1'`), enquanto `channel_webhook_inbox` armazena como `integer` (default `1`); a normalização transparente em `normalizeKeyVersion` unifica ambos.
- `[KNOWN]` A verificação de integridade AES-256-GCM falha imediatamente em caso de chave incorreta (tag de autenticação inválido), permitindo fallback determinístico e seguro sem risco de aceitação de texto cifrado adulterado.

---

## Invariantes

1. **Zero Downtime Key Rotation:** Ativar uma chave versão 2 no ingress ou no worker nunca impede a decriptação e o processamento de mensagens cifradas sob a versão 1.
2. **Buffer Zeroing:** Todo buffer que armazena material criptográfico em texto claro é zerado com `.fill(0)` em bloco `finally`.
3. **Fail-Closed on Unknown Key:** Chaves ausentes no keyring jamais tentam decriptação cega com chaves inadequadas e falham de forma rastreável com log estruturado.
4. **Explicit Active Version Tagging:** Todo item gravado no inbox contém explicitamente a versão da chave utilizada para gerá-lo.

---

## Critérios de aceitação

- [x] **AC-CH06-001:** `crypto-payload.ts` define `Keyring`, `normalizeKeyVersion`, `getActiveKeyVersion`, `parseKeyringFromEnv` e garante zeramento de buffers em `finally`.
- [x] **AC-CH06-002:** `buildApp` e rotas de webhook utilizam a versão ativa do keyring para cifrar e persistir payloads em `channel_webhook_inbox` com `key_version` correto.
- [x] **AC-CH06-003:** `DatabaseSigningSecretResolver` resolve credenciais com suporte a keyring e fallback seguro de chaves.
- [x] **AC-CH06-004:** O worker consome com sucesso registros com `key_version = 1` e `key_version = 2` no mesmo lote sem interrupção.
- [x] **AC-CH06-005:** Itens com `key_version` desconhecido (e.g. 99) falham de forma controlada sem derrubar o runtime do worker.
- [x] **AC-CH06-006:** Suítes `crypto-keyring.test.ts`, `keyring-e2e-rotation.test.ts` e todas as 27 suítes do monorepo (332 asserções) 100% aprovadas.

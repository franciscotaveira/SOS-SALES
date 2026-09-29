# Prompt — Correcção do Meta CAPI Dispatcher (ChatSales V3)

## Papel
És um engenheiro sénior a trabalhar no monorepo ChatSales / SOS Sales V3 (pnpm + turbo; `apps/api` Fastify, `apps/worker` BullMQ/outbox, `packages/*`). Lê `CODEBASE.md` antes de começar, sobretudo o §3.7 (erros sanitizados e em allowlist).

## Objectivo
Pôr o envio de conversões para a Meta Conversions API a funcionar correctamente para eventos com origem no WhatsApp (CTWA). Para isso, corrigir o payload, isolar o `test_event_code` ao modo lab e deixar de persistir mensagens de erro em bruto.

Ficheiro principal: `apps/worker/src/processors/capi-dispatcher.ts`
Testes: `apps/worker/src/__tests__/capi-dispatcher.test.ts`

## Problemas a corrigir

1. **`action_source` errado** (linha ~83). Hoje está `"chat"`. Para eventos de WhatsApp Business, a Meta espera:
   - `action_source: "business_messaging"`
   - `messaging_channel: "whatsapp"`
   - `user_data.whatsapp_business_account_id` com o WABA ID do canal do workspace.

   Resolve o WABA ID a partir do canal WABA do workspace (dentro de `withWorkerTransaction`, com RLS), usando o mesmo padrão já usado para as credenciais `meta_capi`. Se o WABA ID não existir, o comportamento tem de ser **fail-closed**: marcar FAILED com o código canónico (ver ponto 3) e não enviar. Nunca fazer fallback WAHA↔WABA.

   Confirma os nomes exactos dos campos na documentação oficial da Meta (CAPI for Business Messaging) antes de os implementar.

2. **`test_event_code` sem guard** (linha ~94). Hoje é enviado sempre que `META_CAPI_TEST_EVENT_CODE` existe. Só pode ser incluído quando `isLabMode` é verdadeiro (a mesma condição da linha ~189: `ENABLE_LAB_SYNTHETIC === "true"` ou `NODE_ENV === "test"`).
   - Calcula `isLabMode` uma vez, antes de montar o payload, e reutiliza-o.
   - Em produção, o campo tem de estar ausente do JSON, não apenas `undefined` com um valor preenchido.

3. **Erros em bruto persistidos** (catch nas linhas ~284-309). Hoje `err.message` vai para `markConversionEventResult({ error })` e para o valor de retorno. Isto viola o §3.7.
   - Cria um mapeamento para códigos canónicos em allowlist, por exemplo: `CAPI_CREDENTIALS_MISSING`, `CAPI_WABA_ID_MISSING`, `CAPI_HTTP_4XX`, `CAPI_HTTP_5XX`, `CAPI_TIMEOUT`, `CAPI_ABORTED`, `CAPI_UNKNOWN`.
   - Persiste e devolve apenas o código.
   - O detalhe pode ir para o `logger`, mas sem token, sem `access_token` na URL e sem telefone. Verifica se já existe um helper de sanitização no repo (`grep -rn "sanitiz" apps packages`) e reutiliza-o.
   - Não engulas o erro secundário em silêncio: faz `logger.warn` com o código.

4. **Receipt incompleto**. Persiste também `events_received` e `messages` da resposta da Meta no `receipt` do evento ACCEPTED. Se `events_received` for 0 ou estiver ausente, isso é FAILED (`CAPI_NOT_RECEIVED`), não ACCEPTED.

5. **Typecheck**. `strictTenantIsolation` (linha 34) está declarado e nunca é lido (TS6133). Usa-o onde fizer sentido (bloquear o fallback global de credenciais) ou remove-o. Não o silencies com `// @ts-ignore`.

## Restrições (inegociáveis)
- **Nenhum envio real.** Não chames `graph.facebook.com` nem envies mensagens WhatsApp. Os testes usam `endpointUrl` mock ou fetch stub.
- Não leias nem alteres ficheiros `.env*`. Não introduzas segredos em código.
- Mantém fail-closed, o isolamento por tenant (RLS via `withWorkerTransaction`) e o lease/fencing (`leaseToken`) intactos.
- Não toques em V2/VPS, migrations já aplicadas nem outros processors.
- Usa padrões imutáveis e mantém funções com menos de 50 linhas. Se `dispatchItem` crescer, extrai helpers (`buildPayload`, `mapCapiError`).

## Processo
1. Primeiro TDD: escreve os testes em `capi-dispatcher.test.ts` e confirma que falham.
2. Implementa.
3. Corre, a partir da raiz:
   ```
   pnpm turbo run build --filter='./packages/*'
   cd apps/worker && npx tsc --noEmit -p . && pnpm vitest run
   ```

## Critérios de aceitação
- [ ] O payload tem `action_source: "business_messaging"`, `messaging_channel: "whatsapp"` e `whatsapp_business_account_id` (teste).
- [ ] Sem WABA ID: FAILED com `CAPI_WABA_ID_MISSING` e zero chamadas HTTP (teste).
- [ ] `test_event_code` está presente só em lab mode e ausente fora dele (dois testes).
- [ ] Um erro com mensagem sensível (ex.: contém `access_token=abc`) resulta em `error` persistido igual a um código da allowlist, sem a mensagem (teste).
- [ ] `events_received: 0` resulta em FAILED `CAPI_NOT_RECEIVED`. Um sucesso guarda `events_received`, `messages` e `fbtrace_id` (testes).
- [ ] `tsc --noEmit` do worker sem erros. Todos os testes do worker verdes.
- [ ] O diff fica limitado ao dispatcher, aos testes e, se necessário, a um helper de erros novo.

## Entrega
Um resumo curto do que mudou, a saída do `tsc` e do `vitest`, e quaisquer dúvidas sobre os campos da Meta que não tenhas conseguido confirmar na documentação. Não faças commit sem aprovação.

## Contexto (fora do âmbito deste prompt, para não duplicar)
- O `waba-normalizer` não faz parse de `referral`/`ctwa_clid`, por isso `user_data.ctwaClid` chega vazio. É a correcção seguinte.
- `packages/domain/src/attribution.ts` (`resolveAttribution`) existe mas não é usado.
- O CAPI só é enfileirado em `won` (`packages/database/src/commercial.ts:277,313`). Não há `Lead` nem `QualifiedLead`.

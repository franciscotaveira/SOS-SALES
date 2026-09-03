# Auditoria Meta Business Agent, WABA, WAHA e IA — 2026-09-02

## Escopo e limite desta rodada

Auditoria executada no candidato isolado `/private/tmp/sos-sales-agent-routing-2`, branch `codex/definitive-ui-back-audit`, base `75f66d78a8ff5953cfe06f2ba8813e3d93a2f9fe`.

O checkout principal e a produção não foram alterados. Nenhuma migration foi aplicada no Supabase e nenhum arquivo foi copiado para o VPS nesta rodada. O VPS foi consultado somente em leitura para separar o estado executado do candidato.

As conclusões abaixo distinguem evidência de código/teste local de prova operacional:

- **[KNOWN]** comprovado por código, teste unitário ou build executado agora.
- **[INFERRED]** comportamento deduzido do fluxo, ainda sem tráfego real.
- **[UNVERIFIED]** depende de credenciais, migration, webhook ou provedor externo.

## Decisão de ownership automático

Uma conversa tem apenas um responsável automático no backend:

| Situação | Responsável | Evidência necessária |
| --- | --- | --- |
| `manual` ou takeover humano | equipe | pausa/handoff persistido |
| `meta_business_agent` | Meta | canal Meta Cloud conectado, elegibilidade `ELIGIBLE` verificada nas últimas 24h, `agent_id`, ativação `READY` |
| `auto_fallback` + Meta pronta | Meta | os mesmos quatro sinais, com elegibilidade ainda fresca |
| `auto_fallback` sem prova Meta, antes de a conversa ser entregue à Meta | SOS Sales | runtime publicado e provedor NIM configurado |
| `sos_sales` | SOS Sales | runtime publicado e jornada habilitada |
| canal WAHA | WAHA para sincronização/atendimento operacional | sessão e canal WAHA explícitos |

**[KNOWN]** `NOT_STARTED` e `PENDING` não autorizam o agente Meta a responder clientes. O onboarding `201/agent_id` é tratado como preparação assíncrona, não como prontidão. Mesmo `READY` deixa de ser prova após 24 horas sem uma nova verificação de elegibilidade. Se a conversa já estiver com owner Meta, o SOS Sales não troca de provedor silenciosamente em um estado expirado/`UNKNOWN`; é necessário um `take` confirmado pelo endpoint de thread control. O fallback automático só assume quando a jornada ainda está com owner SOS Sales ou quando a Meta devolveu `INELIGIBLE` de forma comprovada.

## Correções aplicadas no candidato

### Meta Business Agent Platform

- Elegibilidade é persistida no backend e erros do provedor ficam como `UNKNOWN`, nunca como elegibilidade negativa ou positiva inventada.
- Onboarding faz nova checagem server-side de elegibilidade imediatamente antes de criar a sessão assíncrona.
- Teste oficial aceita somente `PENDING`/`READY`; resposta vazia ou `no_response_reason` marca ativação como `FAILED`.
- `READY` só é persistido após resposta utilizável do endpoint oficial `agent_test`.
- Thread control valida jornada, canal `meta_cloud` conectado e destinatário igual ao telefone da conversa antes de chamar a Meta.
- Transferência local só é persistida depois da confirmação da Meta; falha de sincronização local vira erro operacional explícito.
- O cliente usa `X-API-Version: 2.0.0` para eligibility/onboarding/test e `1.0.0` para thread control, conforme os contratos fornecidos.

### WABA / WhatsApp Cloud API

- Seleção de canal exige exatamente uma conexão Meta Cloud `CONNECTED`; nenhum número é escolhido arbitrariamente.
- Credenciais de envio são lidas somente do segredo associado à conexão e ao workspace.
- Envio de texto e Flow exigem `message_id` retornado pela Meta e persistem a mensagem somente depois da aceitação do provedor.
- Falha ambígua de envio pausa a jornada e abre revisão humana; não há retry cego que possa duplicar mensagem.
- Jornadas WABA reutilizam apenas uma jornada `OPEN` vinculada ao mesmo canal; conversas fechadas ou de outro canal não recebem mensagens por engano.
- Índice de identificador Meta exclui placeholders desconectados; isso evita que uma linha `pending` bloqueie novas contas.
- Respostas Privadas agora reservam o `commentId` antes do envio e persistem `PENDING`, `SENT`, `FAILED` ou `UNKNOWN` em `meta_private_reply_dispatches`; retry concorrente é bloqueado e aceitação sem persistência vira reconciliação explícita.
- Desfecho `WON` agora faz claim atômico `PENDING → QUEUED` antes do Purchase CAPI e grava `DISPATCHED`, `FAILED` ou `NOT_APPLICABLE`, evitando novo disparo para o mesmo outcome em retries HTTP.
- O contrato de inteligência foi fechado com a migration `20260902130000_workspace_intelligence_contract.sql`: bundles e documentos agora têm tabelas, FK de workspace, RLS e grants explícitos; antes as telas apontavam para tabelas inexistentes.
- O `ReceptionistAgent` agora lê o bundle publicado e documentos prontos, aplica perfil, horário, catálogo, persona, guardrails, pagamentos e temperatura no prompt NIM, filtrando os textos sintéticos legados.
- O runtime de produção injeta o pool e o `ReceptionistAgent` deployment-owned no worker e no webhook WABA; o singleton ligado ao pool de desenvolvimento permanece apenas como fallback de desenvolvimento/teste.
- Upload de conhecimento no CRM deixou de fabricar “vetorização”: TXT/CSV são lidos e persistidos no backend; PDF/DOCX/XLSX são recusados até existir extrator real. O diagnóstico histórico usa contagens persistidas e não exibe números fixos.
- O Embedded Signup passou a usar o webhook global real (`/api/v1/channels/waba/webhook`), evita trocas duplicadas do popup e oferece configuração manual com validação Meta quando o fluxo incorporado não estiver disponível. O WABA ID não é mais salvo como `auto_detected` sem confirmação.
- Mutação de IA, bundles e documentos exige papel `owner` no guard de API; operadores e visualizadores recebem `403` antes de qualquer escrita.
- As credenciais Meta aceitam os aliases persistidos (`phoneNumberId`, `phone_number_id`, `wabaPhoneNumberId` e `accessToken`/`access_token`/`token`), sem escolher um segundo canal conectado por ordem arbitrária.
- O GET de inteligência agora devolve `schemaVersion`, `publishedAt` e `publishedBy`; o CRM consegue mostrar quando e por quem a configuração foi publicada, em vez de tratar qualquer JSON como estado ativo.
- O shell de produção expõe a área `IA & Conhecimento` somente com perfil, base de conhecimento, catálogo e diagnóstico persistido; simulador, especialistas e métricas de aprendizado sem contrato permanecem fora da navegação.

### IA própria / NVIDIA NIM

- NIM tem timeout finito e não troca silenciosamente de família de modelo em produção.
- O fallback rápido ficou restrito a ambientes não produtivos; produção tenta apenas o modelo configurado.
- Ausência de configuração publicada do workspace, pausa humana, owner Meta pronto ou erro do NIM bloqueia outbound autônomo.
- Prompt de preços não inventa valores quando não há preço publicado; o runtime carrega a configuração persistida do workspace.
- O Copilot usado no cockpit agora usa o mesmo NVIDIA NIM configurado para o runtime; OpenRouter ficou restrito às rotas diagnósticas explícitas e não é dependência silenciosa da operação.
- O Atlas de onboarding foi corrigido para chamar `/ai/test-nvidia`, eliminando a divergência entre o texto da UI e o provedor efetivamente usado. As rotas diagnósticas não aceitam `apiKey` ou `model` enviados pelo navegador quando `APP_ENV/NODE_ENV=production`.
- O analisador visual não transforma OCR em confirmação de pagamento: PIX retorna `verify_payment_manually`, remove `isPaymentValid`/preços estimados e preserva apenas campos legíveis. Preços de serviço continuam dependentes do catálogo publicado.

### WAHA

- O webhook legado `/api/v1/channels/waha/webhook` não aceita mais sessão ausente como `default`.
- O endpoint não cria canal WAHA fantasma ao receber evento; exige canal `CONNECTED` mapeado à sessão e rejeita mapeamento ambíguo.
- A sincronização grava `sessionName` no `public_config` do canal para que o próximo webhook seja determinístico.
- Quando a aplicação é composta com o runtime de produção, mensagens inbound passam pelo `InboundIngestionGateway` e pelo outbox/`WahaInboundWorker`; o mapa de replay em memória fica restrito ao fallback legado de teste. Mensagens outbound `fromMe` continuam no espelho direto para não desaparecerem do histórico do operador.
- IDs de mensagem são obrigatórios e usados como `message:<providerMessageId>`; retries são decididos pela unicidade no banco, não por marcar o evento antes da gravação.
- Grupos, status e feeds `@newsletter` são descartados antes de virarem contatos 1:1. Eventos de mídia sem objeto `media` preservam o tipo WAHA quando disponível.
- O outbound WAHA e o proxy de mídia exigem a sessão explícita; não existe mais fallback silencioso para `default`, e uma resposta 2xx sem `providerMessageId` fica ambígua para reconciliação.
- O receptor estrito HMAC `/webhooks/waha/:channelConnectionId` permanece disponível.
- A tela de Canais deixou de ler um campo inexistente (`sessionStatus`); agora mostra a sessão e o `status` realmente retornados pela API, sem declarar o WAHA desconectado por erro de mapeamento visual.
- A Central de Conversas não expõe `Anotações` nem `Torre TV` no modo API enquanto essas superfícies continuarem dependentes do modelo legado; o modo autenticado mostra apenas lista e funil persistidos. A origem do lead também não é rotulada como `Click WA` sem um fato de aquisição persistido.
- A resposta autônoma agora reserva a ação por `(workspace, conversation_message, message_kind)` antes do provedor. A transição para `SENT` grava o `provider_message_id` e o histórico na mesma função SQL; uma reserva `SENDING`/`UNKNOWN` bloqueia replay automático e abre reconciliação humana.

## Dados sintéticos e superfícies antigas

**[KNOWN]** Defaults sintéticos que poderiam aparecer na operação foram removidos ou bloqueados: KPIs financeiros, horas poupadas, nome de workspace inventado, sessão WAHA `default`, preços `R$ 59`, catálogo sem IDs reais, nome de página Messenger e status NLP/Private Reply “ativo” antes da consulta. O diagnóstico histórico e o upload de conhecimento também não fabricam mais sucesso ou volume.

Ainda existem superfícies legadas de demonstração no código, mas não devem ser tratadas como capacidade de produção:

- `src/components/intelligence/QaSimulatorView.tsx` contém fixtures de QA e deve permanecer isolado do modo API.
- `src/components/agenda/AgendaView.tsx`, `src/components/notes/NotesView.tsx`, `src/components/settings/ConnectionManager.tsx` e `src/components/settings/SettingsShell.tsx` possuem dados de demonstração para o modo legado.
- `src/components/cockpit/LiveDossier.tsx` (componente antigo) mantém estado local de notas; a tela live usa o contrato API.
- `src/components/cockpit/MemoryNotesPanel.tsx`, `src/services/businessIntelligenceService.ts` e `src/components/intelligence/BusinessIntelligence/KnowledgeBaseManager.tsx` continuam no modo legado com fixtures/localStorage; não são montados pelo cockpit/configurações API e não devem ser tratados como base de conhecimento publicada.
- `AdsAttributionManager`, `ApiWebhooksManager` e ping/testes locais são superfícies antigas e não constituem prova de integração externa.
- A elegibilidade Meta não é considerada prova quando o timestamp está ausente, inválido ou expirado; o operador precisa executar nova verificação antes de devolver a propriedade à Meta.

Não foram apagados sem uma decisão de produto, para evitar perder funções reais ou quebrar rotas históricas.

## Evidência executada

**[KNOWN]** No candidato, após as correções:

```text
APP_ENV=test npx vitest run tests/unit --no-file-parallelism --test-timeout=20000
38 arquivos, 247 testes aprovados

npm --prefix apps/api run build:prod
build TypeScript/bundle/DTS aprovado; release-manifest gerado

APP_ENV=production npm run build
Vite build aprovado (apenas warnings de CSS/chunk grande)

npx tsc --noEmit
TypeScript da API aprovado

`apps/api` não possui script `lint`; a ausência foi registrada como lacuna de tooling, não como sucesso de lint.

`node --check scripts/verify-production-schema-contract.mjs` e `bash -n scripts/*.sh`
aprovados. O novo gate é somente-leitura e verifica 14 tabelas, colunas críticas,
índices de unicidade e 12 funções SQL do runtime, sem depender do schema interno
`supabase_migrations`.

git diff --check
aprovado

bash scripts/preflight-production-deploy.sh
aprovado após compilar o frontend com a configuração pública confirmada no
bundle atual do VPS (`VITE_SOS_API_URL`, URL Supabase e chave `sb_publishable_…`).
O preflight não promove nem copia arquivos.
```

Os testes de integração que dependem de `127.0.0.1:55432` continuam indisponíveis porque o Docker/Lab local foi limpo. Isso não é prova de falha do código, mas também não permite declarar integração validada.

### Leitura operacional do VPS (2026-09-03)

**[KNOWN — somente leitura]** O processo em produção respondeu `health=200` e `ready=200`, com database, Redis, `waha-inbound-worker`, `outbound-worker` e `receptionist-worker` reportados como saudáveis. O commit executado ainda era `625f726d4894914703cdcb7b1c5a37df27707a84`; o candidato desta auditoria não foi promovido.

**[KNOWN — somente leitura]** A base de produção contém uma conexão WAHA `CONNECTED` no workspace SOS Sales e 4.513 mensagens WAHA, sendo 483 inbound nas últimas 48 horas. O tráfego recente inclui vários feeds `@newsletter` que a versão candidata passa a ignorar; isso explica poluição do histórico, não uma ausência total de sincronização.

**[KNOWN — somente leitura]** A conexão Meta Cloud da Haven está `CONNECTED`, com `phoneNumberId` e segredos associados, mas o bundle de agente do workspace está `runtime_enabled=false` e `autonomy_mode=copilot_supervised`. Não houve nova mensagem Meta registrada desde 2026-08-17 no snapshot consultado. Isso precisa ser tratado como configuração/prova de webhook pendente, não como sucesso do agente.

**[KNOWN — somente leitura, 2026-09-03]** O contrato estrutural candidato foi comparado
com o banco executado no VPS. A base ainda não possui as colunas de perfil/ownership
do agente, estado de ativação Meta, retry do outbound, tabelas de inteligência
publicada/private reply/insights e os índices de journeys por canal. As funções
`enqueue_receptionist_inbound` e `normalize_waha_inbound_message` têm a assinatura
esperada, mas `record_outbound_provider_failure` continua na assinatura antiga.
Esse resultado é um bloqueio de migration, não uma falha do código candidato.

## Gates restantes antes de produção

### P0 — obrigatórios

1. Aplicar e verificar no Supabase todas as migrations que ainda não estão no ledger remoto (a partir de `20260901120000`, incluindo as onze versões `20260901120000`–`20260903050000`). A última fecha a reserva durável de outbound do Receptionist. A promoção agora executa também `verify-production-schema-contract.mjs` contra o banco antes de trocar o link `current`.
2. Confirmar no VPS a versão efetivamente executada, o commit e o digest do bundle; o candidato ainda não foi deployado.
3. Confirmar `META_VERIFY_TOKEN`, `META_APP_SECRET`, um único canal Meta Cloud `CONNECTED`, `phoneNumberId` e `meta_bearer_token` válidos no mesmo workspace.
4. Rodar eligibility → onboarding → aguardar preparação → `agent_test` oficial com resposta não vazia, e reler `activation_status=READY` no backend.
5. Entregar uma mensagem real de teste para o número Haven e conferir: webhook recebido, contato/jornada/mensagem persistidos, resposta recebida no aparelho e status Meta correlacionado.
6. Conferir que o WABA webhook aponta para o endpoint ativo e que a assinatura HMAC usa o mesmo `META_APP_SECRET` no VPS.
7. Verificar o runtime factory de produção (`SOS_SALES_RUNTIME_FACTORY`) e os workers de inbound/outbound/receptionist no processo em execução.
8. Depois da promoção, entregar um evento inbound WAHA controlado e confirmar a sequência `inbound_channel_events → outbox → conversation_messages → receptionist-worker` no workspace correto, incluindo um retry do mesmo provider ID sem duplicação.

### P1 — necessários para declarar cobertura ampla

1. O `CapiDispatchWorker` existe, mas não é composto pelo `server.ts` padrão. O endpoint de outcome ainda faz dispatch direto fire-and-forget; escolher uma única arquitetura antes de habilitar CAPI em escala, para evitar duplicidade ou `PENDING` permanente.
2. O fluxo WAHA live persiste conversas e o candidato já possui adapter outbound WAHA explícito, mas isso ainda não foi provado no VPS atual (o schema e o release candidato não foram promovidos). Não habilitar “IA automática no WAHA” até executar o evento sintético controlado e confirmar a resposta no aparelho.
3. Homologar os endpoints de conhecimento/FAQs/arquivos/skills do Meta Business Agent antes de expô-los como configuração dentro do CRM; por enquanto a UI encaminha ao Meta Business Manager e não simula publicação. A inteligência própria do SOS Sales já possui contrato persistido separado e é consumida pelo Receptionist quando publicada.
4. Validar Messenger/Instagram DM com páginas únicas e conexões `CONNECTED`; o CRM persiste o último estado confirmado de NLP/Private Reply, mas a Meta não oferece leitura completa dessas configurações.

## Conclusão operacional

O candidato está **testável e mais seguro**, mas **não está liberado para produção ainda**. O código e a UI agora distinguem Meta oficial, SOS Sales e humano no backend e falham fechados quando a prova não existe. A liberação depende dos sete gates P0 acima e de um teste real no VPS; build verde ou `health=200` isolados não comprovam entrega WhatsApp.

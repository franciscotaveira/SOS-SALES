# Plano-mestre canônico — SOS Sales Meta-first MVP

Data: 2026-08-30
Status: plano de execução; não constitui prova de produção
Princípio: **poder invisível, simplicidade visível**

## 0. Decisão executiva

O SOS Sales não será lançado como um CRM genérico com dezenas de módulos concorrendo
pela atenção. O produto inicial será uma operação comercial simples para PMEs que fecha
o ciclo abaixo:

`anúncio Meta → conversa → atendimento humano/IA → resultado comercial → feedback à Meta`

O núcleo vendável do MVP é:

1. conexão oficial Meta/WABA;
2. caixa de entrada compartilhada e multiatendimento;
3. IA assistida ou autônoma, com controle humano explícito;
4. Meta Business Agent quando o número for elegível;
5. IA própria do SOS Sales quando o Meta Business Agent não estiver disponível;
6. atribuição CTWA e envio de eventos comerciais qualificados à Meta;
7. operação verificável, persistida, multi-tenant e recuperável.

Funções existentes não serão apagadas por conveniência. Cada uma será classificada como
`MANTER`, `CORRIGIR`, `CONSOLIDAR`, `REALOCAR`, `COMPLETAR_BACKEND`,
`CAPABILITY_PENDENTE` ou `REMOVER`. A classificação `REMOVER` exige decisão expressa
de Francisco.

## 1. Problema central

O risco atual não é falta de funcionalidades. É a divergência entre interface, backend,
provedores e persistência. Há funções reais e robustas, mas também fluxos paralelos,
estado local usado como verdade comercial, mensagens de sucesso sem prova do provedor e
fallbacks silenciosos que podem usar um número diferente do pretendido.

O MVP só é confiável quando cada função essencial comprova a cadeia:

`UI → API → autenticação/RBAC → regra de negócio → provedor/fila → banco → reload`

HTTP 200, container saudável, botão visível ou registro local não comprovam essa cadeia.

## 2. Escopo do MVP e fronteiras

### 2.1 Incluído no lançamento

- cadastro de empresa/workspace e vínculo seguro de operadores;
- conexão WABA oficial por Embedded Signup ou credenciais verificadas;
- webhook WABA autenticado, idempotente e mapeado ao tenant correto;
- recebimento e envio de texto e mídias essenciais suportadas pela Meta;
- caixa de entrada compartilhada, atribuição de responsável e estados de atendimento;
- tomada e devolução explícita do controle da conversa;
- configuração canônica de negócio, catálogo, restrições e tom da IA;
- seleção de provedor de IA por capacidade, sem dupla resposta;
- CTWA/referral, estágios comerciais e eventos CAPI auditáveis;
- logs operacionais, retries, DLQ, readiness, canário e rollback.

### 2.2 Preservado, mas fora do caminho principal

- WAHA para números já autorizados, grupos e contingência conscientemente configurada;
- agenda, Kanban, notas, campanhas, templates e recursos avançados da Meta;
- Messenger e Instagram Direct;
- painéis analíticos e automações adicionais.

Esses recursos podem permanecer acessíveis em áreas apropriadas, mas não podem poluir a
jornada inicial nem declarar funcionamento sem contrato completo de backend.

### 2.3 Não permitido

- fallback silencioso entre WABA e WAHA;
- salvar mensagem outbound como enviada quando nenhum provedor confirmou aceite;
- duas IAs com propriedade simultânea da mesma conversa;
- mock, localStorage ou resposta hardcoded como verdade comercial em produção;
- ativação ampla da IA antes do canário com allowlist;
- remoção de função sem inventário, decisão e caminho de reversão;
- deploy direto no VPS sem validação integrada no Docker Lab.

## 3. Arquitetura funcional alvo

### 3.1 Uma fonte de verdade por domínio

| Domínio | Fonte canônica |
|---|---|
| empresa, usuários e permissões | PostgreSQL + RLS/RBAC |
| canal e identidade do número | `channel_connections` + credencial em cofre |
| conversa e mensagens | PostgreSQL, com IDs do provedor e estados de entrega |
| propriedade do atendimento | estado persistido por conversa + epoch/versionamento |
| configuração da IA | bundle publicado e versionado por workspace |
| catálogo, preços e restrições | conhecimento publicado do workspace |
| atribuição e resultados | eventos comerciais persistidos com proveniência |
| preferências apenas visuais | localStorage permitido, sem efeito comercial |

### 3.2 Roteador de canal explícito

Cada conversa possui um `channel_connection_id` imutável durante o envio. O backend
resolve exatamente um adaptador: `META_WABA`, `WAHA` ou outro futuro. Se ele falhar, o
estado deve ser `FAILED`/`RETRYABLE`; não se troca de provedor ou número automaticamente.

O WAHA pode ser uma capacidade separada, mas não uma fuga invisível da WABA.

### 3.3 Orquestrador de propriedade da conversa

Estados mínimos:

- `HUMAN_OWNED` — operador/SOS controla e a IA não responde;
- `META_AGENT_OWNED` — Meta Business Agent responde; SOS observa `standby`;
- `SOS_AI_OWNED` — IA própria responde pelo worker durável;
- `PAUSED` — nenhuma IA responde;
- `ERROR` — falha explícita que exige recuperação.

Toda transição deve registrar ator, motivo, instante, versão/epoch e resultado do
provedor. A interface nunca deve inferir propriedade apenas por um toggle local.

### 3.4 Seleção da IA por capacidade

1. Verificar elegibilidade do número no endpoint oficial, com versão própria por contrato.
2. Se elegível e configurado: Meta Business Agent pode ser habilitado por allowlist.
3. Se inelegível: manter WABA para mensagens/ads e usar a IA própria do SOS Sales.
4. Se a consulta de elegibilidade falhar: estado `UNKNOWN`, nunca converter erro em
   `INELIGIBLE`.
5. Uma conversa tem apenas um owner de resposta automática por vez.

### 3.5 Conhecimento único, publicação por adaptador

Empresa, FAQ, catálogo, políticas, preços, tom, ações e handoff nascem no bundle
canônico do SOS Sales. Adaptadores publicam esse bundle para:

- Meta Business Agent: business info, FAQ, files, websites, skills e connectors;
- SOS AI: prompt, retrieval e ferramentas internas.

Isso evita configurar duas “personalidades” divergentes para o mesmo cliente.

## 4. Revisão CEO — produto que deve ser vendido

### Usuário principal

PME que recebe leads da Meta/WhatsApp e perde vendas por demora, falta de distribuição,
histórico fragmentado e ausência de retorno de qualidade às campanhas.

### Promessa

“Conecte seu WhatsApp oficial, organize a equipe, responda com ajuda da IA e devolva à
Meta quais conversas realmente viraram oportunidades e vendas.”

### Momento de valor

O primeiro valor não é visualizar dashboards. É receber um lead real, distribuí-lo,
responder sem conflito, persistir o histórico e registrar o resultado comercial.

### Métricas primárias

- tempo para conectar o primeiro número;
- tempo até a primeira conversa recebida;
- tempo de primeira resposta;
- conversas sem responsável e SLA vencido;
- handoffs IA → humano concluídos;
- oportunidades/vendas com origem CTWA comprovada;
- eventos CAPI aceitos, deduplicados e conciliados;
- mensagens falhas ou ambíguas por provedor.

### Corte de complexidade

O sistema pode ter recursos avançados, mas o usuário inicial deve enxergar quatro áreas:

1. **Atender** — caixa de entrada e responsabilidade;
2. **Contatos/Vendas** — pessoa, etapa e resultado;
3. **Meta** — conexão, templates, atribuição e retorno de conversão;
4. **Configurar** — equipe, IA e negócio.

## 5. Revisão de produto e UX

### 5.1 Jornada principal em desktop/notebook

Validar primeiro em 1440×900 e 1280×720:

1. entrar e selecionar empresa;
2. ver claramente se o canal está pronto ou qual ação falta;
3. abrir fila compartilhada;
4. assumir uma conversa;
5. responder e confirmar estado real de envio;
6. transferir para operador ou IA;
7. marcar oportunidade/venda;
8. observar o evento atribuído e enviado à Meta.

### 5.2 Hierarquia e carga cognitiva

- uma ação primária por contexto;
- estados críticos por texto + ícone, não apenas cor;
- ações raras em menus secundários;
- recursos indisponíveis explicam requisito e próximo passo;
- “enviado”, “entregue”, “lido” e “falhou” são estados distintos;
- owner humano/Meta/SOS IA sempre visível no cabeçalho da conversa;
- configurações técnicas não aparecem no fluxo diário do vendedor.

### 5.3 Onboarding real

Checklist derivado do backend:

- empresa criada;
- usuário e função confirmados;
- WABA conectada e webhook validado;
- número e capabilities consultados;
- equipe configurada;
- conhecimento da IA publicado;
- teste controlado aprovado;
- primeira conversa e primeiro resultado persistidos.

Nenhum item pode ser marcado por clique local; todos são read-back da API/provedor.

## 6. Revisão de engenharia — achados atuais obrigatórios

### P0.1 — Remover fallback silencioso WABA → WAHA

**[KNOWN]** As rotas de envio atuais tentam WABA e, em erro, executam WAHA. Isso pode
usar outra identidade/número sem consentimento e viola a propriedade explícita do canal.

Correção:

- resolver o canal pela jornada/conversa;
- chamar apenas o adaptador correspondente;
- retornar erro tipado e persistir tentativa;
- permitir troca manual de canal somente por fluxo administrativo auditado.

### P0.2 — Não registrar falha como sucesso

**[KNOWN]** O fluxo atual pode manter `sentVia='none'`, inserir a mensagem e responder
`success: true`. A nova máquina de estados deve usar `PENDING`, `ACCEPTED`, `SENT`,
`DELIVERED`, `READ`, `FAILED` e `UNKNOWN`, com IDs de tentativa e provedor.

### P0.3 — Tornar outbound durável

O envio humano e o envio de IA devem compartilhar outbox/worker durável, idempotência,
retry controlado e DLQ. O aceite do provedor e a persistência precisam ser conciliados;
falha após aceite não pode gerar reenvio cego.

#### Implementação local validada em 2026-08-30

- o envio do cockpit agora cria e aprova um dispatch supervisionado, retornando
  `202 Accepted`; não chama WABA/WAHA diretamente nem insere uma mensagem como
  enviada antes do worker;
- a função de claim aceita somente o canal persistido da jornada quando ele é
  `waha` ou `meta_cloud` e está `CONNECTED`; não existe troca automática de
  provedor;
- a mensagem inicial de uma nova conversa usa a mesma fila. O template é uma
  exceção explícita de Meta Cloud: requer canal Meta conectado, aguarda o ID
  devolvido pela Meta e só então é persistido;
- broadcasts para grupos não são uma capacidade da Cloud API e retornam erro
  explícito. Broadcast WABA para contatos permanece uma capability pendente,
  até possuir fila, template aprovado, idempotência, opt-out e rastreio de
  aceite; jamais pode incrementar contador de sucesso sem envio real.

Essas mudanças foram provadas no Supabase Lab com testes de integração; não são
prova de credenciais Meta, webhook ou entrega em produção.

### P0.4 — Meta Business Agent ainda é capacidade ausente

**[KNOWN]** Não há implementação atual de elegibilidade, onboarding, configuração,
allowlist, teste/eval ou thread control do Meta Business Agent para WhatsApp.

Criar um módulo isolado, não rotas dispersas:

```text
apps/api/src/application/meta-business-agent/
  ports/
  services/
apps/api/src/infrastructure/meta-business-agent/
  meta-business-agent-client.ts
  contract-version-registry.ts
apps/api/src/interfaces/http/routes/meta-business-agent-routes.ts
```

Cada endpoint deve declarar base URL, `X-API-Version`, timeout, retry, schema de resposta
e erro. A documentação recebida contém contratos divergentes para `thread_control`;
portanto, o plano não autoriza adivinhar um contrato universal. Verificar ao vivo em
ambiente controlado e suportar inicialmente `take`/`release`; `pass` só entra após prova.

### P0.5 — Canary seguro do Meta Business Agent

Ordem obrigatória:

1. eligibility = `true`;
2. onboarding concluído e `agent_id` persistido;
3. publicar conhecimento/configuração;
4. adicionar números de teste à allowlist;
5. definir `ai_audience=ALLOWLISTED_ONLY`;
6. reler a configuração e comprovar;
7. ativar rollout;
8. executar `agent_test` e conversa real controlada;
9. validar take/release e webhooks `standby`/`messaging_handovers`;
10. só depois ampliar audiência.

### P0.6 — Provisionamento de cliente é real, conexão não é automática

**[KNOWN]** A criação de workspace, membership, canal desconectado e configuração base já
existe no backend. O resultado correto é “conta criada, conexão pendente”, nunca “WABA
criada”. O `ownerEmail` hoje é apenas referência; convite/identidade do dono deve ser uma
capacidade separada com status explícito.

### P0.7 — Verdade comercial fora do frontend

Inventariar todos os usos de localStorage/hardcode. Preferências visuais podem ficar;
configurações de agente, catálogo, equipe, mensagens, agenda, tracking, chaves, regras e
estados comerciais precisam de contrato backend ou de rótulo explícito de rascunho.

### P0.8 — Multi-tenant e segredos

- toda rota exige ator autenticado e membership/role;
- provider ID nunca substitui `workspace_id` sem mapeamento único;
- tokens não retornam ao frontend nem entram em log;
- credenciais ficam em cofre/referência, com rotação e último teste;
- teste cruzado entre dois tenants é gate de release.

## 7. Plano de execução por ondas

### Onda 0 — Congelamento e inventário

Entregáveis:

- matriz de todas as funções visíveis por tela;
- classificação funcional sem exclusões;
- mapa UI → endpoint → RBAC → serviço → provedor → tabela → reload;
- lista de mocks, localStorage comercial, 501, hardcodes e fallbacks;
- baseline do Lab, produção e Git separados.

Gate: nenhuma função essencial permanece com estado `DESCONHECIDO`.

### Onda 1 — Verdade do canal e outbound

- introduzir roteador de canal explícito;
- eliminar os fallbacks silenciosos;
- criar outbox durável de outbound e estados de entrega;
- reconciliar webhooks de status;
- unificar envio humano e IA no mesmo pipeline;
- testes de idempotência, timeout e aceite ambíguo.

Gate: uma mensagem real sai pelo número selecionado, persiste e permanece correta após
reload; falha não aparece como sucesso.

### Onda 2 — Multiatendimento e ownership

- owner persistido, claim/release/transfer com concorrência;
- controle otimista/epoch para impedir dupla posse;
- RBAC de operador, gestor e agência;
- SLA e fila derivados do backend;
- trilha de auditoria.

Gate: dois operadores concorrentes não conseguem assumir simultaneamente a mesma
conversa; transferência e reload preservam o owner correto.

### Onda 3 — IA canônica e fallback de capacidade

- consolidar bundle de conhecimento publicado;
- manter Receptionist SOS em worker durável;
- remover configurações comerciais que existem somente no frontend;
- implementar adaptador Meta Business Agent;
- eligibility/onboarding/configuração/allowlist/test/eval;
- máquina de ownership humano/Meta/SOS IA;
- handoff determinístico e guardrails de preços.

Gate: elegível usa Meta no canário; inelegível usa SOS IA; falha de elegibilidade não
ativa nada; nenhuma conversa recebe duas respostas.

### Onda 4 — Meta Ads, CTWA e ciclo de qualidade

- capturar referral/CTWA com proveniência;
- ligar conversa → contato → oportunidade → venda;
- mapear eventos internos para CAPI;
- deduplicação por `event_id`, consentimento e política de dados;
- fila/retry/DLQ e reconciliação com resposta da Meta;
- painel mostra aceitação, rejeição e motivo, não apenas “enviado”.

Gate: lead controlado vindo de anúncio gera resultado comercial persistido e evento CAPI
conciliado sem duplicidade.

### Onda 5 — Subtração de UX sem perda de função

- reorganizar navegação nas quatro áreas principais;
- realocar recursos avançados para “Mais”/Configurações;
- remover badges e ações concorrentes do cockpit;
- apresentar readiness e owner com linguagem operacional;
- validar desktop/notebook antes de mobile;
- estados vazios e de erro com próximo passo real.

Gate: operador completa o Golden Path sem suporte e sem entrar em configurações técnicas.

### Onda 6 — Homologação integral das funções preservadas

Executar a matriz tela por tela. Para cada controle:

- visível e autorizado;
- payload e validação;
- endpoint real;
- persistência;
- efeito externo quando aplicável;
- estado após reload;
- erro/timeout;
- tenant cruzado;
- auditoria e rollback.

Função incompleta fica `CAPABILITY_PENDENTE` e fora do caminho principal, com explicação;
não recebe “sucesso cosmético”.

### Onda 7 — Release controlado

1. testes unitários, integração, contrato e E2E no checkout correto;
2. build de produção de frontend e API;
3. Docker Lab integrado;
4. canários WABA, multiatendimento, IA e CAPI com atores/números controlados;
5. preflight e release imutável;
6. aprovação humana;
7. stage no VPS;
8. promoção atômica;
9. prova pós-deploy autenticada;
10. decisão GO/NO-GO e janela de observação.

O runbook operacional permanece em
`docs/audits/PLANO_FECHAMENTO_PRODUCAO_SOS_SALES_2026-08-30.md` e deve receber o SHA
real do candidato no momento do release.

## 8. Matriz mínima de testes de aceitação

| Fluxo | Prova obrigatória |
|---|---|
| criar cliente | workspace, membership e canal pendente persistidos; reload |
| conectar WABA | credencial protegida, webhook, número e capability relidos |
| inbound | assinatura, dedupe, tenant, mensagem e UI/reload |
| outbound | canal explícito, aceite, status, falha e ausência de fallback |
| multiatendimento | claim concorrente, transfer, RBAC e auditoria |
| Meta Agent | eligibility, allowlist, rollout, test e take/release |
| SOS IA | worker, knowledge version, guardrail, handoff e pausa |
| ownership | nunca duas IAs; estado persistido e reconciliado |
| CTWA | referral ligado à jornada e origem visível |
| CAPI | event_id, consentimento, aceite/erro, retry e dedupe |
| tenant | acesso próprio permitido; cruzado negado em UI/API/banco |
| rollback | frontend, API, runtime, compose e CA restaurados juntos |

## 9. Critério GO/NO-GO do MVP

### GO somente se

- WABA inbound e outbound reais passarem no mesmo release;
- falha de provedor nunca for exibida como envio bem-sucedido;
- multiatendimento impedir dupla posse;
- IA tiver owner único, handoff e kill switch;
- Meta Agent estiver limitado por allowlist ou desligado;
- SOS IA atender números inelegíveis sem perder WABA/ads;
- CTWA e ao menos um evento comercial CAPI estiverem conciliados;
- isolamento de tenant e segredos forem comprovados;
- estado correto permanecer após reload;
- rollback estiver ensaiado.

### NO-GO imediato se

- houver fallback silencioso entre números/provedores;
- mensagem não enviada aparecer como enviada;
- duas IAs responderem à mesma conversa;
- token/segredo chegar ao frontend ou logs;
- UI depender de mock/localStorage para verdade essencial;
- canário não estiver contido;
- produção não corresponder ao SHA e artefatos homologados.

## 10. Documentos e autoridade

Este é o plano-mestre de produto e construção. Os documentos anteriores permanecem como
evidência histórica, mas não devem ser executados em paralelo:

- `SOS_SALES_META_WABA_REMEDIATION_EXECUTION_PLAN_2026-08-26.md`: fonte técnica
  anterior, **substituída por este plano para priorização**;
- prompts Claude Fable: material de execução/revisão, não autoridade arquitetural;
- `PLANO_FECHAMENTO_PRODUCAO_SOS_SALES_2026-08-30.md`: runbook de release, subordinado
  aos gates deste plano;
- `CODEBASE.md` e `DECISION_LOG.md`: devem ser atualizados após decisões implementadas e
  comprovadas, não antes.

## 11. Ordem imediata de construção

1. corrigir envio `sentVia=none` e proibir fallback WABA → WAHA;
2. tornar outbound durável e conciliável;
3. consolidar owner/claim/transfer do multiatendimento;
4. publicar um bundle canônico de conhecimento;
5. implementar Meta Business Agent atrás de capability flag e allowlist;
6. ligar ownership Meta/SOS/humano;
7. fechar CTWA → resultado → CAPI;
8. reorganizar UX sem apagar funções;
9. homologar a matriz completa;
10. executar Lab, canário e release.

## GSTACK REVIEW REPORT

### Premise Review

- Modo: `SELECTIVE_EXPANSION` — reduz o produto visível ao Meta-first MVP e adiciona
  somente a integração necessária do Meta Business Agent.
- Premissa: confirmada no diálogo em 2026-08-30.
- Não negociáveis: WABA/Meta, multiatendimento, IA com fallback por elegibilidade,
  atribuição/CAPI, preservação das funções e prova ponta a ponta.

### CEO Review

- Wedge definido: ciclo Meta → atendimento → venda → feedback.
- Usuário e momento de valor explícitos.
- Métricas operacionais substituem vaidade de dashboard.
- Complexidade avançada é preservada, mas sai do caminho inicial.

### Design Review

- Navegação proposta em quatro áreas.
- Desktop/notebook antes de mobile.
- Owner, readiness e estados de entrega ganham hierarquia primária.
- Onboarding é read-back do backend, não checklist local.

### Engineering Review

- P0 identificados no código atual: fallback cruzado e falso sucesso outbound.
- Arquitetura alvo reutiliza PostgreSQL, workers, outbox, WABA e Receptionist existentes.
- Meta Business Agent entra como adaptador de capacidade, não como segunda plataforma.
- Contratos Meta são versionados por endpoint e validados ao vivo.

### DevEx Review

- Um plano-mestre, um runbook de release e uma matriz funcional.
- Gates têm comandos/evidências a detalhar durante implementação.
- Cada onda termina em critério observável e pode ser revisada isoladamente.
- Alterações devem ser pequenas, rastreáveis e compatíveis com rollback.

### Decisões automáticas aplicadas

- DRY: reutilizar workers/outbox e o bundle canônico.
- Escopo: não bloquear o MVP por toda função avançada; bloquear apenas por núcleo crítico.
- Segurança: erro de elegibilidade é `UNKNOWN`; fallback de canal é proibido.
- UX: realocação antes de remoção.

### Pendências que exigem validação durante execução

- contrato vivo e permissões disponíveis do Meta Business Agent para a conta Tech Provider;
- versão/base URL definitiva por endpoint, especialmente `thread_control`;
- política de dados/consentimento dos eventos CAPI por cliente;
- números e usuários autorizados para os canários;
- decisão futura sobre funções classificadas `REMOVER`.

### Veredito

`READY_FOR_IMPLEMENTATION_IN_WAVES` — o plano está pronto para orientar construção, mas
o produto ainda não deve ser declarado pronto para produção até os gates GO serem
comprovados no Lab e no release candidato.

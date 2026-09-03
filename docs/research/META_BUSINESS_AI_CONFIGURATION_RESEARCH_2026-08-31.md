# Meta Business Agent Research + Commercial AI Configuration Spec v1

**Data de verificação:** 31 ago 2026, America/Sao_Paulo  
**Escopo:** pesquisa e arquitetura; nenhuma conta, WABA, número, cobrança, webhook ou ambiente de produção foi alterado.  
**Status:** `DONE_WITH_CONCERNS` — a documentação técnica é recente, possui inconsistências e não substitui teste em uma conta elegível.

## Regra epistemológica

- `[OFICIAL]`: declarado em documentação, API, Help Center, Blueprint, SDK ou anúncio oficial da Meta.
- `[OBSERVADO]`: comportamento reproduzido em uma conta/produto. Não houve teste autenticado nesta pesquisa.
- `[INFERÊNCIA]`: conclusão arquitetural derivada das fontes.
- `[HIPÓTESE]`: plausível, mas sem evidência suficiente.
- `[MÉTODO PRÓPRIO]`: decisão proposta para a metodologia independente de fornecedor.
- `EVIDÊNCIA INSUFICIENTE`: não há base para concluir.

## Registro de fontes

| ID | Fonte | Publicação/atualização | Verificada | Escopo |
|---|---|---:|---:|---|
| S1 | [Meta Business Agent overview](https://developers.facebook.com/documentation/meta-business-agent/overview) | 25 ago 2026 | 31 ago 2026 | definição, elegibilidade, requisitos |
| S2 | [Capabilities](https://developers.facebook.com/documentation/meta-business-agent/capabilities) | 19 ago 2026 | 31 ago 2026 | knowledge, skills, connectors, handoff, idioma, teste |
| S3 | [Get started](https://developers.facebook.com/documentation/meta-business-agent/get-started) | data não exibida na referência Markdown | 31 ago 2026 | onboarding, webhooks, thread control, catálogo, rollout |
| S4 | [Agent settings](https://developers.facebook.com/documentation/meta-business-agent/reference/onboard/agent-settings) | data não exibida | 31 ago 2026 | enable, audience, handoff, follow-up, never-say |
| S5 | [Business info](https://developers.facebook.com/documentation/meta-business-agent/reference/configure/agent-knowledge-business-info) | data não exibida | 31 ago 2026 | informações empresariais estruturadas |
| S6 | [FAQs](https://developers.facebook.com/documentation/meta-business-agent/reference/configure/agent-knowledge-faqs) | data não exibida | 31 ago 2026 | pergunta, resposta, metadata |
| S7 | [Files](https://developers.facebook.com/documentation/meta-business-agent/reference/configure/agent-knowledge-files) | data não exibida | 31 ago 2026 | tipos e limite de arquivo |
| S8 | [Websites](https://developers.facebook.com/documentation/meta-business-agent/reference/configure/agent-knowledge-websites) | data não exibida | 31 ago 2026 | crawl, status, páginas e freshness |
| S9 | [Skills](https://developers.facebook.com/documentation/meta-business-agent/reference/configure/agent-skills) | data não exibida | 31 ago 2026 | instruções e gatilhos |
| S10 | [UI skills](https://developers.facebook.com/documentation/meta-business-agent/reference/configure/ui-skills) | data não exibida | 31 ago 2026 | componentes ricos |
| S11 | [Connectors](https://developers.facebook.com/documentation/meta-business-agent/reference/configure/connectors) | data não exibida | 31 ago 2026 | APIs externas e autenticação |
| S12 | [Connector tools](https://developers.facebook.com/documentation/meta-business-agent/reference/configure/connector-tools) | data não exibida | 31 ago 2026 | operação, schema, bindings e execução |
| S13 | [Agent test](https://developers.facebook.com/documentation/meta-business-agent/reference/operate/agent-test) | data não exibida | 31 ago 2026 | teste multi-turn e resposta |
| S14 | [Agent eval](https://developers.facebook.com/documentation/meta-business-agent/reference/operate/agent-eval) | data não exibida | 31 ago 2026 | simulação, judge, scores e findings |
| S15 | [Agent event](https://developers.facebook.com/documentation/meta-business-agent/reference/operate/agent-event) | data não exibida | 31 ago 2026 | evento assíncrono e status |
| S16 | [Thread control](https://developers.facebook.com/documentation/meta-business-agent/reference/operate/thread-control-cloud-api) | data não exibida | 31 ago 2026 | take/release e ownership |
| S17 | [WhatsApp Business profiles](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-profiles) | 30 jun 2026 | 31 ago 2026 | perfil visível do número |
| S18 | [Catalogs overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/catalogs-overview/) | 18 jun 2026 | 31 ago 2026 | catálogo, produtos, serviços, carrinho |
| S19 | [Messages webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages) | 17 jun 2026 | 31 ago 2026 | payload inbound/status |
| S20 | [Meta official Postman: CTWA inbound](https://www.postman.com/meta/whatsapp-business-platform/request/g7sv9jo/received-message-triggered-by-click-to-whatsapp-ads) | data não exibida | 31 ago 2026 | referral do anúncio |
| S21 | [WhatsApp official Node SDK webhook types](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK/blob/main/src/types/webhooks.ts) | repositório arquivado; snapshot oficial | 31 ago 2026 | campos de referral |
| S22 | [Pricing for non-template messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages) | 25 ago 2026 | 31 ago 2026 | cobrança MBA e service |
| S23 | [Meta Newsroom: launch](https://about.fb.com/news/2026/06/meta-business-agent/) | 3 jun 2026 | 31 ago 2026 | anúncio e rollout |

---

# A. Executive summary

## O que foi descoberto

1. `[OFICIAL]` A Meta Business Agent Platform deixou de ser apenas anúncio. Há APIs v2 para `business_info`, FAQs, files, websites, skills, UI skills, connectors, connector tools, test, eval, events, allowlist, settings e thread control. [S1–S16]
2. `[OFICIAL]` O agente torna-se o **primary responder**. O app da empresa fica em `standby`, recebe cópias da conversa e precisa controlar explicitamente a titularidade da thread para responder. [S2, S3, S16]
3. `[OFICIAL]` A configuração mínima para ligar o agente é onboarding + settings. Knowledge e connectors são tecnicamente opcionais; isso não significa que sejam comercialmente suficientes. [S3]
4. `[OFICIAL]` A Meta distingue quatro superfícies de configuração: knowledge, skills, connectors/tools e settings/operation. Isso confirma que “um bom prompt + documentos” é apenas uma parte do sistema. [S2]
5. `[OFICIAL]` O Meta product catalog é a fonte nativa para produtos; preços, imagens e disponibilidade pertencem ao catálogo/Commerce Manager, não a PDFs. [S3, S18]
6. `[OFICIAL]` CTWA pode entregar ao app um `referral` com `source_id`, URL, headline, body e mídia. As fontes oficiais consultadas não provam que campaign, ad set, oferta semântica, emoção ou promessa cheguem diretamente ao agente. [S20, S21]
7. `[OFICIAL]` A Meta mantém contexto em conversas multi-turn. `EVIDÊNCIA INSUFICIENTE` para memória semântica entre conversas, perfil aprendido automaticamente ou atualização autônoma do conhecimento. [S2, S13]
8. `[OFICIAL]` Handoff automático pode ocorrer por baixa confiança, integridade ou pedido humano, mas os gatilhos não são configuráveis. A empresa configura mensagem e liberação de controle, não a política completa de escalonamento. [S2, S4]
9. `[OFICIAL]` A plataforma possui teste e avaliação com simulador, LLM judge, score por conversa/turno e categorias de falha. Isso valida assurance como parte do produto, mas judge LLM não prova execução de ferramenta, persistência nem efeito comercial. [S13, S14]
10. `[OFICIAL]` Desde 1 ago 2026, mensagens do Meta Business Agent são cobradas por tokens: taxa publicada de US$ 2/1M tokens e estimativa típica de US$ 0,04–0,05 por mensagem. Ação mínima útil também é controle de custo. [S22]
11. `[OFICIAL]` A API Platform exige número na WhatsApp Business Platform/Cloud API e elegibilidade; o anúncio também descreve uma oferta nativa em rollout para WhatsApp Business app. São superfícies diferentes e não devem ser tratadas como uma única disponibilidade global. [S1, S23]
12. `[INFERÊNCIA]` O produto defensável não é “gerador de PDFs”. É um **compilador e sistema de assurance de configuração comercial**, com fonte canônica, adaptadores por fornecedor, validação de freshness, testes e regressão.

## O que isso muda

- A unidade central deixa de ser “documento” e passa a ser `versioned_configuration_bundle`.
- Dados dinâmicos devem vir de catálogo ou ferramenta; documento é fallback, não source of truth.
- “Memória do gancho” precisa separar payload bruto, enriquecimento por API e interpretação comercial.
- Decision state deve ser hipótese operacional com confiança, não verdade psicológica do cliente.
- Handoff precisa incluir ownership e race control, não apenas texto de transferência.
- A entrega mínima precisa provar comportamento antes/depois, não apenas gerar material.

## Veredito sobre a tese

`[MÉTODO PRÓPRIO]` **Parcialmente confirmada, mas incompleta.** A qualidade depende da qualidade de conhecimento, regras e lógica comercial, porém também de retrieval, modelo, contexto realmente exposto, catálogo, ferramentas, permissões, freshness, ownership, custo, rollout, avaliação e operação humana. A formulação mais resistente é:

> A confiabilidade de uma IA comercial depende da qualidade e atualidade do contexto, conhecimento e políticas; da definição segura de ações e ferramentas; do controle de estado e ownership; e de evidência contínua de que o comportamento e os efeitos reais correspondem ao esperado.

---

# B. O que a Meta realmente usa

| Área | Inputs/configuração encontrados | Estado | Observação crítica | Fonte |
|---|---|---|---|---|
| Elegibilidade | phone number ID; setor/categoria; país; regularidade; trust/verificação; produto de mensagens não conflitante | `[OFICIAL]` | endpoint retorna apenas `is_eligible`; motivo detalhado não é exposto no schema | S1 |
| Identidade pública WABA | `about`, `address`, `description`, `email`, `profile_picture`, `websites`, `vertical` | `[OFICIAL]` | é perfil do WhatsApp, separado de MBA `business_info` | S17 |
| Business info MBA | payment methods, return policy, purchase info, delivery/shipping, description, email, hours, address | `[OFICIAL]` | todos opcionais no schema; não cobre catálogo nem regras condicionais complexas | S5 |
| FAQ | question, answer, metadata, ID, created_at | `[OFICIAL]` | uma pergunta específica; resposta factual, concisa e autocontida | S6 |
| Files | file name + binary; PDF, DOC, DOCX, PNG, JPG/JPEG; CSV/XLSX sob habilitação; até 100 MB | `[OFICIAL]` | não há contrato público de chunking, OCR, precedência ou resolução de conflito | S7 |
| Websites | URL, crawl status, pages crawled, last crawled, created_at | `[OFICIAL]` | crawler periódico citado; frequência e regra de recrawl não documentadas | S2, S8 |
| Skills | title, description/gatilho, instruction body, metadata, channel | `[OFICIAL]` | até 20k chars; conflitos de prioridade geram duplicidade/inconsistência | S9 |
| UI skills | title, component type, status, instruction, optional flow ID | `[OFICIAL]` | carousel, CTA URL, Flow, image, list, buttons, location/request | S10 |
| Catálogo | catálogo Meta conectado; produtos/serviços; name, description, price, images, availability; IDs/retailer IDs; carrinho e order webhook | `[OFICIAL]` | MBA usa catálogo Meta; catálogo é atualizado em Commerce Manager/API | S3, S18 |
| Settings | rollout enabled, AI audience, handoff, follow-up, never-say phrases | `[OFICIAL]` | default audience é `EVERYONE`; allowlist isolada não restringe nada | S4 |
| Idioma | detecção por mensagem; responde no mesmo idioma; fallback para idioma primário; inglês tem melhor qualidade | `[OFICIAL]` | capabilities diz que não existe language setting; get-started sugere language em settings: inconsistência documental | S2, S3 |
| Connectors | name, description, base URL, auth type/config, user-auth injection | `[OFICIAL]` | suportados hoje: client credentials, API key e none; outros enums aparecem, mas não estão implementados | S11 |
| Connector tools | stable name, usage description, HTTP method/path, typed params/body, bindings/macros, user auth | `[OFICIAL]` | schema explícito é necessário; objeto indefinido faz o agente “adivinhar” | S12 |
| Macros de ferramenta | WhatsApp phone number, identity hash, current status ID | `[OFICIAL]` | não equivalem a memória comercial ou CRM | S12 |
| Tool test | endpoint de execução retorna `output` JSON e `status` | `[OFICIAL]` | status `success` precisa ser confrontado com efeito externo/persistência | S12 |
| Eventos | to, type, description, opaque JSON payload; async status | `[OFICIAL]` | POST retorna `accepted`; é obrigatório consultar até sent/success/failed/skipped | S15 |
| Teste | user message, conversation ID; response, handoff/no-response reason, quick replies, product variant IDs | `[OFICIAL]` | multi-turn test não alcança usuário real | S13 |
| Eval | scenarios, categories, max turns, success criteria; judge scores e reasons | `[OFICIAL]` | criação de eval case não aparece na API pública consultada | S14 |
| Handoff | automatic signal; custom/default/agent message; take/release; standby/messages/messaging_handovers | `[OFICIAL]` | triggers automáticos não configuráveis; ownership deve ser reconciliado | S2, S3, S4, S16 |
| Follow-up | enabled, fixed intervals de 5 min a 24 h, message | `[OFICIAL]` | não é um scheduler comercial completo; opt-out, cadência e stop conditions precisam de método próprio | S4 |
| CTWA referral | source URL/type/ID, headline, body, media URLs; payload oficial mostra ad/post | `[OFICIAL]` | campaign/ad set não aparecem diretamente; `source_id` pode ser enriquecido fora do agente | S20, S21 |
| Custos | MBA non-template por token; service por mensagem a partir de 1 out 2026 | `[OFICIAL]` | o 72h free entry point não elimina cobrança de tokens do MBA | S22 |
| Feedback/learning | test, eval, updates manuais a knowledge/skills/settings | `[OFICIAL]` | thumbs/correction, aprendizado automático e memória semântica: `EVIDÊNCIA INSUFICIENTE` | S4–S14 |

## Oficialmente disponível, anunciado e não confirmado

| Capacidade | Classificação em 31 ago 2026 |
|---|---|
| FAQ, files, websites, business info, skills | `OFICIALMENTE DISPONÍVEL` via API para entidades elegíveis |
| Connectors e connector tools próprios | `OFICIALMENTE DISPONÍVEL` na documentação v2, sujeito a elegibilidade/capability |
| Product recommendations do catálogo Meta | `OFICIALMENTE DISPONÍVEL` segundo capabilities/get-started; requer catálogo correto |
| Booking, availability, order lookup | `OFICIALMENTE DISPONÍVEL COMO INTEGRAÇÃO`; não é função universal sem connector/tool |
| Close sales | `ANUNCIADO`; o mecanismo depende de catálogo, UI skills, tools, pagamento e mercado |
| Pagamento confirmado por agent event/tool | `OFICIALMENTE INTEGRÁVEL`; processamento financeiro nativo universal não foi provado |
| Market research, competitive intelligence, daily operations | `ANUNCIADO/ROADMAP` no Newsroom |
| “Hundreds of systems” como Shopify/Zendesk/Shopee | `ANUNCIADO`; catálogo público completo e disponibilidade por conta não confirmados |
| Agent Insights endpoint | linkado no get-started, mas a página não apresentou contrato utilizável na verificação | `EVIDÊNCIA INSUFICIENTE` |
| Memória semântica persistente entre conversas | `NÃO CONFIRMADO` |
| Campaign/ad set/offer/hook automaticamente entregues ao MBA | `NÃO CONFIRMADO` |
| Aprendizado automático com conversas e correções | `NÃO CONFIRMADO` |

## Conflitos na própria documentação oficial

- `get-started` diz que Settings controla “persona” e “language”, mas Capabilities afirma que não existe language setting e o schema de Settings não contém esses campos. Tratar skills como mecanismo de voz e idioma como comportamento automático até prova em API.
- A referência isolada de Thread Control diz que `pass` está reservado e não é aceito; o guia Get Started descreve `pass` como utilizável. Não implementar `pass` sem teste na versão real da conta; `take` e `release` são os contratos seguros documentados em comum.
- A página de preços foi atualizada em 25 ago 2026, mas ainda diz que analytics/webhook do MBA seriam publicados antes de 1 ago 2026. A promessa está temporalmente vencida.
- O Newsroom fala em expansão global e, no mesmo anúncio, em início com empresas selecionadas. Para operação, prevalece o resultado vivo de eligibility por número, não a linguagem de lançamento.

---

# C. Meta Business Agent: arquitetura inferida

| Camada | O que a Meta documenta | O que observamos | Inferência | Desconhecido | O configurador deve preparar |
|---|---|---|---|---|---|
| Entrada | WhatsApp message, referral, UI response, agent event | sem teste autenticado | normalização de eventos precede reasoning | se referral entra no prompt do MBA | payload bruto + adapter + provenance |
| Contexto | multi-turn; standby copies; business profile | sem runtime | context window por thread | tamanho, truncamento, seleção de histórico | resumo factual e context budget policy |
| Knowledge | business info, FAQ, files, sites, catalog | docs/API acessíveis | retrieval híbrido estruturado + não estruturado | ranking, chunking, precedence, conflict rules | facts atômicos, FAQ, sources, freshness |
| State | thread owner, rollout, audience, handoff/follow-up | sem runtime | estado operacional explícito; estado comercial não exposto | estado interno do agente | commercial state externo e auditável |
| Memory | multi-turn conversation; connector pode buscar customer history | sem runtime | memória durável deve estar em CRM/tool, não ser presumida no modelo | cross-thread semantic memory | CRM facts com validity/confidence |
| Reasoning | model escolhe skill, knowledge, tool, UI component | sem runtime | descrições funcionam como roteador semântico | modelo/versionamento, deterministicidade | intents, sufficiency, forbidden outcomes |
| Policy | skills, never-say, platform/commerce policies | sem runtime | parte das políticas é hard-coded pela Meta | precedência total e enforcement interno | regras com severidade e fallback |
| Action | response, UI skill, agent event, handoff | sem runtime | ação precisa ser diferenciada de sugestão | confirmação antes de ação sensível | action contract + confirmation gate |
| Tools | connectors com schemas tipados e auth | sem runtime | tool description e schema são parte do comportamento | retries/timeouts internos completos | idempotency, timeout, reconciliation, evidence |
| Handoff | automatic triggers, message, take/release, webhooks | sem runtime | state machine de ownership | race timing e guarantees | owner único, SLA, context packet, resume policy |
| Outcome | delivery/status, connector effect, order/event | sem runtime | conversa não prova efeito de negócio | atribuição nativa completa | outcome ledger e source of truth |
| Evaluation | test, eval, judge, per-turn score | sem execução | Meta avalia texto; empresa deve avaliar efeitos | estabilidade/custo do judge | deterministic + semantic + E2E suites |
| Learning | update manual de config; summary/failure recommendations | sem execução | loop de melhoria é configuração versionada, não treino online provado | automatic learning | findings → remediation → retest → release |

### Arquitetura provável

```text
WhatsApp user / CTWA / UI / event
        ↓
thread routing + primary ownership
        ↓
conversation context
        ↓
knowledge retrieval ── catalog
        ↓
skill selection + policy layer
        ↓
reasoning / response planning
        ├── text response
        ├── UI skill
        ├── connector tool call ── external system
        └── automatic handoff
        ↓
delivery + standby/messages/messaging_handovers
        ↓
test/eval + business-side outcome evidence
```

`[INFERÊNCIA]` A Meta oferece um agent runtime, não um Commercial Operating System. Estado comercial, qualidade do lead, attribution enrichment, outcome ledger, aprovação de ações e regressão contínua permanecem espaço de produto.

---

# D. Gap analysis: Meta versus metodologia

| Capacidade | Meta oficial | Nossa metodologia atual | Gap | Oportunidade | Risco | Prioridade |
|---|---|---|---|---|---|---|
| Fonte canônica/versionamento | IDs e timestamps parciais | documentos conceituais | falta bundle versionado e compilação | config-as-data | drift entre arquivos | P0 |
| Perfil empresarial | profile + business_info | coberto genericamente | duas superfícies não mapeadas | adapter por fornecedor | divergência pública/interna | P0 |
| Catálogo | nativo e estruturado | products/services/pricing | falta schema de variantes, mídia, stock e IDs | catalog readiness audit | preço em documento fica stale | P0 |
| Dados dinâmicos | tools/catalog | tratado junto de knowledge | falta separar fact estático de operational truth | dynamic-data routing | alucinação de preço/agenda | P0 |
| Skills/instruções | gatilho + corpo + conflitos | behavior rules | falta compilador e lint de conflito | skill compiler | prioridades incompatíveis | P0 |
| UI components | UI skills explícitas | quase ausente | falta decidir quando usar botão/lista/flow/carousel | conversation UX pack | agente responde texto quando ação exige UI | P1 |
| Tool contracts | schema, auth, bindings | lista de NBAs | falta permissions, confirm, idempotency e evidence | action safety layer | HTTP 200 sem efeito | P0 |
| Ownership/handoff | primary/standby/take/release | protocolo de handoff | falta race/owner único | provider-neutral thread state | humano e IA respondem juntos | P0 |
| Follow-up | intervalos fixos | NBA FOLLOW_UP/WAIT | falta opt-out, stop, cadência e janela | follow-up policy engine | spam/custo/política | P0 |
| Guardrail literal | `never_say_phrases` | guardrails amplos | falta separar bloqueio literal de regra semântica | compiled safeguards | falsa sensação de segurança | P0 |
| Rollout | allowlist + audience + enabled | pouco explícito | falta deploy state e canary | homologation manifest | liga para todos por default | P0 |
| Idioma | automático | tone/language | nossa configuração pode ser redundante | language QA por mercado | qualidade menor fora do inglês | P1 |
| Memória do gancho | referral ao app | schema rico | mistura fato bruto e inferência | provenance graph | “emotion/promise” como fato | P0 |
| Decision state | não exposto | taxonomia fixa | possível falsa precisão | internal hypothesis with confidence | perguntas erradas por classificação errada | P1 |
| Gate de suficiência | não documentado | forte | falta ligar lacuna a risco/action | diferenciador real | over-questioning se mal modelado | P0 |
| Avaliação | test/eval/judge | suite proposta | falta deterministic/E2E evidence | assurance independente | confiar no score do próprio fornecedor | P0 |
| Cost governance | cobrança por token | não central | falta budget/verbosity metric | cost-aware NBA | margem PME inviável | P0 |
| Eligibility | endpoint booleano | pouco considerado | produto pode preparar empresa inelegível | readiness check | promessa não entregável | P0 |
| Learning loop | update manual + eval | learning abstrato | falta config diff/retest/rollback | continuous assurance | regressão silenciosa | P0 |

## Onde a metodologia está sofisticada demais

- `UNAWARE` quase nunca pode ser inferido com segurança após alguém iniciar conversa; renomear para estados observáveis de interação.
- `emotion`, `promise` e `intent` não devem ser campos obrigatórios do gancho; são interpretações, com confidence e source.
- dezenas de NBAs universais geram complexidade antes de haver ferramentas. O usuário PME deve escolher objetivos; o compilador cuida dos estados internos.
- PDFs separados para cada tema elevam custo de manutenção e conflito.

## Onde está incompleta

- eligibility, billing e rollout;
- catálogo e freshness;
- UI skills;
- typed tool schemas, auth e user confirmation;
- ownership/race de handoff;
- idempotency/reconciliation;
- cost per resolved outcome;
- versioning, release manifest, rollback e regression suite;
- privacy, consent, retention e data classification.

---

# E. Commercial AI Configuration Spec v1

## Princípio

`[MÉTODO PRÓPRIO]` A fonte de verdade é um bundle canônico versionado. PDFs, DOCX, Markdown, payloads Meta e prompts são **compilações** desse bundle.

```text
configuration_bundle
├── manifest
├── business
├── audience
├── catalog
├── commercial_policy
├── acquisition_context
├── knowledge
├── conversation_policy
├── actions_and_tools
├── handoff
├── guardrails
├── evaluation
└── deployment
```

Legenda: `R` obrigatório, `C` condicional, `O` opcional. Freshness é o prazo máximo proposto antes de revalidação.

## Dicionário de campos

| Campo | Tipo / req. | Descrição | Preenchimento e validação | Consumidor | Freshness / risco | Base |
|---|---|---|---|---|---|---|
| `manifest.config_id` | UUID/R | identidade imutável | sistema; UUID | todos | permanente/baixo | método |
| `manifest.version` | semver/R | versão do bundle | sistema; incremento + diff | deploy/eval | por release/alto | método |
| `manifest.status` | enum/R | draft, review, approved, deployed, retired | owner + approval auditável | deploy | imediato/crítico | método |
| `manifest.vendor_targets` | array/R | Meta, provider X etc. | arquiteto; capability check | compiler | por release/alto | S1–S16 |
| `manifest.owners` | object/R | business, knowledge, policy, technical, approval | owner nomeado | governance | 90d/médio | método |
| `manifest.effective_at/expires_at` | datetime/C | validade da configuração | owner; regra temporal | runtime | por data/alto | método |
| `business.display_name` | string/R | nome usado com cliente | empresa; confrontar perfil | agent/profile | 180d/médio | S17 |
| `business.legal_name` | string/O | nome legal | documento oficial | compliance | 365d/médio | método |
| `business.description` | string/R | definição factual do negócio | empresa + site; aprovação | knowledge/profile | 180d/médio | S5, S17 |
| `business.vertical` | enum/R | setor/categoria | WABA + eligibility | eligibility/profile | 180d/crítico | S1, S17 |
| `business.contacts` | object/R | email, phone, websites | verificar canal/URL | customer/agent | 90d/alto | S5, S17 |
| `business.locations[]` | object/C | endereço, timezone, coverage | geocheck + owner | knowledge/tools | 90d/alto | S5, S17 |
| `business.hours[]` | schedule/C | horário e exceções | owner + calendário | agent/tools | 30d/alto | S5 |
| `business.languages` | array/O | idiomas operacionais humanos | owner + test | handoff/eval | 180d/médio | S2 |
| `business.channels` | array/R | WhatsApp e demais canais | capability/API check | deploy | por release/alto | S1–S3 |
| `audience.segments[]` | object/R | segmento e necessidade | comercial; evidência | skills/eval | 180d/médio | método |
| `audience.exclusions[]` | rule/C | público que não deve ser automatizado | jurídico/owner | rollout/policy | 90d/crítico | S4 |
| `audience.rollout_mode` | enum/R | allowlist, cohort, everyone | técnico; reread settings | deploy | imediato/crítico | S3, S4 |
| `catalog.catalog_id` | string/C | catálogo de destino | Commerce Manager/API | Meta/catalog adapter | por deploy/crítico | S3, S18 |
| `catalog.items[].item_id` | string/R | ID estável interno | source system uniqueness | tools/eval | permanente/alto | método/S18 |
| `catalog.items[].retailer_id` | string/C | ID externo/SKU Meta | catálogo; uniqueness | Meta catalog | permanente/alto | S18 |
| `catalog.items[].type` | enum/R | product, service, subscription | owner | recommendation | 180d/médio | S18 |
| `catalog.items[].name` | string/R | nome comercial | catálogo + review | agent/UI | 90d/alto | S18 |
| `catalog.items[].description` | string/R | escopo e benefício factual | owner + claim review | retrieval/UI | 90d/alto | S18 |
| `catalog.items[].category` | string/C | classificação | taxonomy validation | retrieval/filter | 180d/médio | S18 |
| `catalog.items[].price` | money/C | preço atual | sistema financeiro/catalog | agent/tool/UI | 1d/crítico | S18 |
| `catalog.items[].sale_price` | money/O | preço promocional | valid_from/to | agent/UI | horas/crítico | método |
| `catalog.items[].availability` | enum/R | in_stock, out, preorder, serviceable | inventory/tool | agent/UI | minutos–1d/crítico | S18 |
| `catalog.items[].inventory` | integer/O | quantidade | inventory source | tool | minutos/crítico | S18 |
| `catalog.items[].variants[]` | object/C | size/color/options + IDs | catalog integrity | recommendation/UI | 1d/alto | S13, S18 |
| `catalog.items[].media[]` | URL/C | imagem/vídeo | URL reachable + policy | UI/catalog | 30d/médio | S18 |
| `catalog.items[].purchase_url` | URL/O | checkout/detail | HEAD + transaction test | UI/tool | 7d/alto | S18 |
| `catalog.items[].source_of_truth` | URI/R | sistema autoritativo | técnico; reachable | governance/tool | por change/crítico | método |
| `commercial_policy.payment_methods` | array/R | meios aceitos e restrições | financeiro | knowledge/tool | 30d/alto | S5 |
| `commercial_policy.purchase_process` | steps/R | como comprar/contratar | operação; walkthrough | skills/knowledge | 90d/alto | S5 |
| `commercial_policy.shipping_delivery` | rules/C | prazo, área, custo, exceções | logística/tool | knowledge | 30d/alto | S5 |
| `commercial_policy.returns_refunds` | rules/C | devolução/troca/reembolso | jurídico + owner | knowledge/guardrail | 90d/crítico | S5 |
| `commercial_policy.discounts[]` | rule/O | autoridade, limite e aprovação | owner; test boundaries | action policy | 30d/crítico | método |
| `commercial_policy.quote_validity` | duration/C | validade de orçamento | comercial | quote tool | 90d/alto | método |
| `commercial_policy.claims[]` | object/R | claims permitidos + prova | marketing/legal | agent/eval | 90d/crítico | método |
| `acquisition.raw_referral` | object/C | payload imutável do canal | webhook; schema validation | attribution | por event/alto | S20, S21 |
| `acquisition.source_id/type/url` | string/C | anúncio/post de origem | payload raw | attribution/NBA | por event/alto | S20, S21 |
| `acquisition.headline/body/media` | object/C | conteúdo oficial recebido | payload raw | continuity | por event/médio | S20, S21 |
| `acquisition.click_id` | string/O | identificador de clique, se recebido | raw only; nunca inventar | CAPI/attribution | por event/crítico | oficial adjacente |
| `acquisition.campaign/adset` | object/O | enriquecimento de Marketing API | API + permissions + timestamp | analytics | 1d/alto | método |
| `acquisition.offer/hook/promise/emotion` | evidence object/O | interpretação comercial | analista/modelo + confidence + source | skills/NBA | campanha/médio | método |
| `knowledge.facts[].fact_id` | string/R | ID atômico | uniqueness | retrieval/eval | permanente/alto | método |
| `knowledge.facts[].statement` | string/R | uma afirmação declarativa | owner approval | retrieval | varia/alto | método |
| `knowledge.facts[].epistemic_state` | enum/R | confirmed, inferred, uncertain, conflicting, stale | evidence rule | policy/NBA | imediato/alto | método |
| `knowledge.facts[].source_refs` | array/R | origem verificável | source exists/hash | audit/eval | junto ao fato/alto | método |
| `knowledge.facts[].valid_from/to` | datetime/C | validade temporal | owner/source | retrieval | por data/crítico | método |
| `knowledge.faqs[].question/answer` | strings/C | Q&A autocontida | single-topic lint + owner | Meta FAQ/RAG | 90d/alto | S6 |
| `knowledge.documents[].asset` | object/O | arquivo, hash, mime, version | file validation/OCR review | provider adapter | 90d/alto | S7 |
| `knowledge.websites[].url` | URL/O | site autorizado para crawl | status + last_crawled | provider adapter | 7–30d/alto | S8 |
| `knowledge.precedence` | rules/R | autoridade entre fontes | owner; conflict tests | compiler/retrieval | por release/crítico | método |
| `conversation_policy.opening` | rule/R | abertura por contexto de entrada | scenario tests | skill compiler | 90d/médio | método/S9 |
| `conversation_policy.voice` | object/R | tom, estilo, termos e exemplos | brand review + multilingual tests | skills | 180d/médio | S2, S9 |
| `conversation_policy.decision_states` | array/O | estados observáveis, transições e confidence | test with transcripts | orchestration | 90d/médio | método |
| `conversation_policy.sufficiency_rules[]` | rule/R | quando perguntar versus avançar | counterfactual tests | NBA | 90d/alto | método |
| `conversation_policy.next_best_actions[]` | rule/R | ação, precondition, forbidden outcome | scenario + tool availability | orchestration | 90d/alto | método |
| `conversation_policy.followup` | object/C | cadence, stop, opt-out, max attempts | policy simulation | Meta settings/scheduler | 30d/crítico | S4 |
| `conversation_policy.ui_rules[]` | rule/O | quando usar botão, list, flow, carousel | rendering tests | UI skills | 90d/médio | S10 |
| `actions_and_tools[].tool_id/name` | string/C | chave estável | uniqueness/lint | agent runtime | permanente/alto | S12 |
| `actions_and_tools[].description` | string/C | quando usar, inputs e retorno | ambiguity test | tool router | 90d/alto | S12 |
| `actions_and_tools[].input_schema` | JSON Schema/C | parâmetros tipados | contract tests | tool runtime | por API/crítico | S12 |
| `actions_and_tools[].risk_class` | enum/R | read, reversible, financial, irreversible | security review | policy gate | por change/crítico | método |
| `actions_and_tools[].confirmation` | rule/R | consentimento antes de executar | negative tests | action gate | por change/crítico | método |
| `actions_and_tools[].idempotency` | object/C | key e duplicate behavior | retry tests | runtime | por API/crítico | método |
| `actions_and_tools[].timeout_retry` | object/C | timeout, retry, backoff | failure injection | runtime | por API/alto | método |
| `actions_and_tools[].success_evidence` | array/R | provider, persistence, user-visible state | E2E test | assurance | por change/crítico | método |
| `handoff.reasons[]` | enum/R | motivos obrigatórios | policy owner | agent/app | 90d/crítico | S2 |
| `handoff.target/SLA` | object/R | fila, pessoa, prazo | routing test | operations | 30d/alto | método |
| `handoff.thread_control` | state machine/C | owner, take, release, resume | webhook/API test | channel adapter | por deploy/crítico | S3, S16 |
| `handoff.context_packet` | schema/R | objective, facts, status, next step, risks | completeness test | human operator | 90d/alto | método |
| `handoff.resume_policy` | rule/R | quem e quando devolve à IA | race/reload tests | app/runtime | por release/crítico | S16 |
| `guardrails.never_say` | array/O | frases literais bloqueadas | exact-match tests | Meta settings | 90d/alto | S4 |
| `guardrails.forbidden_claims` | rules/R | afirmações/decisões proibidas | adversarial tests | skills/policy | 90d/crítico | método |
| `guardrails.uncertainty` | rules/R | quando admitir, verificar ou handoff | unknown/conflict tests | agent | 90d/crítico | método |
| `guardrails.sensitive_data` | rules/R | coleta, masking, retention | security/privacy review | agent/tools/logging | 90d/crítico | método |
| `guardrails.action_limits` | rules/R | desconto, pagamento, booking, cancelamento | boundary tests | tool gate | 30d/crítico | método |
| `evaluation.scenarios[]` | object/R | input, expected, forbidden, dependencies | review + execution | test harness | por release/crítico | S13, S14 |
| `evaluation.release_gates` | rules/R | thresholds e zero-tolerance | CI/manual approval | deployment | por release/crítico | método |
| `evaluation.baseline_id` | string/R | comparação anterior | immutable result | regression | por release/alto | método |
| `deployment.provider_mapping` | object/R | campo canônico → API/arquivo | contract validation | compiler | por API/crítico | S3–S16 |
| `deployment.capabilities` | object/R | available, unavailable, inferred | live eligibility/config read | compiler/runtime | antes de deploy/crítico | S1 |
| `deployment.approvals` | array/R | revisão e autorização | signatures/timestamps | release | por release/crítico | método |
| `deployment.rollback` | object/R | versão anterior e trigger | dry-run/rehearsal | operations | por release/crítico | método |

## Regra de obrigatoriedade por PME

Obrigatório para todo negócio: manifest, perfil mínimo, ao menos um item/oferta ou serviço, políticas aplicáveis, fontes, abertura, sufficiency, NBA, handoff, uncertainty, evaluation e approval.

Condicional: catálogo, estoque, preço, pagamento, agenda, desconto, CTWA, tools, UI skills e compliance específico do setor.

Interno e invisível ao empresário: epistemic state, decision state confidence, source precedence, tool idempotency, thread ownership, compiled provider payloads e regression baseline.

---

# F. Configuration workflow

```text
0. Eligibility + scope gate
1. Import raw evidence
2. Extract candidate facts
3. Reconcile and classify facts
4. Detect decision-relevant gaps
5. Adaptive interview
6. Model commercial process
7. Define actions, tools and permissions
8. Define guardrails and handoff ownership
9. Compile vendor-neutral bundle
10. Compile provider artifacts
11. Static validation and conflict lint
12. Test + eval + controlled E2E
13. Human homologation
14. Canary/allowlist deployment
15. Monitor, remediate, retest and version
```

## Interview engine

Cada pergunta candidata recebe:

`gap × decision_impact × urgency × source_availability × risk × answer_cost`

Perguntar somente quando:

1. a informação não estiver confirmada em fonte válida;
2. alterar resposta, ação, permissão, handoff ou avaliação;
3. for necessária no estágio atual da configuração;
4. não puder ser obtida por ferramenta autorizada;
5. o custo de não saber superar o custo de perguntar.

Perguntas sobre detalhes internos sem impacto são adiadas ou removidas. Informações extraídas nunca viram `CONFIRMED` sem confirmação humana ou fonte autoritativa.

## Estados de conhecimento recomendados

Manter: `CONFIRMED`, `UNKNOWN`, `INFERRED`, `UNCERTAIN`, `CONFLICTING`, `STALE`.

Acrescentar: `NOT_APPLICABLE`, `PENDING_VERIFICATION`, `DEPRECATED`.

Cada estado precisa de `source`, `observed_at`, `valid_until`, `confidence` e `owner`.

---

# G. Artefatos de saída

## Menor pacote recomendado

| Artefato | Forma | Função |
|---|---|---|
| `configuration.bundle.json` | JSON | fonte canônica completa, versionada e portátil |
| `agent-instructions.md` | Markdown/TXT | skills, comportamento, prioridades, exemplos e fallback compilados |
| `knowledge-pack.md` + FAQ payload | Markdown/JSON | fatos estáticos e Q&A atômicos; não carrega dado dinâmico |
| `catalog-and-tools-manifest.json` | JSON | catálogo, actions, schemas, permissions e source of truth |
| `operations-runbook.md` | Markdown/PDF | handoff, ownership, incidentes, revisão e manutenção para humanos |
| `evaluation-suite.jsonl` | JSONL | scenarios, expected/forbidden, dependencies e evidence |
| `deployment-manifest.json` | JSON | adapter mappings, capability readback, approvals, hashes e rollback |
| `executive-configuration.pdf` | PDF derivado | leitura/aprovação humana; nunca fonte de verdade |

## Crítica aos 18 documentos propostos

Consolidar os itens 1–16 em quatro domínios: business/catalog, commercial policy, conversation/action policy e operations/guardrails. Manter AI Instructions, Evaluation Suite e manifestos como artefatos separados. Gerar PDF/DOCX somente como views.

Problema da lista original: duplicação de preço, oferta, política, FAQ, objeção e jornada em vários arquivos. Um update parcial criaria contradição silenciosa.

---

# H. Machine-optimized knowledge

## Human documentation versus machine knowledge

| Human documentation | Machine-optimized knowledge |
|---|---|
| narrativa, explicação, layout | fatos atômicos e regras explícitas |
| tabelas visuais e referências implícitas | IDs, tipos, unidades e relações declaradas |
| pode tolerar resumo | precisa preservar exceções e validade |
| foco em leitura linear | foco em retrieval e seleção local |
| PDF final | JSON/Markdown/FAQ/API/catalog como source |

## Regras de preparação

1. Uma seção ou FAQ por tópico recuperável.
2. Um fato por afirmação; incluir sujeito, predicado, unidade, moeda e timezone.
3. IDs estáveis e títulos semânticos, não “Seção 3”.
4. Fonte, owner, `last_verified_at`, `valid_from`, `valid_to` e risco de stale.
5. Exceções ao lado da regra, sem “conforme acima”.
6. FAQ em linguagem natural e resposta autocontida, conforme orientação Meta.
7. Não usar PDF para preço, estoque, agenda, order status ou promoções voláteis; usar catálogo/tool.
8. Imagens com OCR revisado ou descrição textual; layout não pode carregar semântica exclusiva.
9. Conflitos não são “resolvidos” silenciosamente: bloquear publicação ou aplicar precedence explícita.
10. Exemplos devem ser marcados como exemplos, não fatos.
11. Regras e facts separados: “o preço é X” não deve ficar escondido em tone guide.
12. Não duplicar o mesmo fato em múltiplos arquivos compilados sem origem única.

### Exemplo

```yaml
fact_id: service.haircut.walkin.price
statement: "A escova sem hora marcada custa BRL 59.00."
epistemic_state: CONFIRMED
source_refs: ["pricing-system://service/escova-walkin"]
last_verified_at: 2026-08-31T15:00:00-03:00
valid_from: 2026-08-01
valid_to: 2026-09-30
owner: commercial
stale_risk: CRITICAL
exceptions:
  - "Não inclui cabelos acima de 60 cm."
```

---

# I. Evaluation suite

## Contrato de cenário

```text
ID | capability | criticality | version | preconditions | actors
input | steps | expected | forbidden | dependencies | source_of_truth
evidence_required | observed | PASS/FAIL/BLOCKED/UNVERIFIED
finding | remediation | cleanup | retest_condition
```

## Taxonomia mínima

| Grupo | Cenários mínimos | Evidência além do texto |
|---|---|---|
| Identity | nome, categoria, localização, horário, idioma | config/profile readback |
| Knowledge | conhecido, desconhecido, conflito, stale, fonte ausente | source/version used |
| Catalog | item, variant, preço, indisponível, promoção expirada | catalog/tool response |
| Commercial policy | pagamento, retorno, entrega, desconto limite | policy source + response |
| Campaign continuity | referral presente/ausente; headline/offer; repeated question | raw webhook + persisted context |
| Sufficiency | campo vazio irrelevante; gap blocking; dado já disponível | decision trace |
| Qualification | pergunta necessária, não repetida, progressão | transcript + state diff |
| Objection | prova adequada, sem inventar claim | approved claims source |
| NBA | ASK/ANSWER/CHECK/PRESENT/HANDOFF etc. | action selection + effect |
| Tool use | correct tool, missing input, timeout, duplicate, provider 500 | request/response + DB/effect |
| Permissions | read-only, confirmation, unauthorized financial action | denial + no side effect |
| Handoff | user request, low confidence, sensitive issue, take/release race | webhooks + owner state |
| Follow-up | inactivity, response, opt-out, max attempts, outside window | scheduler + delivery/status |
| Hallucination | absent price, unsupported promise, fake availability | forbidden assertion check |
| Adversarial | prompt injection, policy bypass, data exfiltration | logs redacted + denial |
| Resilience | restart, retry, duplicate webhook, stale config rollback | correlated logs + state |
| Cost | verbosity, unnecessary turns, tool loop | token/message cost per outcome |
| Regression | previous passes after config change | baseline diff |

## Release gates propostos

- zero `CRITICAL` aberto;
- zero preço, disponibilidade, desconto, política ou pagamento inventado;
- 100% das ações irreversíveis/financeiras com confirmação e evidence;
- 100% dos handoffs críticos com ownership correto;
- todos os cenários P0 executados, não apenas julgados semanticamente;
- score LLM nunca substitui deterministic assertion ou E2E effect;
- config version, provider mapping e rollback registrados.

`[MÉTODO PRÓPRIO]` O teste Meta Agent Eval é uma camada. Assurance completa segue: UI/message → agent → tool/provider → persistence → resulting state → reload/readback.

---

# J. Moat analysis

| Componente | Defesa | Motivo |
|---|---|---|
| PDFs, templates, prompts e schema público | facilmente copiável | distribuição digital sem dados exclusivos |
| Método nomeado e taxonomias | facilmente copiável | marca ajuda venda, não impede réplica |
| Interview engine adaptativo | moderadamente defensável | melhora com regras, telemetria e verticalização |
| Knowledge extraction + conflict/freshness engine | moderadamente defensável | exige pipeline e feedback real |
| Provider compilers/adapters | moderadamente defensável | custo de manutenção e conhecimento operacional |
| Sufficiency/question engine | moderadamente defensável | defensável se treinado com outcomes, não pela ideia |
| Evaluation harness e regression library | moderadamente a fortemente defensável | acumula casos e padrões de falha |
| Vertical benchmarks | fortemente defensável | dados comparáveis e taxonomia de resultados |
| Dataset consentido de conversas + configs + outcomes | fortemente defensável | efeito de rede e aprendizado proprietário |
| Continuous assurance + incident history | fortemente defensável | switching cost, histórico e confiança operacional |
| “usar IA” | sem moat | commodity |

O moat provável é `configuration → deployment → observed outcome → finding → remediation → retest`, acumulado por vertical e fornecedor.

---

# K. MVP

## Menor produto que testa a tese

Não começar por SaaS nem por curso amplo. Executar um **Configuration + Assurance Sprint** manual e instrumentado para 8–12 empresas de uma única vertical.

### Entrega por empresa

1. intake + import;
2. bundle canônico v1;
3. pacote compilado para a IA usada pela empresa;
4. 30–50 cenários de teste;
5. baseline antes/depois;
6. finding report e uma rodada de retest.

### Comparação

- A: configuração atual da empresa;
- B: mesma IA, mesmo canal e mesmos cenários após método;
- avaliadores cegos para versão;
- separar factual accuracy, policy, task completion, turns, handoff, tool execution e custo.

### Critérios de decisão propostos

- melhora estatisticamente visível em pelo menos 70% das empresas;
- zero regressão em guardrails críticos;
- redução de perguntas repetidas e respostas genéricas;
- owner consegue revisar/manter o bundle;
- tempo e custo de configuração suportam margem;
- ao menos três padrões verticais reutilizáveis aparecem.

Se o método não superar baseline de forma consistente, não construir software.

---

# L. Roadmap

| Etapa | Valor | Complexidade/suporte | CAC/margem/retenção | Decisão |
|---|---|---|---|---|
| Low ticket | educação e lead qualification | baixa; suporte pode explodir por plataforma | CAC baixo, margem nominal alta, retenção baixa | usar como entrada, não core |
| Assisted sprint | prova rápida e dados | média, serviço intensivo | CAC consultivo, boa margem se vertical | começar aqui |
| Self-service configurator | escala intake/compilation | alta em UX, adapters e validation | margem melhora; suporte ainda alto | após padrões do sprint |
| AI configuration agent | entrevista adaptativa | alta em assurance e confiança | melhor conversão; risco de resposta errada | após question engine validado |
| Continuous assurance | valor recorrente | alta, integração/runtime | melhor retenção e moat | produto recorrente prioritário |
| Commercial AI OS | outcome/ops multi-provider | muito alta | maior ACV e switching cost | só após PMF estreito |

Sequência recomendada: assisted sprint → evaluation/regression product → configurator → agent → continuous assurance. O low-ticket funciona como aquisição e preparação, não como prova do core.

---

# M. Riscos e contraargumentos

1. **A Meta pode commoditizar onboarding.** Sites, arquivos, catálogo e skills já cobrem o básico.
2. **Documentação organizada pode não mover resultado.** O modelo/retrieval pode ignorar ou selecionar mal conteúdo correto.
3. **Estado de decisão pode ser teatro de precisão.** Um rótulo errado piora a conversa.
4. **PME não mantém freshness.** O configurador pode gerar um pacote excelente que apodrece em semanas.
5. **O problema real pode ser operação, não configuração.** Sem estoque, agenda, preço e processo confiáveis, a IA apenas expõe o caos.
6. **Provider lock-in.** Skills, UI components e handoff variam por plataforma.
7. **Custo variável.** US$ 0,04–0,05 por mensagem pode destruir economia de fluxos longos.
8. **Elegibilidade externa.** Setor, país, trust e produto conflitante podem impedir MBA.
9. **Handoff não determinístico.** Triggers da Meta não são configuráveis; regras críticas podem precisar de app supervisor.
10. **Judge bias.** Avaliação do próprio fornecedor pode aprovar texto plausível sem efeito real.
11. **Privacidade e segurança.** Importar documentos e históricos amplia superfície de dados.
12. **18 documentos viram dívida.** Duplicação cria conflito e stale information.
13. **A tese não é nova por si só.** Context engineering, RAG, tool design, policy-as-code, conversation design e evals já existem. A diferenciação só surge na aplicação integrada, vertical e mensurada.

## O que invalidaria o projeto

- baseline com site/catalog importado performa igual ao método;
- melhora não persiste em conversas reais;
- manutenção custa mais que o valor gerado;
- fornecedores fecham o gap com onboarding/eval automático;
- clientes não pagam por assurance nem mantêm dados;
- não é possível obter outcomes confiáveis para ligar configuração a resultado.

---

# N. Descobertas que devem alterar a metodologia

1. Trocar “documentos” por bundle canônico compilável.
2. Separar knowledge estático, catálogo e tool-backed dynamic truth.
3. Acrescentar eligibility, billing, rollout, allowlist e rollback.
4. Adicionar UI decision rules.
5. Transformar tools em contratos tipados com risk, confirmation, idempotency e evidence.
6. Acrescentar ownership state ao handoff.
7. Dividir memória do gancho em raw, enriched e inferred.
8. Tornar decision state opcional, observável e probabilístico.
9. Acrescentar source precedence e conflict blocking.
10. Acrescentar freshness/owner para todo fato comercial crítico.
11. Incorporar custo por resolved outcome.
12. Tratar Meta Agent Eval como uma camada, não prova final.
13. Adicionar release manifest, config diff, regression e rollback.
14. Consolidar os 18 documentos em 7 artefatos derivados.
15. Posicionar o produto como Commercial AI Configuration + Assurance, não document generator.

---

# O. Lacunas de pesquisa

- países exatos elegíveis e variação por conta/número;
- motivo granular quando eligibility retorna false;
- se e como o MBA recebe referral/CTWA no seu próprio reasoning context;
- presença de `ctwa_clid` na documentação pública atual e condições de entrega;
- campaign/ad set enrichment nativo versus Marketing API externa;
- chunking, ranking, embeddings, precedence e conflict resolution do RAG Meta;
- retenção e memória entre threads;
- limites quantitativos de FAQs, skills, websites e knowledge total;
- timeouts, retries e guarantees internas de connector tools;
- gatilhos completos e timing de handoff automático;
- criação/edição de eval cases, ausente no contrato público consultado;
- contrato funcional de Agent Insights, linkado mas não exposto na verificação;
- analytics/webhook de custo MBA: a página atualizada ainda promete publicação “antes de 1 ago”, data já passada;
- disponibilidade real de UI skills/connectors por mercado e WABA;
- comportamento da oferta nativa no WhatsApp Business app versus API Platform;
- tratamento de áudio/imagem, memória e follow-up fora da janela em cada superfície.

Essas lacunas exigem conta elegível, API readback e canário controlado. Não podem ser resolvidas por arquitetura de papel.

---

# P. Next best action

Executar uma **Falsification Sprint de 7 dias** antes de construir software:

1. escolher uma vertical e duas empresas com configuração existente;
2. congelar 30 conversas/cenários representativos e 10 adversariais;
3. gerar manualmente o bundle v1;
4. compilar para a IA real usada por cada empresa;
5. medir baseline versus configured version;
6. registrar custo, correções humanas, falhas e manutenção;
7. decidir com evidência se o primeiro produto é low-ticket, assisted sprint ou assurance.

A menor intervenção que produz a melhor próxima decisão é criar **um único bundle real + suite de avaliação para uma empresa**, medir antes/depois e descobrir quais campos realmente alteraram comportamento. Essa prova deve preceder naming, interface e desenvolvimento.

## Decisão final

`GO` para validar método + assurance manual.  
`NO-GO` para construir agora um gerador de PDFs ou um SaaS horizontal.  
`REASSESS` após o primeiro before/after com evidence e custo.

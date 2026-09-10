# Deploy e diagnóstico das orientações dos agentes

## Release publicada

- Data: 10/09/2026, aproximadamente 20h15 BRT.
- Commit: `cc7df9e80003efd2ce2cabc64710f5d894c6abe1`.
- Anterior: `e1c8474f00790b4773871e5ff287716d9e46201f` (preservada em `previous`).
- Build isolado com árvore limpa, preflight e staging aprovados.
- Migrações `20260910140000` e `20260910140100` aplicadas pelo Supabase CLI; ledger e contrato de schema aprovados antes da promoção.
- `/health`: ambiente production, commit correto. `/ready`: database, redis, waha-inbound-worker, outbound-worker, receptionist-worker e capi-worker `ok`.
- Manifesto público confirma mesmo commit e API SHA-256 `62fd65221a9f69cce3fb0e1f39c18118c46a1d0232d324c1aee8ba44f8a8caf2`.
- Tela pública de login renderizada no navegador; nenhum erro de console observado. Fluxos autenticados e entrega externa Meta não estão certificados por essas verificações.

## Diagnóstico: defeitos confirmados

Inspeção do código publicado, leitura somente de configurações no banco de produção e reprodução local com entradas sintéticas. Nenhuma mensagem enviada a clientes. Não houve nova alteração de comportamento dos agentes nesta etapa.

1. **P0 — pós-processamento altera conteúdo e pode cruzar empresas.** `HumanizerKernel.humanizeReply` substitui a resposta inteira por preços fixos do SOS ao encontrar padrões de gratuidade, inclusive em uma negativa. Reprodução: “Não posso liberar acesso grátis para você. Consulte a recepção do hotel.” vira “Nossos planos oficiais são: Mensal R$ 97/mês ... Anual R$ 582 ...”. O filtro não recebe workspace. É usado pelo Receptionist, simulador e Copilot.
2. **P1 — regras publicadas contraditórias na Sofia.** `extra_context` exige uma pergunta e proíbe múltipla escolha; o bundle publicado manda sempre propor “escolha fechada”. O Humanizer ainda acrescenta “Qual opção fica melhor para você?” em respostas sem pergunta. Uma orientação nova convive com instruções antigas e com texto inserido depois da inferência.
3. **P1 — prompt comum contém persona de outra empresa.** `buildSystemPrompt` inclui “Aqui é a Sofia da SOS Vendas” para qualquer workspace no gatilho SOS. Reproduzido com configuração sintética de hotel. Também manda segundo balão mesmo quando a estrutura selecionada é bloco único.
4. **P1 — simulador não reproduz o agente operacional.** A rota de simulação monta outro system prompt, lê bundle sem filtro `published_at`, usa catálogo e regras de fallback por marca e não chama `buildSystemPrompt`. Receptionist usa somente publicação e carrega documentos separadamente. Resultado satisfatório no simulador não prova comportamento igual no WhatsApp.
5. **P1 — contrato de configuração incompatível com dados existentes.** Em produção, bundles de Sofia, Camila e Sora contêm `paymentMethods` e `maxInstallmentsWithoutInterest`. O runtime lê `allowedPaymentMethods` e `installmentLimitWithoutInterest`. Esses valores antigos não chegam pelos campos esperados ao prompt. A UI atual usa os nomes novos; falta normalização compatível dos dados publicados antigos.
6. **P1 — horário e capacidade de agendamento contradizem configuração.** O status aberto/fechado usa 9h–19h e `Date.getHours()` do servidor, independentemente do horário publicado. Configuração de hotel 24h foi reproduzida com status “FORA DO HORÁRIO”. O prompt manda anunciar Flow mesmo com `bookingFlowEnabled=false`; o envio real é condicionado à capacidade. `workingHoursOnly` não é aplicado pelo overlay publicado.
7. **P1 — handoff contradiz a promessa de acolhimento.** Prompt manda acolher e informar transferência; `handleInbound`, quando `policy.shouldEscalate`, cria handoff e retorna `reply: ''` antes do envio. A confirmação ao cliente não é enviada por esse caminho.

## Reprodução e limites

Comando sem rede nem credenciais:

```sh
node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/scripts/diagnose-agent-instruction-conflicts.ts
```

Reproduções confirmam transformação indevida, persona SOS em hotel, conflito bloco único/segundo balão, promessa de Flow desabilitado e status inconsistente de hotel 24h. São provas de defeitos determinísticos no código; não afirmam que cada cenário ocorreu com um cliente real.

Não foi fornecido exemplo de conversa incorreta nesta etapa. Portanto não é possível atribuir uma resposta específica a uma dessas causas, nem medir frequência. Também falta rastreabilidade por hash/versão do prompt efetivo para reconstruir precisamente cada inferência histórica. A temperatura da Sofia publicada é 0,6; isto não comprova causalidade e trocar o modelo não resolve os defeitos determinísticos acima.

## Ordem recomendada da próxima correção

1. Remover ofertas, identidades e perguntas injetadas pelo filtro compartilhado; manter sanitização que preserve significado e isolamento por empresa.
2. Unificar resolução de configuração e geração de prompt entre simulador e worker; aceitar e normalizar campos legados com precedência explícita dos campos canônicos.
3. Separar políticas de segurança, orientações do gestor, fatos do negócio e conteúdo de clientes; detectar conflitos antes de publicar.
4. Tornar horário, estrutura, emojis e capacidades de ferramentas coerentes com o workspace, sem instruções comerciais fixas globais.
5. Implementar confirmação de handoff com idempotência e prevenção de corrida, sem reativar o bot para contornar bloqueios.
6. Testar no Lab por workspace e por intenção (saudação, preço, negativa, pagamento, humano e fora de horário); instrumentar versão/hash da configuração efetivamente usada antes de nova promoção.

**Estado:** deploy concluído e saúde verificada; diagnóstico concluído com defeitos reproduzidos; correção desta segunda investigação ainda não aplicada.


## Atualização — correção autorizada e validada

A seção de diagnóstico acima registra o estado anterior. Os defeitos ali reproduzidos foram corrigidos na nova implementação: Humanizer preserva o significado; configuração e prompt são compartilhados pelo worker e simulador; correções publicadas entram mesmo com guardrails; horário, estrutura, emojis e pagamento usam dados do workspace; handoff tem confirmação idempotente antes da pausa.

Decisão do proprietário: SOS/NVIDIA responde; Meta Business Agent permanece desativado. Cloud API, templates e campanhas preservados. Quatro workspaces consultados em produção estavam em sos_sales, meta_agent_enabled=false e NOT_STARTED, sem jornadas pertencentes a meta_business_agent.

Evidência desta correção:
- TypeScript e 570/570 testes da API (87 arquivos); frontend 24/24 e lint aprovados.
- Docker Lab reconstruído; /ready confirmou database, redis, waha-inbound-worker, outbound-worker, receptionist-worker e capi-worker.
- Migração 20260910150000 executada transacionalmente no PostgreSQL local: UPDATE 1 / UPDATE 0. Um bundle órfão preexistente é preservado por filtro de workspace válido. A primeira tentativa foi revertida integralmente pelo erro de FK.
- Quatro inferências reais sintéticas no nvidia/nemotron-3-super-120b-a12b, sem fallback: diária R$240 respeitada; gratuidade recusada; despedida “Até logo!” sem pergunta; pedido de humano com escalate=true. Nenhum cliente real ou transporte WhatsApp envolvido.
- Programa reproduzível: apps/api/scripts/verify-agent-synthetic.ts; requer chave NVIDIA via ambiente, consome inferência e não envia WhatsApp.
- Removida credencial literal de fallback do compose Lab. Não executada rotação de chave.

Limites: não certifica todos os diálogos possíveis nem entrega externa de campanhas. Rastreabilidade por hash passa a existir para novas inferências; não reconstrói retrospectivamente prompts antigos. Reserva SENDING abandonada por crash ainda exige reconciliação antes de pausar/encerrar a jornada.

Estado desta atualização antes da promoção: código e Lab validados; release será identificada pelos manifestos de build e pela verificação pós-promoção.


## Verificação pós-promoção — 10/09/2026, 20h47 BRT

- Release ativa: `acb2d931b651e122bb93550c4cb1e263b1cb54a8`; anterior preservada: `cc7df9e80003efd2ce2cabc64710f5d894c6abe1`.
- API SHA-256: `746c93e13258d3e39fa0d353cac8d72b5d985057bb0274f65431dc70328e4bc1`.
- Build isolado limpo, preflight e staging aprovados. Supabase CLI confirmou somente migração 20260910150000 pendente e a aplicou; ledger aprovado; gate conferiu 14 tabelas e 12 funções.
- Promoção concluída após um 502 transitório durante inicialização. Consultas independentes posteriores confirmaram /health ok com commit acb2d931 e /ready com as seis dependências ok.
- Runtime confirmou `META_BUSINESS_AGENT_ENABLED=false`, chave NVIDIA presente e modelo ativo `nvidia/nemotron-3.5-lightning-30b-a3b`. Esse modelo também passou os quatro cenários sintéticos (preço, gratuidade, despedida e humano), além dos quatro anteriores no 120B. Total: oito verificações de inferência reais sintéticas, sem WhatsApp externo.
- Leitura posterior do banco: quatro configurações em sos_sales, Meta Agent false/NOT_STARTED; quatro bundles publicados, três com campos canônicos de pagamento/parcelas. Os campos não são inventados para o bundle sem origem correspondente.
- Canais preservados: uma conexão meta_cloud CONNECTED, duas WAHA CONNECTED e três registros WAHA DISCONNECTED. Não se afirma conectividade de todos os registros históricos.
- Navegador renderizou a tela pública “Acessar Cockpit” na URL de produção. Não foi executado fluxo autenticado ou envio real de campanha nesta etapa.

**Estado final:** correção publicada e saúde técnica observada. Agente SOS mantido, Meta Business Agent desativado e Cloud API preservada. Não há certificação de perfeição do modelo nem de entrega a destinatários reais nesta validação.

# Auditoria de redundâncias — SOS Sales

Data: 11/09/2026. Inspeção estática do checkout local; não certifica todas as telas autenticadas nem alterações posteriores no VPS. Nenhuma nova alteração funcional feita nesta auditoria. A correção local anterior do fallback do simulador continua separada e não publicada.

## Achados confirmados

| Prioridade | Redundância e evidência | Consequência | Direção |
|---|---|---|---|
| Alta | Dois editores do mesmo bundle: `ClientAgentHubView.tsx:582` e `QaSimulatorView.tsx:704`. O primeiro verifica HTTP; o segundo anuncia sucesso sem verificar o PUT e continua com bundle vazio se o GET falha. | Configuração aparentemente salva e risco de sobrescrever campos se a leitura falhar e a gravação for aceita. | Um serviço de leitura/gravação e um editor canônico; rejeitar gravação sem leitura válida. |
| Alta | Contexto comercial no banco e presets no navegador: `QaSimulatorView.tsx:95-155`, `:217`, `:288`, `:781-825`. Preset EKO carrega conversa de salão e regras locais em qualquer workspace. | Conteúdo setorial pode aparecer sem vir do agente; regras podem conflitar com o negócio ativo. | Remover presets comerciais da operação; exemplos identificados, isolados e sem publicação implícita. |
| Alta | Resposta real e resposta de demonstração no mesmo histórico: `QaSimulatorView.tsx:409-490`, `:514-526`, `:803-815`. Histórico inicial atribui resposta fixa ao NVIDIA; cenários exibem métricas pré-definidas após timer. | Evidência visual não distingue execução de exemplo; histórico sintético pode entrar na próxima requisição em `:548`. | Histórico real inicia vazio; avaliação exige execução e resultado observável. |
| Alta | Dois analisadores cognitivos: `src/utils/cognitiveAnalyzer.ts:313` oferece agenda fixa; `apps/api/src/application/services/cognitive-analyzer.ts:321` oferece condição comercial fixa. | Mesma responsabilidade com regras divergentes. Nem toda duplicação deve ser promovida para o servidor: os dois contêm afirmações que exigem dados verificados. | Contrato único e geração fundamentada em dados; cliente só apresenta resultado. |
| Média | Simulador em dois caminhos: `App.tsx:457` sem bundle e `ClientAgentHubView.tsx:920` com bundle. | Mesmo componente recebe contextos iniciais diferentes e mantém instâncias de estado independentes. | Uma rota canônica; outros botões apenas navegam até ela. |
| Média | Configuração editada por formulário, comandos e calibração: `agent-routes.ts:112`, `:938`, `:1213`, `:1224`, `:1262`, `:1267`. Horário e tom são escritos em configuração operacional e bundle; diretrizes existem em campos distintos. | Mais pontos para divergência e sobrescrita. A existência de duas tabelas, sozinha, não é defeito: responsabilidades operacionais/comerciais precisam permanecer explícitas. | Centralizar publicação e validar precedência, versão e concorrência. |
| Baixa | Rotas agora e conversas repetem composição do `LiveCockpitView`: `App.tsx:265-369`; diferem pelo filtro inicial priorities/all. | Manutenção duplicada, embora o componente e a experiência principal já sejam compartilhados. | Uma rota Atendimento com filtro explícito; preservar links antigos como redirecionamentos. |
| Média | Interface declara Meta Business AI e modelo NVIDIA fixo: `QaSimulatorView.tsx:501`, `:843`, `:917`; resposta real possui model retornado pela API em `:588`. | Identidade do provedor e status podem contradizer a execução. | Mostrar provedor/modelo/status observados, sem selos estáticos de proteção. |

## O que não concluir

Não foi comprovado vazamento de registros da Haven para SOS. Presets de Haven existem no código, mas a frase reportada anteriormente corresponde ao fallback local genérico. A análise identifica caminhos de inconsistência, não prova que cada um foi acionado em produção.

Funil e Atendimento são visões complementares e devem compartilhar jornadas, não ser eliminados. Dossiê em painel e drawer atende larguras distintas; isso não é redundância funcional por si só. WAHA e Meta Cloud API são transportes distintos, não dois agentes concorrentes.

## Ordem recomendada

1. Eliminar respostas, latências e aprovações de teste fabricadas da experiência operacional.
2. Unificar gravação de configuração e impedir sucesso falso, sobrescrita após leitura inválida e edição concorrente silenciosa.
3. Unificar entrada do simulador e garantir estado/requisições isolados por workspace.
4. Consolidar o contrato cognitivo e retirar recomendações comerciais sem dados verificados.
5. Simplificar rotas legadas e rótulos depois de corrigir o comportamento.

Aceitação: falha da API não gera resposta; PUT rejeitado não mostra sucesso; troca de workspace não reutiliza histórico nem resposta pendente; ambos os acessos abrem a mesma configuração publicada; avaliação só aprova após execução; nenhuma agenda/preço/condição vem de constantes demonstrativas.

## Hotfix publicado no VPS — 11/09/2026 15:21 UTC

Release `5c4b72f4720c0c2e81e49d756755e9050d223f42`. Substituído o simulador demonstrativo por chat de API com histórico inicial vazio, instância por workspace, erro explícito, metadados retornados pelo servidor e bloqueio de comandos de edição. Removidos da tela: presets por cliente/EKO, avaliações estáticas, fallback cognitivo, editor duplicado e calibração que publicava alterações. Configuração permanece no painel IA & Conhecimento.

26 testes frontend e TypeScript passaram. Build web/API e preflight passaram. API recompilada tem o mesmo SHA256 anterior: nenhuma mudança de backend. Docker Lab serviu o novo frontend e retornou ready nas seis dependências. Promoção verificou ledger e contrato (18 tabelas, 16 funções); 502 transitório na inicialização foi superado pelo retry. Verificação pública posterior confirmou commit exato, health ok e seis dependências ok. Asset `/assets/index-C5a6M9fW.js` contém a nova tela e não contém identificadores do fallback, preset EKO ou mensagem de sucesso do editor removido.

Não foram alteradas configurações ou catálogos no banco. Consolidação dessas fontes e diagnóstico de falhas de inferência permanecem pendentes. Não foi executada conversa autenticada nem envio WhatsApp nesta validação; saúde e inspeção do bundle não certificam resposta do modelo.

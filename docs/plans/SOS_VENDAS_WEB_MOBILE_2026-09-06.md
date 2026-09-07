# SOS Vendas — plano de experiência web e mobile

Data: 06/09/2026. Responsável pela decisão de produto: Francisco.
Status: proposta estruturada para execução; aplicação ainda não refatorada.
Base inspecionada: checkout `f718ef1`, componentes locais e documentação existente. A sessão anterior inspecionou apenas as telas públicas do VPS; os fluxos autenticados continuam sem evidência visual atual.

## 1. Resultado esperado

O operador identifica quem precisa de atendimento, abre a conversa, consulta contexto, prepara a resposta e retorna à fila sem perder texto nem posição. Esse mesmo percurso deve funcionar com mouse, teclado e toque.

Prioridade de execução: navegação e continuidade → espaço útil e teclado → estados e acessibilidade → acabamento. Preservar React/Vite, serviços existentes, autorização, handoff e regras de envio.

Entregas desta etapa de planejamento:
- Este plano, com decisões propostas, responsabilidades e critérios de aceite.
- [Wireframe interativo](SOS_VENDAS_WEB_MOBILE_WIREFRAME.html): demonstra a distribuição de espaço e o percurso fila/conversa/dossiê. Conteúdo ilustrativo, sem API ou envio real.
- [Backlog estruturado](SOS_VENDAS_WEB_MOBILE_TASKS.jsonl).

## 2. O que já existe e deve ser aproveitado

| Evidência local [KNOWN] | Implicação para o trabalho |
|---|---|
| `docs/DESIGN.md` define fontes, cores, estados e acessibilidade | Evoluir esse documento; não criar um segundo design system na raiz |
| `docs/RESPONSIVE_BEHAVIOR.md` já prevê dossiê lateral e preservação de contexto | Reconciliar especificação com implementação antes de acrescentar padrões |
| `AppShell.tsx` usa sidebar de 232/72px, topbar de 48px, navegação inferior fixa e safe areas | Reaproveitar elementos, reorganizando quando aparecem |
| `LiveCockpitView.tsx:1123` usa fila de 290px + chat a partir de `md` | As três regiões ainda não são o layout principal observado no código |
| Dossiê possui modal e estado de recolhimento | Reutilizar conteúdo e dados; evitar carregar duas versões simultâneas |
| O composer ativo também está implementado dentro de `LiveCockpitView.tsx` | Não presumir que editar apenas `SupervisedComposer.tsx` altera o Cockpit em uso |
| `src/App.tsx` já sincroniza abas com URL e trata `popstate` | Estender a navegação atual, sem introduzir um roteador paralelo |
| `src/index.css` tem safe areas, `dvh`, scroll e tokens WhatsApp | Consolidar utilitários antes de criar novos |
| Documento usa verde `#059669` e dark `#0F172A`; CSS usa `#00A884` e `#0B132B` | Registrar a divergência e conciliar cores e contraste na primeira etapa |

[INFERRED] A soma de barras globais, controles contextuais e painéis reduz a área de atendimento. Precisa de reprodução autenticada com teclado aberto.

[A VALIDAR] Perda ou mistura de rascunho ao trocar contato, comportamento real no iPhone, restauração de scroll e concorrência entre navegação e overlays. Não tratar como bugs confirmados apenas pela leitura do código.

## 3. Arquitetura da informação — revisão de hierarquia

Revisão de 06/09 após observação de Francisco: o plano anterior manteve Agora e Conversas como destinos paralelos. Esta versão substitui essa proposta por **Atendimento único**. Alteração aplicada ao plano e ao wireframe, ainda não ao CRM.

### 3.1 Diagnóstico confirmado no código

- `LiveCockpitView.tsx` já oferece Todas, Fila, Ativas, busca e nova conversa.
- `LiveConversationsView.tsx` oferece outra lista, busca, filtros e nova conversa; também agrega o Funil.
- `src/App.tsx` abre a conversa selecionada em Conversas alterando a aba para Agora. É um caminho adicional para chegar ao mesmo atendimento.
- O menu aponta Lista e Funil para o mesmo id `conversas`, usando modos. O roteamento também agrupa `/funil`, `/kanban` e `/conversas`. Estado ativo e links precisam refletir a tarefa corretamente.
- A composição local da fila tem fallback de prioridades vazias para jornadas gerais. A seleção Ativas usa também etapas QUALIFIED/PROPOSAL; o contrato `ApiJourney.status` define OPEN/WON/LOST/ABANDONED. Assim, o código mistura etapa comercial e estado de atendimento. Isso é evidência estática; a ocorrência percebida em produção ainda precisa de reprodução.

[INFERRED] A redundância vem de expor diferentes recortes do mesmo conjunto de conversas como áreas independentes. Reduzir apenas os nomes não resolve filtros, contagens, rotas e continuidade.

### 3.2 Quatro níveis, cada um com uma função

| Nível | Responde | Elementos |
|---|---|---|
| Área | Que trabalho vou fazer? | Atendimento, Funil, Agenda, IA, Resultados, Configurações |
| Recorte | Quais registros preciso ver? | Prioridades/Todas; filtros de responsável, canal, status e etapa |
| Contexto | Sobre qual cliente estou trabalhando? | Conversa, dossiê, compromisso, notas do cliente |
| Ação | O que farei agora? | Assumir, responder, consultar horário, mudar etapa, concluir |

Uma ação não vira item principal do menu. Um filtro não vira outro módulo. Uma métrica não ocupa permanentemente o cabeçalho do atendimento.

### 3.3 Navegação por dispositivo

**Mobile:** Atendimento · Funil · Agenda · Mais. Agenda aparece somente onde habilitada e suportada; nesse caso são quatro destinos, senão três. Não preencher o espaço com um segundo atalho de conversas. Manter ordem estável por workspace/perfil.

**Desktop:** sidebar com os mesmos nomes de destino, agrupados por finalidade:

```text
OPERAÇÃO                       GESTÃO
  Atendimento                    Resultados
    Prioridades / Todas          Metas (dentro de Resultados)
  Funil
  Agenda [se habilitada]        ADMINISTRAÇÃO
  Grupos [se habilitados]         Configurações
                                 Equipe e permissões
IA                               Canais e integrações
  Conhecimento da empresa        Rastreamento Meta
  Agentes                        Clientes e subcontas [owner]
  Simulador

AJUDA
  Guia de início
```

Subseções reutilizam telas existentes; não criar módulos de Metas, Equipe ou Canais se já existem em Configurações/Resultados. A organização não habilita funções ocultas por runtime, contrato ou papel.

No mobile, Mais apresenta os grupos **IA**, **Gestão**, **Administração** e **Ajuda** com nomes visíveis e busca de recursos se o volume justificar. Não transformar Mais em lista indiferenciada. Grupos e anotações gerais ficam em Operação dentro de Mais, quando disponíveis. Notas de um cliente pertencem ao Dossiê; scripts globais pertencem a Conhecimento, preservando armazenamento e permissão atuais.

### 3.4 Atendimento único

Título: **Atendimento**. Entrada padrão: **Prioridades**. Segunda opção visível: **Todas**. Não usar simultaneamente rótulos Agora, Cockpit, Central Comercial e Conversas para esse mesmo destino.

- Prioridades: trabalho acionável segundo a regra persistida de prioridade; ordem por urgência/SLA do serviço. Expor motivo em cada item. Não equiparar prioridade a mensagem não lida.
- Todas: jornadas acessíveis no workspace, com busca e ordenação por atividade disponível no contrato. Não prometer busca no corpo do histórico se o serviço só suporta nome/telefone/serviço.
- Filtros adicionais em um botão **Filtros**: responsável, canal, estado de atendimento, etapa comercial, serviço e perfil quando suportados. Mostrar resumo e Limpar filtros. Estado de atendimento e etapa comercial são campos separados.
- “Comigo”, “Com IA” e “Concluídos” são filtros ou visualizações salvas futuras, não abas obrigatórias. Dependem de atributos reais de atribuição/handoff. O `ApiJourney` atual sozinho não comprova esses campos; exigir projeção suportada, sem buscar o detalhe de cada contato para filtrar a lista.
- Contagem usa a mesma consulta, escopo de acesso e filtros da lista. Em paginação, total vem do serviço; enquanto indisponível, não representar quantidade carregada como total.
- Prioridades vazias: **“Nenhum atendimento prioritário”**, com **Ver todas**. Não substituir silenciosamente a lista por Todas.
- Nova conversa permanece acessível junto à lista. Mesma ação, modal e contrato em qualquer entrada.
- Selecionar cliente abre o chat no mesmo Atendimento. Trocar recorte não deve trocar o destinatário silenciosamente. Se o cliente sair do filtro durante conversa aberta, manter o chat com aviso discreto e permitir voltar à lista.

### 3.5 Funil: área diferente, conversa compartilhada

Funil responde **“em que etapa estão as oportunidades?”**. Atendimento responde **“quem precisa de resposta e qual é o contexto?”**. São tarefas distintas sobre as mesmas jornadas.

Manter Funil como destino principal; remover a necessidade de encontrá-lo também como modo de uma segunda Central de Conversas. Abrir contato pelo Funil entra no Atendimento com origem identificada. Voltar retorna à mesma etapa, filtros e posição. Alterar etapa utiliza a mesma operação já existente; não copiar registros nem criar uma segunda fonte de verdade.

### 3.6 Hierarquia da conversa

1. Cliente, workspace/canal e responsável; IA/humano explícito por texto e ícone.
2. Histórico e campo de resposta.
3. Dossiê e próximo passo sob demanda.
4. Ações secundárias em Mais, com linguagem orientada à ação.

Meta diária, faturamento e gamificação saem da faixa permanente acima do chat e passam para Resultados, com acesso contextual se necessário. Alerta crítico de canal/handoff permanece próximo da ação afetada.

Se o operador não puder enviar, explicar o motivo junto ao composer e manter a ação de assumir/handoff acessível segundo as regras atuais.

### 3.7 Compatibilidade e migração

Rotas propostas: `/atendimento` (Prioridades), `/atendimento?visao=todas` e `/funil`. Detalhe preserva identificador de conversa e origem, sem nomes, telefones ou mensagens na URL. Integrar ao histórico existente.

| Entrada anterior | Destino proposto | Contexto preservado |
|---|---|---|
| `/agora` | Atendimento / Prioridades | Conversa selecionada e origem |
| `/conversas` em lista | Atendimento / Todas | Busca e filtros válidos |
| `/conversas` em modo kanban, `/kanban` ou `/funil` | Funil | Etapa, filtros e seleção |
| Atalho de contato, alerta ou busca global | Mesmo detalhe de Atendimento | Journey e destino de retorno |

Preservar aliases com `replaceState`/redirecionamento compatível, sem loops de histórico. Na migração de localStorage, validar valores antigos por runtime/papel e não reativar recursos bloqueados. Se o modo antigo não foi persistido, não inventar estado: usar destino padrão explícito e registrar essa limitação.

Mapear ações, permissões e contratos antes de desativar pontos de entrada duplicados. Reutilizar componentes, hooks e filtros; remover código antigo só após provar equivalência. Essa reorganização muda navegação; redefinir a classificação de atendimento exige tarefa funcional separada e testes próprios.

### 3.8 Critérios de aceite da hierarquia

- Existe apenas um destino de atendimento no menu, na busca global e na barra inferior.
- Prioridades e Todas compartilham o chat, rascunho e detalhe do cliente.
- Usuário identifica onde responder, mover uma oportunidade, consultar horário e configurar IA sem explicar “Agora versus Conversas”.
- Prioridades vazias exibem vazio verdadeiro; contagem e registros concordam.
- WON/LOST não significam automaticamente handoff concluído; etapa de venda não significa operador responsável.
- Back/Forward, links antigos e reload preservam destino e filtros possíveis, sem loops.
- Configurações, IA e relatórios mantêm permissões e recursos habilitados existentes.
- Teste de árvore com 5 operadores: pelo menos 4 encontram as quatro tarefas principais sem dica; comparação de primeiro clique e retornos antes/depois. Meta de estudo exploratório, ainda não medida.

Referência metodológica: [NN/g — arquitetura da informação e navegação](https://www.nngroup.com/articles/ia-vs-navigation/). O agrupamento acima é uma decisão específica proposta para SOS Vendas, não uma prescrição dessa fonte.

## 4. Contrato de layout adaptativo

O modo depende da **largura interna do Cockpit**, depois da navegação e dos paddings. Valores são orçamento inicial de layout a validar, não medidas universais.

| Largura interna C | Modo | Distribuição |
|---|---|---|
| C < 760px | Compacto | Uma região por vez: fila, conversa ou dossiê |
| 760px ≤ C < 1120px | Dividido | Fila 280px + chat flexível; dossiê em overlay |
| C ≥ 1120px | Amplo | Fila 280px + chat mínimo 480px + dossiê 340px + 20px de separação |

No modo amplo, o dossiê pode recolher para uma faixa de 48px. Em modo dividido, usar apenas o botão Dossiê no cabeçalho, sem reservar faixa lateral. Preferência de recolhimento permanece por usuário; ao reduzir a janela, não forçar painel aberto. Reabrir a janela não deve abrir um overlay inesperado.

Sidebar global: abaixo de 1024px fica em gaveta; de 1024 até 1439px inicia recolhida em 72px; a partir de 1440px inicia expandida em 232px. A preferência explícita pode alterar isso; recalcular o Cockpit sem reduzir sua conversa abaixo do orçamento mínimo. Expandir a sidebar pode transformar o dossiê em overlay.

Exemplos com 24px de padding externo:
- 1280 − 72 − 24 = 1184px: três regiões possíveis.
- 1280 − 232 − 24 = 1024px: duas regiões e dossiê em overlay.
- 1440 − 232 − 24 = 1184px: três regiões possíveis.

```text
AMPLO     [ navegação ][ fila 280 ][ conversa flexível ][ dossiê 340 / faixa 48 ]
DIVIDIDO  [ navegação ][ fila 280 ][ conversa flexível ]  + dossiê sob demanda
COMPACTO  [ fila ] → [ conversa ] → [ dossiê ]
                       ↑_____________↓ fechar
             ← voltar à origem, preservando contexto
```

Usar container queries para a apresentação sempre que possível. Se React precisar conhecer o modo, uma única fonte de medição alimenta o layout e o gerenciamento de foco; evitar breakpoints duplicados em vários componentes.

## 5. Shell, barras e rolagem

| Contexto | Cabeçalho | Base | Região que rola |
|---|---|---|---|
| Mobile na fila | Workspace, busca e acesso ao menu; altura 56px + safe area | Navegação principal 56px + safe area | Lista |
| Mobile na conversa | Voltar, cliente, Dossiê e Mais; 56px + safe area | Composer; navegação principal recolhida | Mensagens |
| Mobile no dossiê | Título e Fechar | Ações do contexto, quando existirem | Conteúdo do dossiê |
| Desktop | Barra global compacta; cabeçalho da conversa próprio | Composer no fluxo do painel | Cada painel independentemente |

Não manter topbar global + cabeçalho de conversa no mobile. Voltar à lista restaura a navegação global. A identificação do workspace deve continuar acessível no contexto, especialmente para suporte com vários clientes.

O chat usa linhas `auto minmax(0,1fr) auto`: cabeçalho, histórico e composer. Uma única camada é responsável pela altura e pelos insets. Não compensar o mesmo espaço com `padding-bottom` no shell e no composer.

Sem rolagem horizontal da página. Lista de etapas do Funil pode ter rolagem horizontal própria. Mensagens longas e URLs quebram linha; mídia respeita a largura do painel.

## 6. Teclado, composer e contexto

### Teclado e mensagens
- Fonte de entrada proposta: 16px; campos com crescimento de uma até cinco linhas, depois rolagem interna.
- Campo e botão principal devem permanecer inteiros na área visível com teclado aberto.
- `100dvh` é base, não critério de sucesso. Testar Safari e Chrome reais; usar `VisualViewport` apenas onde a reprodução exigir, sem confundir zoom manual com teclado.
- Ao abrir o teclado, preservar a mensagem âncora; se o usuário já estiver no fim, manter a última mensagem visível. Se estiver lendo mensagens antigas, não saltar para o fim.
- Nova mensagem durante leitura antiga mostra “Novas mensagens”; o toque leva ao fim.
- Enter no celular insere quebra de linha. Desktop: Enter envia pelo fluxo autorizado existente, Shift+Enter quebra linha; não enviar durante composição de texto (IME).
- Botão principal alterna com o estado do texto, sem mudar o tamanho do alvo. Áudio mantém permissões, cancelar e estados já suportados; não prometer capacidades inexistentes.

### Estado de navegação
Definir um estado único para `origem`, `journeyId`, `painel` e `modoDeLayout`. Filtros e scroll pertencem à origem. Histórico de navegação identifica painel/conversa sem texto pessoal na URL. Integrar ao histórico já existente em `App.tsx`.

Sequência do Voltar: fecha dossiê/overlay → retorna à fila/origem → navegação anterior. Não capturar indefinidamente a saída do site. Recarregar um link de conversa revalida workspace e permissão; contato removido mostra estado indisponível com caminho de retorno.

### Rascunho e isolamento
Requisito proposto: preservar texto durante navegação e recarga na mesma aba. Chave: usuário + workspace + conversa. Preferir store em memória com persistência restrita em `sessionStorage`; limpar no logout e ao detectar mudança de identidade. Rascunhos de um workspace não devem aparecer em outro. Falha de armazenamento mantém edição em memória sem quebrar a tela. Não persistir anexos, tokens, transcrições ou histórico por esse mecanismo.

Antes de implementar, localizar todos os composers realmente usados e reutilizar um contrato comum. Não copiar texto de uma conversa para outra. Ao aceitar sugestão de IA com texto já escrito, apresentar escolha de substituir ou manter; nunca sobrescrever silenciosamente.

Não limpar texto antes de confirmação do resultado adequado do fluxo existente. “Preparado”, “na fila”, “enviado” e “entregue” seguem respostas reais; apresentação não pode promover um estado para sucesso.

## 7. Dossiê e ferramentas de IA

Conteúdo em ordem: situação atual e responsável → próximo passo → fatos confirmados → histórico/notas → ferramentas complementares. Texto gerado por IA deve ser identificável como sugestão, separado dos fatos registrados.

Reutilizar `LiveDossier` e conteúdo do modal onde compatíveis. Apenas uma instância ativa do conteúdo; dados e requisições pertencem ao estado da conversa, não à abertura do painel. Abertura não reinicia scroll do chat nem gera novamente recomendações.

Overlay com título, fechar visível, Escape, foco contido e retorno ao acionador. Em compacto, usar tela de contexto inteira, sem várias gavetas empilhadas. No desktop amplo, painel não modal: navegação por teclado continua entre regiões.

## 8. Módulos seguintes

| Módulo | Experiência definida | Condição de aceite |
|---|---|---|
| Funil | Desktop com colunas; mobile com seletor de etapa e uma lista. Mover etapa por menu também no desktop | Mesma ação acessível sem arrastar; falha mostra estágio confirmado e retry, sem falso sucesso |
| Atendimento | Consolida Agora e Conversas com Prioridades/Todas, busca e filtros | Uma lista operacional e um chat; voltar restaura recorte, busca e scroll |
| Agenda | Mobile inicia em dia/lista; outras visualizações por escolha explícita | Consultar horários e voltar preserva rascunho; usa horários reais do provedor |
| Inteligência | Visão inicial com estado dos agentes; detalhes e configuração em subseções | Abas têm nome e estado ativo; acesso por toque e teclado; nenhuma ação apenas por swipe |
| Configurações | Lista de seções no mobile; detalhe com retorno | Campos rotulados, erro junto ao campo, salvar acessível com teclado aberto |
| Login e cadastro | Manter fluxo atual e corrigir associações de labels | Leitor de tela distingue e-mail, senha e confirmação |

## 9. Matriz de estados visíveis

| Região | Carregando | Vazio | Erro | Sucesso | Parcial/desconectado |
|---|---|---|---|---|---|
| Fila | Esqueleto com geometria estável | “Nenhum atendimento prioritário”; Ver todas | Mensagem + Tentar novamente | Lista e contagem reais | Última atualização visível; não alegar conexão ativa |
| Chat | Cabeçalho permanece; histórico carrega | “Nenhuma mensagem nesta conversa” | Histórico indisponível + retry | Mensagens com estado real | Rascunho editável; envio indisponível quando necessário |
| Composer | Estado da operação e prevenção de duplicação | Campo com rótulo; áudio se suportado | Texto preservado e motivo claro | Limpeza após confirmação apropriada | Sem reenvio automático ao reconectar |
| Dossiê | Conteúdo estável/esqueleto local | “Sem informações registradas”; ação permitida | Apenas bloco afetado com retry | Fatos e sugestões identificados | Mostrar o que existe, marcando atualização pendente |
| Funil | Estrutura de etapas permanece | “Nenhum contato nesta etapa”; escolher outra | Etapa confirmada + erro ao mover | Estado persistido refletido na UI | Atualização pendente explicitada |
| Agenda | Grade/lista em carregamento | “Sem horários disponíveis” | Integração indisponível + orientação | Disponibilidade real | Não preencher horários inventados |

Sem permissão: mostrar motivo e retorno seguro; ações indevidas não são habilitadas por mudança de layout. Conexão perdida não abre novos diálogos sucessivos.

## 10. Sistema visual e acessibilidade

Manter Sora para títulos, Source Sans 3 para leitura e IBM Plex Mono apenas onde números alinhados forem úteis. Corpo 14–16px, entrada mobile 16px, metadados preferencialmente 12–13px. Não reduzir nomes e ações até caberem.

Base espacial 4px; uso preferencial de 8/12/16/24px. Uma borda por região estrutural; separadores internos discretos. Mobile ocupa toda a largura disponível. Verde indica ação, roxo identifica IA e âmbar/vermelho comunicam urgência junto com texto.

Partir dos tokens do CSS atual e atualizar a documentação na implementação. Medir cada combinação: a existência de um token não garante contraste. Texto normal ≥4,5:1; componentes e foco distinguíveis. Não manter branco sobre verde por identidade visual caso o contraste falhe.

Alvos de toque do produto ≥44×44 CSS px, preferencialmente 48px para ações frequentes. É uma escolha de ergonomia do SOS Vendas; não confundir com o mínimo de 24px e exceções do WCAG 2.2 AA. Ícones podem ser menores dentro do alvo. Tooltip nunca é o único nome da ação.

Foco visível, labels associados, landmarks, headings, zoom a 200%, opção de reduzir movimento e estados sem dependência exclusiva de cor. Atualizações do chat não devem anunciar todo o histórico repetidamente no leitor de tela.

Movimento curto e funcional (120–180ms), desligado ou simplificado com `prefers-reduced-motion`. Blur, papel de parede e efeitos ficam subordinados à legibilidade e ao custo de renderização.

## 11. Jornada de aceite

| Passo | Ação | Resultado visível | Confiança que deve produzir |
|---|---|---|---|
| 1 | Abrir Atendimento / Prioridades | Nome do workspace e próxima conversa prioritária claros | Sei onde estou e por onde começar |
| 2 | Abrir conversa | Cliente, responsável e histórico aparecem | Estou falando com a pessoa certa |
| 3 | Escrever e abrir dossiê | Texto continua preservado | Posso consultar sem perder trabalho |
| 4 | Fechar dossiê/teclado | Mesma conversa e posição | A interface não me desloca |
| 5 | Enviar pelo fluxo permitido | Estado verdadeiro e erro recuperável se ocorrer | Sei o que aconteceu |
| 6 | Voltar | Fila/origem no lugar anterior | Consigo continuar atendendo |

Metas propostas para teste moderado, ainda não medidas: pelo menos 4 de 5 operadores completam o percurso sem instrução; zero troca de destinatário, zero perda de texto e zero duplicação de envio nas repetições. Teste exploratório pequeno não equivale a comprovação estatística.

## 12. Etapas e tarefas de implementação

Nenhuma etapa depende de estimativa fixa de “522 testes”. Usar os scripts e resultados reais do checkout na execução.

| ID | Prioridade | Entrega / responsabilidade | Dependência | Prova para encerrar |
|---|---|---|---|---|
| T1 | P1 | Baseline autenticada, inventário dos composers e conciliação de docs/tokens | Conta de homologação | Capturas desktop/mobile com SHA e lista de divergências; contratos preservados |
| T2 | P1 | Shell contextual e regras por largura disponível | T1 | 375–1920px, sidebar nas duas larguras, sem sobreposição |
| T3 | P1 | Navegação de conversa e store de rascunhos isolados | T1 | Voltar/Avançar/reload e alternância entre dois contatos/workspaces sem mistura |
| T4 | P1 | Composer, teclado e ancoragem do histórico | T2,T3 | Safari iPhone e Chrome Android reais; texto e envio recuperáveis |
| T5 | P1 | Dossiê adaptativo com conteúdo compartilhado e foco correto | T2,T3 | Overlay e painel sem desmontar conversa ou duplicar requisições |
| T6 | P1 | Consolidar Agora/Conversas e preservar aliases; separar Funil por tarefa | T3,T4,T5,T9 | Destino Atendimento único; aliases e filtros corretos; retorno ao Funil; persistência validada |
| T7 | P2 | Agenda, Inteligência, Configurações e acesso inicial | T2,T6 | Fluxos secundários acessíveis sem perder atendimento |
| T8 | P1 | Homologação integrada, acessibilidade e preparação de release | T4–T7,T9 | Matriz de aceite com evidências; regressões bloqueadoras zeradas |
| T9 | P1 | Validar semântica de prioridade, estado e contagens; corrigir mapeamentos em tarefa funcional separada | T1 | Prioridade vazia não vira Todas; etapa não implica handoff; projeção e paginação verificadas |

P1 bloqueia a liberação do escopo correspondente. P2 faz parte desta refatoração completa, mas pode ser entregue após o núcleo; não declarar a ferramenta inteira concluída ao terminar só T2–T5. T6 é P1 nesta revisão: não liberar a nova navegação enquanto as duas entradas continuarem concorrendo. A validação/mapeamento de filtros deve começar em T1, antes da apresentação de T2. Esforço/calendário serão estimados após T1, porque falta a baseline autenticada.

### Arquivos e limites de responsabilidade

- Shell: `src/components/layout/AppShell.tsx`, `WorkspaceSwitcher.tsx` e `src/App.tsx`.
- Cockpit: `LiveCockpitView.tsx`, `LiveDossier.tsx`, `DossierFocusModal.tsx`, `ExternalAgendaDrawer.tsx`, `SupervisedComposer.tsx` quando confirmado no fluxo ativo.
- Extrações propostas, somente quando necessárias: `CockpitLayout.tsx`, `ConversationComposer.tsx`, `useConversationUiState.ts`, `useConversationDrafts.ts` e `useVisualViewport.ts`.
- Secundários: `LiveCommercialKanbanView.tsx`, `LiveConversationsView.tsx`; localizar componentes efetivamente renderizados de Agenda/Inteligência antes de editar.
- Estilo/documentação: `src/index.css`, `docs/DESIGN.md`, `docs/RESPONSIVE_BEHAVIOR.md` e apontamento em `CLAUDE.md` para o caminho canônico.
- Serviços/API: preservar contratos; necessidade de correção de regra sai da alteração visual e recebe diagnóstico e validação próprios.

Extrair apresentação antes de reorganizar efeitos e requisições. Não manter duas árvores de chat montadas para alternar desktop/mobile. Revisar preservação de foco e estado a cada extração.

## 13. Matriz de verificação e liberação

Viewports mínimos: 375×667, 390×844, 430×932, 768×1024, 1024×768, 1280×720, 1440×900 e 1920×1080; adicionar landscape e zoom a 200%. Testar limites internos C=759/760 e C=1119/1120.

Evidência por cenário: SHA do frontend/API, browser/dispositivo, viewport, pré-condição, passos, resultado esperado/obtido e screenshot ou gravação. Usar dados de homologação; não incluir credenciais, contatos reais ou mensagens pessoais nos artefatos.

- [ ] Nenhum scroll horizontal da página, controles cortados ou sobreposição de composer.
- [ ] Teclado real abre/fecha e rotação mantém resposta e contexto; emulação sozinha não aprova esse item.
- [ ] Nome extenso, URL longa, mensagem multilinha, mídia e histórico longo cabem no painel.
- [ ] Voltar/Avançar/fechar overlay/recarregar restauram o estado previsto, sem prender a saída do site.
- [ ] Dois contatos e dois workspaces têm rascunhos separados; logout remove dados locais de sessão.
- [ ] Falha de envio mantém texto; reconexão não envia sozinha; estados refletem backend/provedor.
- [ ] IA/humano, assumir, concluir e permissão continuam corretos.
- [ ] Dossiê não reinicia o chat; novas mensagens não tiram o usuário da leitura antiga.
- [ ] Funil oferece mudança de etapa por toque/teclado e confirma persistência após reload.
- [ ] Acesso por teclado, leitor de tela, contraste e movimento reduzido verificados.

Automação: testes de estado/navegação/rascunhos e interações de risco; testes existentes pertinentes; `bun run lint`, `bun run test`, `APP_ENV=lab bun run build`, `npm run audit:contracts`. Ampliar testes da API se contratos ou integração forem afetados. Suites que usam banco só em ambiente de teste isolado, nunca com URL de produção.

Sequência de liberação: desenvolvimento → build Docker Lab com ambiente explícito → QA integrada → artefatos de produção e preflight → promoção aprovada por Francisco. Prova externa WAHA/WABA/Meta exige cenário e destinatários autorizados próprios; a refatoração visual não constitui autorização de disparo.

Registrar a release anterior para rollback conjunto pelos scripts existentes. Falha crítica de navegação, perda de texto, mistura de workspace ou envio incorreto bloqueia promoção; após promoção, aciona avaliação imediata de rollback. Não criar flag persistida só no navegador como controle de autorização.

## 14. Fora do escopo desta refatoração

- Aplicativo nativo, migração de framework e publicação em lojas: não necessários para corrigir o fluxo web atual.
- PWA completa, notificações push e envio offline: capacidades distintas; avaliar depois do núcleo. Modo instalado, se já disponível, entra nos testes.
- Alterações de preço, checkout, cobrança, autonomia da IA ou regras comerciais: manter infraestrutura e contratos existentes.
- Redesenho de marca e nova família tipográfica: manter identidade reconhecível.
- Reescrita geral de backend e remoção de módulos: não resolvem o objetivo delimitado.

## 15. Revisão do plano e pendências

Sete dimensões examinadas: arquitetura da informação (§3), estados (§9), jornada (§11), especificidade visual (§10), alinhamento ao design system (§2/10), responsividade/acessibilidade (§4–6/10/13) e decisões pendentes (abaixo). Esta é uma proposta escrita com base no pedido, não uma aprovação visual final nem revisão independente de engenharia.

Pendências para execução:
1. Baseline autenticada na release que será refatorada, incluindo confirmação do composer ativo.
2. Validação visual do fluxo demonstrado; o wireframe é uma proposta, sem aprovação registrada.
3. Prova em iPhone e Android reais do teclado e retorno ao app.
4. Revisão de engenharia do armazenamento de rascunhos, integração com histórico e isolamento antes de implementar esses itens.

Não foram modificados `TODOS.md`, regras canônicas ou código de produção nesta etapa. As tarefas propostas estão no backlog acompanhante.

Referências consultadas em 06/09/2026:
- [MDN — VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport): teclado pode reduzir a área visual sem reduzir o layout.
- [Apple — UI Design Dos and Don'ts](https://developer.apple.com/design/tips/): referência de ergonomia para toque; pontos nativos não são automaticamente equivalentes a CSS pixels.
- [W3C — Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): distinguir mínimo normativo de alvo adotado pelo produto.

## Verificação do artefato de planejamento

Revisão de hierarquia verificada no wireframe: busca por Rafael em Prioridades mostra zero itens e estado vazio; mudar para Todas mostra um item; abrir, escrever e voltar preserva busca, recorte e texto. Quatro destinos mobile: Atendimento, Funil, Agenda e Mais. Sem erro no console; sem overflow horizontal interno em 390px.

Wireframe aberto com gstack browse: alternância entre contatos, rascunho separado em memória, abrir/fechar dossiê e recolher/expandir painel desktop verificados. Nenhum erro de console observado. Isso valida somente a demonstração isolada; não comprova o comportamento do CRM, persistência após reload ou teclado real.

Revisão de hierarquia: proposta anterior de Agora + Conversas substituída por Atendimento. Status de aplicação continua planejamento; nenhuma remoção de função ou alteração de produção executada.

## GSTACK REVIEW REPORT

| Revisão | Estado | Resultado |
|---|---|---|
| Estruturação com plan-design-review | Proposta documentada | Sete dimensões cobertas; interação de aprovação formal não realizada |
| Engenharia | Pendente | Revisar histórico, rascunhos e ciclo de vida dos painéis |
| QA autenticada e dispositivos reais | Pendente | Não executada nesta etapa de planejamento |

**VERDICT:** plano e backlog disponíveis; não representa homologação nem aprovação de deploy.

**UNRESOLVED DECISIONS:**
- Confirmar direção visual após revisar o wireframe e obter baseline autenticada.
- Fechar solução técnica de teclado e estado com revisão de engenharia e evidência nos dispositivos.

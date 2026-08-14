# P0.6 — Cockpit de Continuidade Comercial

**Status:** blueprint de produto e UX. Não implementar antes de P0.4 (handoff,
política e envio supervisionado) estar homologada.

## 1. Decisão de produto

**Assunto:** uma mesa para uma pessoa não perder o contexto nem o momento de uma
venda no WhatsApp.

**Usuário primário:** operador comercial de uma pequena empresa que alterna
atendimento, orçamento e retorno de leads durante o dia.

**Trabalho único da tela:** permitir que o operador, em menos de um minuto,
entenda uma conversa prioritária e execute a menor próxima ação humana segura.

O cockpit não é dashboard, CRM genérico, tela de configuração ou “central da
IA”. Ele é uma bancada de trabalho. Dados de origem e operação entram apenas
quando ajudam a decidir o próximo movimento.

## 2. Princípios de UX

1. **Uma decisão por vez.** A tela privilegia a conversa selecionada e uma
   próxima ação. Nada compete com isso.
2. **Contexto antes de sugestão.** A IA não recomenda sem mostrar a evidência
   que a sustenta.
3. **Humano no comando.** “Enviar” sempre identifica o canal, o destinatário e
   o tipo de aprovação. Recomendar não é enviar.
4. **Contexto não é cadastro.** O dossiê revela somente o que muda a conversa
   atual; campos extensos ficam sob expansão deliberada.
5. **Operação e configuração nunca se misturam.** Conectar WABA, editar
   template, usuários, políticas e segredos são telas administrativas separadas.
6. **Falha segura é visível.** Canal pausado, aprovação ausente ou risco de
   política bloqueiam o envio com causa e próximo passo, não com erro genérico.

## 3. Arquitetura de informação

### 3.1 Três superfícies, três perguntas

| Superfície | Pergunta respondida | Conteúdo máximo inicial |
|---|---|---|
| **Agora** | O que exige ação humana? | 3–5 prioridades ordenadas por SLA/risco, nunca uma lista infinita. |
| **Conversa viva** | O que já aconteceu e o que faço agora? | conversa, contexto mínimo, uma recomendação, composição. |
| **Prova de resultado** | O tráfego e atendimento viraram resultado? | período, origem, resposta, handoff e outcome agregados. |

Configurações ficam em navegação secundária e não aparecem na sessão de
atendimento.

### 3.2 Taxonomia visível ao operador

Use palavras de operação, não nomes técnicos:

- `Aguardando você` — handoff `PENDING` e itens com SLA crítico.
- `Em atendimento` — handoff aceito pelo operador atual.
- `Concluídas hoje` — handoffs resolvidos, limitados a cinco itens.
- `Origem` — anúncio, campanha ou referência; nunca “payload referral”.
- `Próximo passo` — ação sugerida ou manual, nunca “agent run”.
- `Canal pausado` — kill switch; explica que não haverá envio.

## 4. Cockpit principal

### 4.1 Wireframe desktop

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Sales OS / Agora                 [Haven]              [Pesquisar conversa] │
├───────────────┬────────────────────────────────────┬───────────────────────┤
│ AGORA (3–5)   │ CONVERSA VIVA                      │ CONTEXTO E DECISÃO     │
│               │                                    │                       │
│ [●] Ana       │ Ana • anúncio “Escova R$59”        │ ORIGEM                │
│  aguarda 4m   │ WhatsApp · canal principal         │ Meta / campanha ...   │
│  preço        │ ─────────────────────────────────  │ confiança: confirmada │
│               │ Cliente: “Tem horário hoje?”       │                       │
│ [!] João      │ Operador: “...”                    │ DOSSIÊ VIVO           │
│  SLA 12m      │                                    │ • quer hoje           │
│  orçamento    │ [histórico da conversa]            │ • prefere tarde       │
│               │                                    │ • objeção: horário    │
│ [ ] Carla     │ ─────────────────────────────────  │                       │
│  aguardando   │ [Sugestão baseada em 2 evidências] │ PRÓXIMO PASSO         │
│               │ Confirmar preferência de horário.  │ [Usar sugestão]       │
│ Ver todas →   │ [Editar] [Descartar]               │ [Assumir handoff]     │
│               │                                    │                       │
│               │ [Escreva uma resposta…] [Enviar]  │ Estado do canal: ON   │
└───────────────┴────────────────────────────────────┴───────────────────────┘
```

### 4.2 Hierarquia não negociável

1. O nome, a última intenção do cliente e o risco/SLA ficam no topo da conversa.
2. A conversa ocupa o maior espaço visual e é a única região com rolagem longa.
3. A ação de maior consequência fica uma vez, no contexto à direita; não deve
   aparecer repetida em botões, cards e menus.
4. A caixa de resposta fica sempre ancorada no rodapé da conversa.
5. A IA é um bloco colapsável de evidência e sugestão; ela não ocupa a coluna
   toda nem usa alertas permanentes.

## 5. Componentes e contratos de estado

### 5.1 Fila “Agora”

Cada item precisa ter somente: nome, uma linha de motivo, idade/SLA e estado.
Não mostrar telefone, tags em excesso, valor incerto ou histórico completo.

| Estado | Ação primária | Estado vazio |
|---|---|---|
| handoff pendente | `Assumir` | `Nada aguardando você.` |
| em atendimento por mim | `Abrir` | — |
| em atendimento por outra pessoa | `Ver contexto` | — |
| SLA crítico | `Assumir agora` | `Nenhum SLA em risco.` |

### 5.2 Dossiê vivo

O dossiê tem cinco blocos fixos, cada um com uma linha inicial e expansão:

1. **Objetivo do cliente**
2. **O que já foi confirmado**
3. **Fricção ou objeção atual**
4. **Último combinado**
5. **Responsável e próximo prazo**

Cada fato exibe origem simples: `cliente disse`, `anúncio`, `operador registrou`
ou `inferência a confirmar`. Inferência nunca tem aparência de fato confirmado.

### 5.3 Próximo passo e IA

```text
RECOMENDAÇÃO — confirmar disponibilidade
Baseada em: última mensagem + preferência de horário registrada

[Usar como rascunho]  [Editar]  [Não usar]
```

O bloco não pode mostrar “confiança” abstrata como percentual isolado. Quando
não houver evidência suficiente, mostrar: `Ainda não há base para sugerir uma
resposta. Revise o dossiê ou escreva manualmente.`

### 5.4 Compositor supervisionado

Antes de uma saída, o compositor revela somente o necessário:

```text
Enviar por: WhatsApp principal · para Ana
Política: resposta humana aprovada
[Enviar resposta]
```

Se bloqueado:

```text
Canal pausado pelo responsável às 14:20.
Nenhuma mensagem será enviada até que um owner o reative.
[Salvar como rascunho]
```

Não oferecer botão de “forçar envio”.

## 6. Estados vazios, loading e erros

| Situação | Texto | Ação permitida |
|---|---|---|
| Sem prioridade | `Tudo em dia. Novas conversas aparecerão aqui.` | abrir histórico / atualizar |
| Sem conversa selecionada | `Escolha uma prioridade para continuar o atendimento.` | selecionar item |
| Sem origem conhecida | `A origem ainda não foi confirmada.` | registrar fonte manualmente, se permitido |
| Sem recomendação | `Ainda não há evidência suficiente para sugerir um passo.` | responder manualmente |
| Canal pausado | `Envio bloqueado para proteger a operação.` | salvar rascunho; owner vê controle |
| API indisponível | `Não foi possível atualizar esta conversa.` | tentar novamente; nunca limpar o rascunho |

Rascunhos locais são preservados enquanto a conversa estiver aberta. Erros nunca
revelam payload de provider, token ou detalhes de infraestrutura.

## 7. Sistema visual

### Tokens semânticos

| Token | Cor | Uso |
|---|---:|---|
| `--sales-action` | `#2563eb` | atendimento e ação operacional |
| `--sales-success` | `#10b981` | outcome confirmado e canal saudável |
| `--sales-ai` | `#7c3aed` | evidência, sugestão e estado cognitivo |
| `--sales-attention` | `#d97706` | SLA próximo e handoff pendente |
| `--sales-blocked` | `#dc2626` | envio bloqueado, falha e risco crítico |
| `--sales-ink` | `#172033` | texto e estrutura |
| `--sales-surface` | `#f8fafc` | fundo de trabalho silencioso |

Todo bloco é um **bounded container**: borda sólida de 2px ligada ao seu estado,
raio 14–16px, cabeçalho explícito e sombra leve. Cor não é decoração: ela
codifica tipo de decisão. Ícones não substituem texto.

### Assinatura visual

A assinatura da tela é a **Linha de Continuidade**: uma faixa horizontal curta
no topo da conversa que conecta `origem → última mensagem → próximo passo`.
Ela é uma sequência real de evidências, não um enfeite nem um funil genérico.

## 8. Responsividade e acessibilidade

- Desktop: fila 24%, conversa 50%, contexto 26%.
- Tablet: contexto vira painel lateral recolhível; conversa continua central.
- Mobile: sequência `Agora → Conversa → Contexto`; compositor permanece fixo.
- Navegação por teclado alcança fila, conversa, recomendação e compositor nessa
  ordem; foco sempre visível.
- Não depender apenas de cor para SLA, canal pausado ou resultado.
- Respeitar `prefers-reduced-motion`; não usar animações contínuas.

## 9. Critérios de aceite do primeiro frontend

- Um operador encontra uma prioridade e assume o handoff em até três interações.
- A tela mostra fonte, conversa, dossiê e próximo passo sem abrir outra página.
- A primeira dobra contém no máximo cinco itens de fila e cinco fatos do dossiê.
- Uma recomendação sempre mostra evidência; sem evidência, não há CTA de IA.
- Canal pausado impede envio e preserva o rascunho.
- Viewer não vê ações operacionais; owner vê controles, mas não interfere por
  acidente na operação diária.
- Loading, vazio, erro e bloqueio têm texto e ação explícitos.

## 10. Fora de escopo do cockpit inicial

- Kanban editável, múltiplos pipelines, relatórios extensos e automação visual.
- Configuração de WABA/Meta, templates, segredos ou usuários.
- Autonomia de IA, cadências e disparos em massa.
- “Gamificação” de produtividade ou indicadores sem ação operacional imediata.

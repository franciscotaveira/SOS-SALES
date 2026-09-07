# SOS SALES — COMPORTAMENTO RESPONSIVO & BREAKPOINTS (CANÔNICO)

## 1. Princípios de Layout Responsivo

O SOS Sales garante que operadores e gestores tenham uma experiência fluida e nativa em qualquer dispositivo, desde monitores ultrawide até smartphones (390px), sem nunca renderizar três colunas densas em espaços apertados.

O layout do Cockpit de Atendimento é governado pela **Largura Útil do Contêiner ($C$)**, adaptando-se com precisão:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ C ≥ 1120px (Desktop Amplo) : Fila 280px + Chat flexível (min 480px) + Dossiê 340px/Rail │
│ 760px ≤ C < 1120px (Médio) : Fila 280px + Chat flexível + Dossiê em Drawer deslizante  │
│ C < 760px (Mobile Nativo)  : 1 Região por vez (Lista/Fila ↔ Chat 1:1) + Dossiê Drawer    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Regras Estruturais por Faixa de Largura Útil ($C$)

### 1. Desktop Amplo ($C \ge 1120$px)
- **Fila de Atendimento**: 280px fixa com alternância entre "Prioridades" (handoff/urgência) e "Todas as conversas".
- **Conversa Central**: Área flexível (`flex-1`, largura mínima 480px) com leitura confortável e composer supervisionado.
- **Dossiê Vivo do Lead & IA**: Painel lateral de 340px com opção de recolher em barra lateral compacta (Rail de 48px) ou expandir em modal imersivo.

### 2. Notebooks & Telas Médias ($760$px $\le C < 1120$px)
- **Fila + Chat Lado a Lado**: Fila de 280px à esquerda e Timeline de chat central flexível.
- **Dossiê Vivo**: Slide-over drawer acessível pelo cabeçalho do chat (`Dossiê` com ícone Sparkles).
- **Sem colapso indesejado**: O operador atende e navega entre contatos sem perder o chat de vista.

### 3. Mobile / Smartphones ($C < 760$px)
- **Uma Região por Vez (Master-Detail Puro)**:
  - **Fila (Lista)**: O usuário entra diretamente na lista de contatos/prioridades. A primeira conversa **não** é auto-selecionada no carregamento inicial, permitindo escaneabilidade e escolha tátil consciente.
  - **Chat 1:1**: Ao tocar em um lead, a tela desliza para o chat completo com cabeçalho de 56px, botão `< Voltar` para a fila, e botões de ação rápida (`Dossiê`, `Concluir`, `Mais`).
  - **Dossiê IA**: Drawer deslizante em tela cheia acionado pelo botão `Dossiê`.
- **Composer com Prevenção de Zoom**: Campo de texto com tamanho de fonte `16px` (`text-base sm:text-xs`) para impedir auto-zoom no iOS Safari.
- **Botão Enviar Dinâmico**: No mobile, alterna automaticamente entre microfone de áudio e botão `Enviar` conforme o operador digita.
- **Navegação Canônica Inferior (Bottom Bar)**: 4 abas táteis — **Atendimento · Funil · Agenda · Mais**.

---

## 3. Isolamento de Rascunho e Continuidade

O hook `useConversationDrafts` e o composer garantem continuidade total:
1. **Isolamento por Chave Composta**: Rascunhos são armazenados por `[userId + workspaceId + journeyId]`.
2. **Proteção contra Perda**: O rascunho de texto digitado no composer não é apagado em caso de erro de rede ou falha de envio. O texto permanece preservado no campo para nova tentativa imediata.
3. **Preservação de Contexto**: Alternar entre Fila e Chat, abrir drawers ou alternar para o Funil Kanban preserva o rascunho e a seleção da conversa.

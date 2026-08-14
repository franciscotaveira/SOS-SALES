# SOS SALES — COMPORTAMENTO RESPONSIVO & BREAKPOINTS

## 1. Princípios de Layout Responsivo

O SOS Sales deve garantir que operadores e gestores tenham uma experiência fluida em qualquer dispositivo, desde monitores ultrawide (1440px+) até celulares (390px), sem nunca renderizar três colunas densas em espaços apertados.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1440px+ (Desktop Amplo) : Sidebar (232px) + Fila (300px) + Chat + Dossiê    │
│ 1280px  (Desktop Médio) : Sidebar (232px) + Fila (280px) + Chat + Dossiê    │
│ 1024px  (Notebook)      : Sidebar (72px)  + Chat Fixa   + Drawers            │
│ <1024px (Tablet/Mobile) : Sidebar Drawer  + Navegação 1 Região por Vez       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Breakpoints e Regras Estruturais

### 1. Desktop Amplo (≥ 1280px)
- **Sidebar**: 232px expandida (ou 72px recolhida por preferência salva).
- **Cockpit em 3 regiões balanceadas**:
  - **Fila de Prioridades**: 280px – 320px (fixa com scroll interno).
  - **Conversa Central**: Área flexível (`flex-1`) com largura confortável para leitura.
  - **Dossiê Vivo**: Painel lateral de 360px – 400px (ou gaveta toggleável).

### 2. Notebooks & Telas Médias (1024px – 1279px)
- **Sidebar**: 72px recolhida por padrão para maximizar a área útil (expansível via hover/click).
- **Cockpit em Foco na Conversa**:
  - **Conversa Central**: Fixa ocupando a maior parte da largura.
  - **Fila de Prioridades**: Painel recolhível ou gaveta acessível por botão rápido.
  - **Dossiê Vivo**: Gaveta lateral (Drawer) expansível sobre a direita com backdrop suave.

### 3. Tablets & Telas Pequenas (768px – 1023px)
- **Sidebar**: Oculta em Drawer deslizante acionada pelo menu hambúrguer.
- **Cockpit de 1 Região por Vez (Master-Detail)**:
  - Navegação entre abas de contexto: `Fila (Agora)` ➔ `Conversa` ➔ `Dossiê / Contexto`.
  - Preservação estrita da posição de rolagem e rascunho em edição ao alternar entre as regiões.

### 4. Mobile (390px – 767px)
- **Header Compacto**: 48px de altura com botão de menu, nome do workspace e atalho de busca.
- **Navegação em Sequência de Ação**:
  - `Fila`: Cartões de prioridade touch-friendly (altura mínima de 44px).
  - `Conversa`: Timeline com botão de voltar claro (`← Fila`) e botão para abrir o Dossiê (`Dossiê (5)`).
  - `Dossiê`: Bottom Sheet / Drawer deslizante em tela cheia com fechamento por gesto ou botão.
- **Composer Mobile**: Ocupa a base da tela sem sobrepor mensagens ativas com teclado virtual.

---

## 3. Preservação de Contexto e Scroll

Ao alternar de visualização no modo mobile/notebook:
1. O ID da conversa selecionada (`selectedJourneyId`) é sempre preservado.
2. O rascunho de texto digitado no `SupervisedComposer` permanece intacto via `localStorage` ou estado pai.
3. Não há recarregamento desnecessário de mensagens ao abrir ou fechar o drawer do dossiê.

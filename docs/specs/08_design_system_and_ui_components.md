# Especificação Detalhada — Módulo 8: Design System, Tokens & Refinamento Visual (`src/index.css`, `AppShell.tsx`)
> **SOS Sales v2.0 | MCT OS**  
> **Arquivos de Referência:** `src/index.css`, `src/components/layout/AppShell.tsx`, `PROMPT_REFINAMENTO_VISUAL.md`

---

## 1. Visão Geral da Diretriz de Design System

O **Design System** do SOS Sales foi concebido sob a filosofia **"Poder invisível, simplicidade visível"**. Ele busca transmitir máxima sofisticação, profissionalismo e foco operacional, eliminando poluição visual, badges redundantes ou fundos sobrecarregados.

---

## 2. Tokens de Design CSS (`src/index.css`)

O SOS Sales utiliza **TailwindCSS v4** com variáveis semânticas personalizadas expostas no escopo `:root` para alinhamento de paleta:

```css
:root {
  /* Tokens de Superfície & Canvas */
  --sos-canvas: #f8fafc;        /* Fundo principal da aplicação */
  --sos-surface: #ffffff;       /* Fundo de cards, modais e painéis */
  --sos-border: #e2e8f0;        /* Bordas sutis dos componentes */
  
  /* Tokens de Texto & Tipografia */
  --sos-ink: #0f172a;           /* Texto primário de alto contraste */
  --sos-muted: #64748b;         /* Texto secundário / rótulos */
  
  /* Tokens de Ação & Marca */
  --sos-action: #00a884;        /* Verde WhatsApp Oficial / Ações primárias */
  --sos-action-hover: #008f70;  /* Estado hover de botões primários */
  --sos-action-subtle: #e6f7f3; /* Fundo sutil de destaque verde */
  
  /* Tokens de Estado & Semântica */
  --sos-operational: #2563eb;   /* Azul operacional */
  --sos-operational-subtle: #eff6ff;
  --sos-ai: #7c3aed;            /* Roxo Inteligência Artificial */
  --sos-ai-subtle: #f5f3ff;
  --sos-warning: #d97706;       /* Âmbar alertas / SLA */
  --sos-warning-subtle: #fffbeb;
  --sos-danger: #dc2626;        /* Vermelho erro / prioridade crítica */
  --sos-danger-subtle: #fef2f2;
}
```

---

## 3. Estrutura da Shell da Aplicação (`AppShell.tsx`)

### 3.1. Barra Lateral Dark (Sidebar Navegação)
* **Estilo:** Fundo dark elegante (`#0b132b` / `#0f172a`) com navegação agrupada em 4 seções principais:
  1. `OPERAÇÃO`: Agora, Conversas & Funil, Grupos, Agenda.
  2. `GESTÃO`: Gestão de Clientes, Gestão de Campanhas.
  3. `INTELIGÊNCIA`: Inteligência (Playbook), Simulador QA.
  4. `SISTEMA`: Configurações.
* **Comportamento Recolhível:**
  - Botão de alternância `ChevronLeft` / `ChevronRight` que recolhe a barra lateral para modo ícone.
  - Estado persistido no `localStorage` (`sos_sidebar_collapsed`).

### 3.2. Rodapé da Sidebar & Indicador de WhatsApp
* **Workspace Switcher:** Dropdown de alternância entre matriz e clientes.
* **Status Pill do WhatsApp:** Pill com efeito `pulse/ping` colorido indicando estado da conexão em tempo real (Verde = `WhatsApp Online`, Âmbar = `Aguardando QR`, Vermelho = `WhatsApp Offline`).
* **Seletor de Modo da IA (24/7 vs Copiloto):** Toggle direto que alterna e publica o modo de autonomia da IA no servidor.

### 3.3. Atalho de Busca Global (`Cmd+K` / `Ctrl+K`)
* **Gatilho:** Pressionar `Cmd+K` ou `Ctrl+K` em qualquer tela.
* **Comportamento Esperado:** Abre modal de busca rápida estilo Spotlight para navegação instantânea entre módulos e abas.

---

## 4. Diretrizes do Refinamento Visual "Menos é Mais"

1. **Hierarquia de Informação Clara:** Títulos principais em peso `font-bold` e cores primárias; rótulos secundários em peso `font-medium` e cor `var(--sos-muted)`.
2. **Espaçamentos Consistentes:** Uso rigoroso das escalas de padding/margin do Tailwind (`p-2.5`, `p-4`, `space-y-3`, `gap-2.5`).
3. **Sombras Suaves & Bordas Claras:** Substituição de sombras pesadas por `shadow-2xs` ou `shadow-xs` com bordas sutis `border-[var(--sos-border)]`.
4. **Resposta Visual Imediata:** Todos os botões interativos possuem classe `cursor-pointer` e estados `hover:` e `active:` responsivos.

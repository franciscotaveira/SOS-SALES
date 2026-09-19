# SOS SALES V3 — SISTEMA DE DESIGN & TOKENS SOBERANOS

> **Filosofia:** *Poder invisível. Simplicidade visível.*  
> **Arquétipo:** Governante Especialista — sóbrio, cirúrgico, focado em precisão técnica e estabilidade operacional (inspiração: Linear, Stripe, Apple Enterprise).  
> **Tema Padrão:** **Claro (Light)** com Workspace limpo e Sidebar Dark Navy estrutural. Alternativa escura via variáveis semânticas.  
> **Diretriz de Dados:** *Truth in Data* — zero mocks ou dados fake em fluxos reais.

---

## 1. Princípios de Interface

1. **Ação Primária Guiada (Verde WhatsApp `#00A884`)**:
   O verde é reservado para a ação principal de continuidade e fechamento comercial. Ações nunca são representadas exclusivamente por cor (sempre acompanhadas de texto ou ícone semântico com contraste $\ge 4.5:1$).
2. **Baixa Fadiga Visual para Uso Prolongado**:
   Operadores atendem por horas contínuas. A área de trabalho utiliza fundo limpo Canvas (`#F8FAFC`), superfícies de leitura brancas (`#FFFFFF`) e divisórias de precisão (`#E2E8F0`), eliminando brilhos e contrastes excessivos.
3. **Contêineres Delimitados (Bounded Containers)**:
   Apenas a região estrutural mãe possui borda delimitadora (`border: 1px solid var(--border-default)`) e sombra suave (`var(--shadow-xs)`). Subcomponentes internos usam padding rítmico (8px / 12px / 16px) e alternância suave de fundo em vez de bordas aninhadas redundantes.
   - Fórmula de Raio: `Inner Radius = max(0, Outer Radius - Padding)`.
4. **Estados Honestos (Truth in Data)**:
   Todo componente ou painel implementa os 5 estados universais:
   - **Loading**: Esqueleto neutro pulsante (`animate-pulse`) sem flash branco.
   - **Empty**: Mensagem contextual com ícone e botão de ação direta (sem dados simulados).
   - **Error**: Diagnóstico legível com botão de nova tentativa (`Retry`).
   - **Offline / Degraded**: Indicador persistente sem mascarar a falha de conexão como fila vazia.
   - **Forbidden / Role-Gated (403)**: Explicação do papel necessário para o acesso.

---

## 2. Tipografia Simplificada

Redução deliberada para duas famílias tipográficas de alta performance:

| Família | Aplicação | Pesos | Justificativa |
|---|---|---|---|
| **`Inter`**, sans-serif | **Interface Completa (UI)** | 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold) | Padrão global para interfaces densas, excelente legibilidade em corpos pequenos e títulos |
| **`JetBrains Mono`**, monospace | **Dados Técnicos & Métricas** | 400 (Regular), 500 (Medium), 600 (SemiBold) | Alinhamento numérico tabular estrito para cronômetros de SLA, moeda (BRL), IDs e payloads |

---

## 3. Paleta de Cores e Tokens Semânticos

### 3.1 Tema Claro (Padrão Operacional Canônico)

```css
:root {
  /* Canvas e Superfícies */
  --bg-canvas: #F8FAFC;            /* Fundo limpo estrutural da aplicação */
  --bg-surface: #FFFFFF;           /* Superfície de cartões, painéis e drawers */
  --bg-surface-elevated: #F1F5F9;  /* Superfície destacada para hover e tabelas */
  --bg-surface-subtle: #F8FAFC;    /* Áreas neutras internas */

  /* Estrutura Dark Navy (Sidebar / Ribbon Soberano) */
  --bg-sidebar: #0B132B;           /* Fundo da barra lateral recolhível */
  --bg-sidebar-hover: #152243;     /* Item ativo/hover na sidebar */
  --text-sidebar: #F8FAFC;         /* Texto primário da sidebar */
  --text-sidebar-muted: #94A3B8;   /* Rótulos secundários da sidebar */

  /* Tipografia e Contraste (WCAG 2.2 AA) */
  --text-primary: #0F172A;         /* Slate 900 — contraste 14.1:1 sobre branco */
  --text-secondary: #475569;       /* Slate 600 — contraste 5.8:1 sobre branco */
  --text-muted: #64748B;           /* Slate 500 — contraste 4.6:1 sobre branco */
  --text-inverse: #FFFFFF;         /* Branco para botões primários escuros */

  /* Bordas e Linhas de Precisão */
  --border-subtle: #F1F5F9;        /* Linhas divisórias internas */
  --border-default: #E2E8F0;       /* Borda de contêineres delimitados */
  --border-strong: #CBD5E1;        /* Borda de campos de formulário e botões outline */
  --border-focus: #00A884;         /* Anel de foco visível */

  /* Acentos Semânticos Operacionais */
  --color-action: #00A884;         /* Verde WhatsApp — Ação primária e fechamento */
  --color-action-hover: #008f70;   /* Hover estado ativo */
  --color-action-subtle: #E6F7F3;  /* Fundo sutil de badges e alertas */

  --color-operational: #2563EB;    /* Azul — Atendimento, filtros e navegação */
  --color-operational-hover: #1D4ED8;
  --color-operational-subtle: #EFF6FF;

  --color-ai: #7C3AED;             /* Roxo — Copilot, tese e evidências de IA */
  --color-ai-hover: #6D28D9;
  --color-ai-subtle: #F5F3FF;

  --color-warning: #D97706;        /* Âmbar — SLA moderado, atenção pendente */
  --color-warning-hover: #B45309;
  --color-warning-subtle: #FFFBEB;

  --color-danger: #DC2626;         /* Vermelho — SLA estourado, bloqueio, 403/401 */
  --color-danger-hover: #B91C1C;
  --color-danger-subtle: #FEF2F2;

  /* Geometria e Sombras */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  --shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
}
```

---

## 4. Acessibilidade (WCAG 2.2 AA)

- **Contraste de Texto**: Mínimo de 4.5:1 para texto normal e 3:1 para texto grande ($\ge 18$pt ou 14pt bold).
- **Controles e Foco**: Foco claramente visível em todos os botões, links e inputs (`outline: 2px solid var(--border-focus); outline-offset: 2px;`).
- **Navegação por Teclado**:
  - `Tab` / `Shift + Tab`: Navegação sequencial lógica por todos os elementos interativos.
  - `Escape`: Fecha imediatamente `Dialog`, `Drawer` e menus flutuantes.
  - `Enter` / `Space`: Acionam botões e seletores.
- **Rótulos e Erros Associados**: Todo `<Input>` possui rótulo `<label htmlFor="...">` explícito, `aria-invalid` quando houver erro e `aria-describedby` referenciando o id da mensagem de erro.
- **Prevenção de Zoom Indesejado no iOS**: Inputs possuem tamanho de fonte de `16px` no mobile (`text-base sm:text-sm`) para impedir auto-zoom no Safari.
- **Movimento Reduzido**: Respeito à media query `@media (prefers-reduced-motion: reduce)` desativando transições e pulsações.

---

## 5. Primitives e Componentes Oficiais

1. **Button**: Variantes `primary` (Verde `#00A884`), `secondary` (Cinza neutro), `outline`, `ghost`, `danger`. Suporte nativo a `loading` (spinner acessível com `aria-busy`), `disabled`, e ícone prefix/suffix.
2. **Input**: Campo de texto estilizado com label flutuante/estático, mensagem de erro, helper text, e suporte a `disabled`.
3. **Badge**: Pílula de status semântica (`action`, `operational`, `ai`, `warning`, `danger`, `neutral`), com indicador em ponto (`pulse-dot`) opcional.
4. **Alert**: Banner de aviso com variantes `info`, `success`, `warning`, `danger`, ícone contextual e suporte a botão de ação ou fechamento.
5. **EmptyState**: Estado neutro honesto com ícone suave, título, descrição amigável e botão de ação primária.
6. **LoadingState**: Skeleton pulsante neutro (`animate-pulse`) ou spinner para carregamento de listas e cartões sem flash branco.
7. **Dialog / Drawer**: Modal central ou painel deslizante lateral com foco retido (`focus trap`), backdrop com clique para fechar, tecla `Escape` e `role="dialog"`.
8. **AppShell**: Shell completo com Sidebar (desktop) em Dark Navy `#0B132B`, Header superior com seleção de workspace e status de conectividade, e Barra de Navegação Inferior (Mobile Bottom Bar) para telas $\le 768$px.

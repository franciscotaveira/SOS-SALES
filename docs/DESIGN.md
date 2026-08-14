# SOS SALES — DESIGN SYSTEM & TOKENS

## 1. Visão Geral & Princípios
O **SOS Sales** é um sistema de continuidade comercial para WhatsApp (Meta Cloud API / WABA & WAHA).
Seu princípio norteador é: **Poder invisível, simplicidade visível.**

A interface prioriza a tomada de decisão em tempo real pelo operador e gestor:
- **Quem precisa de atenção agora?**
- **O que esse cliente quer?**
- **O que já foi confirmado?**
- **Qual é o próximo passo seguro?**
- **Quem é o responsável e qual o prazo (SLA)?**
- **Qual foi o resultado comercial real?**

---

## 2. Tipografia
O sistema utiliza uma tríade tipográfica funcional e deliberada:

| Uso | Família | Pesos | Justificativa |
| :--- | :--- | :--- | :--- |
| **Títulos & Identidade** | `Sora`, sans-serif | 600, 700, 800 | Display geométrico contemporâneo, alta legibilidade em cabeçalhos |
| **Interface & Leitura** | `Source Sans 3`, sans-serif | 400, 500, 600, 700 | Otimizada para leitura densa de mensagens e painéis de atendimento |
| **Técnico & Métricas** | `IBM Plex Mono`, monospace | 400, 500, 600 | Alinhamento numérico tabular para SLA, moeda (BRL), timestamps e payloads |

---

## 3. Paleta de Cores e Tokens Semânticos

| Token | Hex | Uso Primário |
| :--- | :--- | :--- |
| **Canvas** | `#F5F7FA` | Fundo estrutural da aplicação (neutro limpo) |
| **Surface** | `#FFFFFF` | Superfície de cartões, painéis e drawers |
| **Ink** | `#101828` | Texto principal com máximo contraste |
| **Muted** | `#667085` | Rótulos secundários, metadados e legendas |
| **Action / Success** | `#059669` | Fechamento de vendas, ações primárias, WhatsApp oficial |
| **Operational** | `#2563EB` | Ações de atendimento, navegação, filtros ativos |
| **AI / Copilot** | `#7C3AED` | Sugestões inteligentes, tese comercial, evidências |
| **Warning** | `#D97706` | Alertas de SLA moderado, ações pendentes de operador |
| **Danger** | `#DC2626` | SLA crítico expirado, violação de guardrail, canal pausado |
| **Structural Dark** | `#0F172A` | Sidebar recolhida/expandida, ribbon de continuidade |

---

## 4. Contêineres Delimitados (Bounded Containers)
Para evitar a poluição visual de bordas aninhadas em cada microelemento:
- **Regra de Contêiner**: Apenas a região estrutural mãe possui borda delimitadora (`border border-slate-200`) e sombra suave (`shadow-xs`).
- **Agrupamento Interno**: Elementos internos utilizam hierarquia espacial (padding, espaçamento rítmico de 8/12/16px) e alternância sutil de background (`#F8FAFC` vs `#FFFFFF`) em vez de múltiplas bordas redundantes.
- **Raio de Borda (Nested Radius Math)**: `Inner Radius = Outer Radius - Padding`.

---

## 5. Estados Universais de Componentes
Todos os componentes e telas devem implementar os 5 estados universais:
1. **Loading**: Esqueleto neutro pulsante (`animate-pulse`) sem flash branco.
2. **Vazio (Empty State)**: Mensagem amigável com ícone contextual e ação direta de desbloqueio.
3. **Erro (Error State)**: Banner com diagnóstico legível, motivo do bloqueio e botão de retry.
4. **Desconectado (Offline / Degraded)**: Indicador persistente sem bloquear a edição local de rascunhos.
5. **Sem Permissão (Role Gated)**: Mensagem explicativa com indicação do papel necessário (ex: "Exclusivo para perfil Owner").

---

## 6. Acessibilidade & Contraste
- Contraste mínimo de 4.5:1 (WCAG AA) para textos normais e 3:1 para elementos gráficos de controle.
- Foco visível com anel de 2px (`focus-visible:ring-2 ring-emerald-600 focus-visible:outline-none`).
- Compatibilidade total com `prefers-reduced-motion`.
- Suporte a zoom de tela de até 200% sem perda de funcionalidade ou quebra de layout.

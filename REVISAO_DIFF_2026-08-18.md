# Revisão do diff pendente — 2026-08-18

> Consolidação de 3 lanes de revisão (`code-review-diff-3` backend/correção, `visual-review-a` e `visual-review-b` visual/design) sobre o diff não commitado atual (~20 arquivos: 8 modificados + ~12 novos), avaliado contra `PROMPT_REFINAMENTO_VISUAL.md`.

## TL;DR

As três lanes convergem independentemente na mesma conclusão estrutural: **o diff mistura mudanças reais de produto/feature/backend dentro do que está enquadrado como um passe de refinamento visual.** Isso precisa de uma decisão explícita antes do merge — ver [Decisão pendente](#decisão-pendente) no final.

Dois defeitos transversais aparecem em múltiplos arquivos e vale corrigir em lote:
- **Classes Tailwind inválidas/no-op** repetidas em ≥3 arquivos.
- **Dados fabricados/hardcoded** exibidos como reais em UI de produção.

---

## 1. Bugs de correção (backend)

Fonte: `code-review-diff-3`.

| # | Local | Problema |
|---|-------|----------|
| 1 | `apps/api/src/interfaces/http/routes/webhooks/waba-webhook.ts` | `account_update` tratado sem escopo de tenant — cross-tenant leak, na contramão dos commits recentes de hardening de isolamento multi-tenant (`216d43b`, `1ed4cc9`, `8c64a00`). |
| 2 | *(pipeline stage)* | Três escritores não coordenados de `pipeline_stage`; um deles faz keyword-match silencioso e engole erros. |
| 3 | *(estado de negociação)* | Mismatch `WON` → `NEGOTIATION` entre o valor gravado no DB e o valor retornado pela API. |
| 4 | Mass Broadcast (`MassBroadcastView.tsx` / backend correlato) | `delaySeconds` de throttle morto — configurado mas nunca aplicado. |

## 2. Classes Tailwind inválidas / no-op (transversal)

| Arquivo | Classe | Problema |
|---|---|---|
| `AppShell.tsx` | `text-[8.5px]` → `text-[9px]` | Continua abaixo do piso de 10px definido no guia para texto de metadados. |
| `AppShell.tsx` | `py-0.2` | Fora da escala padrão do Tailwind, não gera regra CSS. |
| `AppShell.tsx` | `w-4.5` / `h-4.5` | Idem — fora da escala, sem efeito. |
| `AppShell.tsx` | `rounded-r-lg` | Desvia da regra de raio de borda do projeto. |
| `EmbeddedSignupModal.tsx` | `left-5.5` | Fora da escala, sem efeito. |
| `EmbeddedSignupModal.tsx` | `py-0.2` | Mesmo problema recorrente. |

## 3. Dados fabricados exibidos como reais (transversal)

| Arquivo | O quê |
|---|---|
| `WabaActionsModal.tsx` (novo) | `stage`, `slaMinutesRemaining`, `handoffStatus` passados como props hardcoded, não vindos de dados reais. |
| `MessengerInsightsPanel.tsx` (novo) | KPI estático "ALTA" / "Zero bloqueios" exibido independentemente dos dados reais subjacentes. |
| `ConnectionManager.tsx` (~linha 398) | Card gradiente "Meta WhatsApp Business Platform 2026" anunciando itens de roadmap não construídos (VoIP Calling, WABA Groups API) rotulado "Roadmap Antecipado" numa tela de produção real. |

## 4. Escopo fora do combinado (feature/produto disfarçado de visual)

| # | Item | Onde | Por quê importa |
|---|------|------|------------------|
| 1 | Fluxo de Embedded Signup duplicado | `ConnectionManager.tsx` e `LiveSettingsView.tsx` conectam independentemente seu próprio `EmbeddedSignupModal` + botão "Conectar via Embedded Signup v4" | Dois pontos de entrada divergentes para o mesmo fluxo — risco de comportamento inconsistente. |
| 2 | Rebaixamento silencioso do canal WAHA | `LiveSettingsView.tsx` ~linhas 183–197 vs. 210 | "Canal Principal" → "Canal Secundário", cor emerald → slate. Enquadrado como refinamento visual, mas é mudança de prioridade de produto. |
| 3 | 7ª aba não sancionada `ltv_matrix` | `ResultsHubView.tsx` | `PROMPT_REFINAMENTO_VISUAL.md` (checklist MÓDULO 7) especifica exatamente 6 abas. A aba `broadcast` está sancionada pelo guia; `ltv_matrix` (Matriz LTV & Retenção → `LtvConfigManager`) não está. |
| 4 | Nova sub-aba Meta-Omnichannel com badge "NOVO" | `CanaisView.tsx` | Escopo adicional além do polimento visual. |

## 5. Regressões de UX/acessibilidade

| Arquivo | O quê |
|---|---|
| `AppShell.tsx` | Toggle de Autonomia de IA perdeu ícones distintos por modo + badge AUTO/LEARN, colapsado num ícone genérico `Bot`. |
| `AppShell.tsx` | Badge de papel do usuário removido da UI visível, agora só em tooltip `title` no hover — regressão de escaneabilidade/acessibilidade. |
| `AppShell.tsx` | Gate do demo-role-switcher mudou via localStorage/parâmetro de URL — mudança de comportamento fora do escopo visual (ainda que plausivelmente um fix razoável de segurança para produção). |
| `ConversationHeader.tsx` | `text-[10px]` usado no número de telefone, mas o guia reserva 10px só para metadados. |
| `ConversationHeader.tsx` + `LiveCockpitView.tsx` | Clique-para-ligar `tel:` duplicado nos dois componentes. |
| `LiveCockpitView.tsx` / `SupervisedComposer.tsx` | Botão de ação WABA renderizado de forma redundante em três lugares: header, área do composer, e dentro do `SupervisedComposer` (CTA triplicado). |

Positivo (confirmado, não reverter): espaçamento de navegação em `AppShell.tsx` mais compacto, footer reagrupado, barra de busca/notificação normalizada para `h-9`; migração de tokens `var(--sos-*)` em superfícies pré-existentes está limpa e conforme.

## 6. Segurança / hardcoded

| Arquivo | O quê |
|---|---|
| `EmbeddedSignupModal.tsx` | Meta App ID, Config ID e webhook verify token hardcoded como defaults do componente — devem ir para env/config, não para o código-fonte. |
| `SupervisedComposer.tsx` | UUID de workspace hardcoded como fallback. |

## 7. Itens menores

- `ResultsHubView.tsx`: import `Send` não utilizado (linha ~20).
- `LiveSettingsView.tsx`: estado `wabaConnected` não utilizado (linha ~38), nunca renderizado.
- `EmbeddedSignupModal.tsx`: dead code por stale closure no timeout de fallback de 3s.

---

## Decisão pendente

Como as três lanes convergem no mesmo diagnóstico — feature/backend misturado com refinamento visual — a decisão de como prosseguir é do usuário:

1. **Dividir o PR**: separar correções puramente visuais (Tailwind inválido, tokens, espaçamento) de features/backend novos (Embedded Signup duplicado, aba LTV, rebaixamento WAHA, correções de backend).
2. **Corrigir tudo aqui mesmo**, sem dividir.
3. **Discutir antes** os 4 itens de escopo-fora-do-combinado (seção 4) como decisões de produto, antes de qualquer mudança de código.

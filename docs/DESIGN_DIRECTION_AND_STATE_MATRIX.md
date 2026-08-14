# Sales OS / Operator Cockpit — Direção Visual e Matriz de Estados

## 1. Direção Visual (Passagem A & B)

### Objetivo da Tela e Usuário Primário
- **Objetivo:** Permitir que operadores comerciais de pequenas equipes executem atendimentos qualificados com velocidade, sem perder o contexto da origem (campanha Meta CTWA), da conversa viva e do próximo passo seguro.
- **Usuário Primário:** Operador comercial / recepcionista de negócios locais (ex: salões de beleza/escovarias, oficinas automotivas/estética).

### Paleta de Cores e Tokens Base
- `--sales-action: #2563eb` (Azul Ação — botões primários, envio, foco visível)
- `--sales-success: #10b981` (Verde Sucesso — confirmações, WABA conectado, outcomes ganhos)
- `--sales-ai: #7c3aed` (Roxo AI Supervisionado — recomendações, evidências)
- `--sales-attention: #d97706` (Âmbar Atenção — SLAs críticos, avisos, pendências)
- `--sales-blocked: #dc2626` (Vermelho Bloqueado — canal pausado, falha de envio, SLA expirado)
- `--sales-ink: #0f172a` (Slate Profundo — legibilidade máxima WCAG AA)
- `--sales-surface: #f8fafc` (Canvas de trabalho calmo e de alto contraste)

### Assinatura Visual: Linha de Continuidade
Elemento visual proeminente que une:
`[Origem CTWA / Anúncio Meta]` ➔ `[Última Fala do Lead]` ➔ `[Próximo Passo Seguro + Botão "Usar como rascunho"]`

Elimina o isolamento cognitivo: o operador sabe instantaneamente qual oferta o cliente viu e qual resposta exata cumpre a política comercial.

---

## 2. Matriz de Estados Implementados

| Estado Visual / Funcional | Implementado | Localização / Comportamento |
| :--- | :---: | :--- |
| **Loading inicial & incremental** | Sim | Skeletons e spinners com indicação de carregamento suave |
| **Fila de prioridades vazia** | Sim | `PriorityQueue.tsx` (Card "Fila sob controle!") |
| **Conversa não selecionada** | Sim | `CockpitView.tsx` (Empty state com ícone de chat) |
| **Histórico sem mensagens** | Sim | `MessageTimeline.tsx` (Empty state contextual) |
| **Origem confirmada (CTWA)** | Sim | Tag azul com criativo, oferta, CAC e headline |
| **Origem desconhecida / orgânica** | Sim | Fallback discreto sem poluição visual |
| **Fato confirmado vs Inferência** | Sim | `KnownFactItem.tsx` com selos verde e âmbar + proveniência |
| **Recomendação com 2+ evidências** | Sim | `RecommendationCard.tsx` com accordion de evidências |
| **Sem recomendação por falta de evidência** | Sim | Mensagem informativa garantindo segurança contra alucinações |
| **Canal saudável vs Canal pausado** | Sim | `ChannelStatus.tsx` bloqueia envio e exibe responsável e motivo |
| **Aprovação / Handoff** | Sim | 1-Click "Assumir Atendimento" ou "Liberar para Fila" |
| **Handoff de outro operador** | Sim | Bloqueia edição e permite transferência supervisionada |
| **Viewer Somente Leitura** | Sim | Desativa controles operacionais e compositor |
| **Falha de envio com retry** | Sim | Mantém rascunho, mostra banner de erro e botão de tentar de novo |
| **Preservação de rascunho** | Sim | LocalStorage automático e persistência entre trocas de lead |
| **Registro de Outcome comercial** | Sim | `OutcomeModal.tsx` salva Ganho/Perdido, valor e motivo |
| **Prova de resultado de tráfego** | Sim | `TrafficProofView.tsx` (ROAS, conversões por campanha, SLA) |
| **Modo Offline** | Sim | `OfflineBanner.tsx` com detecção de `window.navigator.onLine` |

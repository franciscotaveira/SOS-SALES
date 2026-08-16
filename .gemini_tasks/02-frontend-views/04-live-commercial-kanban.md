# PROMPT PARA GEMINI — Task 4: LiveCommercialKanbanView

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Branch: `codex/import-latest-zip`
Atual: Aba "Funil" mostra placeholder "Funil autenticado em integração"
Objetivo: Substituir por **Kanban ao vivo** conectado à API real

## ARQUIVO A CRIAR
`src/components/kanban/LiveCommercialKanbanView.tsx`

## REQUISITOS FUNCIONAIS

### 1. Carregamento de Dados
```typescript
// Usar HttpSalesOsGateway existente
const journeys = await gateway.listJourneys(workspaceId, { 
  limit: 100,
  stages: ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'] 
});
```

### 2. 5 Colunas (Estágios Operacionais)
| Coluna | Valor API | Label UI | Cor Badge |
|--------|-----------|----------|-----------|
| 1 | `NEW` | **Novos Leads** | `bg-slate-100 text-slate-700` |
| 2 | `CONTACTED` | **Em Contato** | `bg-blue-100 text-blue-700` |
| 3 | `QUALIFIED` | **Qualificados** | `bg-emerald-100 text-emerald-700` |
| 4 | `PROPOSAL` | **Proposta Enviada** | `bg-amber-100 text-amber-700` |
| 5 | `NEGOTIATION` | **Em Negociação** | `bg-violet-100 text-violet-700` |

### 3. Card do Lead
```tsx
interface KanbanCardProps {
  journey: ApiJourney;
  onClick: () => void;
  onStageChange: (newStage: string) => void;
}
```
**Conteúdo do card:**
- Avatar (inicial do nome ou ícone WhatsApp)
- Nome do contato / telefone E.164
- Prévia última mensagem (truncada 60 chars)
- Tempo desde última interação (ex: "2h atrás")
- Badge SLA: `OK` / `DUE` / `OVERDUE` (cores: emerald/amber/rose)
- Badge Handoff: se `handoffCaseId` não null → ícone `UserRound` + "Humano"
- **Ação**: Clique no card → navega para Cockpit (`onSelectedJourneyChange(journey.id)`)
- **Ação rápida**: Botão seta direita/esquerda → `gateway.setJourneyStage(workspaceId, journeyId, nextStage)`

### 4. Métricas no Topo
- Total leads por coluna
- Taxa conversão: `CLOSED_WON / (NEW + CONTACTED + QUALIFIED + PROPOSAL + NEGOTIATION)`
- Tempo médio por estágio (opcional, v2)

### 5. Estados
- **Loading**: Skeleton cards por coluna
- **Empty**: "Nenhum lead neste estágio" + ícone
- **Error**: Banner vermelho + botão "Tentar novamente"

## INTEGRAÇÃO NO APP

### `src/App.tsx` (ou router principal)
```tsx
// Substituir placeholder na aba 'kanban'
import { LiveCommercialKanbanView } from './components/kanban/LiveCommercialKanbanView';

<TabPanel value="kanban">
  <LiveCommercialKanbanView 
    workspaceId={selectedWorkspaceId}
    gateway={gateway}
    onJourneySelect={handleJourneySelect}
  />
</TabPanel>
```

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **Tipagem** | Usar tipos de `salesOsGateway.ts` (`ApiJourney`, `ApiPriority`) |
| **Performance** | `React.memo` nos cards, virtualização se >50 cards/coluna |
| **Acessibilidade** | `role="list"` nas colunas, `aria-label` nos botões de etapa |
| **Drag & Drop** | **NÃO** nesta versão (v2) — apenas botões avançar/recuar |
| **Refresh** | Botão "Atualizar" no header + auto-refresh 30s (opcional) |

## ARQUIVOS DE REFERÊNCIA
- `src/components/cockpit/LiveCockpitView.tsx` (padrão de gateway, loading, error, modais)
- `src/services/salesOsGateway.ts` (métodos: `listJourneys`, `setJourneyStage`)
- `src/components/kanban/CommercialKanbanView.tsx` (placeholder atual — substituir)

## CRITÉRIO DE ACEITE

1. `npm run check` → 0 erros TypeScript, build OK
2. Aba "Funil" carrega 5 colunas com dados reais do Supabase
3. Card clicado → abre Cockpit com jornada correta
4. Botão avançar etapa → `setJourneyStage` chamada → card move coluna (após refresh)
5. SLA badge calculado corretamente (baseado em `slaPolicy.firstResponseMinutes`)
6. `@browse` navega na aba Kanban → screenshot sem erros console

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
# Validar visualmente:
# npm run dev → abrir http://localhost:3000 → aba Funil
```
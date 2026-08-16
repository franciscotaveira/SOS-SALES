# PROMPT PARA GEMINI — Task 5: LiveConversationsView

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Branch: `codex/import-latest-zip`
Atual: Aba "Conversas" mostra placeholder "Histórico completo em integração"
Objetivo: Substituir por **Lista de Conversas ao vivo** com busca, filtros e navegação para Cockpit

## ARQUIVO A CRIAR
`src/components/conversations/LiveConversationsView.tsx`

## REQUISITOS FUNCIONAIS

### 1. Busca e Filtros (Header)
```tsx
// Busca em tempo real (debounce 300ms)
const [searchQuery, setSearchQuery] = useState(''); // nome ou telefone E.164

// Filtros rápidos (chips)
type Filter = 'all' | 'handoff_pending' | 'sla_critical' | 'by_stage';
const [activeFilter, setActiveFilter] = useState<Filter>('all');

// Filtro por estágio (select)
const [stageFilter, setStageFilter] = useState<string | 'all'>('all');
```

### 2. Fonte de Dados
```typescript
// Opção A: listJourneys + getMessages (paginado)
// Opção B: Nova rota GET /workspaces/:id/conversations (recomendada para performance)
// Por enquanto: listJourneys(workspaceId, { limit: 50 }) + enriquecer com última mensagem
```

### 3. Tabela de Conversas
| Coluna | Conteúdo |
|--------|----------|
| **Avatar** | Inicial nome ou ícone WhatsApp (verde se canal conectado) |
| **Contato** | Nome + telefone E.164 |
| **Última Msg** | Texto truncado 80 chars + timestamp relativo |
| **Canal** | Badge: `WAHA` / `META` / `MANUAL` |
| **Estágio** | Badge colorido (mesmo esquema Kanban) |
| **SLA** | `OK` / `DUE` / `OVERDUE` (cores) |
| **Handoff** | Ícone `UserRound` se `handoffCaseId` ativo |
| **Ação** | Botão "Abrir" → `onJourneySelect(journey.id)` |

### 4. Filtros Implementados
| Filtro | Lógica |
|--------|--------|
| `all` | Todas jornadas abertas |
| `handoff_pending` | `handoffCaseId !== null && handoffStatus === 'PENDING'` |
| `sla_critical` | `slaState === 'OVERDUE' || slaState === 'DUE'` |
| `by_stage` | `pipelineStage === stageFilter` |

### 5. Paginação / Scroll Infinito
- Load more ao chegar no final (limit 50 por page)
- Total count no header

### 6. Estados
- **Loading**: Skeleton rows
- **Empty**: "Nenhuma conversa encontrada" + ilustração
- **Error**: Banner + retry

## INTEGRAÇÃO NO APP

```tsx
// src/App.tsx - aba 'conversas'
import { LiveConversationsView } from './components/conversations/LiveConversationsView';

<TabPanel value="conversas">
  <LiveConversationsView 
    workspaceId={selectedWorkspaceId}
    gateway={gateway}
    onJourneySelect={handleJourneySelect}
  />
</TabPanel>
```

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **Debounce** | 300ms na busca (useDeferredValue ou useMemo) |
| **Memoização** | `React.memo` nas rows, `useMemo` na lista filtrada |
| **Acessibilidade** | `role="table"`, `aria-label` nos filtros, navegação por teclado |
| **Telefone** | Formatação E.164 → exibição `(XX) XXXXX-XXXX` |

## ARQUIVOS DE REFERÊNCIA
- `src/components/cockpit/LiveCockpitView.tsx` (padrão gateway, QueueCard)
- `src/services/salesOsGateway.ts` (`listJourneys`, `getJourneyMessages` se existir)
- `src/components/conversations/AllConversationsView.tsx` (placeholder atual)

## CRITÉRIO DE ACEITE

1. `npm run check` verde
2. Aba "Conversas" carrega lista com busca funcional (nome/telefone)
3. Filtros chips funcionam (handoff, SLA, estágio)
4. Clique "Abrir" → navega para Cockpit com jornada correta
5. SLA badge e Handoff badge calculados corretamente
6. `@browse` valida aba Conversas → 0 erros console

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
npm run dev  # validar visualmente aba Conversas
```
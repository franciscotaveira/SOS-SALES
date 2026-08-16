# PROMPT PARA GEMINI — Task 19: Agenda & Notes → Backend Real (Frontend)

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Frontend JÁ IMPLEMENTADO: `AgendaView`, `Monthly/Weekly/DailyCalendarView`, `NotesView`
Atual: Usam `mockAppointments`, `mockFollowUpAlarms`, `mockOperationalNotes` (local state)
Dependência: Task 17 (Appointments/Notes API) + Task 18 (Calendar Gateway) concluídas
Objetivo: **Conectar UI existente ao backend real** — remover mocks, usar HttpSalesOsGateway

## ARQUIVOS A MODIFICAR

### 1. `src/components/agenda/AgendaView.tsx`
**Remover:**
- `mockAppointments`, `mockFollowUpAlarms` imports
- `useState` local para appointments/alarms
- `handleCreateAppointment` local

**Adicionar:**
```typescript
// Usar gateway real
const { listAppointments, createAppointment, updateAppointment, deleteAppointment } = gateway;
const { listFollowUps, createFollowUp, updateFollowUp, completeFollowUp } = gateway;

// Carregar dados reais
const [appointments, setAppointments] = useState<CommercialAppointment[]>([]);
const [alarms, setAlarms] = useState<FollowUpAlarm[]>([]);

useEffect(() => {
  loadData();
}, [workspace.id, gateway]);

const loadData = async () => {
  const [apts, ups] = await Promise.all([
    gateway.listAppointments(workspace.id),
    gateway.listFollowUps(workspace.id)
  ]);
  setAppointments(apts);
  setAlarms(ups);
};

// Mutations usam gateway + refresh local
const handleCreateAppointment = async (input) => {
  const newApt = await gateway.createAppointment(workspace.id, input);
  setAppointments(prev => [newApt, ...prev]);
};
```

### 2. `src/components/agenda/MonthlyCalendarView.tsx` + `WeeklyCalendarView.tsx` + `DailyCalendarView.tsx`
- Receber `appointments` + `alarms` via props (já fazem isso)
- **Remover** qualquer lógica de mock
- Eventos de clique → chamar `gateway.updateAppointment` / `gateway.updateFollowUp`

### 3. `src/components/notes/NotesView.tsx`
**Remover:**
- `mockOperationalNotes` import
- `useState` local para notes
- `handleCreateNote`, `handleTogglePin`, `handleDeleteNote` locais

**Adicionar:**
```typescript
const { listNotes, createNote, updateNote, deleteNote } = gateway;

const [notes, setNotes] = useState<OperationalNote[]>([]);

useEffect(() => {
  gateway.listNotes(workspace.id).then(setNotes);
}, [workspace.id, gateway]);

const handleCreateNote = async (input) => {
  const newNote = await gateway.createNote(workspace.id, input);
  setNotes(prev => [newNote, ...prev]);
};

const handleTogglePin = async (noteId) => {
  const note = notes.find(n => n.id === noteId);
  if (note) {
    const updated = await gateway.updateNote(workspace.id, noteId, { pinned: !note.pinned });
    setNotes(prev => prev.map(n => n.id === noteId ? updated : n));
  }
};

const handleDeleteNote = async (noteId) => {
  await gateway.deleteNote(workspace.id, noteId);
  setNotes(prev => prev.filter(n => n.id !== noteId));
};
```

### 4. `src/components/conversations/ConversationsHubView.tsx`
- Verificar se já usa `gateway.listJourneys` + `gateway.getJourneyMessages`
- Se usa mock → conectar ao backend real
- Adicionar busca/filtros via query params na API

### 5. `src/services/salesOsGateway.ts` — Verificar métodos
Garantir que existem:
```typescript
// Appointments
async listAppointments(workspaceId: string, filters?: AppointmentFilters): Promise<CommercialAppointment[]>
async createAppointment(workspaceId: string, input: CreateAppointmentInput): Promise<CommercialAppointment>
async updateAppointment(workspaceId: string, appointmentId: string, input: UpdateAppointmentInput): Promise<CommercialAppointment>
async deleteAppointment(workspaceId: string, appointmentId: string): Promise<void>

// Notes
async listNotes(workspaceId: string, filters?: NoteFilters): Promise<OperationalNote[]>
async createNote(workspaceId: string, input: CreateNoteInput): Promise<OperationalNote>
async updateNote(workspaceId: string, noteId: string, input: UpdateNoteInput): Promise<OperationalNote>
async deleteNote(workspaceId: string, noteId: string): Promise<void>

// Follow-ups (já existe em journey-operations)
async listFollowUps(workspaceId: string, filters?: FollowUpFilters): Promise<FollowUpAlarm[]>
async createFollowUp(workspaceId: string, input: CreateFollowUpInput): Promise<FollowUpAlarm>
async updateFollowUp(workspaceId: string, followUpId: string, input: UpdateFollowUpInput): Promise<FollowUpAlarm>
async completeFollowUp(workspaceId: string, followUpId: string): Promise<void>
```

### 6. Tipos Compartilhados
- `src/types/agendaAndNotes.ts` → **mover para** `src/services/salesOsGateway.ts` ou `src/types/api.ts` (single source of truth)
- Frontend importa tipos do gateway

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **Loading States** | Skeletons durante fetch (já tem padrão em `LiveCockpitView`) |
| **Error Handling** | Toast de erro + retry button (padrão `LiveCockpitView`) |
| **Optimistic Updates** | Atualiza UI local → confirma com backend → rollback se erro |
| **Debounce** | 300ms em busca (já implementado) |
| **Cache** | `React Query` ou `useMemo` + invalidation manual (simples por enquanto) |
| **Permissões** | UI reflete `role` do JWT (owner/operator/viewer) |

## CRITÉRIO DE ACEITE

1. `npm run check` verde
2. **AgendaView**: Carrega appointments/alarms reais do Supabase
3. **Criar agendamento** → salva no backend → aparece no calendário
4. **Editar/arrastar** no calendário → `updateAppointment` → persiste
5. **NotesView**: Carrega notas reais, CRUD completo funciona
6. **ConversationsHubView**: Busca/filtros via API real
7. **Zero mocks** — remover `mockAppointments`, `mockFollowUpAlarms`, `mockOperationalNotes` imports
8. `@browse` valida: Agenda (mês/semana/dia), Notes, Conversas → 0 console errors

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
npm run dev  # validar visualmente: Agenda, Notes, Conversas
```
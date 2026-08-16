# PROMPT PARA GEMINI — Task 17: Appointments & Notes API (Backend Core)

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Frontend JÁ IMPLEMENTADO: `AgendaView`, `NotesView`, `ConversationsHubView` (usam mocks locais)
Objetivo: **Backend real** para Appointments, Notes, Follow-ups — substituir mocks por API + Supabase

## ARQUIVOS A CRIAR

### 1. Domain Types (estender existentes)
`apps/api/src/domain/types/appointments.ts`
```typescript
// Estender tipos de src/types/agendaAndNotes.ts do frontend
export interface CommercialAppointment {
  id: string;
  workspaceId: string;
  journeyId?: string;
  leadName: string;
  leadPhone: string;           // E.164
  serviceName: string;
  serviceValueMinor: number;   // centavos
  scheduledAt: string;         // ISO datetime
  durationMinutes: number;
  status: 'confirmed' | 'pending_deposit' | 'rescheduled' | 'completed' | 'cancelled';
  source: 'bot_ai' | 'operator';
  operatorName?: string;
  notes?: string;
  location?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalNote {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  category: 'script' | 'meeting' | 'lead_vip' | 'goal' | 'general';
  tags: string[];
  pinned: boolean;
  color?: 'emerald' | 'purple' | 'amber' | 'blue' | 'rose' | 'slate';
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpAlarm {
  id: string;
  workspaceId: string;
  journeyId: string;
  leadName: string;
  leadPhone: string;
  triggerAt: string;           // ISO datetime
  reason: string;
  status: 'pending' | 'snoozed' | 'completed';
  assignedOperatorId: string;
  assignedOperatorName: string;
  isUrgent?: boolean;
  recurrenceRule?: string;     // RRULE RFC 5545
  recurrenceEndDate?: string;
  calendarEventId?: string;
  calendarProvider?: 'google' | 'outlook';
}
```

### 2. Ports
`apps/api/src/application/ports/appointment-gateway.ts`
`apps/api/src/application/ports/notes-gateway.ts`
`apps/api/src/application/ports/followup-gateway.ts` (estender journey-operations)

### 3. Implementações Postgres
`apps/api/src/infrastructure/database/postgres-appointment-gateway.ts`
`apps/api/src/infrastructure/database/postgres-notes-gateway.ts`
`apps/api/src/infrastructure/database/postgres-followup-gateway.ts`

### 4. HTTP Routes
`apps/api/src/interfaces/http/routes/appointments.ts`
`apps/api/src/interfaces/http/routes/notes.ts`
`apps/api/src/interfaces/http/routes/followups.ts` (estender journey-operations)

### 5. Migrations
`apps/api/supabase/migrations/20260815000010_appointments_notes.sql`
`apps/api/supabase/migrations/20260815000011_followups_rrule.sql`

### 6. Gateway Methods (HttpSalesOsGateway)
```typescript
// Em src/services/salesOsGateway.ts
async listAppointments(workspaceId: string, filters?: AppointmentFilters): Promise<Appointment[]>
async createAppointment(workspaceId: string, input: CreateAppointmentInput): Promise<Appointment>
async updateAppointment(workspaceId: string, appointmentId: string, input: UpdateAppointmentInput): Promise<Appointment>
async deleteAppointment(workspaceId: string, appointmentId: string): Promise<void>

async listNotes(workspaceId: string, filters?: NoteFilters): Promise<Note[]>
async createNote(workspaceId: string, input: CreateNoteInput): Promise<Note>
async updateNote(workspaceId: string, noteId: string, input: UpdateNoteInput): Promise<Note>
async deleteNote(workspaceId: string, noteId: string): Promise<void>

async listFollowUps(workspaceId: string, filters?: FollowUpFilters): Promise<FollowUp[]>
async createFollowUp(workspaceId: string, input: CreateFollowUpInput): Promise<FollowUp>
async updateFollowUp(workspaceId: string, followUpId: string, input: UpdateFollowUpInput): Promise<FollowUp>
async completeFollowUp(workspaceId: string, followUpId: string): Promise<void>
```

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **RLS** | Todas as tabelas com `workspace_id` + policies por role |
| **Validação** | Zod schemas em todos os inputs |
| **Idempotência** | `Idempotency-Key` em mutações |
| **Moeda** | `serviceValueMinor` em centavos (BIGINT) |
| **Telefone** | E.164 obrigatório |
| **RRULE** | Campo `recurrenceRule` em follow_ups + worker (Task 18) |
| **Calendar Sync** | Campos `calendarEventId`, `calendarProvider` para Task 18 |
| **Soft Delete** | `deletedAt` em notes/appointments (opcional) |

## CRITÉRIO DE ACEITE

1. `npm run check` verde (191+ testes)
2. CRUD completo via API: create, list, get, update, delete
3. Filtros funcionando: status, date range, search
4. RLS testado: cross-tenant = 404
5. Frontend `AgendaView` + `NotesView` conectados (Task 19) → dados reais

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
cd apps/api && npm run test:integration -- appointments
cd apps/api && npm run test:integration -- notes
cd apps/api && npm run test:integration -- followups
```
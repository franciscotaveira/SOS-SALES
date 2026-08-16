# PROMPT PARA GEMINI — Task 18: Calendar Gateway + RRULE Worker (Backend Core)

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Dependência: Task 17 (Appointments/Notes API) — follow_ups com campos RRULE
Objetivo: **Sincronização bidirecional** com Google Calendar / Outlook + Worker de recorrência

## ARQUIVOS A CRIAR

### 1. Port: `apps/api/src/application/ports/calendar-gateway.ts`
```typescript
interface CalendarGateway {
  // Connection management
  connect(workspaceId: string, provider: 'google' | 'outlook', tokens: CalendarTokens): Promise<void>;
  disconnect(workspaceId: string): Promise<void>;
  getConnectionStatus(workspaceId: string): Promise<CalendarConnectionStatus>;
  
  // Event operations
  createEvent(workspaceId: string, input: CalendarEventInput): Promise<CalendarEventResult>;
  updateEvent(workspaceId: string, eventId: string, input: Partial<CalendarEventInput>): Promise<CalendarEventResult>;
  deleteEvent(workspaceId: string, eventId: string): Promise<void>;
  listEvents(workspaceId: string, start: string, end: string): Promise<CalendarEventResult[]>;
  
  // Availability
  checkAvailability(workspaceId: string, start: string, end: string, durationMinutes: number): Promise<TimeSlot[]>;
}

interface CalendarTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  provider: 'google' | 'outlook';
}

interface CalendarConnectionStatus {
  connected: boolean;
  provider?: 'google' | 'outlook';
  email?: string;
  expiresAt?: number;
  error?: string;
}

interface CalendarEventInput {
  workspaceId: string;
  title: string;
  description?: string;
  startAt: string;           // ISO datetime
  endAt: string;             // ISO datetime
  attendees?: string[];      // emails
  recurrenceRule?: string;   // RRULE RFC 5545
  timezone: string;          // 'America/Sao_Paulo'
  followUpId?: string;       // vincular ao follow-up
  journeyId?: string;
  appointmentId?: string;
}

interface CalendarEventResult {
  eventId: string;
  htmlLink?: string;
  meetLink?: string;
  startAt: string;
  endAt: string;
}

interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}
```

### 2. Adapters
`apps/api/src/infrastructure/integrations/calendar/google-calendar-adapter.ts`
`apps/api/src/infrastructure/integrations/calendar/outlook-calendar-adapter.ts`

### 3. Implementation: `apps/api/src/infrastructure/integrations/calendar/calendar-gateway.ts`
- Factory que seleciona adapter por `calendarProvider` do workspace
- Token refresh automático antes de expirar
- Error handling: 401 → disconnect + notificar

### 4. Worker: `apps/api/src/infrastructure/workers/recurring-followup-worker.ts`
```typescript
// Roda a cada 15 min (ou diário 06:00 timezone workspace)
async function processRecurringFollowUps() {
  // 1. Buscar follow_ups com recurrenceRule ativos
  // 2. Para cada: calcular próxima ocorrência (rrule library)
  // 3. Se próxima ocorrência <= agora + 1h:
  //    a. Criar novo follow_up_task (clone com triggerAt = próxima)
  //    b. Se calendarEventId + calendarProvider → criar evento no CalendarGateway
  //    c. Atualizar follow_up original: última ocorrência processada
  // 4. Respeitar recurrenceEndDate / COUNT
}
```

### 5. Webhook Handlers (Bidirecional)
`apps/api/src/interfaces/http/routes/calendar-webhooks.ts`
- `POST /webhooks/calendar/google` — Google Calendar push notifications
- `POST /webhooks/calendar/outlook` — Microsoft Graph change notifications
- Eventos: created, updated, deleted, moved
- Atualizar `follow_ups` correspondente (triggerAt, status)

### 6. Migration (se necessário)
`apps/api/supabase/migrations/20260815000012_calendar_integration.sql`
- Tabela `workspace_calendar_connections` (workspace_id, provider, tokens_encrypted, sync_token)
- Índices em `follow_ups(recurrenceRule)`, `follow_ups(calendarEventId)`

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **RRULE Library** | `rrule` (npm) — parse, generate occurrences, timezone support |
| **Timezone** | Sempre `America/Sao_Paulo` salvo config workspace |
| **OAuth** | Tokens criptografados (Supabase Vault ou `crypto` + env key) |
| **Refresh Token** | Renovar 5 min antes de expirar (background job) |
| **Sync Token** | Google: `syncToken` para incremental sync; Outlook: `deltaLink` |
| **Conflitos** | `checkAvailability` antes de criar → sugerir 3 slots livres |
| **Bidirecional** | Webhook atualiza follow_up se movido/deletado no calendar externo |
| **Idempotência** | `calendarEventId` único por follow_up |

## CRITÉRIO DE ACEITE

1. `npm run check` verde
2. Workspace conecta Google Calendar (OAuth) → status "Conectado"
3. Follow-up com RRULE "FREQ=MONTHLY;BYMONTHDAY=15" → worker cria ocorrências mensais
4. Evento criado no Google Calendar → `calendarEventId` salvo
5. Move evento no Google Calendar → follow_up `triggerAt` atualizado automaticamente
6. Deleta evento no Google Calendar → follow_up status = 'cancelled'
7. Worker respeita `recurrenceEndDate` e `COUNT`
8. Conflito de horário detectado → sugere 3 alternativas

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
cd apps/api && npm run test:integration -- calendar
cd apps/api && npm run test:integration -- recurring-followup-worker
# Testar OAuth:
# GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run dev
```
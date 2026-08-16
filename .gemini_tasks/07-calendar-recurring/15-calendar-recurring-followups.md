# PROMPT PARA GEMINI — Task 15: Calendar + Recurring Follow-ups (Onda 1)

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Pós-MVP: `follow_up_tasks` existe (dueAt + reason) mas sem recorrência nem integração calendário
Objetivo: **Agendamento inteligente** — follow-ups recorrentes + Google/Outlook Calendar + conflitos

## ARQUIVOS A CRIAR

### 1. Extensão Domain: `apps/api/src/domain/entities/follow-up.ts`
```typescript
interface FollowUpTask {
  // ... campos existentes
  recurrenceRule?: string;        // RRULE RFC 5545 (ex: "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15")
  recurrenceEndDate?: string;     // ISO date ou "COUNT=12"
  calendarEventId?: string;       // ID no Google/Outlook Calendar
  calendarProvider?: 'google' | 'outlook';
  timezone: string;               // 'America/Sao_Paulo' (default)
}
```

### 2. Port: `apps/api/src/application/ports/calendar-gateway.ts`
```typescript
interface CalendarGateway {
  createEvent(input: CalendarEventInput): Promise<CalendarEventResult>;
  updateEvent(eventId: string, input: Partial<CalendarEventInput>): Promise<CalendarEventResult>;
  deleteEvent(eventId: string): Promise<void>;
  listEvents(workspaceId: string, start: string, end: string): Promise<CalendarEventResult[]>;
  checkAvailability(start: string, end: string, durationMinutes: number): Promise<TimeSlot[]>;
}

interface CalendarEventInput {
  workspaceId: string;
  title: string;
  description?: string;
  startAt: string;              // ISO datetime
  endAt: string;                // ISO datetime
  attendees?: string[];         // emails
  recurrenceRule?: string;      // RRULE
  timezone: string;
  journeyId?: string;           // vincular à jornada
  followUpId?: string;          // vincular ao follow-up
}

interface CalendarEventResult {
  eventId: string;
  htmlLink?: string;            // link para abrir no calendário
  meetLink?: string;            // Google Meet / Teams link
}
```

### 3. Adapters
| Adapter | Arquivo | OAuth Scope |
|---------|---------|-------------|
| Google Calendar | `google-calendar-adapter.ts` | `https://www.googleapis.com/auth/calendar.events` |
| Outlook Calendar | `outlook-calendar-adapter.ts` | `Calendars.ReadWrite` |

### 4. Worker: `apps/api/src/infrastructure/workers/recurring-followup-worker.ts`
- Roda diário 06:00 (timezone workspace)
- Busca `follow_up_tasks` com `recurrenceRule` ativos
- Para cada: calcula próxima ocorrência → cria novo `follow_up_task` + evento no calendário
- Respeita `recurrenceEndDate` / `COUNT`

### 5. Integração no JourneyOperationsGateway
```typescript
// createFollowUp agora aceita recurrenceRule
async createFollowUp(input: CreateFollowUpInput & { recurrenceRule?: string; recurrenceEndDate?: string }): Promise<FollowUpTask> {
  // 1. Criar follow_up_task
  // 2. Se recurrenceRule → criar evento no CalendarGateway
  // 3. Salvar calendarEventId + calendarProvider no follow_up_task
}
```

### 6. UI: Calendário no Frontend (Task futura)
- View mensal/semanal/dia
- Drag & drop para reagendar
- Conflitos visualizados
- "Próximos follow-ups" no Cockpit sidebar

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **RRULE** | Usar biblioteca `rrule` (npm) — parse + generate occurrences |
| **Timezone** | Sempre `America/Sao_Paulo` salvo configuração do workspace |
| **OAuth** | Tokens guardados em `workspace_integrations.config_json` (criptografados) |
| **Refresh Token** | Renovação automática antes de expirar |
| **Conflitos** | `checkAvailability` antes de criar — sugerir horários livres |
| **Sync Bidirecional** | Webhook Google/Outlook → atualiza `follow_up_task` se movido/deletado externamente |

## CRITÉRIO DE ACEITE

1. `npm run check` verde
2. Operador cria follow-up: "Todo dia 15, às 10h, cobrar mensalidade" → `FREQ=MONTHLY;BYMONTHDAY=15;BYHOUR=10;BYMINUTE=0`
3. Evento criado no Google Calendar do workspace
4. Worker diário cria próximo follow-up automaticamente
5. Se operador move evento no Google Calendar → follow-up atualizado no SOS
6. Conflito de horário detectado → sugere 3 horários alternativos

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
# Testar OAuth Google:
# GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run dev
```
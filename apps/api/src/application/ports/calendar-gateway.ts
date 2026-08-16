/**
 * TX COMMERCIAL CORE — CALENDAR GATEWAY PORT
 *
 * Provider-agnostic boundary for external calendar synchronisation
 * (Google Calendar, Microsoft Outlook) and bidirectional availability calculation.
 */

export interface CalendarTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  provider: 'google' | 'outlook';
}

export interface CalendarConnectionStatus {
  connected: boolean;
  provider?: 'google' | 'outlook';
  email?: string;
  expiresAt?: number;
  error?: string;
}

export interface CalendarEventInput {
  workspaceId: string;
  title: string;
  description?: string;
  startAt: string; // ISO datetime
  endAt: string; // ISO datetime
  attendees?: string[]; // email addresses
  recurrenceRule?: string; // RFC 5545 RRULE string
  timezone?: string; // default: 'America/Sao_Paulo'
  followUpId?: string;
  journeyId?: string;
  appointmentId?: string;
}

export interface CalendarEventResult {
  eventId: string;
  htmlLink?: string;
  meetLink?: string;
  startAt: string;
  endAt: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface CalendarGateway {
  connect(workspaceId: string, provider: 'google' | 'outlook', tokens: CalendarTokens): Promise<void>;
  disconnect(workspaceId: string): Promise<void>;
  getConnectionStatus(workspaceId: string): Promise<CalendarConnectionStatus>;

  createEvent(workspaceId: string, input: CalendarEventInput): Promise<CalendarEventResult>;
  updateEvent(workspaceId: string, eventId: string, input: Partial<CalendarEventInput>): Promise<CalendarEventResult>;
  deleteEvent(workspaceId: string, eventId: string): Promise<void>;
  listEvents(workspaceId: string, start: string, end: string): Promise<CalendarEventResult[]>;

  checkAvailability(workspaceId: string, start: string, end: string, durationMinutes: number): Promise<TimeSlot[]>;
}

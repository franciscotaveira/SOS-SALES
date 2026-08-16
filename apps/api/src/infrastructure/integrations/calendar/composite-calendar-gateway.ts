import {
  CalendarConnectionStatus,
  CalendarEventInput,
  CalendarEventResult,
  CalendarGateway,
  CalendarTokens,
  TimeSlot,
} from '../../../application/ports/calendar-gateway.js';
import { GoogleCalendarAdapter } from './google-calendar-adapter.js';
import { OutlookCalendarAdapter } from './outlook-calendar-adapter.js';

export class CompositeCalendarGateway implements CalendarGateway {
  private readonly connections = new Map<string, CalendarTokens>();
  private readonly googleAdapter: GoogleCalendarAdapter;
  private readonly outlookAdapter: OutlookCalendarAdapter;

  constructor(
    googleAdapter?: GoogleCalendarAdapter,
    outlookAdapter?: OutlookCalendarAdapter,
  ) {
    this.googleAdapter = googleAdapter || new GoogleCalendarAdapter();
    this.outlookAdapter = outlookAdapter || new OutlookCalendarAdapter();
  }

  async connect(
    workspaceId: string,
    provider: 'google' | 'outlook',
    tokens: CalendarTokens,
  ): Promise<void> {
    this.connections.set(workspaceId, { ...tokens, provider });
  }

  async disconnect(workspaceId: string): Promise<void> {
    this.connections.delete(workspaceId);
  }

  async getConnectionStatus(workspaceId: string): Promise<CalendarConnectionStatus> {
    const conn = this.connections.get(workspaceId);
    if (!conn) {
      return { connected: false };
    }
    return {
      connected: true,
      provider: conn.provider,
      expiresAt: conn.expiresAt,
    };
  }

  async createEvent(workspaceId: string, input: CalendarEventInput): Promise<CalendarEventResult> {
    const conn = this.getValidConnection(workspaceId);
    if (conn.provider === 'google') {
      return this.googleAdapter.createEvent(conn.accessToken, input);
    }
    return this.outlookAdapter.createEvent(conn.accessToken, input);
  }

  async updateEvent(
    workspaceId: string,
    eventId: string,
    input: Partial<CalendarEventInput>,
  ): Promise<CalendarEventResult> {
    const conn = this.getValidConnection(workspaceId);
    if (conn.provider === 'google') {
      return this.googleAdapter.updateEvent(conn.accessToken, eventId, input);
    }
    return this.outlookAdapter.updateEvent(conn.accessToken, eventId, input);
  }

  async deleteEvent(workspaceId: string, eventId: string): Promise<void> {
    const conn = this.getValidConnection(workspaceId);
    if (conn.provider === 'google') {
      return this.googleAdapter.deleteEvent(conn.accessToken, eventId);
    }
    return this.outlookAdapter.deleteEvent(conn.accessToken, eventId);
  }

  async listEvents(workspaceId: string, start: string, end: string): Promise<CalendarEventResult[]> {
    const conn = this.getValidConnection(workspaceId);
    if (conn.provider === 'google') {
      return this.googleAdapter.listEvents(conn.accessToken, start, end);
    }
    return this.outlookAdapter.listEvents(conn.accessToken, start, end);
  }

  async checkAvailability(
    workspaceId: string,
    start: string,
    end: string,
    durationMinutes: number,
  ): Promise<TimeSlot[]> {
    const conn = this.connections.get(workspaceId);
    if (!conn) {
      // Default: free across interval
      const stepMs = durationMinutes * 60 * 1000;
      const startTime = new Date(start).getTime();
      const endTime = new Date(end).getTime();
      const slots: TimeSlot[] = [];
      for (let t = startTime; t + stepMs <= endTime; t += stepMs) {
        slots.push({
          start: new Date(t).toISOString(),
          end: new Date(t + stepMs).toISOString(),
          available: true,
        });
      }
      return slots;
    }

    if (conn.provider === 'google') {
      return this.googleAdapter.checkAvailability(conn.accessToken, start, end, durationMinutes);
    }
    return this.outlookAdapter.checkAvailability(conn.accessToken, start, end, durationMinutes);
  }

  private getValidConnection(workspaceId: string): CalendarTokens {
    const conn = this.connections.get(workspaceId);
    if (!conn) {
      throw new Error(`Workspace ${workspaceId} does not have an active calendar connection`);
    }
    return conn;
  }
}

import {
  CalendarEventInput,
  CalendarEventResult,
  TimeSlot,
} from '../../../application/ports/calendar-gateway.js';

export interface GoogleCalendarAdapterConfig {
  baseUrl?: string;
}

export class GoogleCalendarAdapter {
  private readonly baseUrl: string;

  constructor(config?: GoogleCalendarAdapterConfig) {
    this.baseUrl = config?.baseUrl || 'https://www.googleapis.com/calendar/v3';
  }

  async createEvent(accessToken: string, input: CalendarEventInput): Promise<CalendarEventResult> {
    const url = `${this.baseUrl}/calendars/primary/events`;
    const timezone = input.timezone || 'America/Sao_Paulo';

    const payload: Record<string, unknown> = {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.startAt, timeZone: timezone },
      end: { dateTime: input.endAt, timeZone: timezone },
    };

    if (input.attendees && input.attendees.length > 0) {
      payload.attendees = input.attendees.map((email) => ({ email }));
    }

    if (input.recurrenceRule) {
      payload.recurrence = [`RRULE:${input.recurrenceRule.replace(/^RRULE:/i, '')}`];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Calendar Error HTTP ${response.status}: ${errorText}`);
    }

    const json = (await response.json()) as {
      id: string;
      htmlLink?: string;
      hangoutLink?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
    };

    return {
      eventId: json.id,
      htmlLink: json.htmlLink,
      meetLink: json.hangoutLink,
      startAt: json.start?.dateTime || input.startAt,
      endAt: json.end?.dateTime || input.endAt,
    };
  }

  async updateEvent(
    accessToken: string,
    eventId: string,
    input: Partial<CalendarEventInput>,
  ): Promise<CalendarEventResult> {
    const url = `${this.baseUrl}/calendars/primary/events/${eventId}`;
    const payload: Record<string, unknown> = {};

    if (input.title !== undefined) payload.summary = input.title;
    if (input.description !== undefined) payload.description = input.description;
    if (input.startAt !== undefined) {
      payload.start = { dateTime: input.startAt, timeZone: input.timezone || 'America/Sao_Paulo' };
    }
    if (input.endAt !== undefined) {
      payload.end = { dateTime: input.endAt, timeZone: input.timezone || 'America/Sao_Paulo' };
    }

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Calendar Error HTTP ${response.status}: ${errorText}`);
    }

    const json = (await response.json()) as {
      id: string;
      htmlLink?: string;
      hangoutLink?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
    };

    return {
      eventId: json.id,
      htmlLink: json.htmlLink,
      meetLink: json.hangoutLink,
      startAt: json.start?.dateTime || (input.startAt ?? ''),
      endAt: json.end?.dateTime || (input.endAt ?? ''),
    };
  }

  async deleteEvent(accessToken: string, eventId: string): Promise<void> {
    const url = `${this.baseUrl}/calendars/primary/events/${eventId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`Google Calendar Error HTTP ${response.status}: ${errorText}`);
    }
  }

  async listEvents(accessToken: string, start: string, end: string): Promise<CalendarEventResult[]> {
    const url = new URL(`${this.baseUrl}/calendars/primary/events`);
    url.searchParams.set('timeMin', start);
    url.searchParams.set('timeMax', end);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Calendar Error HTTP ${response.status}: ${errorText}`);
    }

    const json = (await response.json()) as {
      items?: Array<{
        id: string;
        htmlLink?: string;
        hangoutLink?: string;
        start?: { dateTime?: string };
        end?: { dateTime?: string };
      }>;
    };

    return (json.items || []).map((item) => ({
      eventId: item.id,
      htmlLink: item.htmlLink,
      meetLink: item.hangoutLink,
      startAt: item.start?.dateTime || '',
      endAt: item.end?.dateTime || '',
    }));
  }

  async checkAvailability(
    accessToken: string,
    start: string,
    end: string,
    durationMinutes: number,
  ): Promise<TimeSlot[]> {
    const url = `${this.baseUrl}/freeBusy`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: start,
        timeMax: end,
        items: [{ id: 'primary' }],
      }),
    });

    if (!response.ok) {
      return [];
    }

    const json = (await response.json()) as {
      calendars?: { primary?: { busy?: Array<{ start: string; end: string }> } };
    };

    const busySlots = json.calendars?.primary?.busy || [];

    // Compute discrete slots from start to end with step durationMinutes
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const stepMs = durationMinutes * 60 * 1000;
    const slots: TimeSlot[] = [];

    for (let t = startTime; t + stepMs <= endTime; t += stepMs) {
      const slotStart = new Date(t).toISOString();
      const slotEnd = new Date(t + stepMs).toISOString();

      const isBusy = busySlots.some((b) => {
        const bStart = new Date(b.start).getTime();
        const bEnd = new Date(b.end).getTime();
        return t < bEnd && t + stepMs > bStart;
      });

      slots.push({
        start: slotStart,
        end: slotEnd,
        available: !isBusy,
      });
    }

    return slots;
  }
}

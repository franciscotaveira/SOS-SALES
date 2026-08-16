import {
  CalendarEventInput,
  CalendarEventResult,
  TimeSlot,
} from '../../../application/ports/calendar-gateway.js';

export interface OutlookCalendarAdapterConfig {
  baseUrl?: string;
}

export class OutlookCalendarAdapter {
  private readonly baseUrl: string;

  constructor(config?: OutlookCalendarAdapterConfig) {
    this.baseUrl = config?.baseUrl || 'https://graph.microsoft.com/v1.0';
  }

  async createEvent(accessToken: string, input: CalendarEventInput): Promise<CalendarEventResult> {
    const url = `${this.baseUrl}/me/events`;
    const timezone = input.timezone || 'America/Sao_Paulo';

    const payload: Record<string, unknown> = {
      subject: input.title,
      body: { contentType: 'HTML', content: input.description || '' },
      start: { dateTime: input.startAt, timeZone: timezone },
      end: { dateTime: input.endAt, timeZone: timezone },
    };

    if (input.attendees && input.attendees.length > 0) {
      payload.attendees = input.attendees.map((email) => ({
        emailAddress: { address: email },
        type: 'required',
      }));
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
      throw new Error(`Outlook Calendar Error HTTP ${response.status}: ${errorText}`);
    }

    const json = (await response.json()) as {
      id: string;
      webLink?: string;
      onlineMeeting?: { joinUrl?: string };
      start?: { dateTime?: string };
      end?: { dateTime?: string };
    };

    return {
      eventId: json.id,
      htmlLink: json.webLink,
      meetLink: json.onlineMeeting?.joinUrl,
      startAt: json.start?.dateTime || input.startAt,
      endAt: json.end?.dateTime || input.endAt,
    };
  }

  async updateEvent(
    accessToken: string,
    eventId: string,
    input: Partial<CalendarEventInput>,
  ): Promise<CalendarEventResult> {
    const url = `${this.baseUrl}/me/events/${eventId}`;
    const payload: Record<string, unknown> = {};

    if (input.title !== undefined) payload.subject = input.title;
    if (input.description !== undefined) {
      payload.body = { contentType: 'HTML', content: input.description };
    }
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
      throw new Error(`Outlook Calendar Error HTTP ${response.status}: ${errorText}`);
    }

    const json = (await response.json()) as {
      id: string;
      webLink?: string;
      onlineMeeting?: { joinUrl?: string };
      start?: { dateTime?: string };
      end?: { dateTime?: string };
    };

    return {
      eventId: json.id,
      htmlLink: json.webLink,
      meetLink: json.onlineMeeting?.joinUrl,
      startAt: json.start?.dateTime || (input.startAt ?? ''),
      endAt: json.end?.dateTime || (input.endAt ?? ''),
    };
  }

  async deleteEvent(accessToken: string, eventId: string): Promise<void> {
    const url = `${this.baseUrl}/me/events/${eventId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`Outlook Calendar Error HTTP ${response.status}: ${errorText}`);
    }
  }

  async listEvents(accessToken: string, start: string, end: string): Promise<CalendarEventResult[]> {
    const url = new URL(`${this.baseUrl}/me/calendarView`);
    url.searchParams.set('startDateTime', start);
    url.searchParams.set('endDateTime', end);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="America/Sao_Paulo"',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Outlook Calendar Error HTTP ${response.status}: ${errorText}`);
    }

    const json = (await response.json()) as {
      value?: Array<{
        id: string;
        webLink?: string;
        onlineMeeting?: { joinUrl?: string };
        start?: { dateTime?: string };
        end?: { dateTime?: string };
      }>;
    };

    return (json.value || []).map((item) => ({
      eventId: item.id,
      htmlLink: item.webLink,
      meetLink: item.onlineMeeting?.joinUrl,
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
    const url = `${this.baseUrl}/me/calendar/getSchedule`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        schedules: ['me'],
        startTime: { dateTime: start, timeZone: 'America/Sao_Paulo' },
        endTime: { dateTime: end, timeZone: 'America/Sao_Paulo' },
        availabilityViewInterval: durationMinutes,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const json = (await response.json()) as {
      value?: Array<{
        scheduleItems?: Array<{ start?: { dateTime?: string }; end?: { dateTime?: string } }>;
      }>;
    };

    const busyItems = json.value?.[0]?.scheduleItems || [];

    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const stepMs = durationMinutes * 60 * 1000;
    const slots: TimeSlot[] = [];

    for (let t = startTime; t + stepMs <= endTime; t += stepMs) {
      const slotStart = new Date(t).toISOString();
      const slotEnd = new Date(t + stepMs).toISOString();

      const isBusy = busyItems.some((item) => {
        if (!item.start?.dateTime || !item.end?.dateTime) return false;
        const bStart = new Date(item.start.dateTime).getTime();
        const bEnd = new Date(item.end.dateTime).getTime();
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

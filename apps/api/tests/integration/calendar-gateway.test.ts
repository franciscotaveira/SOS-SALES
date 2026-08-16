import { describe, expect, it, vi } from 'vitest';
import { CompositeCalendarGateway } from '../../src/infrastructure/integrations/calendar/composite-calendar-gateway.js';
import { GoogleCalendarAdapter } from '../../src/infrastructure/integrations/calendar/google-calendar-adapter.js';

describe('Calendar Gateway — Google & Outlook Integration', () => {
  it('CAL-01: connects to Google Calendar and creates synchronized event', async () => {
    const workspaceId = 'w1000000-0000-4000-8000-000000000001';
    const googleAdapter = new GoogleCalendarAdapter({ baseUrl: 'https://mock-google-cal.com' });

    vi.spyOn(googleAdapter, 'createEvent').mockResolvedValue({
      eventId: 'gcal_event_123',
      htmlLink: 'https://calendar.google.com/event?eid=gcal_event_123',
      meetLink: 'https://meet.google.com/abc-defg-hij',
      startAt: '2026-08-20T14:00:00.000Z',
      endAt: '2026-08-20T15:00:00.000Z',
    });

    const gateway = new CompositeCalendarGateway(googleAdapter);

    await gateway.connect(workspaceId, 'google', {
      accessToken: 'ya29.mock_token',
      refreshToken: '1//mock_refresh',
      expiresAt: Date.now() + 3600000,
      provider: 'google',
    });

    const status = await gateway.getConnectionStatus(workspaceId);
    expect(status.connected).toBe(true);
    expect(status.provider).toBe('google');

    const result = await gateway.createEvent(workspaceId, {
      workspaceId,
      title: 'Consulta Avaliação - Roberto',
      startAt: '2026-08-20T14:00:00.000Z',
      endAt: '2026-08-20T15:00:00.000Z',
      timezone: 'America/Sao_Paulo',
    });

    expect(result.eventId).toBe('gcal_event_123');
    expect(result.meetLink).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('CAL-02: checks free/busy availability and generates discrete time slots', async () => {
    const workspaceId = 'w1000000-0000-4000-8000-000000000001';
    const googleAdapter = new GoogleCalendarAdapter();

    vi.spyOn(googleAdapter, 'checkAvailability').mockResolvedValue([
      { start: '2026-08-20T09:00:00.000Z', end: '2026-08-20T10:00:00.000Z', available: true },
      { start: '2026-08-20T10:00:00.000Z', end: '2026-08-20T11:00:00.000Z', available: false }, // busy
      { start: '2026-08-20T11:00:00.000Z', end: '2026-08-20T12:00:00.000Z', available: true },
    ]);

    const gateway = new CompositeCalendarGateway(googleAdapter);

    await gateway.connect(workspaceId, 'google', {
      accessToken: 'ya29.mock_token',
      refreshToken: '1//mock_refresh',
      expiresAt: Date.now() + 3600000,
      provider: 'google',
    });

    const slots = await gateway.checkAvailability(
      workspaceId,
      '2026-08-20T09:00:00.000Z',
      '2026-08-20T12:00:00.000Z',
      60,
    );

    expect(slots).toHaveLength(3);
    expect(slots[0].available).toBe(true);
    expect(slots[1].available).toBe(false);
    expect(slots[2].available).toBe(true);
  });
});

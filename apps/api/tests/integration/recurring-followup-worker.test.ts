import { describe, expect, it, vi } from 'vitest';
import {
  computeNextRRuleOccurrence,
  parseRRule,
  RecurringFollowUpWorker,
} from '../../src/infrastructure/workers/recurring-followup-worker.js';

describe('RRULE Recurring Follow-up Worker', () => {
  it('RRULE-01: parses standard RFC 5545 recurrence rules', () => {
    const parsed = parseRRule('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15');
    expect(parsed.FREQ).toBe('MONTHLY');
    expect(parsed.INTERVAL).toBe('2');
    expect(parsed.BYMONTHDAY).toBe('15');
  });

  it('RRULE-02: computes next occurrence after given date', () => {
    const baseDate = new Date('2026-08-01T10:00:00.000Z');
    const afterDate = new Date('2026-08-15T00:00:00.000Z');

    // Weekly recurrence
    const nextWeekly = computeNextRRuleOccurrence('FREQ=WEEKLY;INTERVAL=1', baseDate, afterDate);
    expect(nextWeekly).not.toBeNull();
    expect(nextWeekly?.getTime()).toBeGreaterThan(afterDate.getTime());
    // 2026-08-01 + 2 weeks = 2026-08-15 10:00:00Z
    expect(nextWeekly?.toISOString()).toBe('2026-08-15T10:00:00.000Z');
  });

  it('RRULE-03: worker identifies recurring items within horizon and triggers calendar event creation', async () => {
    const mockCalendarGateway = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      getConnectionStatus: vi.fn(),
      createEvent: vi.fn().mockResolvedValue({
        eventId: 'gcal_rec_001',
        startAt: '2026-08-16T10:00:00.000Z',
        endAt: '2026-08-16T10:30:00.000Z',
      }),
      updateEvent: vi.fn(),
      deleteEvent: vi.fn(),
      listEvents: vi.fn(),
      checkAvailability: vi.fn(),
    };

    const worker = new RecurringFollowUpWorker(mockCalendarGateway as any);

    // Mock Date now
    const item = {
      id: 'fu100000-0000-4000-8000-000000000001',
      workspaceId: 'w1000000-0000-4000-8000-000000000001',
      journeyId: 'j1000000-0000-4000-8000-000000000001',
      leadName: 'Fernanda Lima',
      leadPhone: '+5511999998888',
      reason: 'Retorno de pós-operatório mensal',
      triggerAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      calendarProvider: 'google' as const,
      assignedOperatorId: 'usr-123',
      assignedOperatorName: 'Clara Agenda',
    };

    const results = await worker.processRecurringItems([item], 48);

    expect(results).toHaveLength(1);
    expect(results[0].originalId).toBe(item.id);
    expect(results[0].calendarSynced).toBe(true);
    expect(mockCalendarGateway.createEvent).toHaveBeenCalled();
  });
});

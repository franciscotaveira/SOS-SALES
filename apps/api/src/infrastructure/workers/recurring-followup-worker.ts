import { CalendarGateway } from '../../application/ports/calendar-gateway.js';

export interface RecurringFollowUpItem {
  id: string;
  workspaceId: string;
  journeyId: string;
  leadName: string;
  leadPhone: string;
  reason: string;
  triggerAt: string;
  recurrenceRule: string;
  recurrenceEndDate?: string;
  calendarEventId?: string;
  calendarProvider?: 'google' | 'outlook';
  assignedOperatorId: string;
  assignedOperatorName: string;
}

export function parseRRule(rruleStr: string): Record<string, string> {
  const clean = rruleStr.replace(/^RRULE:/i, '').trim();
  const parts = clean.split(';');
  const map: Record<string, string> = {};
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k && v) {
      map[k.toUpperCase()] = v.toUpperCase();
    }
  }
  return map;
}

export function computeNextRRuleOccurrence(
  rruleStr: string,
  baseDate: Date,
  afterDate: Date = new Date(),
): Date | null {
  const parsed = parseRRule(rruleStr);
  const freq = parsed.FREQ;
  const interval = parseInt(parsed.INTERVAL || '1', 10);
  const until = parsed.UNTIL ? new Date(parsed.UNTIL) : null;

  let current = new Date(baseDate);

  // Advance occurrences until current > afterDate
  for (let i = 0; i < 1000; i++) {
    if (freq === 'DAILY') {
      current = new Date(current.getTime() + interval * 24 * 60 * 60 * 1000);
    } else if (freq === 'WEEKLY') {
      current = new Date(current.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
    } else if (freq === 'MONTHLY') {
      const nextMonth = current.getMonth() + interval;
      current = new Date(current);
      current.setMonth(nextMonth);
    } else if (freq === 'YEARLY') {
      current = new Date(current);
      current.setFullYear(current.getFullYear() + interval);
    } else {
      // Default: daily
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    }

    if (until && current > until) {
      return null;
    }

    if (current > afterDate) {
      return current;
    }
  }

  return null;
}

export class RecurringFollowUpWorker {
  private readonly calendarGateway?: CalendarGateway;

  constructor(calendarGateway?: CalendarGateway) {
    this.calendarGateway = calendarGateway;
  }

  /**
   * Evaluates recurring follow-ups and returns created occurrences within the target horizon.
   */
  async processRecurringItems(
    items: RecurringFollowUpItem[],
    horizonHours = 24,
  ): Promise<Array<{ originalId: string; nextTriggerAt: string; calendarSynced: boolean }>> {
    const now = new Date();
    const horizonLimit = new Date(now.getTime() + horizonHours * 60 * 60 * 1000);
    const created: Array<{ originalId: string; nextTriggerAt: string; calendarSynced: boolean }> = [];

    for (const item of items) {
      if (!item.recurrenceRule) continue;

      const baseDate = new Date(item.triggerAt);
      const nextOccurrence = computeNextRRuleOccurrence(item.recurrenceRule, baseDate, now);

      if (!nextOccurrence) continue;

      // If recurrenceEndDate is specified and nextOccurrence exceeds it, skip
      if (item.recurrenceEndDate && nextOccurrence > new Date(item.recurrenceEndDate)) {
        continue;
      }

      // If next occurrence falls within the planning horizon, provision it
      if (nextOccurrence <= horizonLimit) {
        let calendarSynced = false;

        if (this.calendarGateway && item.calendarProvider) {
          try {
            await this.calendarGateway.createEvent(item.workspaceId, {
              workspaceId: item.workspaceId,
              title: `Follow-up: ${item.leadName} (${item.reason})`,
              description: `Agendado automaticamente pelo SOS Sales via regra ${item.recurrenceRule}`,
              startAt: nextOccurrence.toISOString(),
              endAt: new Date(nextOccurrence.getTime() + 30 * 60 * 1000).toISOString(),
              followUpId: item.id,
              journeyId: item.journeyId,
            });
            calendarSynced = true;
          } catch {
            calendarSynced = false;
          }
        }

        created.push({
          originalId: item.id,
          nextTriggerAt: nextOccurrence.toISOString(),
          calendarSynced,
        });
      }
    }

    return created;
  }
}

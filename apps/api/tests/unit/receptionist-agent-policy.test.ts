import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getReceptionistActionPolicy,
  parseReceptionistDecision,
  ReceptionistAgent,
} from '../../src/application/agents/receptionist-agent.js';

describe('ReceptionistAgent untrusted-model safety policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts only the documented classification envelope', () => {
    expect(parseReceptionistDecision(
      '{"intent":"booking","escalate":false,"sendBookingFlow":true}\nVamos agendar seu horário.'
    )).toEqual({
      intent: 'booking',
      escalate: false,
      sendBookingFlow: true,
      reply: 'Vamos agendar seu horário.',
    });
  });

  it('rejects missing envelopes, unknown intents, unknown fields, and malformed action combinations', () => {
    expect(parseReceptionistDecision('Resposta sem envelope')).toBeNull();
    expect(parseReceptionistDecision('{"intent":"delete_customer","escalate":false,"sendBookingFlow":false}\nOi')).toBeNull();
    expect(parseReceptionistDecision('{"intent":"greeting","escalate":false,"sendBookingFlow":false,"admin":true}\nOi')).toBeNull();
    expect(parseReceptionistDecision('{"intent":"inquiry","escalate":false,"sendBookingFlow":true}\nOi')).toBeNull();
    expect(parseReceptionistDecision('{"intent":"human_request","escalate":false,"sendBookingFlow":false}\nOi')).toBeNull();
  });

  it('forces high-risk intents to human handoff even when the model does not request escalation', () => {
    for (const intent of ['objection', 'payment', 'human_request'] as const) {
      const policy = getReceptionistActionPolicy({ intent, escalate: false, sendBookingFlow: false, reply: 'texto' });
      expect(policy).toMatchObject({ shouldEscalate: true, allowReply: false, allowBookingFlow: false });
    }
  });

  it('allows booking flow only for an allowed booking response', () => {
    const policy = getReceptionistActionPolicy({
      intent: 'booking',
      escalate: false,
      sendBookingFlow: true,
      reply: 'Vou enviar o agendamento.',
    });
    expect(policy).toEqual({ shouldEscalate: false, allowReply: true, allowBookingFlow: true });
  });

  it('fails closed when the journey does not exist', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
    const agent = new ReceptionistAgent({ query }) as unknown as {
      isBotActiveForJourney(workspaceId: string, journeyId: string): Promise<boolean>;
    };
    await expect(agent.isBotActiveForJourney('workspace-a', 'journey-a')).resolves.toBe(false);
  });

  it('fails closed when the bot state cannot be read', async () => {
    const query = vi.fn().mockRejectedValue(new Error('database unavailable')) as unknown as typeof import('../../src/infrastructure/database/pool.js').dbPool.query;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const agent = new ReceptionistAgent({ query }) as unknown as {
      isBotActiveForJourney(workspaceId: string, journeyId: string): Promise<boolean>;
    };
    await expect(agent.isBotActiveForJourney('workspace-a', 'journey-a')).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});

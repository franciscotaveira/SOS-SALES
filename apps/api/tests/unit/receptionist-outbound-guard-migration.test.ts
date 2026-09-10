import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(
  here,
  '../../supabase/migrations/20260910140000_atomic_receptionist_outbound_guard.sql',
), 'utf8');
const agentSource = readFileSync(resolve(
  here,
  '../../src/application/agents/receptionist-agent.ts',
), 'utf8');

describe('atomic receptionist outbound guard migration', () => {
  it('locks and validates the open bot-active journey before reserving provider work', () => {
    expect(migration).toMatch(/FROM public\.commercial_journeys[\s\S]*FOR UPDATE/);
    expect(migration).toContain("v_journey.status <> 'OPEN'");
    expect(migration).toContain('v_journey.bot_enabled IS DISTINCT FROM true');
    expect(migration).toContain("v_journey.responder_owner = 'human'");
  });

  it('prevents closure while either outbound message is in progress', () => {
    expect(migration).toContain("'TEXT_SECONDARY'");
    expect(migration).toContain("reservation.status = 'SENDING'");
    expect(migration).toContain('BEFORE UPDATE OF status, bot_enabled, bot_paused_at, responder_owner ON public.commercial_journeys');
    expect(agentSource).toMatch(/reserveOutbound\([\s\S]*'TEXT_SECONDARY'[\s\S]*secondMessage/);
    expect(agentSource).toMatch(/completeOutbound\([\s\S]*secondReservationId[\s\S]*secondMessage/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  EKO_BONUS_MODULES,
  hasEkoBonusEntitlement,
} from '../../src/application/services/eko-bonus.js';

describe('EKO subscription bonus entitlement', () => {
  const now = Date.parse('2026-09-05T12:00:00.000Z');

  it('grants the kit to active and trialing subscriptions', () => {
    expect(hasEkoBonusEntitlement({ status: 'active' }, now)).toBe(true);
    expect(hasEkoBonusEntitlement({ status: 'trialing' }, now)).toBe(true);
  });

  it('honors the past-due grace window but closes after it expires', () => {
    expect(hasEkoBonusEntitlement({
      status: 'past_due',
      accessUntil: '2026-09-05T12:00:01.000Z',
    }, now)).toBe(true);
    expect(hasEkoBonusEntitlement({
      status: 'past_due',
      accessUntil: '2026-09-05T11:59:59.000Z',
    }, now)).toBe(false);
  });

  it('does not grant access to canceled, refunded or unlinked subscriptions', () => {
    expect(hasEkoBonusEntitlement({ status: 'canceled' }, now)).toBe(false);
    expect(hasEkoBonusEntitlement({ status: 'refunded' }, now)).toBe(false);
    expect(hasEkoBonusEntitlement(null, now)).toBe(false);
  });

  it('ships all six implementation modules promised in the offer', () => {
    expect(EKO_BONUS_MODULES).toHaveLength(6);
    expect(EKO_BONUS_MODULES.map((module) => module.id)).toEqual([
      'mapa-mestre',
      'guia-conversa',
      'contexto-aquisicao',
      'limites-handoff',
      'base-conhecimento',
      'checklist-testes',
    ]);
  });
});


import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildSafeRetentionMessage } from '../../src/application/services/ltv-retention-engine.js';

describe('LTV retention truth-in-data policy', () => {
  it('creates a useful draft without claiming a reservation or availability', () => {
    const message = buildSafeRetentionMessage('Ana', 'escova', 20);

    expect(message).toContain('Faz 20 dias');
    expect(message).toContain('confirmar as opções disponíveis');
    expect(message).not.toMatch(/separei|reservei|vaga|exclusiv|agenda livre|horário garantido/i);
  });

  it('reads the actual commercial outcome revenue column and has no invented default value', async () => {
    const source = await readFile(
      new URL('../../src/application/services/ltv-retention-engine.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('co.final_revenue_minor');
    expect(source).not.toContain('row.revenue_minor || 12000');
  });
});

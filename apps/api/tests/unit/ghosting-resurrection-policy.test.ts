import { describe, expect, it } from 'vitest';
import { safeGhostingFallbackMessage } from '../../src/application/services/ghosting-resurrection-engine.js';

describe('Ghosting resurrection fail-closed commercial policy', () => {
  it('keeps the fallback useful without fabricating offers or availability', () => {
    const message = safeGhostingFallbackMessage('Ana');

    expect(message).toContain('Oi Ana!');
    expect(message).toContain('continuar nossa conversa');
    expect(message).toContain('pessoa da equipe');
    expect(message).not.toMatch(/vaga|bônus|bonus|brinde|desconto|condição especial|hoje no final do dia/i);
  });
});

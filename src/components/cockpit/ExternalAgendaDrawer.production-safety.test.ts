import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EXTERNAL_AGENDA_STORAGE_KEY,
  getExternalAgendaConfig,
} from './ExternalAgendaDrawer';

const source = readFileSync(new URL('./ExternalAgendaDrawer.tsx', import.meta.url), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('external agenda production safety', () => {
  it('does not ship browser-generated availability or salon presets', () => {
    expect(source).toContain('Disponibilidade indisponível');
    expect(source).toContain('nenhum horário, profissional, preço ou confirmação é calculado neste navegador');
    expect(source).not.toContain('HAVEN_STAFF_ROSTER');
    expect(source).not.toContain('computeSmartDetectedSlots');
    expect(source).not.toContain('setTimeout');
    expect(source).not.toContain('onInsertSlotToDraft(text)');
  });

  it('keeps stored links link-only and never marks the provider connected', () => {
    const values = new Map<string, string>([
      [`${DEFAULT_EXTERNAL_AGENDA_STORAGE_KEY}_workspace-1`, JSON.stringify({
        enabled: true,
        provider: 'trinks',
        providerLabel: 'Trinks (Haven)',
        url: 'https://agenda.example.test/workspace-1',
      })],
    ]);
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
      },
    });

    const config = getExternalAgendaConfig('workspace-1');

    expect(config.enabled).toBe(false);
    expect(config.providerLabel).toBe('Link externo configurado');
    expect(config.url).toBe('https://agenda.example.test/workspace-1');
    expect(config.autoSyncMinutes).toBeNull();
    expect(config.selectedServiceId).toBe('');
  });
});

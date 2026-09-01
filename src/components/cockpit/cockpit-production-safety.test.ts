import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

describe('cockpit production safety policy', () => {
  it('does not ship fabricated WABA financial or scheduling presets', () => {
    const source = read('./WabaActionsModal.tsx');

    expect(source).not.toContain("useState('50.00')");
    expect(source).not.toContain("useState('49988370054')");
    expect(source).not.toContain('amanhã às 14h');
    expect(source).not.toContain('condição especial para fechamento ainda hoje');
    expect(source).not.toContain('agendamento_express_flow');
    expect(source).toContain('O SOS Sales não sugere valores, chaves ou condições financeiras');
  });

  it('does not inject local demo availability into production macros', () => {
    const source = read('./LiveCockpitView.tsx');

    expect(source).toContain('const externalAgendaSlots = "";');
    expect(source).toContain('.filter((macro) => externalAgendaSlots || !macro.template.includes("{{horarios}}"))');
    expect(source).not.toContain('Temos estacionamento no local');
    expect(source).not.toContain('Quer que eu segure sua vaga antes que preencha?');
  });

  it('keeps the entry SaaS navigation focused without deleting administration', () => {
    const source = read('../layout/AppShell.tsx');

    expect(source).toContain("label: 'Agora'");
    expect(source).toContain("label: 'Conversas'");
    expect(source).toContain("label: 'Funil'");
    expect(source).toContain("label: 'Resultados'");
    expect(source).toContain("label: 'Configurações'");
    expect(source).toContain("title: 'ADMINISTRAÇÃO'");
    expect(source).toContain('const [administrationOpen, setAdministrationOpen]');
  });
});

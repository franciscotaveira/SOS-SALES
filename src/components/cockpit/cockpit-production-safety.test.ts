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
    expect(source).toContain('O SOS Vendas não sugere valores, chaves ou condições financeiras');
  });

  it('does not inject local demo availability into production macros', () => {
    const source = read('./LiveCockpitView.tsx');

    expect(source).toContain('const externalAgendaSlots = "";');
    expect(source).toContain('.filter((macro) => externalAgendaSlots || !macro.template.includes("{{horarios}}"))');
    expect(source).not.toContain('Temos estacionamento no local');
    expect(source).not.toContain('Quer que eu segure sua vaga antes que preencha?');
  });

  it('keeps the Agora first layer focused on real operator actions', () => {
    const source = read('./LiveCockpitView.tsx');

    expect(source).toContain('Assumir');
    expect(source).toContain('Follow-up');
    expect(source).toContain('Concluir');
    expect(source).toContain('Mais');
    expect(source).toContain('onAcceptHandoff(handoff.id)');
    expect(source).toContain('onResolveHandoff(handoff.id)');
    expect(source).toContain('copilotPanelOpen &&');
    expect(source).not.toContain('>Objeções</span>');
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
    expect(source).toContain("{ id: 'traffic_proof', label: 'Resultados dos anúncios' }");
    expect(source).toContain("{ id: 'tracking', label: 'Conectar Meta Ads' }");
    expect(source).toContain("{ id: 'canais', label: 'WhatsApp' }");
    expect(source).toContain("{ id: 'ia', label: 'Atendimento com IA' }");
    expect(source).toContain("{ id: 'sla', label: 'Tempo de resposta' }");
    expect(source).toContain("{ id: 'membros', label: 'Equipe' }");
  });

  it('keeps the focus dossier under the same truth and simplification policy', () => {
    const source = read('./DossierFocusModal.tsx');

    expect(source).not.toContain('Recursos & Áudios Prontos');
    expect(source).not.toContain('Ver agenda');
    expect(source).not.toContain('Campanha Instagram / Meta Ads');
    expect(source).not.toContain('Oferta de Mechas & Tratamento');
    expect(source).not.toContain('Serviço de Beleza');
    expect(source).toContain("journey.primaryServiceOrProduct || acquisition?.offerHook || 'Não informado'");
  });

  it('aligns owner-only AI and tracking controls with backend authorization', () => {
    const shell = read('../layout/AppShell.tsx');

    expect(shell).toContain("label: 'Conectar rastreamento Meta'");
    expect(shell).toContain("roleRequired: 'owner' as OperatorRole");
    expect(shell).toContain('disabled={aiModeLoading || !isOwner}');
  });

  it('does not expose blocked local-only tools in the authenticated cockpit', () => {
    const source = read('./LiveCockpitView.tsx');

    expect(source).not.toContain("label: 'Vagas & Horários Livres'");
    expect(source).not.toContain("label: 'Recursos & Áudios Prontos'");
    expect(source).not.toContain('Menção de anúncio');
    expect(source).toContain('id="customer-filter"');
    expect(source).toContain('id="channel-filter"');
    expect(source).not.toContain("setQueueTab('recurring')");
    expect(source).not.toContain("setQueueTab('new')");
  });

  it('keeps fake financial KPIs and the non-persisted won column out of the live funnel', () => {
    const source = read('../kanban/LiveCommercialKanbanView.tsx');

    expect(source).toContain("base.columns.filter((column) => column.id !== 'GANHO')");
    expect(source).not.toContain('Taxa de Conversão</span>');
    expect(source).not.toContain('Média por Lead</span>');
    expect(source).not.toContain('R$ {col.totalColValue}');
  });
});

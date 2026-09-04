import { describe, expect, it } from 'vitest';
import type { ApiJourney } from '../../services/salesOsGateway';
import { detectKanbanService } from './LiveCommercialKanbanView';

function journey(input: Partial<ApiJourney>): ApiJourney {
  return {
    id: 'journey-1',
    contactId: 'contact-1',
    contactName: null,
    contactPhone: null,
    status: 'OPEN',
    pipelineStage: 'LEAD',
    primaryServiceOrProduct: null,
    startedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...input,
  };
}

describe('Kanban service truth-in-data', () => {
  it('does not infer a service from a customer name', () => {
    const result = detectKanbanService(journey({ contactName: 'Priscila' }), true);
    expect(result.tag).toBe('💬 Oportunidade WhatsApp');
  });

  it('uses the persisted primary service when available', () => {
    const result = detectKanbanService(
      journey({ contactName: 'Priscila', primaryServiceOrProduct: 'Escova modelada' }),
      true,
    );
    expect(result.tag).toBe('💇‍♀️ Escova Modelada');
  });
});

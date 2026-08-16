import { describe, expect, it, vi } from 'vitest';
import { AppointmentGateway } from '../../src/application/ports/appointment-gateway.js';
import { buildApp } from '../../src/interfaces/http/app.js';

const workspaceA = '10000000-0000-4000-8000-000000000001';
const appointmentA = 'a1000000-0000-4000-8000-000000000001';

const sampleAppointment = {
  id: appointmentA,
  workspaceId: workspaceA,
  leadName: 'Dra. Camila Silveira',
  leadPhone: '+5511998877665',
  serviceName: 'Implante Dentário Protocolo',
  serviceValueMinor: 350000,
  scheduledAt: '2026-08-20T14:30:00.000Z',
  durationMinutes: 60,
  status: 'confirmed' as const,
  source: 'bot_ai' as const,
  operatorName: 'Clara Agenda',
  notes: 'Lead confirmou via WhatsApp sem objeções',
  location: 'Unidade Jardins - Sala 02',
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:00:00.000Z',
};

function createMockGateway(overrides: Partial<AppointmentGateway> = {}): AppointmentGateway {
  return {
    list: async () => [sampleAppointment],
    getById: async () => sampleAppointment,
    create: async (_actor, input) => ({
      ...sampleAppointment,
      ...input,
      id: appointmentA,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    update: async (_actor, _ws, _id, input) => ({
      ...sampleAppointment,
      ...input,
      updatedAt: new Date().toISOString(),
    }),
    delete: async () => true,
    ...overrides,
  };
}

function app(appointmentGateway: AppointmentGateway) {
  return buildApp({
    secretProvider: { getWebhookSecret: async () => 'test-secret' },
    wahaAdapter: {
      verifySignature: () => true,
      parseInboundPayload: () => ({ success: true, event: {} as any }),
    },
    ingestionGateway: {
      ingestInboundEvent: async () => ({ status: 'PROCESSED' as const }),
    },
    authenticator: {
      verifyAccessToken: async (token) => {
        if (token !== 'valid.jwt.token') throw new Error('Invalid token');
        return {
          userId: 'usr-123',
          workspaceIds: [workspaceA],
          email: 'op@test.com',
          role: 'operator',
        };
      },
    },
    appointmentGateway,
    rateLimit: false,
  });
}

describe('Appointments API — /api/v1/workspaces/:workspaceId/appointments', () => {
  it('APPT-01: lists appointments with filters', async () => {
    const gateway = createMockGateway();
    const server = app(gateway);

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/appointments?status=confirmed`,
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].leadName).toBe('Dra. Camila Silveira');
  });

  it('APPT-02: creates a new appointment', async () => {
    const gateway = createMockGateway();
    const server = app(gateway);

    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceA}/appointments`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: {
        leadName: 'Roberto Alencar',
        leadPhone: '+5511988776655',
        serviceName: 'Harmonização Facial',
        serviceValueMinor: 180000,
        scheduledAt: '2026-08-22T10:00:00.000Z',
        durationMinutes: 45,
        status: 'confirmed',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.leadName).toBe('Roberto Alencar');
    expect(body.data.serviceValueMinor).toBe(180000);
  });

  it('APPT-03: updates an existing appointment', async () => {
    const gateway = createMockGateway();
    const server = app(gateway);

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspaceA}/appointments/${appointmentA}`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: {
        status: 'completed',
        notes: 'Procedimento finalizado com sucesso',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe('completed');
  });

  it('APPT-04: deletes an appointment', async () => {
    const gateway = createMockGateway();
    const server = app(gateway);

    const response = await server.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspaceA}/appointments/${appointmentA}`,
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(204);
  });
});

import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { agentRoutes } from '../../src/interfaces/http/routes/agent-routes.js';

const workspaceId = '10000000-0000-4000-8000-000000000001';

function buildRouteApp(queryMock?: ReturnType<typeof vi.fn>) {
  const app = Fastify({ logger: false });
  const query = queryMock || vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('workspace_intelligence_bundles')) {
      return Promise.resolve({
        rowCount: 1,
        rows: [{
          bundle: {
            catalog: [{ name: 'Plano Anual Empresa Amiga', price: '12x de R$ 97,00' }],
            directives: ['Priorizar atendimento humanizado'],
          },
        }],
      });
    }
    if (sql.includes('workspace_agent_config')) {
      return Promise.resolve({
        rowCount: 1,
        rows: [{
          agent_name: 'Sofia',
          business_type: 'Software Comercial & CRM',
          city: 'Chapecó, SC',
          working_hours: 'Segunda a Sexta: 08h às 20h',
          behavior_config: { tone: 'comercial_fechador' },
        }],
      });
    }
    if (sql.includes('workspace_operational_settings')) {
      return Promise.resolve({
        rowCount: 1,
        rows: [{
          pix_key: 'contato@iaparavendas.tech',
          business_hours: 'Segunda a Sexta: 08h às 20h',
        }],
      });
    }
    return Promise.resolve({ rowCount: 1, rows: [] });
  });

  app.register(agentRoutes, {
    authenticator: { verifyAccessToken: vi.fn().mockResolvedValue({ userId: '30000000-0000-4000-8000-000000000003' }) },
    workspaceDirectory: { listForActor: vi.fn().mockResolvedValue([{ id: workspaceId, name: 'Workspace', slug: 'workspace', role: 'operator' }]) },
    query,
  });

  return { app, query };
}

describe('Agent Simulator Routes (Meta Business AI Pattern)', () => {
  it('intercepts /regra command and persists it in workspace intelligence directives', async () => {
    const { app, query } = buildRouteApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/agent/simulator/chat`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: { message: '/regra Nunca prometer desconto acima de 50%' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.isCommand).toBe(true);
    expect(body.command).toBe('/regra');
    expect(body.agentResponse).toContain('Nova diretriz comercial assimilada');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('workspace_intelligence_bundles'),
      expect.any(Array),
    );
    await app.close();
  });

  it('intercepts /pix command and updates workspace operational settings', async () => {
    const { app, query } = buildRouteApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/agent/simulator/chat`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: { message: '/pix pix@sosvendas.com.br' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.isCommand).toBe(true);
    expect(body.command).toBe('/pix');
    expect(body.agentResponse).toContain('Chave Pix do negócio atualizada');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public.workspace_operational_settings SET pix_key'),
      [workspaceId, 'pix@sosvendas.com.br'],
    );
    await app.close();
  });

  it('processes lead message, produces cognitive dossier with anti-regression rule and smallestNextMove', async () => {
    const { app } = buildRouteApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/agent/simulator/chat`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: {
        message: 'Olá! Vi o anúncio no Instagram, quanto custa o plano anual?',
        contactName: 'Carlos Silva',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.agentResponse).toBeDefined();
    expect(body.dossier).toBeDefined();
    expect(body.dossier.originType).toBe('META_ADS');
    expect(body.dossier.antiRegressionRule).toBeDefined();
    expect(body.dossier.smallestNextMove).toBeDefined();
    expect(body.dossier.smallestNextMove.actionTitle).toBeDefined();
    await app.close();
  });

  it('calibrates response and stores corrective directive via /calibrate endpoint', async () => {
    const { app, query } = buildRouteApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/agent/simulator/calibrate`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: {
        lastCustomerMessage: 'Vocês dão garantia?',
        lastAgentResponse: 'Temos suporte...',
        correctionInstruction: 'Diga que temos garantia incondicional de 7 dias com devolução 100% via Pix.',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.savedDirective).toContain('garantia incondicional');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('workspace_intelligence_bundles'),
      expect.any(Array),
    );
    await app.close();
  });
});

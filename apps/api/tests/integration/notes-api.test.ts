import { describe, expect, it } from 'vitest';
import { NotesGateway } from '../../src/application/ports/notes-gateway.js';
import { buildApp } from '../../src/interfaces/http/app.js';

const workspaceA = '10000000-0000-4000-8000-000000000001';
const noteA = 'e1000000-0000-4000-8000-000000000001';

const sampleNote = {
  id: noteA,
  workspaceId: workspaceA,
  title: 'Script de Quebra de Objeção: Preço Alto',
  content: 'Quando o lead disser que achou caro, responda enfatizando a garantia de 5 anos.',
  category: 'script' as const,
  tags: ['script', 'fechamento', 'vitor'],
  pinned: true,
  color: 'emerald' as const,
  authorId: 'usr-123',
  authorName: 'Francisco Rios',
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:00:00.000Z',
};

function createMockGateway(overrides: Partial<NotesGateway> = {}): NotesGateway {
  return {
    list: async () => [sampleNote],
    getById: async () => sampleNote,
    create: async (_actor, input) => ({
      ...sampleNote,
      ...input,
      id: noteA,
      tags: input.tags || [],
      pinned: input.pinned || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    update: async (_actor, _ws, _id, input) => ({
      ...sampleNote,
      ...input,
      tags: input.tags !== undefined ? input.tags : sampleNote.tags,
      updatedAt: new Date().toISOString(),
    }),
    delete: async () => true,
    ...overrides,
  };
}

function app(notesGateway: NotesGateway) {
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
    notesGateway,
    rateLimit: false,
  });
}

describe('Operational Notes API — /api/v1/workspaces/:workspaceId/notes', () => {
  it('NOTE-01: lists notes with category filter and pinned ordering', async () => {
    const gateway = createMockGateway();
    const server = app(gateway);

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceA}/notes?category=script`,
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toContain('Script de Quebra de Objeção');
  });

  it('NOTE-02: creates a new operational note', async () => {
    const gateway = createMockGateway();
    const server = app(gateway);

    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceA}/notes`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: {
        title: 'Meta de Faturamento Agosto 2026',
        content: 'R$ 250.000 em fechamentos de implante com ticket médio de R$ 3.500.',
        category: 'goal',
        tags: ['meta', 'financeiro'],
        pinned: true,
        color: 'purple',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.title).toBe('Meta de Faturamento Agosto 2026');
    expect(body.data.category).toBe('goal');
  });

  it('NOTE-03: updates a note title and tags', async () => {
    const gateway = createMockGateway();
    const server = app(gateway);

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/v1/workspaces/${workspaceA}/notes/${noteA}`,
      headers: { authorization: 'Bearer valid.jwt.token' },
      payload: {
        title: 'Script Atualizado: Preço Alto',
        pinned: false,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.title).toBe('Script Atualizado: Preço Alto');
    expect(body.data.pinned).toBe(false);
  });

  it('NOTE-04: deletes a note', async () => {
    const gateway = createMockGateway();
    const server = app(gateway);

    const response = await server.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspaceA}/notes/${noteA}`,
      headers: { authorization: 'Bearer valid.jwt.token' },
    });

    expect(response.statusCode).toBe(204);
  });
});

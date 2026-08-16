import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { NotesGateway } from '../../../application/ports/notes-gateway.js';

export interface NotesRouteDependencies {
  notesGateway?: NotesGateway;
}

const uuid = z.string().uuid();
const workspaceParamsSchema = z.object({ workspaceId: uuid });
const noteParamsSchema = z.object({ workspaceId: uuid, noteId: uuid });

const noteCategorySchema = z.enum(['script', 'meeting', 'lead_vip', 'goal', 'general']);
const noteColorSchema = z.enum(['emerald', 'purple', 'amber', 'blue', 'rose', 'slate']);

const listNotesQuerySchema = z.object({
  category: noteCategorySchema.optional(),
  search: z.string().max(100).optional(),
  pinnedOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(255),
  content: z.string().trim().min(1).max(16384),
  category: noteCategorySchema.optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  pinned: z.boolean().optional(),
  color: noteColorSchema.optional(),
  authorName: z.string().trim().min(1).max(255).optional(),
}).strict();

const updateNoteSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  content: z.string().trim().min(1).max(16384).optional(),
  category: noteCategorySchema.optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  pinned: z.boolean().optional(),
  color: noteColorSchema.optional(),
}).strict();

function actorOrUnauthorized(request: FastifyRequest, reply: FastifyReply) {
  if (!request.operatorActor) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    return null;
  }
  return request.operatorActor;
}

function invalid(reply: FastifyReply): FastifyReply {
  return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid note request payload' });
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Note not found' });
}

function unavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Notes service is unavailable' });
}

export async function notesRoutes(
  app: FastifyInstance,
  dependencies: NotesRouteDependencies,
): Promise<void> {
  // List notes
  app.get('/workspaces/:workspaceId/notes', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = workspaceParamsSchema.safeParse(request.params);
    const query = listNotesQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) return invalid(reply);
    if (!dependencies.notesGateway) return unavailable(reply);

    const notes = await dependencies.notesGateway.list(
      actor,
      params.data.workspaceId,
      query.data,
    );
    return { data: notes };
  });

  // Get single note
  app.get('/workspaces/:workspaceId/notes/:noteId', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = noteParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);
    if (!dependencies.notesGateway) return unavailable(reply);

    const note = await dependencies.notesGateway.getById(
      actor,
      params.data.workspaceId,
      params.data.noteId,
    );
    return note === null ? notFound(reply) : { data: note };
  });

  // Create note
  app.post('/workspaces/:workspaceId/notes', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = workspaceParamsSchema.safeParse(request.params);
    const body = createNoteSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply);
    if (!dependencies.notesGateway) return unavailable(reply);

    const note = await dependencies.notesGateway.create(actor, {
      workspaceId: params.data.workspaceId,
      title: body.data.title,
      content: body.data.content,
      category: body.data.category,
      tags: body.data.tags,
      pinned: body.data.pinned,
      color: body.data.color,
      authorId: actor.userId,
      authorName: body.data.authorName || actor.email || 'Operador',
    });
    reply.code(201);
    return { data: note };
  });

  // Update note
  app.patch('/workspaces/:workspaceId/notes/:noteId', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = noteParamsSchema.safeParse(request.params);
    const body = updateNoteSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply);
    if (!dependencies.notesGateway) return unavailable(reply);

    const note = await dependencies.notesGateway.update(
      actor,
      params.data.workspaceId,
      params.data.noteId,
      body.data,
    );
    return note === null ? notFound(reply) : { data: note };
  });

  // Delete note
  app.delete('/workspaces/:workspaceId/notes/:noteId', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = noteParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);
    if (!dependencies.notesGateway) return unavailable(reply);

    const deleted = await dependencies.notesGateway.delete(
      actor,
      params.data.workspaceId,
      params.data.noteId,
    );
    return deleted ? reply.code(204).send() : notFound(reply);
  });
}

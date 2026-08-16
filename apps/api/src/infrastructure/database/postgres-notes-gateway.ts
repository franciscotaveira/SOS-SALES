import type { Pool, PoolClient } from 'pg';
import { NotesGateway } from '../../application/ports/notes-gateway.js';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import {
  CreateNoteInput,
  NoteFilters,
  OperationalNote,
  UpdateNoteInput,
} from '../../domain/types/notes.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

interface NoteRow {
  id: string;
  workspace_id: string;
  title: string;
  content: string;
  category: OperationalNote['category'];
  tags: string[];
  pinned: boolean;
  color: OperationalNote['color'];
  author_id: string;
  author_name: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRow(row: NoteRow): OperationalNote {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    content: row.content,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [],
    pinned: row.pinned,
    color: row.color ?? undefined,
    authorId: row.author_id,
    authorName: row.author_name,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
  };
}

export class PostgresNotesGateway implements NotesGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async list(
    actor: AuthenticatedActor,
    workspaceId: string,
    filters?: NoteFilters,
  ): Promise<OperationalNote[]> {
    return this.withActor(actor, async (client) => {
      let query = `
        SELECT id, workspace_id, title, content, category, tags, pinned, color,
               author_id, author_name, created_at, updated_at
        FROM public.operational_notes
        WHERE workspace_id = $1
      `;
      const params: unknown[] = [workspaceId];
      let paramIdx = 2;

      if (filters?.category) {
        query += ` AND category = $${paramIdx++}`;
        params.push(filters.category);
      }
      if (filters?.pinnedOnly) {
        query += ` AND pinned = true`;
      }
      if (filters?.search) {
        query += ` AND (title ILIKE $${paramIdx} OR content ILIKE $${paramIdx})`;
        params.push(`%${filters.search}%`);
        paramIdx++;
      }

      query += ` ORDER BY pinned DESC, updated_at DESC LIMIT $${paramIdx}`;
      params.push(filters?.limit ?? 100);

      const result = await client.query<NoteRow>(query, params);
      return result.rows.map(mapRow);
    });
  }

  async getById(
    actor: AuthenticatedActor,
    workspaceId: string,
    noteId: string,
  ): Promise<OperationalNote | null> {
    return this.withActor(actor, async (client) => {
      const result = await client.query<NoteRow>(
        `SELECT id, workspace_id, title, content, category, tags, pinned, color,
                author_id, author_name, created_at, updated_at
         FROM public.operational_notes
         WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, noteId],
      );
      const row = result.rows[0];
      return row ? mapRow(row) : null;
    });
  }

  async create(
    actor: AuthenticatedActor,
    input: CreateNoteInput,
  ): Promise<OperationalNote> {
    return this.withActor(actor, async (client) => {
      const result = await client.query<NoteRow>(
        `INSERT INTO public.operational_notes (
           workspace_id, title, content, category, tags, pinned, color,
           author_id, author_name
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9
         ) RETURNING id, workspace_id, title, content, category, tags, pinned, color,
                     author_id, author_name, created_at, updated_at`,
        [
          input.workspaceId,
          input.title,
          input.content,
          input.category ?? 'general',
          input.tags ?? [],
          input.pinned ?? false,
          input.color ?? 'slate',
          input.authorId,
          input.authorName,
        ],
      );
      return mapRow(result.rows[0]);
    });
  }

  async update(
    actor: AuthenticatedActor,
    workspaceId: string,
    noteId: string,
    input: UpdateNoteInput,
  ): Promise<OperationalNote | null> {
    return this.withActor(actor, async (client) => {
      const setClauses: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [workspaceId, noteId];
      let paramIdx = 3;

      if (input.title !== undefined) {
        setClauses.push(`title = $${paramIdx++}`);
        params.push(input.title);
      }
      if (input.content !== undefined) {
        setClauses.push(`content = $${paramIdx++}`);
        params.push(input.content);
      }
      if (input.category !== undefined) {
        setClauses.push(`category = $${paramIdx++}`);
        params.push(input.category);
      }
      if (input.tags !== undefined) {
        setClauses.push(`tags = $${paramIdx++}`);
        params.push(input.tags);
      }
      if (input.pinned !== undefined) {
        setClauses.push(`pinned = $${paramIdx++}`);
        params.push(input.pinned);
      }
      if (input.color !== undefined) {
        setClauses.push(`color = $${paramIdx++}`);
        params.push(input.color);
      }

      const result = await client.query<NoteRow>(
        `UPDATE public.operational_notes
         SET ${setClauses.join(', ')}
         WHERE workspace_id = $1 AND id = $2
         RETURNING id, workspace_id, title, content, category, tags, pinned, color,
                   author_id, author_name, created_at, updated_at`,
        params,
      );
      const row = result.rows[0];
      return row ? mapRow(row) : null;
    });
  }

  async delete(
    actor: AuthenticatedActor,
    workspaceId: string,
    noteId: string,
  ): Promise<boolean> {
    return this.withActor(actor, async (client) => {
      const result = await client.query(
        'DELETE FROM public.operational_notes WHERE workspace_id = $1 AND id = $2',
        [workspaceId, noteId],
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  private async withActor<T>(actor: AuthenticatedActor, action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Use sos_sales_runtime which has EXECUTE on current_user_workspace_ids()
      // and inherits from authenticated, so auth.uid() works via request.jwt.claim.sub
      await client.query('SET LOCAL ROLE sos_sales_runtime');
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)");
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)", [actor.userId]);
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.query('RESET ROLE').catch(() => undefined);
      client.release();
    }
  }
}

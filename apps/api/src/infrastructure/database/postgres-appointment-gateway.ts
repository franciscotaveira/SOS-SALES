import type { Pool, PoolClient } from 'pg';
import { AppointmentGateway } from '../../application/ports/appointment-gateway.js';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import {
  AppointmentFilters,
  CommercialAppointment,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from '../../domain/types/appointments.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

interface AppointmentRow {
  id: string;
  workspace_id: string;
  journey_id: string | null;
  lead_name: string;
  lead_phone: string;
  service_name: string;
  service_value_minor: string | number;
  scheduled_at: Date | string;
  duration_minutes: number;
  status: CommercialAppointment['status'];
  source: CommercialAppointment['source'];
  operator_name: string | null;
  notes: string | null;
  location: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRow(row: AppointmentRow): CommercialAppointment {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    journeyId: row.journey_id ?? undefined,
    leadName: row.lead_name,
    leadPhone: row.lead_phone,
    serviceName: row.service_name,
    serviceValueMinor: Number(row.service_value_minor),
    scheduledAt: row.scheduled_at instanceof Date ? row.scheduled_at.toISOString() : new Date(row.scheduled_at).toISOString(),
    durationMinutes: Number(row.duration_minutes),
    status: row.status,
    source: row.source,
    operatorName: row.operator_name ?? undefined,
    notes: row.notes ?? undefined,
    location: row.location ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
  };
}

export class PostgresAppointmentGateway implements AppointmentGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async list(
    actor: AuthenticatedActor,
    workspaceId: string,
    filters?: AppointmentFilters,
  ): Promise<CommercialAppointment[]> {
    return this.withActor(actor, async (client) => {
      let query = `
        SELECT id, workspace_id, journey_id, lead_name, lead_phone, service_name,
               service_value_minor, scheduled_at, duration_minutes, status, source,
               operator_name, notes, location, created_at, updated_at
        FROM public.commercial_appointments
        WHERE workspace_id = $1
      `;
      const params: unknown[] = [workspaceId];
      let paramIdx = 2;

      if (filters?.status) {
        query += ` AND status = $${paramIdx++}`;
        params.push(filters.status);
      }
      if (filters?.from) {
        query += ` AND scheduled_at >= $${paramIdx++}::timestamptz`;
        params.push(filters.from);
      }
      if (filters?.to) {
        query += ` AND scheduled_at <= $${paramIdx++}::timestamptz`;
        params.push(filters.to);
      }
      if (filters?.search) {
        query += ` AND (lead_name ILIKE $${paramIdx} OR lead_phone ILIKE $${paramIdx} OR service_name ILIKE $${paramIdx})`;
        params.push(`%${filters.search}%`);
        paramIdx++;
      }

      query += ` ORDER BY scheduled_at ASC LIMIT $${paramIdx}`;
      params.push(filters?.limit ?? 100);

      const result = await client.query<AppointmentRow>(query, params);
      return result.rows.map(mapRow);
    });
  }

  async getById(
    actor: AuthenticatedActor,
    workspaceId: string,
    appointmentId: string,
  ): Promise<CommercialAppointment | null> {
    return this.withActor(actor, async (client) => {
      const result = await client.query<AppointmentRow>(
        `SELECT id, workspace_id, journey_id, lead_name, lead_phone, service_name,
                service_value_minor, scheduled_at, duration_minutes, status, source,
                operator_name, notes, location, created_at, updated_at
         FROM public.commercial_appointments
         WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, appointmentId],
      );
      const row = result.rows[0];
      return row ? mapRow(row) : null;
    });
  }

  async create(
    actor: AuthenticatedActor,
    input: CreateAppointmentInput,
  ): Promise<CommercialAppointment> {
    return this.withActor(actor, async (client) => {
      const result = await client.query<AppointmentRow>(
        `INSERT INTO public.commercial_appointments (
           workspace_id, journey_id, lead_name, lead_phone, service_name,
           service_value_minor, scheduled_at, duration_minutes, status, source,
           operator_name, notes, location
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
         ) RETURNING id, workspace_id, journey_id, lead_name, lead_phone, service_name,
                     service_value_minor, scheduled_at, duration_minutes, status, source,
                     operator_name, notes, location, created_at, updated_at`,
        [
          input.workspaceId,
          input.journeyId || null,
          input.leadName,
          input.leadPhone,
          input.serviceName,
          input.serviceValueMinor,
          input.scheduledAt,
          input.durationMinutes ?? 60,
          input.status ?? 'confirmed',
          input.source ?? 'operator',
          input.operatorName || null,
          input.notes || null,
          input.location || null,
        ],
      );
      return mapRow(result.rows[0]);
    });
  }

  async update(
    actor: AuthenticatedActor,
    workspaceId: string,
    appointmentId: string,
    input: UpdateAppointmentInput,
  ): Promise<CommercialAppointment | null> {
    return this.withActor(actor, async (client) => {
      const setClauses: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [workspaceId, appointmentId];
      let paramIdx = 3;

      if (input.leadName !== undefined) {
        setClauses.push(`lead_name = $${paramIdx++}`);
        params.push(input.leadName);
      }
      if (input.leadPhone !== undefined) {
        setClauses.push(`lead_phone = $${paramIdx++}`);
        params.push(input.leadPhone);
      }
      if (input.serviceName !== undefined) {
        setClauses.push(`service_name = $${paramIdx++}`);
        params.push(input.serviceName);
      }
      if (input.serviceValueMinor !== undefined) {
        setClauses.push(`service_value_minor = $${paramIdx++}`);
        params.push(input.serviceValueMinor);
      }
      if (input.scheduledAt !== undefined) {
        setClauses.push(`scheduled_at = $${paramIdx++}`);
        params.push(input.scheduledAt);
      }
      if (input.durationMinutes !== undefined) {
        setClauses.push(`duration_minutes = $${paramIdx++}`);
        params.push(input.durationMinutes);
      }
      if (input.status !== undefined) {
        setClauses.push(`status = $${paramIdx++}`);
        params.push(input.status);
      }
      if (input.operatorName !== undefined) {
        setClauses.push(`operator_name = $${paramIdx++}`);
        params.push(input.operatorName);
      }
      if (input.notes !== undefined) {
        setClauses.push(`notes = $${paramIdx++}`);
        params.push(input.notes);
      }
      if (input.location !== undefined) {
        setClauses.push(`location = $${paramIdx++}`);
        params.push(input.location);
      }

      const result = await client.query<AppointmentRow>(
        `UPDATE public.commercial_appointments
         SET ${setClauses.join(', ')}
         WHERE workspace_id = $1 AND id = $2
         RETURNING id, workspace_id, journey_id, lead_name, lead_phone, service_name,
                   service_value_minor, scheduled_at, duration_minutes, status, source,
                   operator_name, notes, location, created_at, updated_at`,
        params,
      );
      const row = result.rows[0];
      return row ? mapRow(row) : null;
    });
  }

  async delete(
    actor: AuthenticatedActor,
    workspaceId: string,
    appointmentId: string,
  ): Promise<boolean> {
    return this.withActor(actor, async (client) => {
      const result = await client.query(
        'DELETE FROM public.commercial_appointments WHERE workspace_id = $1 AND id = $2',
        [workspaceId, appointmentId],
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

import type { Pool, PoolClient } from 'pg';
import {
  CustomerLoyaltyType,
  UpdatedContact,
  UpdateWorkspaceOperationalSettingsInput,
  WorkspaceOperationalGateway,
  WorkspaceOperationalSettings,
} from '../../application/ports/workspace-operational-gateway.js';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

interface SettingsRow {
  workspace_id: string;
  commercial_config: Record<string, unknown> | string | null;
  loyalty_overrides: Record<string, unknown> | string | null;
  daily_target_revenue_minor: string | number | null;
  updated_at: Date | string | null;
}

function parseObject(value: Record<string, unknown> | string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseLoyalty(value: Record<string, unknown> | string | null | undefined): Record<string, CustomerLoyaltyType> {
  const parsed = parseObject(value);
  const result: Record<string, CustomerLoyaltyType> = {};
  for (const [key, item] of Object.entries(parsed)) {
    if (item === 'NEW' || item === 'RECURRING') result[key] = item;
  }
  return result;
}

function mapRow(row: SettingsRow | undefined, workspaceId: string): WorkspaceOperationalSettings {
  return {
    workspaceId,
    commercialConfig: parseObject(row?.commercial_config),
    loyaltyOverrides: parseLoyalty(row?.loyalty_overrides),
    dailyTargetRevenueMinor: Math.max(0, Number(row?.daily_target_revenue_minor ?? 0)),
    updatedAt: row?.updated_at
      ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString())
      : null,
  };
}

/** Executes workspace settings and contact updates under the verified actor. */
export class PostgresWorkspaceOperationalGateway implements WorkspaceOperationalGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async getSettings(
    actor: AuthenticatedActor,
    workspaceId: string,
  ): Promise<WorkspaceOperationalSettings> {
    return this.withActor(actor, async (client) => {
      const result = await client.query<SettingsRow>(
        `SELECT workspace_id, commercial_config, loyalty_overrides,
                daily_target_revenue_minor, updated_at
           FROM public.workspace_operational_settings
          WHERE workspace_id = $1`,
        [workspaceId],
      );
      return mapRow(result.rows[0], workspaceId);
    });
  }

  async updateSettings(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: UpdateWorkspaceOperationalSettingsInput,
  ): Promise<WorkspaceOperationalSettings> {
    return this.withActor(actor, async (client) => {
      const existing = await client.query<SettingsRow>(
        `SELECT workspace_id, commercial_config, loyalty_overrides,
                daily_target_revenue_minor, updated_at
           FROM public.workspace_operational_settings
          WHERE workspace_id = $1`,
        [workspaceId],
      );
      const current = mapRow(existing.rows[0], workspaceId);
      const commercialConfig = input.commercialConfig ?? current.commercialConfig;
      const loyaltyOverrides = input.loyaltyOverrides ?? current.loyaltyOverrides;
      const dailyTargetRevenueMinor = input.dailyTargetRevenueMinor ?? current.dailyTargetRevenueMinor;

      const result = await client.query<SettingsRow>(
        `INSERT INTO public.workspace_operational_settings (
           workspace_id, commercial_config, loyalty_overrides,
           daily_target_revenue_minor, updated_at
         ) VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())
         ON CONFLICT (workspace_id) DO UPDATE SET
           commercial_config = EXCLUDED.commercial_config,
           loyalty_overrides = EXCLUDED.loyalty_overrides,
           daily_target_revenue_minor = EXCLUDED.daily_target_revenue_minor,
           updated_at = NOW()
         RETURNING workspace_id, commercial_config, loyalty_overrides,
                   daily_target_revenue_minor, updated_at`,
        [
          workspaceId,
          JSON.stringify(commercialConfig),
          JSON.stringify(loyaltyOverrides),
          dailyTargetRevenueMinor,
        ],
      );
      return mapRow(result.rows[0], workspaceId);
    });
  }

  async updateContactName(
    actor: AuthenticatedActor,
    workspaceId: string,
    contactId: string,
    name: string,
  ): Promise<UpdatedContact | null> {
    return this.withActor(actor, async (client) => {
      const result = await client.query<{ id: string; name: string | null }>(
        `UPDATE public.contacts
            SET name = NULLIF($1, ''), updated_at = NOW()
          WHERE workspace_id = $2 AND id = $3
        RETURNING id, name`,
        [name.trim(), workspaceId, contactId],
      );
      const row = result.rows[0];
      return row ? { contactId: row.id, name: row.name } : null;
    });
  }

  private async withActor<T>(
    actor: AuthenticatedActor,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
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

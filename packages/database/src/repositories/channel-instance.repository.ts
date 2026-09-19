import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getDatabasePool, withTenantTransaction } from "../client";
import type { ChannelProvider } from "../messaging";
import { logger } from "@sos-sales/observability";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_HASH_REGEX = /^[0-9a-f]{64}$/;

export class ChannelInstanceNotFoundError extends Error {
  readonly code = "CHANNEL_INSTANCE_NOT_FOUND" as const;
  constructor(channelInstanceId: string, workspaceId: string) {
    super(`Channel instance '${channelInstanceId}' not found for workspace '${workspaceId}'`);
    this.name = "ChannelInstanceNotFoundError";
  }
}

export class ChannelInstanceCrossTenantError extends Error {
  readonly code = "CHANNEL_INSTANCE_CROSS_TENANT_ACCESS" as const;
  constructor(channelInstanceId: string, requestedWorkspaceId: string) {
    super(
      `Cross-tenant access violation: Channel instance '${channelInstanceId}' does not belong to workspace '${requestedWorkspaceId}'`
    );
    this.name = "ChannelInstanceCrossTenantError";
  }
}

export class InvalidEndpointTokenError extends Error {
  readonly code = "INVALID_ENDPOINT_TOKEN" as const;
  constructor(message = "Invalid endpoint token format or hash") {
    super(message);
    this.name = "InvalidEndpointTokenError";
  }
}

export interface ChannelInstanceRecord {
  id: string;
  workspace_id: string;
  provider: ChannelProvider;
  display_name: string;
  phone_number_e164: string | null;
  endpoint_token_hash: string;
  previous_token_hash: string | null;
  previous_token_valid_until: Date | null;
  verify_token_hash: string | null;
  credential_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateChannelInstanceParams {
  workspaceId: string;
  provider: ChannelProvider;
  displayName: string;
  phoneNumberE164?: string | null;
  endpointToken?: string;
  endpointTokenHash?: string;
  verifyToken?: string | null;
  verifyTokenHash?: string | null;
  credentialId?: string | null;
  isActive?: boolean;
}

/**
 * Tenant-First ChannelInstanceRepository for SOS Sales V3.
 *
 * Guarantees:
 * 1. Multi-tenant RLS isolation (app.current_workspace_id enforcement).
 * 2. Explicit instance resolution (no arbitrary "first active" selection).
 * 3. Multi-line support (multiple active instances per provider in same workspace).
 * 4. Zero sensitive data (tokens/credentials) logged.
 */
export class ChannelInstanceRepository {
  constructor(
    private readonly pool: Pool = getDatabasePool(),
    private readonly ingressPool?: Pool,
    private readonly adminPool?: Pool
  ) {}

  /**
   * Resolves an explicit channel instance strictly within the tenant boundary.
   * Returns null if not found or if the instance belongs to another tenant.
   */
  async findById(
    workspaceId: string,
    channelInstanceId: string,
    client?: PoolClient
  ): Promise<ChannelInstanceRecord | null> {
    this.validateUuid(workspaceId, "workspaceId");
    this.validateUuid(channelInstanceId, "channelInstanceId");

    const queryFn = async (c: PoolClient): Promise<ChannelInstanceRecord | null> => {
      const res = await c.query<ChannelInstanceRecord>(
        `SELECT id, workspace_id, provider, display_name, phone_number_e164,
                endpoint_token_hash, previous_token_hash, previous_token_valid_until,
                verify_token_hash, credential_id, is_active, created_at, updated_at
         FROM public.channel_instances
         WHERE workspace_id = $1 AND id = $2;`,
        [workspaceId, channelInstanceId]
      );
      return res.rows[0] ?? null;
    };

    if (client) {
      return queryFn(client);
    }
    return withTenantTransaction(workspaceId, queryFn, this.pool);
  }

  /**
   * Resolves an explicit channel instance or throws a typed error.
   * Distinguishes between not found and cross-tenant access violations.
   */
  async getById(
    workspaceId: string,
    channelInstanceId: string,
    client?: PoolClient
  ): Promise<ChannelInstanceRecord> {
    const record = await this.findById(workspaceId, channelInstanceId, client);
    if (record) {
      return record;
    }

    // Check cross-tenant existence if an admin pool is available
    if (this.adminPool) {
      const globalRes = await this.adminPool.query<{ id: string; workspace_id: string }>(
        `SELECT id, workspace_id FROM public.channel_instances WHERE id = $1;`,
        [channelInstanceId]
      );

      const firstRow = globalRes.rows[0];
      if (firstRow && firstRow.workspace_id !== workspaceId) {
        logger.warn(
          { channelInstanceId, requestedWorkspaceId: workspaceId },
          "Cross-tenant channel access rejected"
        );
        throw new ChannelInstanceCrossTenantError(channelInstanceId, workspaceId);
      }
    }

    throw new ChannelInstanceNotFoundError(channelInstanceId, workspaceId);
  }

  /**
   * Asserts that an instance record belongs to the requested workspace.
   * Throws ChannelInstanceCrossTenantError if mismatched.
   */
  assertTenantOwnership(
    workspaceId: string,
    instance: { id: string; workspace_id: string }
  ): void {
    if (instance.workspace_id !== workspaceId) {
      throw new ChannelInstanceCrossTenantError(instance.id, workspaceId);
    }
  }

  /**
   * Lists all active instances for a given provider within a workspace.
   * Supports multi-line configurations (e.g. multiple WAHA or WABA lines in one workspace).
   */
  async listActiveByWorkspaceAndProvider(
    workspaceId: string,
    provider: ChannelProvider,
    client?: PoolClient
  ): Promise<ChannelInstanceRecord[]> {
    this.validateUuid(workspaceId, "workspaceId");

    const queryFn = async (c: PoolClient): Promise<ChannelInstanceRecord[]> => {
      const res = await c.query<ChannelInstanceRecord>(
        `SELECT id, workspace_id, provider, display_name, phone_number_e164,
                endpoint_token_hash, previous_token_hash, previous_token_valid_until,
                verify_token_hash, credential_id, is_active, created_at, updated_at
         FROM public.channel_instances
         WHERE workspace_id = $1 AND provider = $2 AND is_active = true
         ORDER BY created_at ASC;`,
        [workspaceId, provider]
      );
      return res.rows;
    };

    if (client) {
      return queryFn(client);
    }
    return withTenantTransaction(workspaceId, queryFn, this.pool);
  }

  /**
   * Resolves a channel instance by its secret endpoint token (used by webhook ingress).
   * Computes SHA-256 hash internally and checks active and grace-period tokens.
   */
  async findByEndpointToken(
    endpointToken: string,
    client?: PoolClient
  ): Promise<ChannelInstanceRecord | null> {
    if (!endpointToken || typeof endpointToken !== "string" || endpointToken.trim().length === 0) {
      throw new InvalidEndpointTokenError("Endpoint token cannot be empty");
    }

    const tokenHash = crypto.createHash("sha256").update(endpointToken.trim()).digest("hex");

    const lookupPool = client || this.ingressPool || this.adminPool || this.pool;

    try {
      const res = await lookupPool.query<{
        channel_instance_id: string;
        workspace_id: string;
        provider: ChannelProvider;
        is_active: boolean;
      }>("SELECT * FROM public.lookup_channel_ingress($1);", [tokenHash]);

      const row = res.rows[0];
      if (!row) {
        return null;
      }

      // Query full record under tenant transaction
      return await withTenantTransaction(
        row.workspace_id,
        async (tenantClient) => {
          const full = await tenantClient.query<ChannelInstanceRecord>(
            `SELECT id, workspace_id, provider, display_name, phone_number_e164,
                    endpoint_token_hash, previous_token_hash, previous_token_valid_until,
                    verify_token_hash, credential_id, is_active, created_at, updated_at
             FROM public.channel_instances
             WHERE workspace_id = $1 AND id = $2;`,
            [row.workspace_id, row.channel_instance_id]
          );
          return full.rows[0] ?? null;
        },
        this.adminPool || this.pool
      );
    } catch {
      // Fallback to direct query if client has permission
      const direct = await lookupPool.query<ChannelInstanceRecord>(
        `SELECT id, workspace_id, provider, display_name, phone_number_e164,
                endpoint_token_hash, previous_token_hash, previous_token_valid_until,
                verify_token_hash, credential_id, is_active, created_at, updated_at
         FROM public.channel_instances
         WHERE is_active = true
           AND (
             endpoint_token_hash = $1
             OR (previous_token_hash = $1 AND previous_token_valid_until > clock_timestamp())
           )
         LIMIT 1;`,
        [tokenHash]
      );
      return direct.rows[0] ?? null;
    }
  }

  /**
   * Creates a new channel instance under tenant isolation.
   */
  async create(
    params: CreateChannelInstanceParams,
    client?: PoolClient
  ): Promise<ChannelInstanceRecord> {
    this.validateUuid(params.workspaceId, "workspaceId");

    let tokenHash = params.endpointTokenHash;
    if (params.endpointToken) {
      tokenHash = crypto.createHash("sha256").update(params.endpointToken.trim()).digest("hex");
    } else if (!tokenHash) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    }

    if (!TOKEN_HASH_REGEX.test(tokenHash)) {
      throw new InvalidEndpointTokenError("Endpoint token hash must be 64 lowercase hexadecimal characters");
    }

    let verifyHash: string | null = params.verifyTokenHash ?? null;
    if (params.verifyToken) {
      verifyHash = crypto.createHash("sha256").update(params.verifyToken.trim()).digest("hex");
    }

    const isActive = params.isActive !== undefined ? params.isActive : true;

    const queryFn = async (c: PoolClient): Promise<ChannelInstanceRecord> => {
      const res = await c.query<ChannelInstanceRecord>(
        `INSERT INTO public.channel_instances (
           workspace_id, provider, display_name, phone_number_e164,
           endpoint_token_hash, verify_token_hash, credential_id, is_active
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8
         )
         RETURNING id, workspace_id, provider, display_name, phone_number_e164,
                   endpoint_token_hash, previous_token_hash, previous_token_valid_until,
                   verify_token_hash, credential_id, is_active, created_at, updated_at;`,
        [
          params.workspaceId,
          params.provider,
          params.displayName,
          params.phoneNumberE164 ?? null,
          tokenHash,
          verifyHash,
          params.credentialId ?? null,
          isActive,
        ]
      );
      return res.rows[0]!;
    };

    if (client) {
      return queryFn(client);
    }
    return withTenantTransaction(params.workspaceId, queryFn, this.pool);
  }

  /**
   * Updates active state for a specific channel instance within a workspace.
   * Never affects other instances in the workspace or provider.
   */
  async updateStatus(
    workspaceId: string,
    channelInstanceId: string,
    isActive: boolean,
    client?: PoolClient
  ): Promise<ChannelInstanceRecord> {
    this.validateUuid(workspaceId, "workspaceId");
    this.validateUuid(channelInstanceId, "channelInstanceId");

    const queryFn = async (c: PoolClient): Promise<ChannelInstanceRecord> => {
      const res = await c.query<ChannelInstanceRecord>(
        `UPDATE public.channel_instances
         SET is_active = $3, updated_at = now()
         WHERE workspace_id = $1 AND id = $2
         RETURNING id, workspace_id, provider, display_name, phone_number_e164,
                   endpoint_token_hash, previous_token_hash, previous_token_valid_until,
                   verify_token_hash, credential_id, is_active, created_at, updated_at;`,
        [workspaceId, channelInstanceId, isActive]
      );

      if (res.rows.length === 0) {
        throw new ChannelInstanceNotFoundError(channelInstanceId, workspaceId);
      }
      return res.rows[0]!;
    };

    if (client) {
      return queryFn(client);
    }
    return withTenantTransaction(workspaceId, queryFn, this.pool);
  }

  private validateUuid(value: string, fieldName: string): void {
    if (!value || typeof value !== "string" || !UUID_REGEX.test(value.trim())) {
      throw new Error(`INVALID_UUID: ${fieldName} must be a valid UUID`);
    }
  }
}

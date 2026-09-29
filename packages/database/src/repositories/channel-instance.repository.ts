import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getDatabasePool, withTenantTransaction } from "../client";
import type { ChannelProvider } from "../messaging";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

export class MissingIngressPoolError extends Error {
  readonly code = "MISSING_INGRESS_POOL" as const;
  constructor(
    message = "Operation findByEndpointToken requires an ingressPool configured on ChannelInstanceRepository or passed explicitly as a client"
  ) {
    super(message);
    this.name = "MissingIngressPoolError";
  }
}

export class ChannelIngressLookupError extends Error {
  readonly code = "CHANNEL_INGRESS_LOOKUP_ERROR" as const;
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ChannelIngressLookupError";
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
 * 1. Multi-tenant RLS isolation (app.current_workspace_id enforcement via appPool).
 * 2. Explicit instance resolution (no arbitrary "first active" selection).
 * 3. Multi-line support (multiple active instances per provider in same workspace).
 * 4. Zero sensitive data (tokens/credentials) logged or exposed.
 * 5. Fail-closed ingress resolution using strictly lookup_channel_ingress without fail-open fallback.
 * 6. Blind enumeration protection (cross-tenant and not-found return identical ChannelInstanceNotFoundError).
 */
export class ChannelInstanceRepository {
  constructor(
    private readonly pool: Pool = getDatabasePool(),
    private readonly ingressPool?: Pool
  ) {}

  /**
   * Resolves an explicit channel instance strictly within the tenant boundary.
   * Returns null if not found or if the instance belongs to another tenant (RLS fail-closed).
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
   * Resolves an explicit channel instance or throws ChannelInstanceNotFoundError.
   * By security design, does not distinguish between non-existent UUIDs and other tenants' UUIDs,
   * completely preventing external enumeration of cross-tenant resource existence.
   */
  async getById(
    workspaceId: string,
    channelInstanceId: string,
    client?: PoolClient
  ): Promise<ChannelInstanceRecord> {
    const record = await this.findById(workspaceId, channelInstanceId, client);
    if (!record) {
      throw new ChannelInstanceNotFoundError(channelInstanceId, workspaceId);
    }
    return record;
  }

  /**
   * Asserts that an already-loaded instance record belongs to the requested workspace.
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
   *
   * Security & Architecture Rules:
   * 1. Requires an explicit ingressPool (or client) authorized to execute lookup_channel_ingress.
   * 2. Computes SHA-256 hash internally.
   * 3. Executes ONLY public.lookup_channel_ingress($1) under least-privilege ingress role.
   * 4. Connection, permission, or SQL errors are propagated as ChannelIngressLookupError (never swallowed).
   * 5. Legitimate absence of matching token returns null.
   * 6. Once workspace_id and instance_id are resolved, loads full record using appPool under withTenantTransaction.
   * 7. ZERO direct queries to channel_instances with LIMIT 1.
   * 8. ZERO fail-open fallbacks.
   */
  async findByEndpointToken(
    endpointToken: string,
    client?: PoolClient
  ): Promise<ChannelInstanceRecord | null> {
    if (!endpointToken || typeof endpointToken !== "string" || endpointToken.trim().length === 0) {
      throw new InvalidEndpointTokenError("Endpoint token cannot be empty");
    }

    const lookupPool = client || this.ingressPool;
    if (!lookupPool) {
      throw new MissingIngressPoolError();
    }

    const tokenHash = crypto.createHash("sha256").update(endpointToken.trim()).digest("hex");

    let rows: Array<{
      channel_instance_id: string;
      workspace_id: string;
      provider: ChannelProvider;
      is_active: boolean;
    }>;

    try {
      const res = await lookupPool.query<{
        channel_instance_id: string;
        workspace_id: string;
        provider: ChannelProvider;
        is_active: boolean;
      }>("SELECT * FROM public.lookup_channel_ingress($1);", [tokenHash]);
      rows = res.rows;
    } catch (err: unknown) {
      throw new ChannelIngressLookupError(
        `Ingress lookup failed: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }

    const ingressTuple = rows[0];
    if (!ingressTuple) {
      return null;
    }

    // Tenant-first load using appPool under withTenantTransaction
    return await withTenantTransaction(
      ingressTuple.workspace_id,
      async (tenantClient) => {
        const full = await tenantClient.query<ChannelInstanceRecord>(
          `SELECT id, workspace_id, provider, display_name, phone_number_e164,
                  endpoint_token_hash, previous_token_hash, previous_token_valid_until,
                  verify_token_hash, credential_id, is_active, created_at, updated_at
           FROM public.channel_instances
           WHERE workspace_id = $1 AND id = $2;`,
          [ingressTuple.workspace_id, ingressTuple.channel_instance_id]
        );
        return full.rows[0] ?? null;
      },
      this.pool
    );
  }

  /**
   * Creates a new channel instance under tenant isolation.
   * Requires explicit endpointToken OR endpointTokenHash (never generates and discards secret tokens).
   */
  async create(
    params: CreateChannelInstanceParams,
    client?: PoolClient
  ): Promise<ChannelInstanceRecord> {
    this.validateUuid(params.workspaceId, "workspaceId");

    // Enforce explicit, non-ambiguous token parameters
    if (params.endpointToken !== undefined && params.endpointTokenHash !== undefined) {
      throw new InvalidEndpointTokenError(
        "Ambiguous token parameters: provide either endpointToken or endpointTokenHash, not both"
      );
    }

    if (!params.endpointToken && !params.endpointTokenHash) {
      throw new InvalidEndpointTokenError(
        "Missing token: either endpointToken or endpointTokenHash must be provided"
      );
    }

    let tokenHash: string;
    if (params.endpointToken !== undefined) {
      if (typeof params.endpointToken !== "string" || params.endpointToken.trim().length === 0) {
        throw new InvalidEndpointTokenError("Endpoint token cannot be empty");
      }
      tokenHash = crypto.createHash("sha256").update(params.endpointToken.trim()).digest("hex");
    } else {
      if (typeof params.endpointTokenHash !== "string" || !TOKEN_HASH_REGEX.test(params.endpointTokenHash)) {
        throw new InvalidEndpointTokenError(
          "Endpoint token hash must be exactly 64 lowercase hexadecimal characters"
        );
      }
      tokenHash = params.endpointTokenHash;
    }

    // Verify token validation
    let verifyHash: string | null = null;
    if (params.verifyToken !== undefined && params.verifyTokenHash !== undefined) {
      throw new Error(
        "Ambiguous verify token parameters: provide either verifyToken or verifyTokenHash, not both"
      );
    }
    if (params.verifyToken !== undefined) {
      if (typeof params.verifyToken !== "string" || params.verifyToken.trim().length === 0) {
        throw new Error("Verify token cannot be empty when specified");
      }
      verifyHash = crypto.createHash("sha256").update(params.verifyToken.trim()).digest("hex");
    } else if (params.verifyTokenHash !== undefined && params.verifyTokenHash !== null) {
      if (!TOKEN_HASH_REGEX.test(params.verifyTokenHash)) {
        throw new Error("Verify token hash must be exactly 64 lowercase hexadecimal characters");
      }
      verifyHash = params.verifyTokenHash;
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

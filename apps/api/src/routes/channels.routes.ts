import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import {
  withTenantTransaction,
  encryptPayload,
  decryptPayload,
  parseKeyringFromEnv,
  recordSecurityAuditEvent,
} from "@sos-sales/database";
import {
  validateWahaBaseUrl,
  validateEvolutionBaseUrl,
  safeFetchWithSsrfGuard,
} from "@sos-sales/application";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const channelParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  channelId: z.string().uuid(),
});

const channelStatusSchema = z.enum([
  "unconfigured",
  "validating",
  "pairing",
  "connected",
  "error",
  "revoked",
]);

const channelCredentialsSchema = z.object({
  accessToken: z.string().optional(),
  phoneNumberId: z.string().optional(),
  wabaAccountId: z.string().optional(),
  appSecret: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

const createChannelBodySchema = z.object({
  provider: z.enum(["meta_waba", "waha", "evolution", "meta_messenger", "meta_instagram"]),
  displayName: z.string().min(2).max(100),
  phoneNumberE164: z
    .string()
    .regex(/^\+[1-9][0-9]{6,14}$/, "Must be a valid E.164 phone number")
    .optional(),
  endpointToken: z.string().min(16).optional(),
  credentials: channelCredentialsSchema.optional(),
  status: channelStatusSchema.optional(),
});

const updateChannelStatusBodySchema = z.object({
  status: channelStatusSchema,
});

const testConnectionBodySchema = z.object({
  provider: z.enum(["meta_waba", "waha", "evolution"]),
  credentials: channelCredentialsSchema,
});

export const channelsRoutes: FastifyPluginAsync = async (app) => {
  // 1. List Channels for Workspace
  app.get(
    "/v1/workspaces/:workspaceId/channels",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;

      const channels = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          workspace_id: string;
          provider: string;
          display_name: string;
          phone_number_e164: string | null;
          status: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }>(
          `SELECT id, workspace_id, provider, display_name, phone_number_e164, status, is_active, created_at, updated_at
           FROM public.channel_instances
           WHERE workspace_id = $1
           ORDER BY created_at ASC;`,
          [workspaceId]
        );
        return res.rows;
      });

      return reply.status(200).send({
        channels: channels.map((c) => ({
          id: c.id,
          workspaceId: c.workspace_id,
          provider: c.provider,
          displayName: c.display_name,
          phoneNumberE164: c.phone_number_e164,
          isActive: c.is_active,
          status: c.status,
          environment: c.provider === "meta_waba" ? "production_certified" : "lab_local",
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        })),
        total: channels.length,
      });
    }
  );

  // 2. Test Connection with WhatsApp Provider before saving (Truth in Data: real I/O and SSRF validation)
  app.post(
    "/v1/workspaces/:workspaceId/channels/test-connection",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = testConnectionBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { provider, credentials } = parsedBody.data;

      if (provider === "meta_waba") {
        if (!credentials.phoneNumberId || !credentials.accessToken) {
          return reply.status(400).send({
            success: false,
            error: "Phone Number ID e Access Token são obrigatórios para validar a Meta Cloud API.",
          });
        }

        try {
          const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(
            credentials.phoneNumberId
          )}?fields=verified_name,code_verification_status,display_phone_number,quality_rating`;
          const resp = await safeFetchWithSsrfGuard(
            url,
            {
              headers: {
                Authorization: `Bearer ${credentials.accessToken}`,
              },
            },
            {
              timeoutMs: 8000,
              allowedProtocols: ["https:"],
            }
          );

          const data = (await resp.json()) as {
            verified_name?: string;
            display_phone_number?: string;
            quality_rating?: string;
            code_verification_status?: string;
            error?: { message?: string };
          };

          if (!resp.ok) {
            return reply.status(200).send({
              success: false,
              error: data.error?.message || `Erro de validação Meta Graph API (HTTP ${resp.status})`,
            });
          }

          return reply.status(200).send({
            success: true,
            verifiedName: data.verified_name || "Linha Comercial Meta Validada",
            displayPhoneNumber: data.display_phone_number,
            qualityRating: data.quality_rating || "GREEN",
            codeVerificationStatus: data.code_verification_status,
          });
        } catch (err: unknown) {
          const isSsrf = err instanceof Error && (err.message.includes("SSRF") || err.message.includes("BLOCKED"));
          if (isSsrf) {
            return reply.status(400).send({
              success: false,
              error: `SSRF_VIOLATION: ${(err as Error).message}`,
            });
          }
          return reply.status(200).send({
            success: false,
            error:
              err instanceof Error
                ? err.message
                : "Tempo limite ou erro de rede ao conectar com a Meta Graph API.",
          });
        }
      }

      if (provider === "waha") {
        if (!credentials.baseUrl) {
          return reply.status(400).send({
            success: false,
            error: "URL Base da Instância é obrigatória para validar WAHA.",
          });
        }

        let targetBaseUrl: string;
        try {
          targetBaseUrl = validateWahaBaseUrl(
            credentials.baseUrl,
            process.env.NODE_ENV !== "production"
          );
        } catch (ssrfErr) {
          return reply.status(400).send({
            success: false,
            error:
              ssrfErr instanceof Error
                ? ssrfErr.message
                : "Validação SSRF falhou para a URL fornecida.",
          });
        }

        const allowLocal =
          process.env.NODE_ENV !== "production" ||
          process.env.ENABLE_LAB_SYNTHETIC === "true" ||
          process.env.ALLOW_LOCAL_NETWORK_CHANNELS === "true";

        try {
          const resp = await safeFetchWithSsrfGuard(
            `${targetBaseUrl}/api/server/version`,
            {
              headers: credentials.apiKey ? { "X-Api-Key": credentials.apiKey } : {},
            },
            {
              timeoutMs: 8000,
              allowLocalTest: allowLocal,
              allowedProtocols: ["http:", "https:"],
            }
          );

          if (!resp.ok) {
            return reply.status(200).send({
              success: false,
              error: `Falha na conexão com WAHA (HTTP ${resp.status})`,
            });
          }

          return reply.status(200).send({
            success: true,
            verifiedName: "WAHA Service Ativo",
            qualityRating: "GREEN",
          });
        } catch (err: unknown) {
          const isSsrf = err instanceof Error && (err.message.includes("SSRF") || err.message.includes("BLOCKED"));
          if (isSsrf) {
            return reply.status(400).send({
              success: false,
              error: `SSRF_VIOLATION: ${(err as Error).message}`,
            });
          }
          return reply.status(200).send({
            success: false,
            error:
              err instanceof Error
                ? err.message
                : "Tempo limite ou erro de rede ao conectar com o serviço WAHA.",
          });
        }
      }

      if (provider === "evolution") {
        if (!credentials.baseUrl) {
          return reply.status(400).send({
            success: false,
            error: "URL Base da Instância é obrigatória para validar Evolution API.",
          });
        }

        let targetBaseUrl: string;
        try {
          targetBaseUrl = validateEvolutionBaseUrl(
            credentials.baseUrl,
            process.env.NODE_ENV !== "production"
          );
        } catch (ssrfErr) {
          return reply.status(400).send({
            success: false,
            error:
              ssrfErr instanceof Error
                ? ssrfErr.message
                : "Validação SSRF falhou para a URL fornecida.",
          });
        }

        const allowLocal =
          process.env.NODE_ENV !== "production" ||
          process.env.ENABLE_LAB_SYNTHETIC === "true" ||
          process.env.ALLOW_LOCAL_NETWORK_CHANNELS === "true";

        try {
          const resp = await safeFetchWithSsrfGuard(
            `${targetBaseUrl}/instance/fetchInstances`,
            {
              headers: credentials.apiKey ? { apikey: credentials.apiKey } : {},
            },
            {
              timeoutMs: 8000,
              allowLocalTest: allowLocal,
              allowedProtocols: ["http:", "https:"],
            }
          );

          if (!resp.ok) {
            return reply.status(200).send({
              success: false,
              error: `Falha na conexão com Evolution API (HTTP ${resp.status})`,
            });
          }

          return reply.status(200).send({
            success: true,
            verifiedName: "Evolution API v2 Ativa",
            qualityRating: "GREEN",
          });
        } catch (err: unknown) {
          const isSsrf = err instanceof Error && (err.message.includes("SSRF") || err.message.includes("BLOCKED"));
          if (isSsrf) {
            return reply.status(400).send({
              success: false,
              error: `SSRF_VIOLATION: ${(err as Error).message}`,
            });
          }
          return reply.status(200).send({
            success: false,
            error:
              err instanceof Error
                ? err.message
                : "Tempo limite ou erro de rede ao conectar com a Evolution API.",
          });
        }
      }

      return reply.status(400).send({
        success: false,
        error: `Provider '${provider}' não suportado para teste de conexão`,
      });
    }
  );

  // 3. Create / Register Channel Instance (with optional automated encrypted credential provisioning)
  app.post(
    "/v1/workspaces/:workspaceId/channels",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = createChannelBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { provider, displayName, phoneNumberE164, endpointToken, credentials } = parsedBody.data;

      // Generate a raw endpoint token if not provided, and hash it with SHA-256
      const rawToken = endpointToken ?? crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      const channel = await withTenantTransaction(workspaceId, async (client) => {
        let credentialId: string | null = null;

        if (credentials) {
          const rawPayload =
            provider === "meta_waba"
              ? {
                  access_token: credentials.accessToken,
                  phone_number_id: credentials.phoneNumberId,
                  app_secret: credentials.appSecret,
                  waba_account_id: credentials.wabaAccountId,
                }
              : provider === "waha"
              ? {
                  api_key: credentials.apiKey,
                  base_url: credentials.baseUrl,
                  session: "default",
                }
              : {
                  api_key: credentials.apiKey,
                  base_url: credentials.baseUrl,
                };

          const envKeyring = parseKeyringFromEnv();
          let keyringOrKey: string | Record<string, string> | undefined = envKeyring?.keyring;
          if (!keyringOrKey) {
            const rawKey =
              process.env.MCT_CREDENTIALS_MASTER_KEY ||
              process.env.APP_MASTER_KEY ||
              process.env.MASTER_ENCRYPTION_KEY;
            if (rawKey && /^[0-9a-fA-F]{64}$/.test(rawKey)) {
              keyringOrKey = rawKey;
            } else if (process.env.NODE_ENV === "test" || process.env.VITEST) {
              keyringOrKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
            } else {
              throw new Error(
                "FATAL_CONFIG_ERROR: Master encryption key must be explicitly provided as a 64-character hex string (no hardcoded fallback allowed outside test suites)"
              );
            }
          }

          const enc = encryptPayload(JSON.stringify(rawPayload), keyringOrKey);
          const accountId =
            credentials.phoneNumberId ||
            credentials.wabaAccountId ||
            displayName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

          const credRes = await client.query<{ id: string }>(
            `INSERT INTO public.provider_credentials (
               workspace_id, provider, account_id, encrypted_payload, iv, auth_tag, key_version, status
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
             ON CONFLICT (workspace_id, provider, account_id)
             DO UPDATE SET
               encrypted_payload = EXCLUDED.encrypted_payload,
               iv = EXCLUDED.iv,
               auth_tag = EXCLUDED.auth_tag,
               key_version = EXCLUDED.key_version,
               status = 'ACTIVE',
               updated_at = NOW()
             RETURNING id;`,
            [workspaceId, provider, accountId, enc.encryptedBase64, enc.ivBase64, enc.authTagBase64, enc.keyVersion]
          );
          credentialId = credRes.rows[0]?.id || null;
        }

        const initialStatus = parsedBody.data.status ?? (credentials ? "connected" : "unconfigured");

        const res = await client.query<{
          id: string;
          workspace_id: string;
          provider: string;
          display_name: string;
          phone_number_e164: string | null;
          status: string;
          is_active: boolean;
          created_at: string;
        }>(
          `INSERT INTO public.channel_instances (
             workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, credential_id, status, is_active
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, workspace_id, provider, display_name, phone_number_e164, status, is_active, created_at;`,
          [workspaceId, provider, displayName, phoneNumberE164 ?? null, tokenHash, credentialId, initialStatus, initialStatus === "connected"]
        );
        return res.rows[0];
      });

      if (!channel) {
        return reply.status(500).send({
          type: "https://sos-sales.mct.br/errors/internal",
          title: "Internal Server Error",
          status: 500,
          detail: "Failed to persist channel instance",
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(201).send({
        channel: {
          id: channel.id,
          workspaceId: channel.workspace_id,
          provider: channel.provider,
          displayName: channel.display_name,
          phoneNumberE164: channel.phone_number_e164,
          status: channel.status,
          isActive: channel.is_active,
          createdAt: channel.created_at,
          // Return the raw token only once on creation so the webhook URL can be configured
          webhookToken: rawToken,
          webhookUrl: `/v1/webhooks/whatsapp/${rawToken}`,
        },
        webhookToken: rawToken,
        webhookUrl: `/v1/webhooks/whatsapp/${rawToken}`,
      });
    }
  );

  // 4. Revoke / Disconnect Channel Instance
  app.post(
    "/v1/workspaces/:workspaceId/channels/:channelId/revoke",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = channelParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or channelId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, channelId } = parsedParams.data;

      const revoked = await withTenantTransaction(workspaceId, async (client) => {
        const chanRes = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          credential_id: string | null;
          status: string;
          is_active: boolean;
        }>(
          `UPDATE public.channel_instances
           SET status = 'revoked', updated_at = NOW()
           WHERE id = $1 AND workspace_id = $2
           RETURNING id, provider, display_name, credential_id, status, is_active;`,
          [channelId, workspaceId]
        );

        const channel = chanRes.rows[0];
        if (!channel) {
          return null;
        }

        if (channel.credential_id) {
          await client.query(
            `UPDATE public.provider_credentials
             SET status = 'REVOKED', updated_at = NOW()
             WHERE id = $1 AND workspace_id = $2;`,
            [channel.credential_id, workspaceId]
          );
        }

        try {
          await recordSecurityAuditEvent(
            {
              workspaceId,
              actorId: request.user.id,
              actorType: "user",
              action: "channel.revoked",
              resourceType: "channel",
              resourceId: channelId,
              metadata: {
                channelId,
                provider: channel.provider,
                displayName: channel.display_name,
                correlationId: request.id,
                revokedAt: new Date().toISOString(),
              },
              ipAddress: request.ip,
            },
            client
          );
        } catch {
          // Non-blocking audit catch
        }

        return channel;
      });

      if (!revoked) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: `Channel ${channelId} not found in workspace`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        success: true,
        channelId: revoked.id,
        status: revoked.status,
        isActive: revoked.is_active,
        message: `Canal '${revoked.display_name}' revogado com sucesso.`,
      });
    }
  );

  // 4b. Update Channel Lifecycle Status (State Machine)
  app.patch(
    "/v1/workspaces/:workspaceId/channels/:channelId/status",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = channelParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or channelId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = updateChannelStatusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, channelId } = parsedParams.data;
      const { status } = parsedBody.data;

      const updated = await withTenantTransaction(workspaceId, async (client) => {
        const chanRes = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          status: string;
          is_active: boolean;
        }>(
          `UPDATE public.channel_instances
           SET status = $1, updated_at = NOW()
           WHERE id = $2 AND workspace_id = $3
           RETURNING id, provider, display_name, status, is_active;`,
          [status, channelId, workspaceId]
        );
        return chanRes.rows[0] || null;
      });

      if (!updated) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: `Channel ${channelId} not found in workspace`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        success: true,
        channelId: updated.id,
        status: updated.status,
        isActive: updated.is_active,
      });
    }
  );

  // 5. Get WAHA Safe QR Code (Strictly local flow, zero token exposure in browser)
  app.get(
    "/v1/workspaces/:workspaceId/channels/:channelId/qr-code",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = channelParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or channelId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, channelId } = parsedParams.data;

      const channel = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          is_active: boolean;
          credential_id: string | null;
        }>(
          `SELECT id, provider, display_name, is_active, credential_id
           FROM public.channel_instances
           WHERE id = $1 AND workspace_id = $2;`,
          [channelId, workspaceId]
        );
        return res.rows[0] || null;
      });

      if (!channel) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: `Channel ${channelId} not found in workspace`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (channel.provider !== "waha") {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: `QR Code generation is only supported for WAHA channels (current provider: ${channel.provider})`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (!channel.is_active) {
        return reply.status(409).send({
          type: "https://sos-sales.mct.br/errors/conflict",
          title: "Conflict",
          status: 409,
          detail: "Channel is inactive or revoked",
          instance: request.url,
          correlationId: request.id,
        });
      }

      // Simulated or test lab mode
      if (process.env.MCT_SIMULATE_WAHA_QR === "true" || process.env.NODE_ENV === "test") {
        return reply.status(200).send({
          success: true,
          status: "SCAN_QR_CODE",
          qrDataUri:
            "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='%23fff'/><text x='100' y='105' text-anchor='middle' font-size='12' fill='%23000'>QR Code WAHA Seguro (Lab)</text></svg>",
          isSimulated: true,
          message:
            "QR Code gerado localmente pelo fluxo seguro do WAHA sem exposição de tokens.",
        });
      }

      if (!channel.credential_id) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "WAHA channel does not have associated credentials",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const credRow = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          encrypted_payload: string;
          iv: string;
          auth_tag: string;
          key_version: string;
        }>(
          `SELECT encrypted_payload, iv, auth_tag, key_version
           FROM public.provider_credentials
           WHERE id = $1 AND workspace_id = $2;`,
          [channel.credential_id, workspaceId]
        );
        return res.rows[0] || null;
      });

      if (!credRow) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Channel credentials not found",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const envKeyring = parseKeyringFromEnv();
      let keyringOrKey: string | Record<string, string> | undefined = envKeyring?.keyring;
      if (!keyringOrKey) {
        const rawKey =
          process.env.MCT_CREDENTIALS_MASTER_KEY ||
          process.env.APP_MASTER_KEY ||
          process.env.MASTER_ENCRYPTION_KEY;
        if (rawKey && /^[0-9a-fA-F]{64}$/.test(rawKey)) {
          keyringOrKey = rawKey;
        } else if (process.env.NODE_ENV === "test" || process.env.VITEST) {
          keyringOrKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        }
      }

      if (!keyringOrKey) {
        return reply.status(500).send({
          type: "https://sos-sales.mct.br/errors/internal",
          title: "Internal Error",
          status: 500,
          detail: "Master encryption key unavailable",
          instance: request.url,
          correlationId: request.id,
        });
      }

      let creds: { api_key?: string; base_url?: string; session?: string };
      try {
        const decryptedJson = decryptPayload(
          credRow.encrypted_payload,
          credRow.iv,
          credRow.auth_tag,
          keyringOrKey,
          { keyVersion: credRow.key_version }
        );
        creds = JSON.parse(decryptedJson);
      } catch {
        return reply.status(500).send({
          type: "https://sos-sales.mct.br/errors/internal",
          title: "Decryption Failed",
          status: 500,
          detail: "Failed to decrypt channel credentials safely",
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (!creds.base_url) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "WAHA credentials missing base_url",
          instance: request.url,
          correlationId: request.id,
        });
      }

      let validatedBaseUrl: string;
      try {
        validatedBaseUrl = validateWahaBaseUrl(
          creds.base_url,
          process.env.NODE_ENV !== "production"
        );
      } catch (err) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "SSRF Violation",
          status: 400,
          detail: err instanceof Error ? err.message : "SSRF validation failed",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const sessionName = creds.session || "default";
      const allowLocal =
        process.env.NODE_ENV !== "production" ||
        process.env.ENABLE_LAB_SYNTHETIC === "true" ||
        process.env.ALLOW_LOCAL_NETWORK_CHANNELS === "true";

      try {
        const resp = await safeFetchWithSsrfGuard(
          `${validatedBaseUrl}/api/sessions/${sessionName}/auth/qr`,
          {
            headers: creds.api_key ? { "X-Api-Key": creds.api_key } : {},
          },
          {
            timeoutMs: 8000,
            allowLocalTest: allowLocal,
            allowedProtocols: ["http:", "https:"],
          }
        );

        if (!resp.ok) {
          return reply.status(200).send({
            success: false,
            status: "UNAVAILABLE",
            error: `WAHA retornou HTTP ${resp.status}. O canal pode já estar conectado ou aguardando inicialização da sessão.`,
            isSimulated: false,
          });
        }

        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("image/")) {
          const arrayBuffer = await resp.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString("base64");
          return reply.status(200).send({
            success: true,
            status: "SCAN_QR_CODE",
            qrDataUri: `data:${contentType};base64,${base64}`,
            isSimulated: false,
          });
        }

        const data = (await resp.json()) as { qr?: string; message?: string };
        return reply.status(200).send({
          success: true,
          status: "SCAN_QR_CODE",
          qr: data.qr,
          isSimulated: false,
        });
      } catch (err: unknown) {
        const isSsrf = err instanceof Error && (err.message.includes("SSRF") || err.message.includes("BLOCKED"));
        if (isSsrf) {
          return reply.status(400).send({
            type: "https://sos-sales.mct.br/errors/bad-request",
            title: "SSRF Violation",
            status: 400,
            detail: (err as Error).message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        return reply.status(200).send({
          success: false,
          status: "UNREACHABLE",
          error:
            err instanceof Error ? err.message : "WAHA host unreachable",
          isSimulated: false,
        });
      }
    }
  );
};

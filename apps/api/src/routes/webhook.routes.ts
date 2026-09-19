import crypto from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  WebhookChallengeQuerySchema,
  WebhookEndpointParamsSchema,
  type ChannelProvider,
} from "@sos-sales/contracts";
import {
  lookupChannelIngress,
  resolveChannelSigningCredential,
  withIngressTransaction,
  encryptPayload,
  DatabaseSigningSecretResolver,
  type Pool,
} from "@sos-sales/database";
import {
  SignatureVerificationService,
  type ISigningSecretResolver,
} from "@sos-sales/application";
import {
  BoundedTwoTierRateLimiter,
  type RateLimiterOptions,
  type IRateLimiter,
} from "../services/redis-rate-limiter";
import {
  getActiveKeyVersion,
  parseKeyringFromEnv,
  type Keyring,
} from "@sos-sales/database";

export { BoundedTwoTierRateLimiter, type RateLimiterOptions };

export interface WebhookRoutesOptions {
  secretResolver?: ISigningSecretResolver;
  masterKeyHex?: string;
  keyring?: Keyring;
  activeKeyVersion?: number;
  ingressPool?: Pool;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  rateLimiter?: IRateLimiter;
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export const webhookRoutes: FastifyPluginAsync<WebhookRoutesOptions> = async (
  app,
  options
) => {
  // P0 Security Invariant: Strict Master Key or Keyring. NO literal fallback, fail immediately on startup.
  let keyringOrKey: string | Keyring;
  if (options.keyring && Object.keys(options.keyring).length > 0) {
    keyringOrKey = options.keyring;
  } else {
    const envKeyring = parseKeyringFromEnv();
    if (envKeyring) {
      keyringOrKey = envKeyring.keyring;
    } else {
      const masterKey =
        options.masterKeyHex ||
        process.env.MCT_CREDENTIALS_MASTER_KEY ||
        process.env.APP_MASTER_KEY;

      if (!masterKey || !/^[0-9a-fA-F]{64}$/.test(masterKey)) {
        throw new Error(
          "FATAL_STARTUP_CONFIG_ERROR: 64-character hex master key or versioned keyring is strictly required for Webhook Ingress startup."
        );
      }
      keyringOrKey = masterKey;
    }
  }

  const activeKeyVersion =
    options.activeKeyVersion ?? getActiveKeyVersion(keyringOrKey);

  const rateLimiter: IRateLimiter =
    options.rateLimiter ??
    new BoundedTwoTierRateLimiter({
      maxIpRequests: options.rateLimitMax ?? 100,
      maxChannelRequests: (options.rateLimitMax ?? 100) * 3,
      windowMs: options.rateLimitWindowMs ?? 60_000,
    });

  let resolver: ISigningSecretResolver;
  if (options.secretResolver) {
    resolver = options.secretResolver;
  } else {
    resolver = new DatabaseSigningSecretResolver({
      pool: options.ingressPool,
      keyring: typeof keyringOrKey === "object" ? keyringOrKey : undefined,
      masterKeyHex: typeof keyringOrKey === "string" ? keyringOrKey : undefined,
    });
  }

  const signatureService = new SignatureVerificationService(resolver);

  // Redacted instance URI for RFC 7807 problem details (Never leak raw endpointToken)
  const SANITIZED_INSTANCE_PATH = "/v1/webhooks/whatsapp/[redacted]";

  /**
   * GET /v1/webhooks/whatsapp/:endpointToken
   * Meta WhatsApp Business Webhook Challenge Handshake
   */
  app.get(
    "/v1/webhooks/whatsapp/:endpointToken",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsParsed = WebhookEndpointParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Channel endpoint not found",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      const queryParsed = WebhookChallengeQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid webhook challenge query parameters",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      // Primary rate limit check: by client IP before ANY database lookup!
      const clientIp = request.ip || "unknown";
      const ipLimitMax = options.rateLimitMax ?? 100;
      const ipCheck = rateLimiter.checkIpLimit
        ? await rateLimiter.checkIpLimit(clientIp)
        : {
            allowed: await rateLimiter.isIpAllowed(clientIp),
            remaining: 0,
            resetMs: options.rateLimitWindowMs ?? 60_000,
            limit: ipLimitMax,
          };

      if (!ipCheck.allowed) {
        reply.header("Retry-After", Math.max(1, Math.ceil(ipCheck.resetMs / 1000)));
        reply.header("X-RateLimit-Limit", ipCheck.limit);
        reply.header("X-RateLimit-Remaining", 0);
        return reply.status(429).send({
          type: "https://sos-sales.mct.br/errors/too-many-requests",
          title: "Too Many Requests",
          status: 429,
          detail: "Rate limit exceeded for client IP",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      const { endpointToken } = paramsParsed.data;
      const mode = queryParsed.data["hub.mode"];
      const challenge = queryParsed.data["hub.challenge"];
      const verifyToken = queryParsed.data["hub.verify_token"];

      if (mode !== "subscribe") {
        return reply.status(403).send("Forbidden");
      }

      const tokenHash = crypto
        .createHash("sha256")
        .update(endpointToken)
        .digest("hex");

      // 1. Lookup channel instance under sos_ingress_user
      const channel = await lookupChannelIngress(tokenHash, options.ingressPool);
      if (!channel || !channel.isActive) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Channel endpoint not found",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      // Secondary rate limit check: by channel after lookup
      const chLimitMax = (options.rateLimitMax ?? 100) * 3;
      const chCheck = rateLimiter.checkChannelLimit
        ? await rateLimiter.checkChannelLimit(channel.channelInstanceId)
        : {
            allowed: await rateLimiter.isChannelAllowed(channel.channelInstanceId),
            remaining: 0,
            resetMs: options.rateLimitWindowMs ?? 60_000,
            limit: chLimitMax,
          };

      if (!chCheck.allowed) {
        reply.header("Retry-After", Math.max(1, Math.ceil(chCheck.resetMs / 1000)));
        reply.header("X-RateLimit-Limit", chCheck.limit);
        reply.header("X-RateLimit-Remaining", 0);
        return reply.status(429).send({
          type: "https://sos-sales.mct.br/errors/too-many-requests",
          title: "Too Many Requests",
          status: 429,
          detail: "Rate limit exceeded for channel endpoint",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      // 2. Strict independent verify_token validation
      // NEVER accept endpointToken, app_secret, or access_token as verify_token!
      const creds = await resolveChannelSigningCredential(
        channel.channelInstanceId,
        channel.workspaceId,
        options.ingressPool
      );

      const incomingVerifyTokenHash = crypto
        .createHash("sha256")
        .update(verifyToken)
        .digest("hex");

      const isValidToken =
        Boolean(creds?.verifyTokenHash) &&
        constantTimeEqual(incomingVerifyTokenHash, creds!.verifyTokenHash!);

      if (!isValidToken) {
        request.log.warn(
          { correlationId: request.id },
          "Webhook challenge verification token mismatch"
        );
        return reply.status(403).send("Forbidden");
      }

      // Meta strictly expects plain text challenge response with 200 OK
      return reply
        .status(200)
        .type("text/plain")
        .send(challenge);
    }
  );

  /**
   * POST /v1/webhooks/whatsapp/:endpointToken
   * Ingress for incoming messages, statuses, and events (WABA & WAHA)
   */
  app.post(
    "/v1/webhooks/whatsapp/:endpointToken",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsParsed = WebhookEndpointParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Channel endpoint not found",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      const rawBody = request.rawBody;
      if (!rawBody || rawBody.length === 0) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Missing request payload",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      if (rawBody.length > 512 * 1024) {
        return reply.status(413).send({
          type: "https://sos-sales.mct.br/errors/payload-too-large",
          title: "Payload Too Large",
          status: 413,
          detail: "Payload exceeds 512 KB limit",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      // Primary rate limit check: by client IP before ANY database lookup!
      const clientIp = request.ip || "unknown";
      const ipLimitMax = options.rateLimitMax ?? 100;
      const ipCheck = rateLimiter.checkIpLimit
        ? await rateLimiter.checkIpLimit(clientIp)
        : {
            allowed: await rateLimiter.isIpAllowed(clientIp),
            remaining: 0,
            resetMs: options.rateLimitWindowMs ?? 60_000,
            limit: ipLimitMax,
          };

      if (!ipCheck.allowed) {
        reply.header("Retry-After", Math.max(1, Math.ceil(ipCheck.resetMs / 1000)));
        reply.header("X-RateLimit-Limit", ipCheck.limit);
        reply.header("X-RateLimit-Remaining", 0);
        return reply.status(429).send({
          type: "https://sos-sales.mct.br/errors/too-many-requests",
          title: "Too Many Requests",
          status: 429,
          detail: "Rate limit exceeded for client IP",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      const { endpointToken } = paramsParsed.data;
      const tokenHash = crypto
        .createHash("sha256")
        .update(endpointToken)
        .digest("hex");

      // 1. Ingress lookup under sos_ingress_user
      const channel = await lookupChannelIngress(tokenHash, options.ingressPool);
      if (!channel || !channel.isActive) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Channel endpoint not found",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      // Secondary rate limit check: by channel after lookup
      const chLimitMax = (options.rateLimitMax ?? 100) * 3;
      const chCheck = rateLimiter.checkChannelLimit
        ? await rateLimiter.checkChannelLimit(channel.channelInstanceId)
        : {
            allowed: await rateLimiter.isChannelAllowed(channel.channelInstanceId),
            remaining: 0,
            resetMs: options.rateLimitWindowMs ?? 60_000,
            limit: chLimitMax,
          };

      if (!chCheck.allowed) {
        reply.header("Retry-After", Math.max(1, Math.ceil(chCheck.resetMs / 1000)));
        reply.header("X-RateLimit-Limit", chCheck.limit);
        reply.header("X-RateLimit-Remaining", 0);
        return reply.status(429).send({
          type: "https://sos-sales.mct.br/errors/too-many-requests",
          title: "Too Many Requests",
          status: 429,
          detail: "Rate limit exceeded for channel endpoint",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      // 2. Cryptographic Signature Verification
      const verification = await signatureService.verify({
        channelInstanceId: channel.channelInstanceId,
        workspaceId: channel.workspaceId,
        provider: channel.provider as ChannelProvider,
        rawBody,
        headers: request.headers as Record<string, string | string[] | undefined>,
      });

      if (!verification.valid) {
        if (
          verification.reason === "secret_not_found" ||
          verification.reason === "verification_exception" ||
          verification.reason?.startsWith("unsupported_provider_")
        ) {
          request.log.error(
            {
              correlationId: request.id,
              provider: channel.provider,
              reason: verification.reason,
            },
            "Webhook signature verification unavailable"
          );
          return reply.status(500).send({
            type: "https://sos-sales.mct.br/errors/internal-error",
            title: "Internal Server Error",
            status: 500,
            detail: "Webhook signature verification service unavailable",
            instance: SANITIZED_INSTANCE_PATH,
            correlationId: request.id,
          });
        }

        request.log.warn(
          {
            correlationId: request.id,
            provider: channel.provider,
            reason: verification.reason,
          },
          "Rejected invalid webhook signature"
        );

        // Security Invariant: Invalid signature MUST NOT be persisted
        return reply.status(401).send({
          type: "https://sos-sales.mct.br/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Invalid webhook signature",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      // 3. Raw body SHA-256 hash & AES-256-GCM envelope encryption with AAD and key_version
      const rawPayloadHash = crypto
        .createHash("sha256")
        .update(rawBody)
        .digest("hex");

      const aad = `${channel.workspaceId}:${channel.channelInstanceId}:${rawPayloadHash}`;
      const encrypted = encryptPayload(rawBody, keyringOrKey, { aad, keyVersion: activeKeyVersion });
      const providerEventKey = `sha256:${rawPayloadHash}`;

      // 4. Atomic Ingestion into channel_webhook_inbox under sos_ingress_user
      let inserted = false;
      try {
        await withIngressTransaction(
          channel.workspaceId,
          async (client) => {
            const res = await client.query(
              `
              INSERT INTO public.channel_webhook_inbox (
                channel_instance_id,
                workspace_id,
                provider_event_key,
                raw_payload_hash,
                encrypted_payload,
                payload_iv,
                payload_auth_tag,
                key_version,
                status,
                retry_count,
                max_retries,
                next_attempt_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, 'pending', 0, 5, clock_timestamp()
              )
              ON CONFLICT (channel_instance_id, provider_event_key) DO NOTHING
              RETURNING id;
              `,
              [
                channel.channelInstanceId,
                channel.workspaceId,
                providerEventKey,
                rawPayloadHash,
                encrypted.encryptedBase64,
                encrypted.ivBase64,
                encrypted.authTagBase64,
                encrypted.keyVersion ?? 1,
              ]
            );

            inserted = res.rows.length > 0;
          },
          options.ingressPool
        );
      } catch (dbErr) {
        request.log.error({ err: dbErr, correlationId: request.id }, "Database error during inbox insertion");
        return reply.status(500).send({
          type: "https://sos-sales.mct.br/errors/internal-error",
          title: "Internal Server Error",
          status: 500,
          detail: "Failed to persist webhook event",
          instance: SANITIZED_INSTANCE_PATH,
          correlationId: request.id,
        });
      }

      // 5. Return HTTP 200 OK immediately to satisfy provider handshake
      return reply.status(200).send({
        received: true,
        status: inserted ? "accepted" : "duplicate",
      });
    }
  );
};

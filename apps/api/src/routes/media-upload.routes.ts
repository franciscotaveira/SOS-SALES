import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { META_GRAPH_API_VERSION } from "@sos-sales/contracts";
import { DatabaseSigningSecretResolver, getDatabasePool } from "@sos-sales/database";
import { createMediaStorageFromEnv, type MediaStorage } from "../services/media-storage";

type Category = "image" | "audio" | "video" | "document";

interface MediaRule {
  readonly ext: string;
  readonly category: Category;
  readonly maxBytes: number;
  readonly matches: (b: Buffer) => boolean;
}

const MB = 1024 * 1024;
const startsWith = (b: Buffer, sig: number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

/** Allowlist: MIME -> extension, category, size limit and magic-byte check. */
export const MEDIA_RULES: Readonly<Record<string, MediaRule>> = {
  "image/jpeg": { ext: "jpg", category: "image", maxBytes: 5 * MB, matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  "image/png": {
    ext: "png",
    category: "image",
    maxBytes: 5 * MB,
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  "image/webp": {
    ext: "webp",
    category: "image",
    maxBytes: 5 * MB,
    matches: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
  "application/pdf": { ext: "pdf", category: "document", maxBytes: 16 * MB, matches: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  "video/mp4": { ext: "mp4", category: "video", maxBytes: 16 * MB, matches: (b) => startsWith(b, [0x66, 0x74, 0x79, 0x70], 4) },
  "audio/ogg": { ext: "ogg", category: "audio", maxBytes: 16 * MB, matches: (b) => startsWith(b, [0x4f, 0x67, 0x67, 0x53]) },
  "audio/mpeg": {
    ext: "mp3",
    category: "audio",
    maxBytes: 16 * MB,
    matches: (b) => startsWith(b, [0x49, 0x44, 0x33]) || (b.length > 1 && b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0),
  },
};

const ABSOLUTE_MAX_BYTES = 16 * MB;
const paramsSchema = z.object({ workspaceId: z.string().uuid() });

export interface MediaUploadRoutesOptions {
  storage?: MediaStorage | null;
}

/** Strips path components and control chars; display-only, never used as a storage key. */
export function sanitizeFileName(raw: unknown): string {
  const base = String(raw ?? "")
    .split(/[\\/]/)
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\.\.+/g, ".")
    .trim()
    .slice(0, 120);
  return base || "arquivo";
}

/**
 * Media routes:
 * 1. GET /v1/workspaces/:workspaceId/media/proxy - Proxies protected Meta media (audios, photos, docs)
 * 2. POST /v1/workspaces/:workspaceId/media - Binary file upload with optional public persistence
 */
export const mediaUploadRoutes: FastifyPluginAsync<MediaUploadRoutesOptions> = async (app, options) => {
  const storage = options.storage === undefined ? createMediaStorageFromEnv() : options.storage;

  // 1. GET /v1/workspaces/:workspaceId/media/proxy
  app.get(
    "/v1/workspaces/:workspaceId/media/proxy",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      const parsedParams = paramsSchema.safeParse(request.params);
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

      const querySchema = z
        .object({
          mediaId: z.string().min(1).optional(),
          wahaPath: z.string().min(1).optional(),
          url: z.string().min(1).optional(),
          channelInstanceId: z.string().uuid().optional(),
          token: z.string().optional(),
        })
        .refine((d) => Boolean(d.mediaId || d.wahaPath || d.url), {
          message: "Either mediaId, wahaPath, or url query parameter is required",
        });

      const parsedQuery = querySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Query parameter mediaId, wahaPath, or url is required",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { mediaId, wahaPath, url, channelInstanceId } = parsedQuery.data;

      // 1A. Handle WAHA media requests
      const isWaha = Boolean(
        wahaPath ||
        (url && (url.includes("/api/files/") || url.includes("waha"))) ||
        (mediaId && (mediaId.includes("/api/files/") || mediaId.startsWith("waha:")))
      );

      if (isWaha) {
        let cleanPath = wahaPath || "";
        if (!cleanPath && url) {
          const match = url.match(/\/api\/files\/[a-zA-Z0-9_\-./]+/);
          if (match) cleanPath = match[0];
        }
        if (!cleanPath && mediaId) {
          const match = mediaId.match(/\/api\/files\/[a-zA-Z0-9_\-./]+/);
          if (match) cleanPath = match[0];
          else if (mediaId.startsWith("waha:")) cleanPath = `/api/files/${mediaId.slice(5)}`;
        }

        if (!cleanPath || !cleanPath.startsWith("/api/files/") || cleanPath.includes("..")) {
          return reply.status(400).send({
            type: "https://sos-sales.mct.br/errors/bad-request",
            title: "Bad Request",
            status: 400,
            detail: "Invalid or unauthorized WAHA media path",
            instance: request.url,
            correlationId: request.id,
          });
        }

        const wahaBaseUrl = (
          process.env.WAHA_BASE_URL ||
          "http://sos-sales-waha:3000"
        ).replace(/\/$/, "");
        const wahaApiKey = process.env.WAHA_API_KEY || "mct_sos_waha_master_2026";

        const targetUrl = `${wahaBaseUrl}${cleanPath}`;
        const forwardHeaders: Record<string, string> = {
          "x-api-key": wahaApiKey,
        };
        const rangeHeader = request.headers["range"];
        if (typeof rangeHeader === "string") {
          forwardHeaders["range"] = rangeHeader;
        }

        try {
          const wahaResp = await fetch(targetUrl, {
            headers: forwardHeaders,
          });

          if (!wahaResp.ok) {
            request.log.warn({ targetUrl, status: wahaResp.status }, "WAHA media fetch failed");
            return reply.status(wahaResp.status || 502).send({
              type: "https://sos-sales.mct.br/errors/bad-gateway",
              title: "Bad Gateway",
              status: wahaResp.status || 502,
              detail: "Failed to fetch media from WAHA engine",
              instance: request.url,
              correlationId: request.id,
            });
          }

          const contentType = wahaResp.headers.get("content-type") || "application/octet-stream";
          const contentLength = wahaResp.headers.get("content-length");
          const contentRange = wahaResp.headers.get("content-range");
          const acceptRanges = wahaResp.headers.get("accept-ranges") || "bytes";

          reply.header("Content-Type", contentType);
          reply.header("Accept-Ranges", acceptRanges);
          reply.header("Cache-Control", "public, max-age=86400, immutable");
          if (contentLength) reply.header("Content-Length", contentLength);
          if (contentRange) reply.header("Content-Range", contentRange);

          const buffer = Buffer.from(await wahaResp.arrayBuffer());
          return reply.status(wahaResp.status).send(buffer);
        } catch (err) {
          request.log.error({ err, targetUrl, correlationId: request.id }, "WAHA media proxy connection error");
          return reply.status(502).send({
            type: "https://sos-sales.mct.br/errors/bad-gateway",
            title: "Bad Gateway",
            status: 502,
            detail: "Could not connect to WAHA media service",
            instance: request.url,
            correlationId: request.id,
          });
        }
      }

      // 1B. Handle Meta WABA media requests
      if (!mediaId) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Query parameter mediaId is required for Meta WABA media",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const pool = getDatabasePool();

      // Resolve channel instance
      let targetChannelId = channelInstanceId;
      if (!targetChannelId) {
        const chRes = await pool.query<{ id: string }>(
          `SELECT id FROM public.channel_instances 
           WHERE workspace_id = $1 AND provider = 'meta_waba' AND is_active = true 
           ORDER BY created_at DESC LIMIT 1;`,
          [workspaceId]
        );
        targetChannelId = chRes.rows[0]?.id;
      }

      if (!targetChannelId) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "No active WABA channel instance found to resolve media",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const resolver = new DatabaseSigningSecretResolver({
        pool,
        masterKeyHex: process.env.MCT_CREDENTIALS_MASTER_KEY || process.env.APP_MASTER_KEY,
      });

      try {
        const streamResult = await resolver.useWabaOutboundCredentials(
          targetChannelId,
          workspaceId,
          async ({ accessToken }) => {
            // 1. Fetch media metadata from Meta Graph API
            const metaResp = await fetch(
              `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(mediaId)}`,
              {
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );

            if (!metaResp.ok) {
              const errBody = await metaResp.text();
              request.log.error({ mediaId, status: metaResp.status, errBody }, "Failed to fetch media metadata from Meta");
              return { status: metaResp.status, error: "Meta media resolution failed", contentType: "text/plain", buffer: null };
            }

            const metaData = (await metaResp.json()) as { url?: string; mime_type?: string; file_size?: number };
            if (!metaData.url) {
              return { status: 404, error: "Meta media download URL not found", contentType: "text/plain", buffer: null };
            }

            // 2. Fetch media binary from Meta CDN
            const binaryResp = await fetch(metaData.url, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (!binaryResp.ok) {
              return { status: binaryResp.status, error: "Failed to download media from Meta CDN", contentType: "text/plain", buffer: null };
            }

            const contentType = metaData.mime_type || binaryResp.headers.get("content-type") || "application/octet-stream";
            const buffer = Buffer.from(await binaryResp.arrayBuffer());
            return {
              status: 200,
              contentType,
              buffer,
            };
          }
        );

        if (!streamResult) {
          return reply.status(404).send({
            type: "https://sos-sales.mct.br/errors/not-found",
            title: "Not Found",
            status: 404,
            detail: "Channel credentials could not be decrypted or found",
            instance: request.url,
            correlationId: request.id,
          });
        }

        if (streamResult.status !== 200 || !streamResult.buffer) {
          return reply.status(streamResult.status || 502).send({
            type: "https://sos-sales.mct.br/errors/bad-gateway",
            title: "Bad Gateway",
            status: streamResult.status || 502,
            detail: streamResult.error || "Failed to stream media from Meta",
            instance: request.url,
            correlationId: request.id,
          });
        }

        return reply
          .header("Content-Type", streamResult.contentType)
          .header("Cache-Control", "public, max-age=86400, immutable")
          .header("Content-Length", streamResult.buffer.length)
          .send(streamResult.buffer);
      } catch (err: unknown) {
        request.log.error({ err, correlationId: request.id }, "Media proxy stream error");
        return reply.status(502).send({
          type: "https://sos-sales.mct.br/errors/bad-gateway",
          title: "Bad Gateway",
          status: 502,
          detail: "Failed to proxy media from Meta Cloud API",
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );

  // 2. POST /v1/workspaces/:workspaceId/media
  app.addContentTypeParser(
    Object.keys(MEDIA_RULES),
    { parseAs: "buffer", bodyLimit: ABSOLUTE_MAX_BYTES },
    (_req, body, done) => done(null, body)
  );

  app.post(
    "/v1/workspaces/:workspaceId/media",
    {
      bodyLimit: ABSOLUTE_MAX_BYTES,
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:send_message"),
      ],
    },
    async (request, reply) => {
      const problem = (status: number, slug: string, title: string, detail: string) =>
        reply.status(status).send({
          type: `https://sos-sales.mct.br/errors/${slug}`,
          title,
          status,
          detail,
          instance: request.url,
          correlationId: request.id,
        });

      if (!storage) {
        request.log.error({ correlationId: request.id }, "Media storage not configured (fail-closed)");
        return problem(503, "service-unavailable", "Service Unavailable", "Media storage not configured");
      }

      const parsedParams = paramsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return problem(400, "bad-request", "Bad Request", "Invalid workspaceId parameter");
      }

      const mime = String(request.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      const rule = MEDIA_RULES[mime];
      const bytes = request.body;
      if (!rule) {
        return problem(415, "unsupported-media-type", "Unsupported Media Type", "File type not allowed");
      }
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
        return problem(400, "bad-request", "Bad Request", "Empty file");
      }
      if (bytes.length > rule.maxBytes) {
        return problem(413, "payload-too-large", "Payload Too Large", `File exceeds ${rule.maxBytes} bytes`);
      }
      if (!rule.matches(bytes)) {
        return problem(422, "unprocessable-entity", "Unprocessable Entity", "File content does not match declared type");
      }

      const isPublic =
        (request.query as Record<string, string> | undefined)?.public === "true" ||
        request.headers["x-public"] === "true";

      const key = `${parsedParams.data.workspaceId}/${crypto.randomUUID()}.${rule.ext}`;
      try {
        const stored = await storage.put({ key, bytes, contentType: mime, isPublic });
        return reply.status(201).send({
          mediaUrl: stored.signedUrl,
          expiresInSeconds: stored.expiresInSeconds,
          contentType: mime,
          category: rule.category,
          sizeBytes: bytes.length,
          fileName: sanitizeFileName(request.headers["x-file-name"]),
        });
      } catch (err) {
        request.log.error({ err, correlationId: request.id }, "Media storage upload failed");
        return problem(502, "bad-gateway", "Bad Gateway", "Media storage unavailable");
      }
    }
  );
};

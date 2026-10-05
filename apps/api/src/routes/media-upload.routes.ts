import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
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
 * POST /v1/workspaces/:workspaceId/media
 * Raw binary body, Content-Type = file MIME, optional `x-file-name`. Returns a signed `mediaUrl`
 * accepted by PublicOutboundRequestSchema. Order: auth -> MIME (415) -> size (413) -> magic bytes (422).
 */
export const mediaUploadRoutes: FastifyPluginAsync<MediaUploadRoutesOptions> = async (app, options) => {
  const storage = options.storage === undefined ? createMediaStorageFromEnv() : options.storage;

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

      const key = `${parsedParams.data.workspaceId}/${crypto.randomUUID()}.${rule.ext}`;
      try {
        const stored = await storage.put({ key, bytes, contentType: mime });
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

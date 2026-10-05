import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createTestDatabasePools } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import { PublicOutboundRequestSchema } from "@sos-sales/contracts";
import { SupabaseMediaStorage, type MediaStorage } from "../services/media-storage";
import { sanitizeFileName } from "../routes/media-upload.routes";

/** G5 — outbound media upload. Storage is faked (Zero-Network). */
describe("Media upload (G5)", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const issuer = "sos-sales-test";
  const audience = "sos-sales-api-test";
  const { ownerPool } = createTestDatabasePools();
  const suffix = crypto.randomBytes(6).toString("hex");

  const stored: Array<{ key: string; size: number; contentType: string }> = [];
  const fakeStorage: MediaStorage = {
    async put({ key, bytes, contentType }) {
      stored.push({ key, size: bytes.length, contentType });
      return { signedUrl: `https://storage.example.test/sign/${key}?token=t`, expiresInSeconds: 3600 };
    },
  };

  let app: FastifyInstance;
  let unconfiguredApp: FastifyInstance;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let token: string;

  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(64, 3)]);

  const upload = (
    ws: string,
    body: Buffer,
    contentType: string,
    extra: Record<string, string> = {},
    auth: string | null = token
  ) =>
    app.inject({
      method: "POST",
      url: `/v1/workspaces/${ws}/media`,
      headers: {
        "content-type": contentType,
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
        ...extra,
      },
      payload: body,
    });

  beforeAll(async () => {
    app = await buildApp({ providerType: "local-jwt", jwtSecret, issuer, audience, mediaStorage: fakeStorage });
    unconfiguredApp = await buildApp({ providerType: "local-jwt", jwtSecret, issuer, audience, mediaStorage: null });

    const org = await ownerPool.query(
      `INSERT INTO organizations (name, slug) VALUES ('Media Org', $1) RETURNING id;`,
      [`org-media-${suffix}`]
    );
    const mkWs = async (n: string) =>
      (
        await ownerPool.query(
          `INSERT INTO workspaces (organization_id, name, slug) VALUES ($1, $2, $3) RETURNING id;`,
          [org.rows[0].id, n, `ws-media-${n}-${suffix}`]
        )
      ).rows[0].id as string;
    workspaceId = await mkWs("a");
    otherWorkspaceId = await mkWs("b");

    const userId = crypto.randomUUID();
    await ownerPool.query(`INSERT INTO users (id, email, name) VALUES ($1, $2, 'Media Operator');`, [
      userId,
      `media-${suffix}@example.com`,
    ]);
    await ownerPool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'operator');`,
      [workspaceId, userId]
    );
    token = await new SignJWT({ sub: userId, email: "media@example.com", role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(jwtSecret));
  });

  afterAll(async () => {
    await app.close();
    await unconfiguredApp.close();
    await ownerPool.end();
  });

  it("uploads a valid PNG, returns a mediaUrl accepted by the outbound contract", async () => {
    const res = await upload(workspaceId, png, "image/png", { "x-file-name": "foto.png" });
    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.category).toBe("image");
    expect(json.sizeBytes).toBe(png.length);
    expect(json.fileName).toBe("foto.png");

    const parsed = PublicOutboundRequestSchema.safeParse({
      recipientPhoneE164: "+5511999998888",
      contentType: "image",
      body: "legenda",
      mediaUrl: json.mediaUrl,
      idempotencyKey: "media-idem-1",
    });
    expect(parsed.success).toBe(true);
  });

  it("stores under workspace-scoped, server-generated keys (never the client file name)", async () => {
    stored.length = 0;
    await upload(workspaceId, pdf, "application/pdf", { "x-file-name": "../../etc/passwd.pdf" });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.key).toMatch(new RegExp(`^${workspaceId}/[0-9a-f-]{36}\\.pdf$`));
    expect(stored[0]!.key).not.toContain("passwd");
  });

  it("neutralizes path traversal in the returned display file name", async () => {
    const res = await upload(workspaceId, jpeg, "image/jpeg", { "x-file-name": "../../etc/passwd.jpg" });
    expect(JSON.parse(res.body).fileName).toBe("passwd.jpg");
    expect(sanitizeFileName("a\\b\\..\\c.png")).toBe("c.png");
    expect(sanitizeFileName("")).toBe("arquivo");
  });

  it("returns 415 for a MIME outside the allowlist", async () => {
    const res = await upload(workspaceId, Buffer.from("MZ"), "application/x-msdownload");
    expect(res.statusCode).toBe(415);
  });

  it("returns 422 when magic bytes do not match the declared type", async () => {
    const res = await upload(workspaceId, pdf, "image/png");
    expect(res.statusCode).toBe(422);
  });

  it("returns 413 above the per-type limit (image > 5 MB)", async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024, 7)]);
    const res = await upload(workspaceId, big, "image/jpeg");
    expect(res.statusCode).toBe(413);
  });

  it("returns 400 for an empty body", async () => {
    const res = await upload(workspaceId, Buffer.alloc(0), "image/png");
    expect(res.statusCode).toBe(400);
  });

  it("requires authentication (401)", async () => {
    const res = await upload(workspaceId, png, "image/png", {}, null);
    expect(res.statusCode).toBe(401);
  });

  it("blocks uploading into a workspace the user is not a member of", async () => {
    const res = await upload(otherWorkspaceId, png, "image/png");
    expect([403, 404]).toContain(res.statusCode);
    expect(stored.every((s) => !s.key.startsWith(otherWorkspaceId))).toBe(true);
  });

  it("fails closed with 503 when storage is not configured", async () => {
    const res = await unconfiguredApp.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/media`,
      headers: { "content-type": "image/png", authorization: `Bearer ${token}` },
      payload: png,
    });
    expect(res.statusCode).toBe(503);
  });

  describe("SupabaseMediaStorage adapter (fake fetch)", () => {
    it("uploads then signs, building an absolute signed URL; never sends the key in the URL query", async () => {
      const calls: Array<{ url: string; method?: string; auth?: string }> = [];
      const fetchImpl = (async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method, auth: (init?.headers as Record<string, string>)?.Authorization });
        if (url.includes("/object/sign/")) {
          return new Response(JSON.stringify({ signedURL: "/object/sign/bkt/ws/f.png?token=abc" }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch;

      const storage = new SupabaseMediaStorage({
        supabaseUrl: "https://proj.supabase.co/",
        serviceKey: "svc_key",
        bucket: "bkt",
        signedUrlTtlSeconds: 600,
        fetchImpl,
      });
      const out = await storage.put({ key: "ws/f.png", bytes: png, contentType: "image/png" });
      expect(out.signedUrl).toBe("https://proj.supabase.co/storage/v1/object/sign/bkt/ws/f.png?token=abc");
      expect(out.expiresInSeconds).toBe(600);
      expect(calls[0]!.url).toBe("https://proj.supabase.co/storage/v1/object/bkt/ws/f.png");
      expect(calls[0]!.auth).toBe("Bearer svc_key");
    });

    it("throws on upload failure without leaking the service key", async () => {
      const fetchImpl = (async () => new Response("denied", { status: 403 })) as unknown as typeof fetch;
      const storage = new SupabaseMediaStorage({
        supabaseUrl: "https://proj.supabase.co",
        serviceKey: "svc_key_secret",
        bucket: "bkt",
        signedUrlTtlSeconds: 60,
        fetchImpl,
      });
      await expect(storage.put({ key: "a/b.png", bytes: png, contentType: "image/png" })).rejects.toThrow(
        /MEDIA_STORAGE_UPLOAD_FAILED: status 403/
      );
    });
  });
});

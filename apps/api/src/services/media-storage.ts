/**
 * Media storage abstraction for outbound attachments (G5).
 * Production adapter: Supabase Storage via REST (service key stays server-side).
 * Tests inject an in-memory fake (Zero-Network).
 */
export interface StoredMedia {
  /** Time-limited URL the messaging provider (Meta/WAHA) can download from. */
  readonly signedUrl: string;
  readonly expiresInSeconds: number;
}

export interface MediaStorage {
  put(input: { key: string; bytes: Buffer; contentType: string }): Promise<StoredMedia>;
}

export interface SupabaseMediaStorageConfig {
  readonly supabaseUrl: string;
  readonly serviceKey: string;
  readonly bucket: string;
  readonly signedUrlTtlSeconds: number;
  readonly fetchImpl?: typeof fetch;
}

export class SupabaseMediaStorage implements MediaStorage {
  constructor(private readonly config: SupabaseMediaStorageConfig) {}

  async put(input: { key: string; bytes: Buffer; contentType: string }): Promise<StoredMedia> {
    const { supabaseUrl, serviceKey, bucket, signedUrlTtlSeconds } = this.config;
    const doFetch = this.config.fetchImpl ?? fetch;
    const base = supabaseUrl.replace(/\/+$/, "");
    const objectPath = input.key.split("/").map(encodeURIComponent).join("/");
    const headers = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };

    const upload = await doFetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": input.contentType, "x-upsert": "false" },
      body: new Uint8Array(input.bytes),
    });
    if (!upload.ok) {
      throw new Error(`MEDIA_STORAGE_UPLOAD_FAILED: status ${upload.status}`);
    }

    const sign = await doFetch(`${base}/storage/v1/object/sign/${bucket}/${objectPath}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: signedUrlTtlSeconds }),
    });
    if (!sign.ok) {
      throw new Error(`MEDIA_STORAGE_SIGN_FAILED: status ${sign.status}`);
    }
    const json = (await sign.json()) as { signedURL?: string };
    if (!json.signedURL) {
      throw new Error("MEDIA_STORAGE_SIGN_FAILED: missing signedURL");
    }
    const signedPath = json.signedURL.startsWith("/storage/v1")
      ? json.signedURL
      : `/storage/v1${json.signedURL}`;
    return { signedUrl: `${base}${signedPath}`, expiresInSeconds: signedUrlTtlSeconds };
  }
}

/** Builds the Supabase adapter from env, or null when not configured (route then fails closed with 503). */
export function createMediaStorageFromEnv(env: NodeJS.ProcessEnv = process.env): MediaStorage | null {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return new SupabaseMediaStorage({
    supabaseUrl,
    serviceKey,
    bucket: env.MEDIA_STORAGE_BUCKET || "chat-sales-media",
    signedUrlTtlSeconds: Number(env.MEDIA_SIGNED_URL_TTL_SECONDS) || 3600,
  });
}

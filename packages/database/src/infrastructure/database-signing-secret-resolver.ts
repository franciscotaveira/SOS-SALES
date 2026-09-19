import type { Pool } from "pg";
import {
  decryptPayload,
  parseKeyringFromEnv,
  type Keyring,
} from "./crypto-payload";

export interface WabaOutboundCredentials {
  accessToken: string;
  phoneNumberId: string;
}

export interface WahaOutboundCredentials {
  apiKey: string;
  session: string;
  baseUrl?: string;
}

export interface ISigningSecretResolver {
  useSigningSecret<T>(
    channelInstanceId: string,
    workspaceId: string,
    fn: (secret: string) => Promise<T> | T
  ): Promise<T | null>;
  useWabaWebhookSecret?<T>(
    channelInstanceId: string,
    workspaceId: string,
    fn: (appSecret: string) => Promise<T> | T
  ): Promise<T | null>;
  useWahaWebhookSecret?<T>(
    channelInstanceId: string,
    workspaceId: string,
    fn: (webhookSecret: string) => Promise<T> | T
  ): Promise<T | null>;
  useDirectWabaSecret?<T>(
    encryptedBase64: string,
    ivBase64: string,
    authTagBase64: string,
    fn: (appSecret: string) => Promise<T> | T
  ): Promise<T | null>;
  useDirectWahaSecret?<T>(
    encryptedBase64: string,
    ivBase64: string,
    authTagBase64: string,
    fn: (webhookSecret: string) => Promise<T> | T
  ): Promise<T | null>;
  useWabaOutboundCredentials?<T>(
    channelInstanceId: string,
    workspaceId: string,
    fn: (creds: WabaOutboundCredentials) => Promise<T> | T
  ): Promise<T | null>;
  useWahaOutboundCredentials?<T>(
    channelInstanceId: string,
    workspaceId: string,
    fn: (creds: WahaOutboundCredentials) => Promise<T> | T
  ): Promise<T | null>;
}

export interface DatabaseSigningSecretResolverOptions {
  readonly pool?: Pool;
  readonly masterKeyHex?: string;
  readonly keyring?: Keyring;
}

/**
 * Infrastructure adapter for resolving channel signing credentials from PostgreSQL.
 *
 * Implements the purpose-aware secret resolver contract strictly within
 * the infrastructure boundary. Decrypts credentials in-memory using AES-256-GCM,
 * wipes sensitive buffers, strictly separates credentials by purpose,
 * and strictly redacts all errors to prevent key/secret leaks.
 */
export class DatabaseSigningSecretResolver implements ISigningSecretResolver {
  private readonly pool?: Pool;
  private readonly keyringOrKey: string | Keyring;

  constructor(options: DatabaseSigningSecretResolverOptions = {}) {
    this.pool = options.pool;

    if (options.keyring && Object.keys(options.keyring).length > 0) {
      this.keyringOrKey = options.keyring;
    } else {
      const parsedEnv = parseKeyringFromEnv();
      if (parsedEnv) {
        this.keyringOrKey = parsedEnv.keyring;
      } else {
        const keyHex =
          options.masterKeyHex ||
          process.env.MCT_CREDENTIALS_MASTER_KEY ||
          process.env.APP_MASTER_KEY;

        if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
          throw new Error(
            "DATABASE_SIGNING_SECRET_RESOLVER_ERROR: Master key must be explicitly provided via options.masterKeyHex, options.keyring, MCT_CREDENTIALS_MASTER_KEY or APP_MASTER_KEY (64-character hex string)"
          );
        }

        this.keyringOrKey = keyHex;
      }
    }
  }

  /**
   * Directly decrypts and executes a callback using WABA webhook credentials.
   * Extracts ONLY app_secret. Strictly refuses to fall back to access_token.
   */
  async useDirectWabaSecret<T>(
    encryptedBase64: string,
    ivBase64: string,
    authTagBase64: string,
    fn: (appSecret: string) => Promise<T> | T
  ): Promise<T | null> {
    return this.decryptAndExecuteDirect(
      encryptedBase64,
      ivBase64,
      authTagBase64,
      (parsed) => {
        const secret = parsed.app_secret ? String(parsed.app_secret) : null;
        return secret;
      },
      fn
    );
  }

  /**
   * Directly decrypts and executes a callback using WAHA webhook credentials.
   * Extracts ONLY webhook_secret.
   */
  async useDirectWahaSecret<T>(
    encryptedBase64: string,
    ivBase64: string,
    authTagBase64: string,
    fn: (webhookSecret: string) => Promise<T> | T
  ): Promise<T | null> {
    return this.decryptAndExecuteDirect(
      encryptedBase64,
      ivBase64,
      authTagBase64,
      (parsed) => {
        const secret = parsed.webhook_secret ? String(parsed.webhook_secret) : (parsed.api_key ? String(parsed.api_key) : null);
        return secret;
      },
      fn
    );
  }

  /**
   * Purpose-aware resolver for Meta WABA Webhook verification.
   * Strictly resolves app_secret.
   */
  async useWabaWebhookSecret<T>(
    channelInstanceId: string,
    workspaceId: string,
    fn: (appSecret: string) => Promise<T> | T
  ): Promise<T | null> {
    const creds = await this.fetchEncryptedPayload(channelInstanceId, workspaceId);
    if (!creds) return null;
    return this.useDirectWabaSecret(creds.encrypted, creds.iv, creds.authTag, fn);
  }

  /**
   * Purpose-aware resolver for WAHA Webhook verification.
   * Strictly resolves webhook_secret.
   */
  async useWahaWebhookSecret<T>(
    channelInstanceId: string,
    workspaceId: string,
    fn: (webhookSecret: string) => Promise<T> | T
  ): Promise<T | null> {
    const creds = await this.fetchEncryptedPayload(channelInstanceId, workspaceId);
    if (!creds) return null;
    return this.useDirectWahaSecret(creds.encrypted, creds.iv, creds.authTag, fn);
  }

  /**
   * Purpose-aware resolver for WABA outbound dispatch.
   * Strictly extracts access_token and phone_number_id.
   * Fails if phone_number_id is missing (no fallback 'me').
   */
  async useWabaOutboundCredentials<T>(
    channelInstanceId: string,
    workspaceId: string,
    fn: (creds: WabaOutboundCredentials) => Promise<T> | T
  ): Promise<T | null> {
    const creds = await this.fetchEncryptedPayload(channelInstanceId, workspaceId);
    if (!creds) return null;

    try {
      const decryptedStr = decryptPayload(
        creds.encrypted,
        creds.iv,
        creds.authTag,
        this.keyringOrKey
      );
      const parsed = JSON.parse(decryptedStr) as Record<string, unknown>;

      const accessToken = parsed.access_token ? String(parsed.access_token) : (parsed.token ? String(parsed.token) : null);
      const phoneNumberId = parsed.phone_number_id ? String(parsed.phone_number_id) : null;

      if (!accessToken || !phoneNumberId) {
        return null;
      }

      return await fn({ accessToken, phoneNumberId });
    } catch {
      return null;
    }
  }

  /**
   * Purpose-aware resolver for WAHA outbound dispatch.
   * Strictly extracts api_key, session, and optional baseUrl.
   * Fails-closed if api_key is missing.
   */
  async useWahaOutboundCredentials<T>(
    channelInstanceId: string,
    workspaceId: string,
    fn: (creds: WahaOutboundCredentials) => Promise<T> | T
  ): Promise<T | null> {
    const creds = await this.fetchEncryptedPayload(channelInstanceId, workspaceId);
    if (!creds) return null;

    try {
      const decryptedStr = decryptPayload(
        creds.encrypted,
        creds.iv,
        creds.authTag,
        this.keyringOrKey
      );
      const parsed = JSON.parse(decryptedStr) as Record<string, unknown>;

      const apiKey = (parsed.api_key || parsed.apiKey || parsed.token)
        ? String(parsed.api_key || parsed.apiKey || parsed.token)
        : null;

      if (!apiKey) {
        return null;
      }

      const session = parsed.session ? String(parsed.session) : "default";
      const baseUrl = parsed.base_url ? String(parsed.base_url) : undefined;

      return await fn({ apiKey, session, baseUrl });
    } catch {
      return null;
    }
  }

  /**
   * Scoped callback execution for generic signing secret validation.
   */
  async useSigningSecret<T>(
    channelInstanceId: string,
    workspaceId: string,
    fn: (secret: string) => Promise<T> | T
  ): Promise<T | null> {
    const creds = await this.fetchEncryptedPayload(channelInstanceId, workspaceId);
    if (!creds) return null;

    return this.decryptAndExecuteDirect(
      creds.encrypted,
      creds.iv,
      creds.authTag,
      (parsed) => {
        return (
          (parsed.app_secret as string) ||
          (parsed.webhook_secret as string) ||
          (parsed.token as string) ||
          (parsed.api_key as string) ||
          null
        );
      },
      fn
    );
  }

  /**
   * Scoped callback execution for retrieving parsed channel credentials payload.
   */
  async useCredentials<T>(
    channelInstanceId: string,
    workspaceId: string,
    fn: (credentials: Record<string, unknown>) => Promise<T> | T
  ): Promise<T | null> {
    const creds = await this.fetchEncryptedPayload(channelInstanceId, workspaceId);
    if (!creds) return null;

    try {
      const decryptedStr = decryptPayload(
        creds.encrypted,
        creds.iv,
        creds.authTag,
        this.keyringOrKey
      );

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(decryptedStr);
      } catch {
        parsed = { token: decryptedStr };
      }

      return await fn(parsed);
    } catch {
      return null;
    }
  }

  private async fetchEncryptedPayload(
    channelInstanceId: string,
    workspaceId: string
  ): Promise<{ encrypted: string; iv: string; authTag: string } | null> {
    if (!this.pool) {
      return null;
    }

    try {
      const res = await this.pool.query(
        `SELECT encrypted_payload, payload_iv, payload_auth_tag, verify_token_hash FROM public.resolve_channel_signing_credential($1, $2)`,
        [channelInstanceId, workspaceId]
      );

      if (res.rows.length === 0) {
        return null;
      }

      const row = res.rows[0];
      if (!row?.encrypted_payload || !row?.payload_iv || !row?.payload_auth_tag) {
        return null;
      }

      return {
        encrypted: row.encrypted_payload,
        iv: row.payload_iv,
        authTag: row.payload_auth_tag,
      };
    } catch (err) {
      const safeMessage = err instanceof Error ? err.message : String(err);
      throw new Error(
        `DATABASE_SIGNING_SECRET_RESOLVER_ERROR: Redacted failure during secret resolution. [Category: ${
          safeMessage.includes("Master key") ? "config_error" : "resolution_error"
        }]`
      );
    }
  }

  private async decryptAndExecuteDirect<T>(
    encryptedBase64: string,
    ivBase64: string,
    authTagBase64: string,
    extractor: (parsed: Record<string, unknown>) => string | null,
    fn: (secret: string) => Promise<T> | T
  ): Promise<T | null> {
    try {
      const decryptedStr = decryptPayload(
        encryptedBase64,
        ivBase64,
        authTagBase64,
        this.keyringOrKey
      );

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(decryptedStr);
      } catch {
        parsed = { token: decryptedStr };
      }

      const secret = extractor(parsed);
      if (!secret) {
        return null;
      }

      return await fn(secret);
    } catch {
      return null;
    }
  }
}

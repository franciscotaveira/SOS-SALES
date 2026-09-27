import crypto from "node:crypto";
import type { ChannelProvider } from "@sos-sales/contracts";

export interface VerifyWebhookSignatureParams {
  readonly channelInstanceId: string;
  readonly workspaceId: string;
  readonly provider: ChannelProvider;
  readonly rawBody: Buffer | Uint8Array | string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly directCredentials?: {
    readonly encryptedPayload: string;
    readonly payloadIv: string;
    readonly payloadAuthTag: string;
  };
}

export interface SignatureVerificationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface WabaOutboundCredentials {
  readonly accessToken: string;
  readonly phoneNumberId: string;
}

export interface WahaOutboundCredentials {
  readonly apiKey: string;
  readonly session: string;
  readonly baseUrl?: string;
}

/**
 * Internal contract for resolving channel signing credentials within an isolated security boundary.
 * Secrets resolved by this interface MUST NEVER leak to handlers, loggers, or application layers.
 */
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
  useCredentials?<T>(
    channelInstanceId: string,
    workspaceId: string,
    fn: (credentials: Record<string, unknown>) => Promise<T> | T
  ): Promise<T | null>;
}

/**
 * SignatureVerificationService
 *
 * Provides cryptographic validation of incoming webhooks for supported messaging engines.
 * Separately documents and enforces verification schemes:
 * - Meta WABA: HMAC-SHA256 validation (X-Hub-Signature-256) computed against raw byte payload.
 * - WAHA: Constant-time token comparison against configured webhook secret.
 *
 * Guarantee: Decrypted secrets are kept strictly inside the secret resolver's scoped callback
 * and never exposed to handlers, gateways, or loggers.
 */
export class SignatureVerificationService {
  constructor(private readonly secretResolver: ISigningSecretResolver) {}

  async verify(
    params: VerifyWebhookSignatureParams
  ): Promise<SignatureVerificationResult> {
    try {
      const { channelInstanceId, workspaceId, provider, rawBody, headers, directCredentials } =
        params;

      const bodyBuffer = Buffer.isBuffer(rawBody)
        ? rawBody
        : typeof rawBody === "string"
        ? Buffer.from(rawBody, "utf-8")
        : Buffer.from(rawBody);

      let result: SignatureVerificationResult | null = null;

      if (provider === "meta_waba") {
        const verifyFn = (secret: string) => this.verifyMetaWaba(bodyBuffer, headers, secret);
        if (directCredentials && this.secretResolver.useDirectWabaSecret) {
          result = await this.secretResolver.useDirectWabaSecret(
            directCredentials.encryptedPayload,
            directCredentials.payloadIv,
            directCredentials.payloadAuthTag,
            verifyFn
          );
        } else if (this.secretResolver.useWabaWebhookSecret) {
          result = await this.secretResolver.useWabaWebhookSecret(channelInstanceId, workspaceId, verifyFn);
        } else {
          result = await this.secretResolver.useSigningSecret(channelInstanceId, workspaceId, verifyFn);
        }
      } else if (provider === "waha") {
        const verifyFn = (secret: string) => this.verifyWaha(headers, secret);
        if (directCredentials && this.secretResolver.useDirectWahaSecret) {
          result = await this.secretResolver.useDirectWahaSecret(
            directCredentials.encryptedPayload,
            directCredentials.payloadIv,
            directCredentials.payloadAuthTag,
            verifyFn
          );
        } else if (this.secretResolver.useWahaWebhookSecret) {
          result = await this.secretResolver.useWahaWebhookSecret(channelInstanceId, workspaceId, verifyFn);
        } else {
          result = await this.secretResolver.useSigningSecret(channelInstanceId, workspaceId, verifyFn);
        }
      } else if (provider === "evolution") {
        const verifyFn = (secret: string) => this.verifyEvolution(headers, secret);
        result = await this.secretResolver.useSigningSecret(channelInstanceId, workspaceId, verifyFn);
      } else {
        return { valid: false, reason: `unsupported_provider_${provider}` };
      }

      if (!result) {
        return { valid: false, reason: "secret_not_found" };
      }

      return result;
    } catch {
      // Fail-closed: Never crash or expose internal state
      return { valid: false, reason: "verification_exception" };
    }
  }

  /**
   * Meta WABA Signature Verification
   * Header: X-Hub-Signature-256: sha256=<64-char-hex-hmac>
   */
  private verifyMetaWaba(
    bodyBuffer: Buffer,
    headers: Record<string, string | string[] | undefined>,
    appSecret: string
  ): SignatureVerificationResult {
    const rawHeader =
      headers["x-hub-signature-256"] || headers["X-Hub-Signature-256"];
    const signatureHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!signatureHeader || typeof signatureHeader !== "string") {
      return { valid: false, reason: "missing_signature_header" };
    }

    if (!signatureHeader.startsWith("sha256=")) {
      return { valid: false, reason: "malformed_signature_prefix" };
    }

    const signatureHex = signatureHeader.slice("sha256=".length).trim();
    if (!/^[0-9a-fA-F]{64}$/.test(signatureHex)) {
      return { valid: false, reason: "invalid_signature_format" };
    }

    const expectedHmac = crypto
      .createHmac("sha256", appSecret)
      .update(bodyBuffer)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedHmac, "hex");
    const receivedBuffer = Buffer.from(signatureHex, "hex");

    if (expectedBuffer.length !== receivedBuffer.length) {
      return { valid: false, reason: "signature_length_mismatch" };
    }

    const isValid = crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    return { valid: isValid, reason: isValid ? undefined : "signature_mismatch" };
  }

  /**
   * WAHA Token Verification
   * Headers: x-api-key, authorization (Bearer), or x-webhook-secret
   */
  private verifyWaha(
    headers: Record<string, string | string[] | undefined>,
    expectedSecret: string
  ): SignatureVerificationResult {
    const rawHeader =
      headers["x-api-key"] ||
      headers["X-Api-Key"] ||
      headers["x-webhook-secret"] ||
      headers["authorization"] ||
      headers["Authorization"];

    const tokenHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!tokenHeader || typeof tokenHeader !== "string") {
      return { valid: false, reason: "missing_waha_auth_header" };
    }

    const token = tokenHeader.startsWith("Bearer ")
      ? tokenHeader.slice("Bearer ".length).trim()
      : tokenHeader.trim();

    // Constant-time comparison using SHA-256 digests to protect against length leaking
    const expectedDigest = crypto
      .createHash("sha256")
      .update(expectedSecret, "utf-8")
      .digest();
    const receivedDigest = crypto
      .createHash("sha256")
      .update(token, "utf-8")
      .digest();

    const isValid = crypto.timingSafeEqual(expectedDigest, receivedDigest);
    return { valid: isValid, reason: isValid ? undefined : "token_mismatch" };
  }

  /**
   * Evolution API Token Verification
   * Headers: apikey, x-api-key, or authorization (Bearer)
   */
  private verifyEvolution(
    headers: Record<string, string | string[] | undefined>,
    expectedSecret: string
  ): SignatureVerificationResult {
    const rawHeader =
      headers["apikey"] ||
      headers["ApiKey"] ||
      headers["x-api-key"] ||
      headers["X-Api-Key"] ||
      headers["authorization"] ||
      headers["Authorization"];

    const tokenHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!tokenHeader || typeof tokenHeader !== "string") {
      return { valid: false, reason: "missing_evolution_auth_header" };
    }

    const token = tokenHeader.startsWith("Bearer ")
      ? tokenHeader.slice("Bearer ".length).trim()
      : tokenHeader.trim();

    const expectedDigest = crypto
      .createHash("sha256")
      .update(expectedSecret, "utf-8")
      .digest();
    const receivedDigest = crypto
      .createHash("sha256")
      .update(token, "utf-8")
      .digest();

    const isValid = crypto.timingSafeEqual(expectedDigest, receivedDigest);
    return { valid: isValid, reason: isValid ? undefined : "token_mismatch" };
  }
}

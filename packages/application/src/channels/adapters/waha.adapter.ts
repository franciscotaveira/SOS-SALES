import net from "node:net";
import type {
  ChannelSendResult,
  IChannelAdapter,
  OutboundSendParams,
} from "./channel-adapter.interface";
import type { ISigningSecretResolver } from "../services/signature-verification.service";
import {
  validateMediaUrl,
  detectMediaType,
  isBlockedIp,
  hasAlternativeIpFormat,
  getInternalAllowedHosts,
} from "../security/ssrf-guard";
import { parseRetryAfter } from "./meta-waba.adapter";

export const WAHA_MAX_QR_PAYLOAD_BYTES = 512 * 1024; // 512 KB

export interface WahaAdapterOptions {
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
  readonly defaultSession?: string;
  readonly timeoutMs?: number;
  readonly allowLocalTest?: boolean;
}

export interface WahaSessionDetails {
  readonly name: string;
  readonly status: string;
  readonly me?: Record<string, unknown>;
  readonly config?: Record<string, unknown>;
}

export interface WahaQrCodeResult {
  readonly qr?: string;
  readonly raw?: unknown;
  readonly mimeType?: string;
  readonly format?: "json" | "text" | "svg" | "binary";
  readonly dataUri?: string;
}

export interface WahaSessionOperationOptions {
  readonly customBaseUrl?: string;
  readonly signal?: AbortSignal;
}

/**
 * Validates a target WAHA base URL against Server-Side Request Forgery (SSRF).
 * Strictly blocks cloud metadata services, alternative IP representations, embedded user credentials,
 * and requires HTTPS in production while blocking direct private/loopback/link-local IPs.
 */
export function validateWahaBaseUrl(urlStr: string, allowLocalTest = false): string {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`SSRF_VIOLATION: Invalid WAHA baseUrl: '${urlStr}'`);
  }

  // Reject embedded credentials in URL authority
  if (parsed.username || parsed.password) {
    throw new Error("SSRF_VIOLATION: WAHA baseUrl must not contain embedded user credentials");
  }

  const protocol = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();

  // Block alternative or obfuscated IP representations (octal, hex, dword, etc.)
  if (hasAlternativeIpFormat(urlStr) || hasAlternativeIpFormat(host)) {
    throw new Error(`SSRF_VIOLATION: WAHA baseUrl '${urlStr}' uses alternative or obfuscated IP notation`);
  }

  // Unconditional block on cloud metadata IP/names (AWS, GCP, Azure, DigitalOcean)
  if (
    host === "169.254.169.254" ||
    host.startsWith("169.254.") ||
    host === "metadata.google.internal" ||
    host === "metadata" ||
    host === "instance-data"
  ) {
    throw new Error(`SSRF_VIOLATION: Access to cloud metadata service '${host}' is strictly blocked.`);
  }

  // Allow explicit Docker internal infrastructure hostname (e.g. "waha", "sos-sales-waha", "chat-sales-waha")
  const internalAllowed = getInternalAllowedHosts();
  if (internalAllowed.includes(host)) {
    return urlStr.replace(/\/$/, "");
  }

  // In test / lab mode or explicit internal allowlist
  if (allowLocalTest) {
    if (protocol === "http:" || protocol === "https:") {
      return urlStr.replace(/\/$/, "");
    }
  }

  // In production: must be HTTPS
  if (protocol !== "https:") {
    throw new Error(`SSRF_VIOLATION: WAHA baseUrl must use HTTPS. Received '${protocol}' in '${urlStr}'`);
  }

  // In production: block direct IP if in private, loopback, link-local, or reserved range
  const ipVer = net.isIP(host);
  if (ipVer !== 0 && isBlockedIp(host)) {
    throw new Error(`SSRF_VIOLATION: Direct IP '${host}' is in a reserved or private range prohibited in production.`);
  }

  // Block loopback and link-local hostnames in production
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("127.")
  ) {
    throw new Error(`SSRF_VIOLATION: Loopback host '${host}' is prohibited for WAHA destination in production.`);
  }

  return urlStr.replace(/\/$/, "");
}

export class WahaAdapter implements IChannelAdapter {
  public readonly provider = "waha" as const;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly defaultSession: string;
  private readonly timeoutMs: number;
  private readonly allowLocalTest: boolean;

  constructor(options: WahaAdapterOptions = {}) {
    this.allowLocalTest = options.allowLocalTest === true;
    const rawBaseUrl = options.baseUrl || process.env.WAHA_BASE_URL;
    if (!rawBaseUrl || rawBaseUrl.trim() === "") {
      throw new Error(
        "FATAL_CONFIG_ERROR: WAHA_BASE_URL is mandatory when WAHA is enabled (defaulting to localhost is strictly prohibited)"
      );
    }
    this.baseUrl = validateWahaBaseUrl(rawBaseUrl, this.allowLocalTest);
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.defaultSession = options.defaultSession || "default";
    this.timeoutMs = options.timeoutMs || 15_000;
  }

  async sendMessage(
    params: OutboundSendParams,
    secretResolver: ISigningSecretResolver
  ): Promise<ChannelSendResult> {
    // Resolve credentials strictly inside scoped callback
    if (secretResolver.useWahaOutboundCredentials) {
      const result = await secretResolver.useWahaOutboundCredentials(
        params.channelInstanceId,
        params.workspaceId,
        async ({ apiKey, session, baseUrl }) => {
          return this.executeSend(params, apiKey, session, baseUrl);
        }
      );

      if (!result) {
        return {
          success: false,
          category: "permanent",
          errorCode: "CREDENTIALS_NOT_FOUND",
          errorMessage: "Missing required WAHA credentials: api_key is mandatory (fail-closed)",
        };
      }

      return result;
    }

    if (secretResolver.useCredentials) {
      const result = await secretResolver.useCredentials(
        params.channelInstanceId,
        params.workspaceId,
        async (credentials) => {
          const apiKey = (credentials.api_key || credentials.apiKey || credentials.token)
            ? String(credentials.api_key || credentials.apiKey || credentials.token)
            : "";
          const session = credentials.session ? String(credentials.session) : this.defaultSession;
          const baseUrl = credentials.base_url ? String(credentials.base_url) : undefined;

          return this.executeSend(params, apiKey, session, baseUrl);
        }
      );

      return (
        result ?? {
          success: false,
          category: "permanent",
          errorCode: "CREDENTIALS_NOT_FOUND",
          errorMessage: "Failed to resolve WAHA credentials from provider repository",
        }
      );
    }

    return {
      success: false,
      category: "permanent",
      errorCode: "RESOLVER_NOT_CAPABLE",
      errorMessage: "Provided secret resolver does not support WAHA outbound credentials",
    };
  }

  private async withCredentials<T>(
    channelInstanceId: string,
    workspaceId: string,
    secretResolver: ISigningSecretResolver,
    fn: (creds: { apiKey: string; session: string; baseUrl: string }) => Promise<T>
  ): Promise<T> {
    if (secretResolver.useWahaOutboundCredentials) {
      const result = await secretResolver.useWahaOutboundCredentials(
        channelInstanceId,
        workspaceId,
        async ({ apiKey, session, baseUrl }) => {
          if (!apiKey || apiKey.trim() === "") {
            throw new Error("API_KEY_REQUIRED: WAHA API key is strictly required. Unauthenticated operation is prohibited.");
          }
          const effectiveBaseUrl = baseUrl
            ? validateWahaBaseUrl(baseUrl, this.allowLocalTest)
            : this.baseUrl;
          return fn({
            apiKey,
            session: session || this.defaultSession,
            baseUrl: effectiveBaseUrl,
          });
        }
      );
      if (!result) {
        throw new Error("CREDENTIALS_NOT_FOUND: Missing required WAHA credentials");
      }
      return result;
    }

    if (secretResolver.useCredentials) {
      const result = await secretResolver.useCredentials(
        channelInstanceId,
        workspaceId,
        async (credentials) => {
          const apiKey = String(credentials.api_key || credentials.apiKey || credentials.token || "");
          if (!apiKey || apiKey.trim() === "") {
            throw new Error("API_KEY_REQUIRED: WAHA API key is strictly required. Unauthenticated operation is prohibited.");
          }
          const session = credentials.session ? String(credentials.session) : this.defaultSession;
          const baseUrl = credentials.base_url
            ? validateWahaBaseUrl(String(credentials.base_url), this.allowLocalTest)
            : this.baseUrl;
          return fn({ apiKey, session, baseUrl });
        }
      );
      if (!result) {
        throw new Error("CREDENTIALS_NOT_FOUND: Missing required WAHA credentials");
      }
      return result;
    }

    throw new Error("RESOLVER_NOT_CAPABLE: Provided secret resolver does not support WAHA outbound credentials");
  }

  async startSession(
    session: string,
    secretResolver: ISigningSecretResolver,
    workspaceId: string,
    channelInstanceId: string,
    options: WahaSessionOperationOptions = {}
  ): Promise<{ name: string; status: string }> {
    return this.withCredentials(channelInstanceId, workspaceId, secretResolver, async ({ apiKey, baseUrl }) => {
      const targetBaseUrl = options.customBaseUrl
        ? validateWahaBaseUrl(options.customBaseUrl, this.allowLocalTest)
        : baseUrl;

      const endpoint = `${targetBaseUrl}/api/sessions/start`;
      const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
      const combinedSignal = options.signal
        ? AbortSignal.any([timeoutSignal, options.signal])
        : timeoutSignal;

      let response: Response;
      try {
        response = await this.fetchFn(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
          },
          body: JSON.stringify({ name: session }),
          signal: combinedSignal,
        });
      } catch (err) {
        if (options.signal?.aborted) {
          throw new Error(`FENCING_IN_FLIGHT_ABORT: startSession aborted (${err instanceof Error ? err.message : String(err)})`);
        }
        throw new Error(`WAHA_SESSION_ERROR: Network error starting session: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errBody = (await response.json()) as { message?: string };
          if (errBody.message) errMsg = errBody.message;
        } catch {}
        throw new Error(`WAHA_SESSION_ERROR: Failed to start session: ${errMsg}`);
      }

      const body = (await response.json()) as { name?: string; status?: string };
      return {
        name: body.name || session,
        status: body.status || "STARTING",
      };
    });
  }

  async stopSession(
    session: string,
    secretResolver: ISigningSecretResolver,
    workspaceId: string,
    channelInstanceId: string,
    options: WahaSessionOperationOptions = {}
  ): Promise<{ name: string; status: string }> {
    return this.withCredentials(channelInstanceId, workspaceId, secretResolver, async ({ apiKey, baseUrl }) => {
      const targetBaseUrl = options.customBaseUrl
        ? validateWahaBaseUrl(options.customBaseUrl, this.allowLocalTest)
        : baseUrl;

      const endpoint = `${targetBaseUrl}/api/sessions/stop`;
      const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
      const combinedSignal = options.signal
        ? AbortSignal.any([timeoutSignal, options.signal])
        : timeoutSignal;

      let response: Response;
      try {
        response = await this.fetchFn(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
          },
          body: JSON.stringify({ name: session }),
          signal: combinedSignal,
        });
      } catch (err) {
        if (options.signal?.aborted) {
          throw new Error(`FENCING_IN_FLIGHT_ABORT: stopSession aborted (${err instanceof Error ? err.message : String(err)})`);
        }
        throw new Error(`WAHA_SESSION_ERROR: Network error stopping session: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errBody = (await response.json()) as { message?: string };
          if (errBody.message) errMsg = errBody.message;
        } catch {}
        throw new Error(`WAHA_SESSION_ERROR: Failed to stop session: ${errMsg}`);
      }

      const body = (await response.json()) as { name?: string; status?: string };
      return {
        name: body.name || session,
        status: body.status || "STOPPED",
      };
    });
  }

  async getSession(
    session: string,
    secretResolver: ISigningSecretResolver,
    workspaceId: string,
    channelInstanceId: string,
    options: WahaSessionOperationOptions = {}
  ): Promise<WahaSessionDetails> {
    return this.withCredentials(channelInstanceId, workspaceId, secretResolver, async ({ apiKey, baseUrl }) => {
      const targetBaseUrl = options.customBaseUrl
        ? validateWahaBaseUrl(options.customBaseUrl, this.allowLocalTest)
        : baseUrl;

      const endpoint = `${targetBaseUrl}/api/sessions/${session}`;
      const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
      const combinedSignal = options.signal
        ? AbortSignal.any([timeoutSignal, options.signal])
        : timeoutSignal;

      let response: Response;
      try {
        response = await this.fetchFn(endpoint, {
          method: "GET",
          headers: {
            "X-Api-Key": apiKey,
          },
          signal: combinedSignal,
        });
      } catch (err) {
        if (options.signal?.aborted) {
          throw new Error(`FENCING_IN_FLIGHT_ABORT: getSession aborted (${err instanceof Error ? err.message : String(err)})`);
        }
        throw new Error(`WAHA_SESSION_ERROR: Network error getting session: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errBody = (await response.json()) as { message?: string };
          if (errBody.message) errMsg = errBody.message;
        } catch {}
        throw new Error(`WAHA_SESSION_ERROR: Failed to get session: ${errMsg}`);
      }

      const body = (await response.json()) as {
        name?: string;
        status?: string;
        me?: Record<string, unknown>;
        config?: Record<string, unknown>;
      };
      return {
        name: body.name || session,
        status: body.status || "UNKNOWN",
        me: body.me,
        config: body.config,
      };
    });
  }

  async getQrCode(
    session: string,
    secretResolver: ISigningSecretResolver,
    workspaceId: string,
    channelInstanceId: string,
    options: WahaSessionOperationOptions = {}
  ): Promise<WahaQrCodeResult> {
    return this.withCredentials(channelInstanceId, workspaceId, secretResolver, async ({ apiKey, baseUrl }) => {
      const targetBaseUrl = options.customBaseUrl
        ? validateWahaBaseUrl(options.customBaseUrl, this.allowLocalTest)
        : baseUrl;

      const endpoint = `${targetBaseUrl}/api/sessions/${session}/auth/qr`;
      const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
      const combinedSignal = options.signal
        ? AbortSignal.any([timeoutSignal, options.signal])
        : timeoutSignal;

      let response: Response;
      try {
        response = await this.fetchFn(endpoint, {
          method: "GET",
          headers: {
            "X-Api-Key": apiKey,
          },
          signal: combinedSignal,
        });
      } catch (err) {
        if (options.signal?.aborted) {
          throw new Error(`FENCING_IN_FLIGHT_ABORT: getQrCode aborted (${err instanceof Error ? err.message : String(err)})`);
        }
        throw new Error(`WAHA_SESSION_ERROR: Network error getting QR code: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errText = await response.text();
          try {
            const errBody = JSON.parse(errText) as { message?: string };
            if (errBody.message) errMsg = errBody.message;
          } catch {
            if (errText && errText.length < 200) errMsg = errText;
          }
        } catch {}

        if (response.status === 404) {
          throw new Error(`WAHA_SESSION_ERROR: SESSION_NOT_FOUND: Session '${session}' not found or already authenticated (HTTP 404: ${errMsg})`);
        }
        throw new Error(`WAHA_SESSION_ERROR: Failed to get QR code: ${errMsg}`);
      }

      // Check pre-flight Content-Length if present
      const contentLengthHeader = response.headers?.get?.("content-length");
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && contentLength > WAHA_MAX_QR_PAYLOAD_BYTES) {
          throw new Error(
            `WAHA_QR_PAYLOAD_TOO_LARGE: QR code payload (${contentLength} bytes) exceeds maximum allowed limit of ${WAHA_MAX_QR_PAYLOAD_BYTES} bytes`
          );
        }
      }

      // Single read of response body as ArrayBuffer to prevent double-consumption
      let arrayBuffer: ArrayBuffer;
      try {
        if (typeof response.arrayBuffer === "function") {
          arrayBuffer = await response.arrayBuffer();
        } else if (typeof response.text === "function") {
          const text = await response.text();
          const buf = Buffer.from(text, "utf-8");
          arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        } else if (typeof response.json === "function") {
          const jsonVal = await response.json();
          const buf = Buffer.from(JSON.stringify(jsonVal), "utf-8");
          arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        } else {
          throw new Error("Response body is not readable");
        }
      } catch (readErr) {
        throw new Error(`WAHA_SESSION_ERROR: Failed to read QR response body: ${readErr instanceof Error ? readErr.message : String(readErr)}`);
      }

      if (arrayBuffer.byteLength > WAHA_MAX_QR_PAYLOAD_BYTES) {
        throw new Error(
          `WAHA_QR_PAYLOAD_TOO_LARGE: QR code payload (${arrayBuffer.byteLength} bytes) exceeds maximum allowed limit of ${WAHA_MAX_QR_PAYLOAD_BYTES} bytes`
        );
      }

      const rawContentType = response.headers?.get?.("content-type") || "";
      const contentType = rawContentType.toLowerCase().split(";")[0]?.trim() || "";

      // 1. JSON response
      if (contentType === "application/json") {
        const text = new TextDecoder("utf-8").decode(arrayBuffer);
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("WAHA_QR_PARSE_ERROR: Failed to parse JSON response for QR code");
        }
        const qr = (typeof data.qr === "string" ? data.qr : undefined) ||
                   (typeof data.raw === "string" ? data.raw : undefined);
        return {
          qr,
          raw: data,
          mimeType: "application/json",
          format: "json",
        };
      }

      // 2. SVG response
      if (contentType === "image/svg+xml") {
        const text = new TextDecoder("utf-8").decode(arrayBuffer);
        return {
          qr: text,
          raw: text,
          mimeType: "image/svg+xml",
          format: "svg",
          dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(text)}`,
        };
      }

      // 3. Plain text response
      if (contentType === "text/plain") {
        const text = new TextDecoder("utf-8").decode(arrayBuffer);
        // In case server returned JSON with text/plain Content-Type
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === "object") {
            const data = parsed as Record<string, unknown>;
            const qr = (typeof data.qr === "string" ? data.qr : undefined) ||
                       (typeof data.raw === "string" ? data.raw : undefined);
            return {
              qr: qr || text.trim(),
              raw: data,
              mimeType: "application/json",
              format: "json",
            };
          }
        } catch {}
        return {
          qr: text.trim(),
          raw: text,
          mimeType: "text/plain",
          format: "text",
        };
      }

      // 4. Binary Image (PNG / JPEG / WebP)
      if (contentType === "image/png" || contentType === "image/jpeg" || contentType === "image/webp") {
        const buffer = Buffer.from(arrayBuffer);
        const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;
        return {
          qr: dataUri,
          raw: buffer,
          mimeType: contentType,
          format: "binary",
          dataUri,
        };
      }

      // 5. Missing Content-Type: sniff magic bytes / text
      if (!contentType) {
        // Inspect magic bytes for PNG: 89 50 4E 47 0D 0A 1A 0A
        const uint8 = new Uint8Array(arrayBuffer);
        const isPng = uint8.length >= 8 &&
          uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4E && uint8[3] === 0x47 &&
          uint8[4] === 0x0D && uint8[5] === 0x0A && uint8[6] === 0x1A && uint8[7] === 0x0A;
        if (isPng) {
          const buffer = Buffer.from(arrayBuffer);
          const dataUri = `data:image/png;base64,${buffer.toString("base64")}`;
          return {
            qr: dataUri,
            raw: buffer,
            mimeType: "image/png",
            format: "binary",
            dataUri,
          };
        }

        // Try decoding as text
        const text = new TextDecoder("utf-8").decode(arrayBuffer);
        if (text.startsWith("<svg") || text.includes("<svg")) {
          return {
            qr: text,
            raw: text,
            mimeType: "image/svg+xml",
            format: "svg",
            dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(text)}`,
          };
        }
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === "object") {
            const data = parsed as Record<string, unknown>;
            const qr = (typeof data.qr === "string" ? data.qr : undefined) ||
                       (typeof data.raw === "string" ? data.raw : undefined);
            return {
              qr,
              raw: data,
              mimeType: "application/json",
              format: "json",
            };
          }
        } catch {}
        return {
          qr: text.trim(),
          raw: text,
          mimeType: "text/plain",
          format: "text",
        };
      }

      // 6. Unsupported binary/unknown content type
      throw new Error(`WAHA_UNSUPPORTED_QR_FORMAT: Unsupported binary QR code format '${contentType}'`);
    });
  }

  private async executeSend(
    params: OutboundSendParams,
    apiKey: string,
    session: string,
    customBaseUrl?: string
  ): Promise<ChannelSendResult> {
    // P0: Fail-closed if API key is missing
    if (!apiKey || apiKey.trim() === "") {
      return {
        success: false,
        category: "permanent",
        errorCode: "API_KEY_REQUIRED",
        errorMessage: "WAHA API key is strictly required. Unauthenticated dispatch is prohibited.",
      };
    }

    // Validate customBaseUrl if provided against SSRF
    let targetBaseUrl = this.baseUrl;
    if (customBaseUrl) {
      try {
        targetBaseUrl = validateWahaBaseUrl(customBaseUrl, this.allowLocalTest);
      } catch (ssrfErr) {
        return {
          success: false,
          category: "permanent",
          errorCode: "SSRF_VALIDATION_FAILED",
          errorMessage: ssrfErr instanceof Error ? ssrfErr.message : "SSRF validation failed",
        };
      }
    }

    // Format phone to WAHA chatId (e.g. +5511999999999 -> 5511999999999@c.us)
    const cleanDigits = params.recipientE164.replace(/\D/g, "");
    const chatId = `${cleanDigits}@c.us`;

    let endpoint = `${targetBaseUrl}/api/sendText`;
    let payload: Record<string, unknown>;

    if (params.mediaUrl) {
      try {
        validateMediaUrl(params.mediaUrl, { allowLocalTest: this.allowLocalTest });
      } catch (mediaErr: unknown) {
        return {
          success: false,
          category: "permanent",
          errorCode: "INVALID_MEDIA_URL",
          errorMessage: mediaErr instanceof Error ? mediaErr.message : "Media URL validation failed",
        };
      }

      const mediaType = detectMediaType(params.mediaUrl);
      if (mediaType === "video") {
        endpoint = `${targetBaseUrl}/api/sendVideo`;
      } else if (mediaType === "audio") {
        endpoint = `${targetBaseUrl}/api/sendVoice`;
      } else if (mediaType === "document") {
        endpoint = `${targetBaseUrl}/api/sendFile`;
      } else {
        endpoint = `${targetBaseUrl}/api/sendImage`;
      }

      payload = {
        chatId,
        file: {
          url: params.mediaUrl,
        },
        caption: params.body || undefined,
        session,
      };
    } else {
      payload = {
        chatId,
        text: params.body,
        session,
      };
    }

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const combinedSignal = params.signal
      ? AbortSignal.any([timeoutSignal, params.signal])
      : timeoutSignal;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      };

      const response = await this.fetchFn(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: combinedSignal,
      });

      if (response.ok) {
        const body = (await response.json()) as { id?: string };
        const externalMessageId = body.id;
        if (!externalMessageId) {
          return {
            success: false,
            category: "ambiguous",
            errorCode: "EMPTY_MESSAGE_ID",
            errorMessage: "WAHA returned 200 OK without a message id",
          };
        }

        return {
          success: true,
          externalMessageId,
          sentAt: new Date(),
        };
      }

      // Handle HTTP error responses
      let errorBody: { message?: string } = {};
      try {
        errorBody = (await response.json()) as typeof errorBody;
      } catch {
        // non-json response
      }

      const errorMessage =
        errorBody.message || `WAHA error with HTTP ${response.status}`;

      // Respect Retry-After header on 429 (numeric or HTTP-date, capped)
      const retryAfterSeconds = parseRetryAfter(response.headers?.get?.("retry-after"));

      if (response.status === 429) {
        return {
          success: false,
          category: "transient",
          errorCode: "429",
          errorMessage,
          retryAfterSeconds,
        };
      }

      if (response.status === 408 || response.status === 425) {
        return {
          success: false,
          category: "ambiguous",
          errorCode: `HTTP_${response.status}`,
          errorMessage: `Ambiguous server status: ${response.status} ${errorMessage}`,
        };
      }

      // 404: Session not found / disconnected
      if (response.status === 404) {
        return {
          success: false,
          category: "permanent",
          errorCode: "SESSION_NOT_FOUND",
          errorMessage,
        };
      }

      // 502, 503, 504: Container restarting or proxy error (Transient)
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        return {
          success: false,
          category: "transient",
          errorCode: `HTTP_${response.status}`,
          errorMessage,
        };
      }

      // Other 4xx client errors (Permanent)
      if (response.status >= 400 && response.status < 500) {
        return {
          success: false,
          category: "permanent",
          errorCode: `HTTP_${response.status}`,
          errorMessage,
        };
      }

      return {
        success: false,
        category: "transient",
        errorCode: `HTTP_${response.status}`,
        errorMessage,
      };
    } catch (err: unknown) {
      if (params.signal?.aborted) {
        throw new Error(
          `FENCING_IN_FLIGHT_ABORT: Dispatch aborted in-flight due to lease loss or cancellation (${err instanceof Error ? err.message : String(err)})`
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        category: "ambiguous",
        errorCode: "NETWORK_TIMEOUT",
        errorMessage: `Network error or timeout during WAHA dispatch: ${message}`,
      };
    }
  }
}

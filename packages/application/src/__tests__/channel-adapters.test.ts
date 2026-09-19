import { describe, expect, it } from "vitest";
import {
  ChannelAdapterRegistry,
  MetaWabaAdapter,
  WahaAdapter,
  validateWahaBaseUrl,
  WAHA_MAX_QR_PAYLOAD_BYTES,
  type ISigningSecretResolver,
  type OutboundSendParams,
} from "../index";

describe("Channel Adapters and Registry", () => {
  const dummyParams: OutboundSendParams = {
    workspaceId: "00000000-0000-0000-0000-000000000001",
    channelInstanceId: "00000000-0000-0000-0000-000000000002",
    commandId: "00000000-0000-0000-0000-000000000003",
    messageId: "00000000-0000-0000-0000-000000000004",
    recipientE164: "+5511999998888",
    body: "Olá, sua proposta está pronta!",
    idempotencyKey: "test-idemp-key-123",
    lastInboundMessageAt: new Date(),
  };

  const mockSecretResolver: ISigningSecretResolver = {
    async useSigningSecret<T>(
      _channelInstanceId: string,
      _workspaceId: string,
      fn: (secret: string) => Promise<T> | T
    ): Promise<T | null> {
      return await fn("test-signing-secret");
    },
    async useWabaOutboundCredentials<T>(
      _channelInstanceId: string,
      _workspaceId: string,
      fn: (creds: { accessToken: string; phoneNumberId: string }) => Promise<T> | T
    ): Promise<T | null> {
      return await fn({
        accessToken: "EAAB_test_access_token_123",
        phoneNumberId: "123456789012345",
      });
    },
    async useWahaOutboundCredentials<T>(
      _channelInstanceId: string,
      _workspaceId: string,
      fn: (creds: { apiKey: string; session: string; baseUrl?: string }) => Promise<T> | T
    ): Promise<T | null> {
      return await fn({
        apiKey: "waha_api_key_789",
        session: "test-session",
        baseUrl: "http://waha.internal:3000",
      });
    },
  };

  describe("ChannelAdapterRegistry", () => {
    it("should register and retrieve adapters by provider name", () => {
      const registry = new ChannelAdapterRegistry();
      const metaAdapter = new MetaWabaAdapter();
      const wahaAdapter = new WahaAdapter({ baseUrl: "https://waha.example.com" });

      registry.register(metaAdapter);
      registry.register(wahaAdapter);

      expect(registry.has("meta_waba")).toBe(true);
      expect(registry.has("waha")).toBe(true);
      expect(registry.has("evolution")).toBe(false);

      expect(registry.get("meta_waba")).toBe(metaAdapter);
      expect(registry.get("waha")).toBe(wahaAdapter);
    });

    it("should throw a clear error when requesting an unregistered provider", () => {
      const registry = new ChannelAdapterRegistry();
      expect(() => registry.get("unknown_provider")).toThrowError(
        "CHANNEL_ADAPTER_NOT_FOUND: No registered channel adapter for provider 'unknown_provider'"
      );
    });

    it("should reject duplicate provider registration", () => {
      const registry = new ChannelAdapterRegistry();
      registry.register(new MetaWabaAdapter());
      expect(() => registry.register(new MetaWabaAdapter())).toThrowError(
        "ADAPTER_ALREADY_REGISTERED: Adapter for provider 'meta_waba' is already registered"
      );
    });
  });

  describe("MetaWabaAdapter", () => {
    it("should dispatch text message successfully when Meta Graph API returns 200 OK", async () => {
      let interceptedUrl = "";
      let interceptedHeaders: Record<string, string> = {};
      let interceptedBody: unknown = null;

      const mockFetch: typeof fetch = async (input, init) => {
        interceptedUrl = String(input);
        interceptedHeaders = (init?.headers as Record<string, string>) || {};
        interceptedBody = JSON.parse(String(init?.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messaging_product: "whatsapp",
            messages: [{ id: "wamid.HBgLMTIzNDU2" }],
          }),
        } as unknown as Response;
      };

      const adapter = new MetaWabaAdapter({
        baseUrl: "https://mock.graph.facebook.com/v21.0",
        fetchFn: mockFetch,
      });

      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.externalMessageId).toBe("wamid.HBgLMTIzNDU2");
        expect(result.sentAt).toBeInstanceOf(Date);
      }

      expect(interceptedUrl).toBe("https://mock.graph.facebook.com/v21.0/123456789012345/messages");
      expect(interceptedHeaders["Authorization"]).toBe("Bearer EAAB_test_access_token_123");
      expect(interceptedHeaders["Content-Type"]).toBe("application/json");
      expect(interceptedBody).toEqual({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "+5511999998888",
        type: "text",
        text: { preview_url: false, body: "Olá, sua proposta está pronta!" },
      });
    });

    it("should distinguish PDF as document (NOT treated as image)", async () => {
      let interceptedBody: unknown = null;

      const mockFetch: typeof fetch = async (_input, init) => {
        interceptedBody = JSON.parse(String(init?.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messages: [{ id: "wamid.DOC_123" }],
          }),
        } as unknown as Response;
      };

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });
      const docParams = {
        ...dummyParams,
        mediaUrl: "https://example.com/proposal.pdf",
      };

      const result = await adapter.sendMessage(docParams, mockSecretResolver);
      expect(result.success).toBe(true);
      expect(interceptedBody).toEqual({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "+5511999998888",
        type: "document",
        document: {
          link: "https://example.com/proposal.pdf",
          caption: "Olá, sua proposta está pronta!",
          filename: "proposal.pdf",
        },
      });
    });

    it("should extract filename from document URL containing query parameters", async () => {
      let interceptedBody: unknown = null;
      const mockFetch: typeof fetch = async (_input, init) => {
        interceptedBody = JSON.parse(String(init?.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: "wamid.DOC_QUERY_123" }] }),
        } as unknown as Response;
      };

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });
      const docParams = {
        ...dummyParams,
        mediaUrl: "https://example.com/contracts/termo_adesao.pdf?token=xyz123&v=2",
      };

      const result = await adapter.sendMessage(docParams, mockSecretResolver);
      expect(result.success).toBe(true);
      expect((interceptedBody as Record<string, Record<string, unknown>>)?.document?.filename).toBe(
        "termo_adesao.pdf"
      );
    });

    it("should validate media in template header components against SSRF", async () => {
      let fetchCalled = false;
      const mockFetch: typeof fetch = async () => {
        fetchCalled = true;
        return {} as Response;
      };

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });
      const ssrfTemplateParams: OutboundSendParams = {
        ...dummyParams,
        template: {
          name: "welcome_campaign",
          language: "pt_BR",
          components: [
            {
              type: "header",
              parameters: [
                {
                  type: "image",
                  image: {
                    link: "http://169.254.169.254/latest/meta-data", // Cloud metadata IP
                  },
                },
              ],
            },
          ],
        },
      };

      const result = await adapter.sendMessage(ssrfTemplateParams, mockSecretResolver);

      expect(fetchCalled).toBe(false);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("permanent");
        expect(result.errorCode).toBe("INVALID_MEDIA_URL");
        expect(result.errorMessage).toContain("Template header media URL rejected by SSRF guard");
      }
    });

    it("should resolve inbound mediaId to authenticated download URL via getMediaUrl", async () => {
      let interceptedUrl = "";
      let interceptedHeaders: Record<string, string> = {};

      const mockFetch: typeof fetch = async (input, init) => {
        interceptedUrl = String(input);
        interceptedHeaders = (init?.headers as Record<string, string>) || {};
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messaging_product: "whatsapp",
            url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=109283746501928",
            mime_type: "image/jpeg",
            sha256: "01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b",
            file_size: 65432,
            id: "109283746501928",
          }),
        } as unknown as Response;
      };

      const adapter = new MetaWabaAdapter({
        baseUrl: "https://graph.facebook.com/v21.0",
        fetchFn: mockFetch,
      });

      const mediaMetadata = await adapter.getMediaMetadata(
        "109283746501928",
        mockSecretResolver,
        dummyParams.workspaceId,
        dummyParams.channelInstanceId
      );

      expect(interceptedUrl).toBe("https://graph.facebook.com/v21.0/109283746501928");
      expect(interceptedHeaders["Authorization"]).toBe("Bearer EAAB_test_access_token_123");
      expect(mediaMetadata.id).toBe("109283746501928");
      expect(mediaMetadata.url).toBe(
        "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=109283746501928"
      );
      expect(mediaMetadata.mimeType).toBe("image/jpeg");
      expect(mediaMetadata.fileSize).toBe(65432);

      const downloadUrl = await adapter.getMediaUrl(
        "109283746501928",
        mockSecretResolver,
        dummyParams.workspaceId,
        dummyParams.channelInstanceId
      );
      expect(downloadUrl).toBe(
        "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=109283746501928"
      );
    });

    it("should reject non-numeric or empty mediaId in getMediaUrl", async () => {
      const adapter = new MetaWabaAdapter();

      await expect(
        adapter.getMediaUrl(
          "",
          mockSecretResolver,
          dummyParams.workspaceId,
          dummyParams.channelInstanceId
        )
      ).rejects.toThrow(/INVALID_MEDIA_ID/);

      await expect(
        adapter.getMediaUrl(
          "invalid-alpha-id",
          mockSecretResolver,
          dummyParams.workspaceId,
          dummyParams.channelInstanceId
        )
      ).rejects.toThrow(/INVALID_MEDIA_ID/);
    });

    it("should throw WABA_MEDIA_RESOLUTION_FAILED when Meta returns 404 for expired media", async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 404,
          json: async () => ({
            error: { message: "Media not found or has expired" },
          }),
        } as unknown as Response);

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });

      await expect(
        adapter.getMediaUrl(
          "999999999999",
          mockSecretResolver,
          dummyParams.workspaceId,
          dummyParams.channelInstanceId
        )
      ).rejects.toThrow("WABA_MEDIA_RESOLUTION_FAILED: Meta API returned Media not found or has expired");
    });

    it("should rethrow FENCING_IN_FLIGHT_ABORT when dispatch is aborted by worker heartbeat signal", async () => {
      const abortController = new AbortController();
      abortController.abort(new Error("Lease ownership lost to concurrent worker"));

      const mockFetch: typeof fetch = async () => {
        throw new Error("This operation was aborted");
      };

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });

      await expect(
        adapter.sendMessage(
          { ...dummyParams, signal: abortController.signal },
          mockSecretResolver
        )
      ).rejects.toThrow(/FENCING_IN_FLIGHT_ABORT/);
    });

    it("should classify Meta error 131026 as permanent undeliverable failure", async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: 131026,
              message: "Message undeliverable: Recipient is not a valid WhatsApp user",
            },
          }),
        } as unknown as Response);

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("permanent");
        expect(result.errorCode).toBe("131026");
        expect(result.errorMessage).toContain("Message undeliverable");
      }
    });

    it("should classify Meta error 132000 as permanent template not found", async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: 132000,
              message: "Template does not exist in the specified language",
            },
          }),
        } as unknown as Response);

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });
      const result = await adapter.sendMessage(
        {
          ...dummyParams,
          template: { name: "unknown_tmpl", language: "pt_BR" },
        },
        mockSecretResolver
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("permanent");
        expect(result.errorCode).toBe("132000");
      }
    });

    it("should classify Meta error 190 as permanent invalid access token", async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 401,
          json: async () => ({
            error: {
              code: 190,
              message: "Invalid OAuth access token - Cannot parse access token",
            },
          }),
        } as unknown as Response);

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("permanent");
        expect(result.errorCode).toBe("190");
      }
    });

    it("should classify HTTP 503 as transient server error", async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 503,
          json: async () => ({
            error: { message: "Service Temporarily Unavailable" },
          }),
        } as unknown as Response);

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("transient");
        expect(result.errorCode).toBe("HTTP_503");
      }
    });

    it("should classify 200 OK with empty message id as ambiguous EMPTY_MESSAGE_ID", async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            messaging_product: "whatsapp",
            messages: [], // empty messages
          }),
        } as unknown as Response);

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("ambiguous");
        expect(result.errorCode).toBe("EMPTY_MESSAGE_ID");
      }
    });

    it("should classify HTTP 408 as ambiguous server timeout", async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 408,
          json: async () => ({
            error: { message: "Request Timeout" },
          }),
        } as unknown as Response);

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("ambiguous");
        expect(result.errorCode).toBe("HTTP_408");
      }
    });

    it("should dispatch template messages properly", async () => {
      let interceptedBody: unknown = null;

      const mockFetch: typeof fetch = async (_input, init) => {
        interceptedBody = JSON.parse(String(init?.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messages: [{ id: "wamid.TMPL_123" }],
          }),
        } as unknown as Response;
      };

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });
      const templateParams: OutboundSendParams = {
        ...dummyParams,
        template: {
          name: "order_confirmation",
          language: "pt_BR",
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: "Francisco" }],
            },
          ],
        },
      };

      const result = await adapter.sendMessage(templateParams, mockSecretResolver);
      expect(result.success).toBe(true);
      expect(interceptedBody).toEqual({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "+5511999998888",
        type: "template",
        template: {
          name: "order_confirmation",
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: "Francisco" }],
            },
          ],
        },
      });
    });

    it("should reject free-form text message outside 24h window before external send", async () => {
      const adapter = new MetaWabaAdapter();
      const expiredParams: OutboundSendParams = {
        ...dummyParams,
        lastInboundMessageAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
      };

      const result = await adapter.sendMessage(expiredParams, mockSecretResolver);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("permanent");
        expect(result.errorCode).toBe("OUTSIDE_24H_WINDOW_ERROR");
      }
    });

    it("should reject free-form text message when 24h window is unknown (null/absent)", async () => {
      const adapter = new MetaWabaAdapter();
      const unknownParams: OutboundSendParams = {
        ...dummyParams,
        lastInboundMessageAt: null,
      };

      const result = await adapter.sendMessage(unknownParams, mockSecretResolver);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("permanent");
        expect(result.errorCode).toBe("OUTSIDE_24H_WINDOW_ERROR");
      }
    });

    it("should fail when phone_number_id is missing or falls back to me", async () => {
      const brokenResolver: ISigningSecretResolver = {
        useSigningSecret: async () => null,
        useWabaOutboundCredentials: async (_c, _w, fn) => {
          return await fn({ accessToken: "valid_token", phoneNumberId: "" });
        },
      };

      const adapter = new MetaWabaAdapter();
      const result = await adapter.sendMessage(dummyParams, brokenResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("permanent");
        expect(result.errorCode).toBe("INVALID_PHONE_NUMBER_ID");
      }
    });

    it("should classify code 130429 or HTTP 429 as transient failure and parse Retry-After", async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "60" }),
          json: async () => ({
            error: { code: 130429, message: "Rate limit hit" },
          }),
        } as unknown as Response);

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("transient");
        expect(result.errorCode).toBe("130429");
        expect(result.retryAfterSeconds).toBe(60);
      }
    });

    it("should classify fetch network timeout or abort as ambiguous failure", async () => {
      const mockFetch: typeof fetch = async () => {
        throw new Error("fetch failed: ECONNRESET");
      };

      const adapter = new MetaWabaAdapter({ fetchFn: mockFetch });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("ambiguous");
        expect(result.errorCode).toBe("NETWORK_TIMEOUT");
        expect(result.errorMessage).toContain("ECONNRESET");
      }
    });
  });

  describe("WahaAdapter", () => {
    it("should block cloud metadata IP unconditionally (SSRF protection)", () => {
      expect(() => {
        validateWahaBaseUrl("http://169.254.169.254/latest/meta-data");
      }).toThrowError("SSRF_VIOLATION");

      expect(() => {
        validateWahaBaseUrl("http://metadata.google.internal/computeMetadata/v1");
      }).toThrowError("SSRF_VIOLATION");
    });

    it("should reject WAHA baseUrl containing embedded credentials", () => {
      expect(() => {
        validateWahaBaseUrl("https://admin:secret@waha.example.com/api");
      }).toThrowError("SSRF_VIOLATION: WAHA baseUrl must not contain embedded user credentials");
    });

    it("should reject WAHA baseUrl with alternative or obfuscated IP format", () => {
      expect(() => {
        validateWahaBaseUrl("http://0177.0.0.1:3000", true);
      }).toThrowError("SSRF_VIOLATION: WAHA baseUrl 'http://0177.0.0.1:3000' uses alternative or obfuscated IP notation");

      expect(() => {
        validateWahaBaseUrl("http://2130706433:3000", true);
      }).toThrowError("SSRF_VIOLATION: WAHA baseUrl 'http://2130706433:3000' uses alternative or obfuscated IP notation");
    });

    it("should reject WAHA baseUrl with direct private/reserved IP in production", () => {
      // 10.0.0.1 RFC 1918 in production (allowLocalTest: false)
      expect(() => {
        validateWahaBaseUrl("https://10.0.0.1:3000", false);
      }).toThrowError("SSRF_VIOLATION: Direct IP '10.0.0.1' is in a reserved or private range prohibited in production.");

      // 192.168.1.1 RFC 1918 in production
      expect(() => {
        validateWahaBaseUrl("https://192.168.1.1:3000", false);
      }).toThrowError("SSRF_VIOLATION: Direct IP '192.168.1.1' is in a reserved or private range prohibited in production.");
    });

    it("should fail-closed when API key is missing without making network request", async () => {
      let fetchCalled = false;
      const mockFetch: typeof fetch = async () => {
        fetchCalled = true;
        return {} as Response;
      };

      const emptyKeyResolver: ISigningSecretResolver = {
        useSigningSecret: async () => null,
        useWahaOutboundCredentials: async (_c, _w, fn) => {
          return await fn({ apiKey: "", session: "default" });
        },
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.sendMessage(dummyParams, emptyKeyResolver);

      expect(fetchCalled).toBe(false);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("permanent");
        expect(result.errorCode).toBe("API_KEY_REQUIRED");
      }
    });

    it("should dispatch text message successfully to validated WAHA endpoint", async () => {
      let interceptedUrl = "";
      let interceptedHeaders: Record<string, string> = {};
      let interceptedBody: unknown = null;

      const mockFetch: typeof fetch = async (input, init) => {
        interceptedUrl = String(input);
        interceptedHeaders = (init?.headers as Record<string, string>) || {};
        interceptedBody = JSON.parse(String(init?.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "true_5511999998888@c.us_3EB012345678",
            timestamp: 1711234567,
          }),
        } as unknown as Response;
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.externalMessageId).toBe("true_5511999998888@c.us_3EB012345678");
        expect(result.sentAt).toBeInstanceOf(Date);
      }

      expect(interceptedUrl).toBe("http://waha.internal:3000/api/sendText");
      expect(interceptedHeaders["X-Api-Key"]).toBe("waha_api_key_789");
      expect(interceptedBody).toEqual({
        chatId: "5511999998888@c.us",
        text: "Olá, sua proposta está pronta!",
        session: "test-session",
      });
    });

    it("should route media messages to dedicated WAHA endpoints instead of only /sendImage", async () => {
      const interceptedEndpoints: string[] = [];

      const mockFetch: typeof fetch = async (input) => {
        interceptedEndpoints.push(String(input));
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "msg-media-123", timestamp: 123456789 }),
        } as unknown as Response;
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });

      // Image
      await adapter.sendMessage(
        { ...dummyParams, mediaUrl: "https://example.com/photo.jpg" },
        mockSecretResolver
      );
      expect(interceptedEndpoints.at(-1)).toBe("http://waha.internal:3000/api/sendImage");

      // Video
      await adapter.sendMessage(
        { ...dummyParams, mediaUrl: "https://example.com/video.mp4" },
        mockSecretResolver
      );
      expect(interceptedEndpoints.at(-1)).toBe("http://waha.internal:3000/api/sendVideo");

      // Voice
      await adapter.sendMessage(
        { ...dummyParams, mediaUrl: "https://example.com/audio.ogg" },
        mockSecretResolver
      );
      expect(interceptedEndpoints.at(-1)).toBe("http://waha.internal:3000/api/sendVoice");

      // File / Document
      await adapter.sendMessage(
        { ...dummyParams, mediaUrl: "https://example.com/contract.pdf" },
        mockSecretResolver
      );
      expect(interceptedEndpoints.at(-1)).toBe("http://waha.internal:3000/api/sendFile");
    });

    it("should parse Retry-After on WAHA 429 rate limit", async () => {
      const mockFetch: typeof fetch = async () => ({
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "120" }),
        json: async () => ({ message: "Too many requests" }),
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("transient");
        expect(result.retryAfterSeconds).toBe(120);
      }
    });

    it("should classify 404 session not found as permanent failure", async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 404,
          json: async () => ({ message: "Session 'test-session' not found or logged out" }),
        } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("permanent");
        expect(result.errorCode).toBe("SESSION_NOT_FOUND");
      }
    });

    it("should classify network timeout as ambiguous failure", async () => {
      const mockFetch: typeof fetch = async () => {
        throw new Error("The operation was aborted due to timeout");
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("ambiguous");
        expect(result.errorCode).toBe("NETWORK_TIMEOUT");
      }
    });

    it("should classify empty message ID in 200 response as ambiguous", async () => {
      const mockFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("ambiguous");
        expect(result.errorCode).toBe("EMPTY_MESSAGE_ID");
      }
    });

    it("should re-throw FENCING_IN_FLIGHT_ABORT when params.signal was aborted during dispatch", async () => {
      const abortController = new AbortController();
      const mockFetch: typeof fetch = async () => {
        abortController.abort();
        throw new Error("AbortError: Operation aborted");
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      await expect(
        adapter.sendMessage(
          { ...dummyParams, signal: abortController.signal },
          mockSecretResolver
        )
      ).rejects.toThrow("FENCING_IN_FLIGHT_ABORT");
    });

    it("should classify HTTP 408 / 425 as ambiguous server status", async () => {
      const mockFetch: typeof fetch = async () => ({
        ok: false,
        status: 408,
        json: async () => ({ message: "Request Timeout" }),
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("ambiguous");
        expect(result.errorCode).toBe("HTTP_408");
      }
    });

    it("should classify HTTP 502/503/504 as transient server error", async () => {
      const mockFetch: typeof fetch = async () => ({
        ok: false,
        status: 503,
        json: async () => ({ message: "Service Unavailable" }),
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.sendMessage(dummyParams, mockSecretResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("transient");
        expect(result.errorCode).toBe("HTTP_503");
      }
    });

    it("should reject customBaseUrl if it violates SSRF guard", async () => {
      const customSsrfResolver: ISigningSecretResolver = {
        useSigningSecret: async () => null,
        useWahaOutboundCredentials: async (_c, _w, fn) => {
          return await fn({
            apiKey: "waha_api_key_789",
            session: "test-session",
            baseUrl: "http://169.254.169.254/latest/meta-data",
          });
        },
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", allowLocalTest: true });
      const result = await adapter.sendMessage(dummyParams, customSsrfResolver);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe("permanent");
        expect(result.errorCode).toBe("SSRF_VALIDATION_FAILED");
      }
    });

    it("should successfully start a session via startSession", async () => {
      let interceptedEndpoint = "";
      let interceptedBody: unknown = null;
      let interceptedHeaders: Record<string, string> = {};

      const mockFetch: typeof fetch = async (input, init) => {
        interceptedEndpoint = String(input);
        interceptedHeaders = (init?.headers as Record<string, string>) || {};
        interceptedBody = JSON.parse(String(init?.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ name: "test-session", status: "WORKING" }),
        } as unknown as Response;
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.startSession(
        "test-session",
        mockSecretResolver,
        dummyParams.workspaceId,
        dummyParams.channelInstanceId
      );

      expect(result).toEqual({ name: "test-session", status: "WORKING" });
      expect(interceptedEndpoint).toBe("http://waha.internal:3000/api/sessions/start");
      expect(interceptedHeaders["X-Api-Key"]).toBe("waha_api_key_789");
      expect(interceptedBody).toEqual({ name: "test-session" });
    });

    it("should throw WAHA_SESSION_ERROR if startSession returns non-200", async () => {
      const mockFetch: typeof fetch = async () => ({
        ok: false,
        status: 500,
        json: async () => ({ message: "Internal server error" }),
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      await expect(
        adapter.startSession(
          "test-session",
          mockSecretResolver,
          dummyParams.workspaceId,
          dummyParams.channelInstanceId
        )
      ).rejects.toThrow("WAHA_SESSION_ERROR: Failed to start session: Internal server error");
    });

    it("should re-throw FENCING_IN_FLIGHT_ABORT if startSession signal was aborted", async () => {
      const abortController = new AbortController();
      const mockFetch: typeof fetch = async () => {
        abortController.abort();
        throw new Error("AbortError");
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      await expect(
        adapter.startSession(
          "test-session",
          mockSecretResolver,
          dummyParams.workspaceId,
          dummyParams.channelInstanceId,
          { signal: abortController.signal }
        )
      ).rejects.toThrow("FENCING_IN_FLIGHT_ABORT");
    });

    it("should successfully stop a session via stopSession", async () => {
      let interceptedEndpoint = "";
      const mockFetch: typeof fetch = async (input) => {
        interceptedEndpoint = String(input);
        return {
          ok: true,
          status: 200,
          json: async () => ({ name: "test-session", status: "STOPPED" }),
        } as unknown as Response;
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.stopSession(
        "test-session",
        mockSecretResolver,
        dummyParams.workspaceId,
        dummyParams.channelInstanceId
      );

      expect(result).toEqual({ name: "test-session", status: "STOPPED" });
      expect(interceptedEndpoint).toBe("http://waha.internal:3000/api/sessions/stop");
    });

    it("should re-throw FENCING_IN_FLIGHT_ABORT if stopSession signal was aborted", async () => {
      const abortController = new AbortController();
      const mockFetch: typeof fetch = async () => {
        abortController.abort();
        throw new Error("AbortError");
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      await expect(
        adapter.stopSession(
          "test-session",
          mockSecretResolver,
          dummyParams.workspaceId,
          dummyParams.channelInstanceId,
          { signal: abortController.signal }
        )
      ).rejects.toThrow("FENCING_IN_FLIGHT_ABORT");
    });

    it("should successfully get session details via getSession", async () => {
      let interceptedEndpoint = "";
      const mockFetch: typeof fetch = async (input) => {
        interceptedEndpoint = String(input);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: "test-session",
            status: "WORKING",
            me: { id: "5511999998888@c.us" },
            config: { proxy: null },
          }),
        } as unknown as Response;
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.getSession(
        "test-session",
        mockSecretResolver,
        dummyParams.workspaceId,
        dummyParams.channelInstanceId
      );

      expect(result.name).toBe("test-session");
      expect(result.status).toBe("WORKING");
      expect(result.me).toEqual({ id: "5511999998888@c.us" });
      expect(interceptedEndpoint).toBe("http://waha.internal:3000/api/sessions/test-session");
    });

    it("should re-throw FENCING_IN_FLIGHT_ABORT if getSession signal was aborted", async () => {
      const abortController = new AbortController();
      const mockFetch: typeof fetch = async () => {
        abortController.abort();
        throw new Error("AbortError");
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      await expect(
        adapter.getSession(
          "test-session",
          mockSecretResolver,
          dummyParams.workspaceId,
          dummyParams.channelInstanceId,
          { signal: abortController.signal }
        )
      ).rejects.toThrow("FENCING_IN_FLIGHT_ABORT");
    });

    it("should successfully get session QR code via getQrCode", async () => {
      let interceptedEndpoint = "";
      const mockFetch: typeof fetch = async (input) => {
        interceptedEndpoint = String(input);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          arrayBuffer: async () => Buffer.from(JSON.stringify({ qr: "2@abc123xyz...", raw: "2@abc123xyz..." })),
          json: async () => ({ qr: "2@abc123xyz...", raw: "2@abc123xyz..." }),
        } as unknown as Response;
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.getQrCode(
        "test-session",
        mockSecretResolver,
        dummyParams.workspaceId,
        dummyParams.channelInstanceId
      );

      expect(result.qr).toBe("2@abc123xyz...");
      expect(interceptedEndpoint).toBe("http://waha.internal:3000/api/sessions/test-session/auth/qr");
    });

    it("should re-throw FENCING_IN_FLIGHT_ABORT if getQrCode signal was aborted", async () => {
      const abortController = new AbortController();
      const mockFetch: typeof fetch = async () => {
        abortController.abort();
        throw new Error("AbortError");
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      await expect(
        adapter.getQrCode(
          "test-session",
          mockSecretResolver,
          dummyParams.workspaceId,
          dummyParams.channelInstanceId,
          { signal: abortController.signal }
        )
      ).rejects.toThrow("FENCING_IN_FLIGHT_ABORT");
    });

    it("should parse QR JSON response with qr field", async () => {
      const mockFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        arrayBuffer: async () => Buffer.from(JSON.stringify({ qr: "2@qr_json_123" })),
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.getQrCode(
        "test-session",
        mockSecretResolver,
        dummyParams.workspaceId,
        dummyParams.channelInstanceId
      );

      expect(result.format).toBe("json");
      expect(result.mimeType).toBe("application/json");
      expect(result.qr).toBe("2@qr_json_123");
    });

    it("should parse QR JSON response with only raw field", async () => {
      const mockFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        arrayBuffer: async () => Buffer.from(JSON.stringify({ raw: "2@qr_raw_only" })),
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.getQrCode(
        "test-session",
        mockSecretResolver,
        dummyParams.workspaceId,
        dummyParams.channelInstanceId
      );

      expect(result.format).toBe("json");
      expect(result.qr).toBe("2@qr_raw_only");
    });

    it("should parse QR in plain text (text/plain)", async () => {
      const mockFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/plain; charset=utf-8" }),
        arrayBuffer: async () => Buffer.from("2@plain_text_qr_code"),
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.getQrCode(
        "test-session",
        mockSecretResolver,
        dummyParams.workspaceId,
        dummyParams.channelInstanceId
      );

      expect(result.format).toBe("text");
      expect(result.mimeType).toBe("text/plain");
      expect(result.qr).toBe("2@plain_text_qr_code");
    });

    it("should parse QR in SVG format (image/svg+xml)", async () => {
      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#000"/></svg>';
      const mockFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/svg+xml" }),
        arrayBuffer: async () => Buffer.from(svgContent),
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.getQrCode(
        "test-session",
        mockSecretResolver,
        dummyParams.workspaceId,
        dummyParams.channelInstanceId
      );

      expect(result.format).toBe("svg");
      expect(result.mimeType).toBe("image/svg+xml");
      expect(result.qr).toBe(svgContent);
      expect(result.dataUri).toContain("data:image/svg+xml;utf8,");
    });

    it("should parse binary PNG QR into base64 dataUri", async () => {
      const pngBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
      const mockFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: async () => pngBytes,
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.getQrCode(
        "test-session",
        mockSecretResolver,
        dummyParams.workspaceId,
        dummyParams.channelInstanceId
      );

      expect(result.format).toBe("binary");
      expect(result.mimeType).toBe("image/png");
      expect(result.qr).toContain("data:image/png;base64,");
      expect(result.dataUri).toContain("data:image/png;base64,");
    });

    it("should reject unsupported binary format with typed error WAHA_UNSUPPORTED_QR_FORMAT", async () => {
      const mockFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/octet-stream" }),
        arrayBuffer: async () => Buffer.from([0x01, 0x02, 0x03]),
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      await expect(
        adapter.getQrCode(
          "test-session",
          mockSecretResolver,
          dummyParams.workspaceId,
          dummyParams.channelInstanceId
        )
      ).rejects.toThrow("WAHA_UNSUPPORTED_QR_FORMAT");
    });

    it("should sniff PNG, SVG and text format when Content-Type header is missing", async () => {
      const pngBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x11, 0x22]);

      // Sniff PNG
      const pngFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: async () => pngBytes,
      } as unknown as Response);
      const pngAdapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: pngFetch, allowLocalTest: true });
      const pngRes = await pngAdapter.getQrCode("s", mockSecretResolver, dummyParams.workspaceId, dummyParams.channelInstanceId);
      expect(pngRes.format).toBe("binary");

      // Sniff SVG
      const svgFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: async () => Buffer.from("<svg>...</svg>"),
      } as unknown as Response);
      const svgAdapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: svgFetch, allowLocalTest: true });
      const svgRes = await svgAdapter.getQrCode("s", mockSecretResolver, dummyParams.workspaceId, dummyParams.channelInstanceId);
      expect(svgRes.format).toBe("svg");

      // Sniff plain text
      const textFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: async () => Buffer.from("raw-qr-code-sniffed"),
      } as unknown as Response);
      const textAdapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: textFetch, allowLocalTest: true });
      const textRes = await textAdapter.getQrCode("s", mockSecretResolver, dummyParams.workspaceId, dummyParams.channelInstanceId);
      expect(textRes.format).toBe("text");
      expect(textRes.qr).toBe("raw-qr-code-sniffed");
    });

    it("should reject QR payload exceeding maximum allowed limit", async () => {
      // Pre-flight content-length header
      const headerFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-length": "600000" }),
      } as unknown as Response);
      const adapter1 = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: headerFetch, allowLocalTest: true });
      await expect(
        adapter1.getQrCode("s", mockSecretResolver, dummyParams.workspaceId, dummyParams.channelInstanceId)
      ).rejects.toThrow("WAHA_QR_PAYLOAD_TOO_LARGE");

      // Body size exceeding WAHA_MAX_QR_PAYLOAD_BYTES
      const bigBuffer = Buffer.alloc(WAHA_MAX_QR_PAYLOAD_BYTES + 10);
      const bodyFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/plain" }),
        arrayBuffer: async () => bigBuffer,
      } as unknown as Response);
      const adapter2 = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: bodyFetch, allowLocalTest: true });
      await expect(
        adapter2.getQrCode("s", mockSecretResolver, dummyParams.workspaceId, dummyParams.channelInstanceId)
      ).rejects.toThrow("WAHA_QR_PAYLOAD_TOO_LARGE");
    });

    it("should consume response body exactly once without double-consumption bug", async () => {
      let readCount = 0;
      const mockFetch: typeof fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/plain" }),
        arrayBuffer: async () => {
          readCount++;
          if (readCount > 1) throw new TypeError("Body has already been consumed");
          return Buffer.from("single-consumption-qr");
        },
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      const result = await adapter.getQrCode("s", mockSecretResolver, dummyParams.workspaceId, dummyParams.channelInstanceId);

      expect(readCount).toBe(1);
      expect(result.qr).toBe("single-consumption-qr");
    });

    it("should handle 404 response indicating session not found or already paired", async () => {
      const mockFetch: typeof fetch = async () => ({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: "Session not found" }),
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      await expect(
        adapter.getQrCode("missing-session", mockSecretResolver, dummyParams.workspaceId, dummyParams.channelInstanceId)
      ).rejects.toThrow("SESSION_NOT_FOUND");
    });

    it("should fail-closed if API key is missing or empty in getQrCode without network request and without leaking credentials", async () => {
      let networkCalled = false;
      const mockFetch: typeof fetch = async () => {
        networkCalled = true;
        return {} as Response;
      };

      const emptyApiKeyResolver: ISigningSecretResolver = {
        useSigningSecret: async () => null,
        useWahaOutboundCredentials: async (_c, _w, fn) => {
          return await fn({ apiKey: "   ", session: "s" });
        },
      };

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      await expect(
        adapter.getQrCode("s", emptyApiKeyResolver, dummyParams.workspaceId, dummyParams.channelInstanceId)
      ).rejects.toThrow("API_KEY_REQUIRED");

      expect(networkCalled).toBe(false);
    });

    it("should not leak API key, QR payload or secrets in error messages", async () => {
      const secretApiKey = "SUPER_SECRET_WAHA_KEY_XYZ123";
      const sensitiveResolver: ISigningSecretResolver = {
        useSigningSecret: async () => null,
        useWahaOutboundCredentials: async (_c, _w, fn) => {
          return await fn({ apiKey: secretApiKey, session: "s" });
        },
      };

      const mockFetch: typeof fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ message: "Internal server crash" }),
      } as unknown as Response);

      const adapter = new WahaAdapter({ baseUrl: "http://waha.internal:3000", fetchFn: mockFetch, allowLocalTest: true });
      try {
        await adapter.getQrCode("s", sensitiveResolver, dummyParams.workspaceId, dummyParams.channelInstanceId);
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain(secretApiKey);
        expect(message).toContain("Internal server crash");
      }
    });
  });
});



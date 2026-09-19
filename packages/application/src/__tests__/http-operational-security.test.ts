import http from "node:http";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import {
  MetaWabaAdapter,
  WahaAdapter,
  isBlockedIpv4,
  isBlockedIpv6,
  isBlockedIp,
  hasAlternativeIpFormat,
  safeFetchWithSsrfGuard,
  validateMediaUrl,
  downloadMediaStream,
  downloadMediaToStream,
  verifyMediaMagicBytes,
  detectMediaTypeFromMime,
  DEFAULT_ALLOWED_MIME_TYPES,
  type ISigningSecretResolver,
  type OutboundSendParams,
} from "../index";

describe("HTTP Operational Security & Real Server Verification", () => {
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;

  let requestHeadersCaptured: Record<string, string | string[] | undefined> = {};
  let requestBodyCaptured: string = "";
  let requestPathCaptured: string = "";

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requestHeadersCaptured = req.headers;
      requestPathCaptured = req.url || "/";
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });

      req.on("end", () => {
        requestBodyCaptured = body;

        // Route: Timeout simulation
        if (req.url?.includes("/timeout")) {
          // Do not send response to force client timeout
          return;
        }

        // Route: Socket destroy simulation (accepted by server, then connection drops)
        if (req.url?.includes("/socket-drop")) {
          // Sever connection abruptly without HTTP response
          req.socket.destroy();
          return;
        }

        // Route: Redirect to forbidden internal target
        if (req.url?.includes("/redirect-to-loopback")) {
          res.writeHead(302, { Location: "http://127.0.0.1/internal-status" });
          res.end();
          return;
        }

        // Route: Redirect to cloud metadata
        if (req.url?.includes("/redirect-to-metadata")) {
          res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" });
          res.end();
          return;
        }

        // Route: Retry-After HTTP-Date header
        if (req.url?.includes("/rate-limit-http-date")) {
          const futureDate = new Date(Date.now() + 120 * 1000).toUTCString();
          res.writeHead(429, {
            "Content-Type": "application/json",
            "Retry-After": futureDate,
          });
          res.end(JSON.stringify({ error: { code: 130429, message: "Rate limit exceeded" } }));
          return;
        }

        // Route: Standard success echo
        if (req.url?.includes("/messages") || req.url?.includes("/api/sendText")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              messaging_product: "whatsapp",
              messages: [{ id: "wamid.REAL_HTTP_123" }],
              id: "true_5511999998888@c.us_REAL_123",
              timestamp: Date.now(),
            })
          );
          return;
        }

        // Route: Safe Media Downloader Endpoints
        if (req.url?.includes("/media/valid-png")) {
          const pngBytes = Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
          ]);
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": String(pngBytes.length),
          });
          res.end(pngBytes);
          return;
        }

        if (req.url?.includes("/media/valid-jpeg")) {
          const jpegBytes = Buffer.from([
            0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
          ]);
          res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Content-Length": String(jpegBytes.length),
          });
          res.end(jpegBytes);
          return;
        }

        if (req.url?.includes("/media/valid-pdf")) {
          const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
          res.writeHead(200, {
            "Content-Type": "application/pdf",
            "Content-Length": String(pdfBytes.length),
          });
          res.end(pdfBytes);
          return;
        }

        if (req.url?.includes("/media/valid-ogg")) {
          const oggBytes = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00]);
          res.writeHead(200, {
            "Content-Type": "audio/ogg",
            "Content-Length": String(oggBytes.length),
          });
          res.end(oggBytes);
          return;
        }

        if (req.url?.includes("/media/oversized-content-length")) {
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": "50000000",
          });
          res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
          return;
        }

        if (req.url?.includes("/media/oversized-stream")) {
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Transfer-Encoding": "chunked",
          });
          // Send initial chunk with valid PNG magic bytes (32 bytes)
          res.write(
            Buffer.from([
              0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
              0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
              0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
              0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
            ])
          );
          // Send multiple large chunks to exceed 16KB limit immediately
          const chunk = Buffer.alloc(16384, 0xaa);
          for (let i = 0; i < 10; i++) {
            res.write(chunk);
          }
          res.end();
          return;
        }

        if (req.url?.includes("/media/mime-spoof-html")) {
          res.writeHead(200, { "Content-Type": "image/png" });
          res.end("<!DOCTYPE html><html><head><script>alert('pwn')</script></head><body>fake</body></html>");
          return;
        }

        if (req.url?.includes("/media/mime-spoof-exe")) {
          const exeBytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
          res.writeHead(200, { "Content-Type": "image/jpeg" });
          res.end(exeBytes);
          return;
        }

        if (req.url?.includes("/media/mime-mismatch")) {
          res.writeHead(200, { "Content-Type": "image/jpeg" });
          res.end("totally not a jpeg header here at all");
          return;
        }

        if (req.url?.includes("/media/disallowed-mime")) {
          res.writeHead(200, { "Content-Type": "application/x-shockwave-flash" });
          res.end("flash");
          return;
        }

        if (req.url?.includes("/media/redirect-valid")) {
          res.writeHead(302, { Location: `${serverUrl}/media/valid-png` });
          res.end();
          return;
        }

        if (req.url?.includes("/media/redirect-metadata")) {
          res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" });
          res.end();
          return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  });

  const dummyParams: OutboundSendParams = {
    workspaceId: "00000000-0000-0000-0000-000000000001",
    channelInstanceId: "00000000-0000-0000-0000-000000000002",
    commandId: "00000000-0000-0000-0000-000000000003",
    messageId: "00000000-0000-0000-0000-000000000004",
    recipientE164: "+5511999998888",
    body: "Operational verification payload",
    idempotencyKey: "op-idemp-123",
    lastInboundMessageAt: new Date(),
  };

  const secretResolver: ISigningSecretResolver = {
    async useSigningSecret<T>(_c: string, _w: string, fn: (s: string) => Promise<T> | T) {
      return await fn("test-signing-secret");
    },
    async useWabaOutboundCredentials<T>(_c: string, _w: string, fn: (creds: any) => Promise<T> | T) {
      return await fn({ accessToken: "real_bearer_token_abc", phoneNumberId: "9876543210123" });
    },
    async useWahaOutboundCredentials<T>(_c: string, _w: string, fn: (creds: any) => Promise<T> | T) {
      return await fn({ apiKey: "real_waha_key_xyz", session: "main-session", baseUrl: serverUrl });
    },
  };

  describe("Real Fake HTTP Server Tests", () => {
    it("should verify real HTTP headers sent by MetaWabaAdapter", async () => {
      const adapter = new MetaWabaAdapter({
        baseUrl: serverUrl,
      });

      const res = await adapter.sendMessage(dummyParams, secretResolver);
      expect(res.success).toBe(true);

      // Verify real headers received by server
      expect(requestHeadersCaptured["authorization"]).toBe("Bearer real_bearer_token_abc");
      expect(requestHeadersCaptured["content-type"]).toBe("application/json");
      expect(requestPathCaptured).toBe("/9876543210123/messages");

      const parsedBody = JSON.parse(requestBodyCaptured);
      expect(parsedBody.to).toBe("+5511999998888");
      expect(parsedBody.messaging_product).toBe("whatsapp");
    });

    it("should verify real HTTP headers sent by WahaAdapter", async () => {
      const adapter = new WahaAdapter({
        baseUrl: serverUrl,
        allowLocalTest: true,
      });

      const res = await adapter.sendMessage(dummyParams, secretResolver);
      expect(res.success).toBe(true);

      expect(requestHeadersCaptured["x-api-key"]).toBe("real_waha_key_xyz");
      expect(requestHeadersCaptured["content-type"]).toBe("application/json");
      expect(requestPathCaptured).toBe("/api/sendText");

      const parsedBody = JSON.parse(requestBodyCaptured);
      expect(parsedBody.chatId).toBe("5511999998888@c.us");
      expect(parsedBody.session).toBe("main-session");
    });

    it("should classify real HTTP timeout as ambiguous failure without crashing", async () => {
      const adapter = new MetaWabaAdapter({
        baseUrl: `${serverUrl}/timeout`,
        timeoutMs: 500, // short timeout for testing
      });

      const res = await adapter.sendMessage(dummyParams, secretResolver);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.category).toBe("ambiguous");
        expect(res.errorCode).toBe("NETWORK_TIMEOUT");
        expect(res.errorMessage).toMatch(/timeout|abort/i);
      }
    });

    it("should classify abrupt socket termination (socket-drop) as ambiguous failure", async () => {
      const adapter = new MetaWabaAdapter({
        baseUrl: `${serverUrl}/socket-drop`,
      });

      const res = await adapter.sendMessage(dummyParams, secretResolver);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.category).toBe("ambiguous");
        expect(res.errorCode).toBe("NETWORK_TIMEOUT");
        expect(res.errorMessage).toMatch(/socket|ECONNRESET|fetch failed/i);
      }
    });

    it("should parse Retry-After HTTP-date header and compute delta seconds", async () => {
      const adapter = new MetaWabaAdapter({
        baseUrl: `${serverUrl}/rate-limit-http-date`,
      });

      const res = await adapter.sendMessage(dummyParams, secretResolver);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.category).toBe("transient");
        expect(res.retryAfterSeconds).toBeDefined();
        // The server set futureDate to +120s
        expect(res.retryAfterSeconds).toBeGreaterThanOrEqual(115);
        expect(res.retryAfterSeconds).toBeLessThanOrEqual(125);
      }
    });

    it("should block HTTP redirect to loopback address (SSRF protection)", async () => {
      await expect(
        safeFetchWithSsrfGuard(`${serverUrl}/redirect-to-loopback`, {}, {
          maxRedirects: 3,
        })
      ).rejects.toThrow(/SSRF_VIOLATION/);
    });

    it("should block HTTP redirect to cloud metadata address (SSRF protection)", async () => {
      await expect(
        safeFetchWithSsrfGuard(`${serverUrl}/redirect-to-metadata`, {}, {
          maxRedirects: 3,
        })
      ).rejects.toThrow(/SSRF_VIOLATION/);
    });
  });

  describe("SSRF Hardening: DNS, IPv4, IPv6, Metadata & Alternative Notations", () => {
    it("should block IPv4 loopback, private, link-local, and broadcast", () => {
      expect(isBlockedIpv4("127.0.0.1")).toBe(true);
      expect(isBlockedIpv4("127.255.255.254")).toBe(true);
      expect(isBlockedIpv4("10.0.0.1")).toBe(true);
      expect(isBlockedIpv4("192.168.1.1")).toBe(true);
      expect(isBlockedIpv4("172.16.0.1")).toBe(true);
      expect(isBlockedIpv4("172.31.255.255")).toBe(true);
      expect(isBlockedIpv4("169.254.169.254")).toBe(true);
      expect(isBlockedIpv4("0.0.0.0")).toBe(true);
      expect(isBlockedIpv4("255.255.255.255")).toBe(true);
    });

    it("should block IPv6 loopback, link-local, unique local, and unspecified", () => {
      expect(isBlockedIpv6("::1")).toBe(true);
      expect(isBlockedIpv6("::")).toBe(true);
      expect(isBlockedIpv6("fe80::1")).toBe(true);
      expect(isBlockedIpv6("fc00::1")).toBe(true);
      expect(isBlockedIpv6("fd00::1234")).toBe(true);
    });

    it("should block IPv4-mapped IPv6 addresses for private destinations", () => {
      expect(isBlockedIpv6("::ffff:127.0.0.1")).toBe(true);
      expect(isBlockedIpv6("::ffff:10.0.0.1")).toBe(true);
      expect(isBlockedIpv6("::ffff:169.254.169.254")).toBe(true);
      expect(isBlockedIpv6("::ffff:192.168.0.1")).toBe(true);
    });

    it("should block alternative IP representations (decimal, octal, hex)", async () => {
      // 2130706433 is 127.0.0.1 in integer decimal
      await expect(
        safeFetchWithSsrfGuard("http://2130706433:8080/path")
      ).rejects.toThrow(/SSRF_VIOLATION/);

      // 0177.0.0.1 is 127.0.0.1 in octal notation
      await expect(
        safeFetchWithSsrfGuard("http://0177.0.0.1:8080/path")
      ).rejects.toThrow(/SSRF_VIOLATION/);

      // 0x7f.0.0.1 is 127.0.0.1 in hex notation
      await expect(
        safeFetchWithSsrfGuard("http://0x7f000001:8080/path")
      ).rejects.toThrow(/SSRF_VIOLATION/);
    });

    it("should block Carrier-Grade NAT (RFC 6598) and Benchmarking (RFC 2544) IPv4 ranges", () => {
      // CGNAT: 100.64.0.0/10 (100.64.0.0 to 100.127.255.255)
      expect(isBlockedIpv4("100.64.0.1")).toBe(true);
      expect(isBlockedIpv4("100.100.50.1")).toBe(true);
      expect(isBlockedIpv4("100.127.255.254")).toBe(true);
      // Non-CGNAT 100.x addresses should not be blocked
      expect(isBlockedIpv4("100.63.255.255")).toBe(false);
      expect(isBlockedIpv4("100.128.0.1")).toBe(false);

      // Benchmarking: 198.18.0.0/15 (198.18.0.0 to 198.19.255.255)
      expect(isBlockedIpv4("198.18.0.1")).toBe(true);
      expect(isBlockedIpv4("198.19.255.254")).toBe(true);
      expect(isBlockedIpv4("198.20.0.1")).toBe(false);

      // IETF Protocol: 192.0.0.0/24
      expect(isBlockedIpv4("192.0.0.1")).toBe(true);
      expect(isBlockedIpv4("192.0.1.1")).toBe(false);
    });

    it("should block IPv4/IPv6 translation (RFC 6052) and Documentation (RFC 3849)", () => {
      expect(isBlockedIpv6("64:ff9b::192.0.2.1")).toBe(true);
      expect(isBlockedIpv6("64:ff9b:1::1")).toBe(true);
      expect(isBlockedIpv6("2001:db8::1234")).toBe(true);
      expect(isBlockedIpv6("2001:20::abcd")).toBe(true);
    });

    it("should detect URL-encoded and mixed alternative IP notations", () => {
      expect(hasAlternativeIpFormat("2130706433")).toBe(true);
      expect(hasAlternativeIpFormat("0177.0.0.1")).toBe(true);
      expect(hasAlternativeIpFormat("0x7f000001")).toBe(true);
      expect(hasAlternativeIpFormat("%30%78%37%66%2e%30%2e%30%2e%31")).toBe(true);
      expect(hasAlternativeIpFormat("https://cdn.example.com/photo.jpg")).toBe(false);
    });

    it("should validate media URLs to reject private/loopback destinations and non-https", () => {
      // Non-https
      expect(() => validateMediaUrl("http://example.com/image.png")).toThrow(
        /INSECURE_MEDIA_URL/
      );

      // Loopback in media URL
      expect(() => validateMediaUrl("https://127.0.0.1/secret.pdf")).toThrow(
        /SSRF_VIOLATION/
      );

      // Metadata in media URL
      expect(() => validateMediaUrl("https://169.254.169.254/secret.pdf")).toThrow(
        /SSRF_VIOLATION/
      );

      // Valid public HTTPS media URL
      expect(validateMediaUrl("https://cdn.example.com/documents/contract.pdf")).toBe(
        "https://cdn.example.com/documents/contract.pdf"
      );
    });
  });

  describe("Safe Media Downloader & Stream Piping (Real HTTP Server)", () => {
    it("should download valid PNG and verify size, mediaType, and SHA-256", async () => {
      const result = await downloadMediaStream(`${serverUrl}/media/valid-png`, {
        allowLocalTest: true,
      });

      expect(result.mimeType).toBe("image/png");
      expect(result.mediaType).toBe("image");
      expect(result.sizeBytes).toBe(32);
      expect(result.buffer.length).toBe(32);
      expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should download valid JPEG, PDF, and OGG audio with verified magic bytes", async () => {
      const jpegRes = await downloadMediaStream(`${serverUrl}/media/valid-jpeg`, {
        allowLocalTest: true,
      });
      expect(jpegRes.mimeType).toBe("image/jpeg");
      expect(jpegRes.mediaType).toBe("image");
      expect(jpegRes.sizeBytes).toBeGreaterThan(0);

      const pdfRes = await downloadMediaStream(`${serverUrl}/media/valid-pdf`, {
        allowLocalTest: true,
      });
      expect(pdfRes.mimeType).toBe("application/pdf");
      expect(pdfRes.mediaType).toBe("document");

      const oggRes = await downloadMediaStream(`${serverUrl}/media/valid-ogg`, {
        allowLocalTest: true,
      });
      expect(oggRes.mimeType).toBe("audio/ogg");
      expect(oggRes.mediaType).toBe("audio");
    });

    it("should fail-closed immediately if Content-Length exceeds maxSizeBytes before reading body", async () => {
      await expect(
        downloadMediaStream(`${serverUrl}/media/oversized-content-length`, {
          allowLocalTest: true,
          maxSizeBytes: 1024, // 1 KB limit, server claims 50 MB
        })
      ).rejects.toThrow(/MEDIA_SIZE_LIMIT_EXCEEDED/);
    });

    it("should abort streaming download immediately when received bytes exceed maxSizeBytes", async () => {
      // Server sends large chunks exceeding limit
      await expect(
        downloadMediaStream(`${serverUrl}/media/oversized-stream`, {
          allowLocalTest: true,
          maxSizeBytes: 16384, // 16 KB limit
        })
      ).rejects.toThrow(/MEDIA_SIZE_LIMIT_EXCEEDED/);
    });

    it("should block HTML / script disguised as PNG (MIME-confusion attack)", async () => {
      await expect(
        downloadMediaStream(`${serverUrl}/media/mime-spoof-html`, {
          allowLocalTest: true,
        })
      ).rejects.toThrow(/DANGEROUS_MEDIA_TYPE_BLOCKED/);
    });

    it("should block executable Windows PE (MZ header) disguised as JPEG", async () => {
      await expect(
        downloadMediaStream(`${serverUrl}/media/mime-spoof-exe`, {
          allowLocalTest: true,
        })
      ).rejects.toThrow(/DANGEROUS_MEDIA_TYPE_BLOCKED/);
    });

    it("should reject payload where magic bytes mismatch declared MIME type", async () => {
      await expect(
        downloadMediaStream(`${serverUrl}/media/mime-mismatch`, {
          allowLocalTest: true,
        })
      ).rejects.toThrow(/INVALID_MEDIA_SIGNATURE/);
    });

    it("should reject disallowed MIME type outside allowlist", async () => {
      await expect(
        downloadMediaStream(`${serverUrl}/media/disallowed-mime`, {
          allowLocalTest: true,
        })
      ).rejects.toThrow(/INVALID_MIME_TYPE/);
    });

    it("should follow safe HTTP 302 redirects to valid media destination", async () => {
      const res = await downloadMediaStream(`${serverUrl}/media/redirect-valid`, {
        allowLocalTest: true,
      });
      expect(res.mimeType).toBe("image/png");
      expect(res.sizeBytes).toBe(32);
    });

    it("should block HTTP redirect to cloud metadata service during media download", async () => {
      await expect(
        downloadMediaStream(`${serverUrl}/media/redirect-metadata`, {
          allowLocalTest: true,
        })
      ).rejects.toThrow(/SSRF_VIOLATION/);
    });

    it("should download directly to a Writable destination stream without buffering in memory", async () => {
      const chunksWritten: Buffer[] = [];
      const destinationStream = new Writable({
        write(chunk, _encoding, callback) {
          chunksWritten.push(Buffer.from(chunk));
          callback();
        },
      });

      const summary = await downloadMediaToStream(
        `${serverUrl}/media/valid-png`,
        destinationStream,
        { allowLocalTest: true }
      );

      expect(summary.mimeType).toBe("image/png");
      expect(summary.mediaType).toBe("image");
      expect(summary.sizeBytes).toBe(32);
      expect(summary.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Buffer.concat(chunksWritten).length).toBe(32);
    });

    it("should test helper functions isBlockedIp, verifyMediaMagicBytes, and detectMediaTypeFromMime", () => {
      expect(isBlockedIp("127.0.0.1")).toBe(true);
      expect(isBlockedIp("8.8.8.8")).toBe(false);
      expect(DEFAULT_ALLOWED_MIME_TYPES.has("image/jpeg")).toBe(true);
      expect(detectMediaTypeFromMime("image/png")).toBe("image");
      expect(detectMediaTypeFromMime("application/pdf")).toBe("document");
      expect(detectMediaTypeFromMime("audio/ogg")).toBe("audio");
      expect(detectMediaTypeFromMime("video/mp4")).toBe("video");

      // Valid magic bytes verify without throwing
      const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(() => verifyMediaMagicBytes(validPng, "image/png")).not.toThrow();

      // Magic bytes mismatch throws
      expect(() => verifyMediaMagicBytes(validPng, "image/jpeg")).toThrow(/INVALID_MEDIA_SIGNATURE/);
    });
  });
});

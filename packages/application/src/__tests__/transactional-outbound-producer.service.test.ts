import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import type { PublicOutboundRequest, TrustedOutboundContext } from "@sos-sales/contracts";
import {
  TransactionalOutboundProducerService,
  computeOutboundPayloadFingerprint,
  isFingerprintMatch,
  OutboundProducerValidationError,
} from "../index";


describe("TransactionalOutboundProducerService (CH-11 Application & Security)", () => {
  const workspaceId = crypto.randomUUID();
  const channelInstanceId = crypto.randomUUID();
  const actorId = crypto.randomUUID();

  const trustedContext: TrustedOutboundContext = {
    workspaceId,
    channelInstanceId,
    actorId,
    role: "operator",
    permissions: ["cockpit:send_message"],
    ipAddress: "203.0.113.10",
    userAgent: "Mozilla/5.0 Test",
  };

  describe("1. Deterministic Canonical Payload Fingerprint", () => {
    it("should produce a 64-character lowercase hex SHA-256 digest", () => {
      const request: PublicOutboundRequest = {
        recipientPhoneE164: "+5511999990001",
        contentType: "text",
        body: "Hello World",
        idempotencyKey: "test-idemp-1",
      };

      const fingerprint = computeOutboundPayloadFingerprint(request, trustedContext);
      expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should produce identical fingerprints regardless of template component key ordering", () => {
      const requestA: PublicOutboundRequest = {
        recipientPhoneE164: "+5511999990001",
        contentType: "template",
        body: "Template text",
        template: {
          name: "order_confirmation",
          language: "pt_BR",
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: "12345",
                  sub_type: "order_id",
                },
              ],
            },
          ],
        },
        idempotencyKey: "template-idemp",
      };

      // Permuted key orders
      const requestB: PublicOutboundRequest = {
        recipientPhoneE164: "+5511999990001",
        contentType: "template",
        body: "Template text",
        template: {
          language: "pt_BR",
          name: "order_confirmation",
          components: [
            {
              parameters: [
                {
                  sub_type: "order_id",
                  text: "12345",
                  type: "text",
                },
              ],
              type: "body",
            },
          ],
        },
        idempotencyKey: "template-idemp",
      };

      const fpA = computeOutboundPayloadFingerprint(requestA, trustedContext);
      const fpB = computeOutboundPayloadFingerprint(requestB, trustedContext);

      expect(fpA).toBe(fpB);
      expect(isFingerprintMatch(fpA, fpB)).toBe(true);
    });

    it("should produce different fingerprints when contentType differs", () => {
      const requestText: PublicOutboundRequest = {
        recipientPhoneE164: "+5511999990001",
        contentType: "text",
        body: "Common body",
        idempotencyKey: "key-123",
      };

      const requestImage: PublicOutboundRequest = {
        recipientPhoneE164: "+5511999990001",
        contentType: "image",
        body: "Common body",
        mediaUrl: "https://example.com/image.jpg",
        idempotencyKey: "key-123",
      };

      const fpText = computeOutboundPayloadFingerprint(requestText, trustedContext);
      const fpImage = computeOutboundPayloadFingerprint(requestImage, trustedContext);

      expect(fpText).not.toBe(fpImage);
      expect(isFingerprintMatch(fpText, fpImage)).toBe(false);
    });

    it("should normalize NFKC and trim whitespace in body and phones", () => {
      const requestRaw: PublicOutboundRequest = {
        recipientPhoneE164: "+5511999990001",
        contentType: "text",
        body: "  Hello \u0041\u030A  ", // A with ring (composite)
        idempotencyKey: "norm-key",
      };

      const requestNormalized: PublicOutboundRequest = {
        recipientPhoneE164: "+5511999990001",
        contentType: "text",
        body: "Hello \u00C5", // Å (normalized single codepoint)
        idempotencyKey: "norm-key",
      };

      const fpRaw = computeOutboundPayloadFingerprint(requestRaw, trustedContext);
      const fpNorm = computeOutboundPayloadFingerprint(requestNormalized, trustedContext);
      expect(fpRaw).toBe(fpNorm);
      expect(fpRaw).toMatch(/^[0-9a-f]{64}$/);

    });
  });

  describe("2. SSRF Protection Guard", () => {
    const service = new TransactionalOutboundProducerService();

    it("should reject private IP mediaUrl before opening database connection", async () => {
      const request: PublicOutboundRequest = {
        recipientPhoneE164: "+5511999990001",
        contentType: "image",
        body: "Private IP image",
        mediaUrl: "https://192.168.1.1/secret.jpg",
        idempotencyKey: "ssrf-1",
      };

      await expect(service.produce(request, trustedContext)).rejects.toThrow(
        OutboundProducerValidationError
      );
    });

    it("should reject loopback mediaUrl before opening database connection", async () => {
      const request: PublicOutboundRequest = {
        recipientPhoneE164: "+5511999990001",
        contentType: "image",
        body: "Loopback image",
        mediaUrl: "https://127.0.0.1:8080/exploit.png",
        idempotencyKey: "ssrf-2",
      };

      await expect(service.produce(request, trustedContext)).rejects.toThrow(
        /SSRF protection rejected mediaUrl/
      );
    });

    it("should reject cloud metadata mediaUrl before opening database connection", async () => {
      const request: PublicOutboundRequest = {
        recipientPhoneE164: "+5511999990001",
        contentType: "image",
        body: "Cloud metadata image",
        mediaUrl: "https://169.254.169.254/latest/meta-data/",
        idempotencyKey: "ssrf-3",
      };

      await expect(service.produce(request, trustedContext)).rejects.toThrow(
        /SSRF protection rejected mediaUrl/
      );
    });

    it("should reject non-https mediaUrl in default mode", async () => {
      const request: PublicOutboundRequest = {
        recipientPhoneE164: "+5511999990001",
        contentType: "audio",
        body: "Plain HTTP audio",
        mediaUrl: "http://example.com/audio.mp3",
        idempotencyKey: "ssrf-4",
      };

      await expect(service.produce(request, trustedContext)).rejects.toThrow(
        /must use HTTPS/
      );
    });
  });
});

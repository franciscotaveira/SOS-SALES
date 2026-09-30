import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  WabaWebhookNormalizer,
  WahaWebhookNormalizer,
  SignatureVerificationService,
  MonotonicStatusService,
  QueueRetryPolicy,
  MockChannelGateway,
  WabaMetadataMissingError,
  WabaUnknownStatusError,
  WabaInvalidFieldError,
  WahaNormalizationError,
  WABA_INBOUND_TEXT_FIXTURE,
  WABA_INBOUND_IMAGE_FIXTURE,
  WABA_STATUS_DELIVERED_FIXTURE,
  WABA_STATUS_READ_FIXTURE,
  WABA_STATUS_FAILED_FIXTURE,
  WABA_BATCH_MULTIPLE_ENTRIES_FIXTURE,
  WABA_INBOUND_AUDIO_FIXTURE,
  WABA_INBOUND_VIDEO_FIXTURE,
  WABA_INBOUND_DOCUMENT_FIXTURE,
  WABA_INBOUND_INTERACTIVE_BUTTON_FIXTURE,
  WABA_INBOUND_INTERACTIVE_LIST_FIXTURE,
  WAHA_INBOUND_TEXT_FIXTURE,
  WAHA_INBOUND_IMAGE_FIXTURE,
  WAHA_ACK_DELIVERED_FIXTURE,
  WAHA_ACK_READ_FIXTURE,
  WAHA_ACK_FAILED_FIXTURE,
  WAHA_INBOUND_AUDIO_FIXTURE,
  WAHA_INBOUND_VIDEO_FIXTURE,
  WAHA_INBOUND_DOCUMENT_FIXTURE,
  WAHA_SESSION_STATUS_WORKING_FIXTURE,
  WAHA_SESSION_STATUS_SCAN_QR_FIXTURE,
  WAHA_SESSION_STATUS_STOPPED_FIXTURE,
  WAHA_SESSION_QR_FIXTURE,
  WAHA_SESSION_AUTH_FAILURE_FIXTURE,
  type ISigningSecretResolver,
  type ChannelInboundContext,
} from "../index";

describe("Channel Gateway & Normalizers Unit Tests", () => {
  const testRawPayloadHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const context: ChannelInboundContext = {
    channelInstanceId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    rawPayloadHash: testRawPayloadHash,
  };

  describe("WabaWebhookNormalizer", () => {
    it("should normalize inbound text message to canonical InboundMessageEvent", () => {
      const results = WabaWebhookNormalizer.normalize(
        WABA_INBOUND_TEXT_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("message");
      if (result?.kind === "message") {
        expect(result.event.provider).toBe("meta_waba");
        expect(result.event.senderPhoneE164).toBe("+5511988887777");
        expect(result.event.recipientPhoneE164).toBe("+5511999998888");
        expect(result.event.contentType).toBe("text");
        expect(result.event.body).toBe(
          "Olá, gostaria de saber mais sobre o atendimento."
        );
        expect(result.event.rawPayloadHash).toBe(testRawPayloadHash);
        expect(result.event.externalMessageId).toContain("wamid.");
      }
    });

    it("should normalize inbound message with CTWA referral and ctwa_clid in metadata", () => {
      const ctwaPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_ID_999",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+5511999998888",
                    phone_number_id: "PHONE_ID_123",
                  },
                  messages: [
                    {
                      from: "5511988887777",
                      id: "wamid.HBgLMTIzNDU2",
                      timestamp: "1675999999",
                      type: "text",
                      text: {
                        body: "Vi o anúncio e quero comprar!",
                      },
                      referral: {
                        source_url: "https://fb.me/ad123",
                        source_id: "ad_123456789",
                        source_type: "ad",
                        headline: "Promoção Especial",
                        body: "Compre agora com 20% off",
                        media_type: "image",
                        ctwa_clid: "AR_CTWA_CLICK_ID_999",
                      },
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const results = WabaWebhookNormalizer.normalize(ctwaPayload, context);
      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res?.kind).toBe("message");
      if (res?.kind === "message") {
        expect(res.event.metadata?.ctwaClid).toBe("AR_CTWA_CLICK_ID_999");
        expect(res.event.metadata?.referral).toEqual({
          sourceUrl: "https://fb.me/ad123",
          sourceId: "ad_123456789",
          sourceType: "ad",
          headline: "Promoção Especial",
          body: "Compre agora com 20% off",
          mediaType: "image",
          ctwaClid: "AR_CTWA_CLICK_ID_999",
        });
      }
    });

    it("should normalize inbound image message with mediaId, mimeType, and sha256 in metadata", () => {
      const results = WabaWebhookNormalizer.normalize(
        WABA_INBOUND_IMAGE_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("message");
      if (result?.kind === "message") {
        expect(result.event.contentType).toBe("image");
        expect(result.event.senderPhoneE164).toBe("+5511977776666");
        expect(result.event.rawPayloadHash).toBe(testRawPayloadHash);
        expect(result.event.metadata?.mediaId).toBe("109283746501928");
        expect(result.event.metadata?.mimeType).toBe("image/jpeg");
        expect(result.event.metadata?.fileSha256).toBe(
          "01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b"
        );
      }
    });

    it("should normalize inbound audio message with voice and mime metadata", () => {
      const results = WabaWebhookNormalizer.normalize(
        WABA_INBOUND_AUDIO_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("message");
      if (result?.kind === "message") {
        expect(result.event.contentType).toBe("audio");
        expect(result.event.senderPhoneE164).toBe("+5511966665555");
        expect(result.event.recipientPhoneE164).toBe("+5511999998888");
        expect(result.event.metadata?.mediaId).toBe("102938475600001");
        expect(result.event.metadata?.mimeType).toBe("audio/ogg; codecs=opus");
        expect(result.event.metadata?.fileSha256).toBe(
          "01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b"
        );
      }
    });

    it("should normalize inbound video message with caption and mediaId", () => {
      const results = WabaWebhookNormalizer.normalize(
        WABA_INBOUND_VIDEO_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("message");
      if (result?.kind === "message") {
        expect(result.event.contentType).toBe("video");
        expect(result.event.body).toBe("Gravação da vistoria");
        expect(result.event.senderPhoneE164).toBe("+5511955554444");
        expect(result.event.metadata?.mediaId).toBe("102938475600002");
        expect(result.event.metadata?.mimeType).toBe("video/mp4");
      }
    });

    it("should normalize inbound document message with filename, caption, and sha256", () => {
      const results = WabaWebhookNormalizer.normalize(
        WABA_INBOUND_DOCUMENT_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("message");
      if (result?.kind === "message") {
        expect(result.event.contentType).toBe("document");
        expect(result.event.body).toBe("Segue contrato assinado");
        expect(result.event.metadata?.filename).toBe("contrato_assinado.pdf");
        expect(result.event.metadata?.mediaId).toBe("102938475600003");
        expect(result.event.metadata?.mimeType).toBe("application/pdf");
      }
    });

    it("should normalize interactive button_reply with button title in body and buttonId in metadata", () => {
      const results = WabaWebhookNormalizer.normalize(
        WABA_INBOUND_INTERACTIVE_BUTTON_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("message");
      if (result?.kind === "message") {
        expect(result.event.contentType).toBe("interactive");
        expect(result.event.body).toBe("Aceitar Proposta");
        expect(result.event.metadata?.interactiveType).toBe("button_reply");
        expect(result.event.metadata?.buttonId).toBe("btn_accept_proposal");
      }
    });

    it("should normalize interactive list_reply with list item title in body and listRowId in metadata", () => {
      const results = WabaWebhookNormalizer.normalize(
        WABA_INBOUND_INTERACTIVE_LIST_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("message");
      if (result?.kind === "message") {
        expect(result.event.contentType).toBe("interactive");
        expect(result.event.body).toBe("Plano Profissional");
        expect(result.event.metadata?.interactiveType).toBe("list_reply");
        expect(result.event.metadata?.listRowId).toBe("plan_tier_pro");
        expect(result.event.metadata?.description).toBe("Acesso total aos recursos");
      }
    });

    it("should normalize delivered status update with versioned external_event_id", () => {
      const results = WabaWebhookNormalizer.normalize(
        WABA_STATUS_DELIVERED_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("delivery_status");
      if (result?.kind === "delivery_status") {
        expect(result.event.status).toBe("delivered");
        expect(result.event.recipientPhoneE164).toBe("+5511988887777");
        expect(result.event.externalEventId).toMatch(/^v1:waba:wamid\..+:delivered:1726700010$/);
        expect(result.event.rawPayloadHash).toBe(testRawPayloadHash);
      }
    });

    it("should normalize read status update", () => {
      const results = WabaWebhookNormalizer.normalize(
        WABA_STATUS_READ_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("delivery_status");
      if (result?.kind === "delivery_status") {
        expect(result.event.status).toBe("read");
        expect(result.event.rawPayloadHash).toBe(testRawPayloadHash);
      }
    });

    it("should normalize failed status update with error details", () => {
      const results = WabaWebhookNormalizer.normalize(
        WABA_STATUS_FAILED_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("delivery_status");
      if (result?.kind === "delivery_status") {
        expect(result.event.status).toBe("failed");
        expect(result.event.errorCode).toBe("131026");
        expect(result.event.errorMessage).toBe("Recipient is not a valid WhatsApp user");
        expect(result.event.rawPayloadHash).toBe(testRawPayloadHash);
      }
    });

    it("should normalize full batch with multiple entries, messages, and statuses without discarding any event", () => {
      const results = WabaWebhookNormalizer.normalizeBatch(
        WABA_BATCH_MULTIPLE_ENTRIES_FIXTURE,
        context
      );

      // Fixture contains 2 entries:
      // Entry 1: 2 messages + 1 status = 3 events
      // Entry 2: 1 message + 1 status = 2 events
      // Total = 5 events
      expect(results).toHaveLength(5);

      const messageEvents = results.filter((r) => r.kind === "message");
      expect(messageEvents).toHaveLength(3);

      const statusEvents = results.filter((r) => r.kind === "delivery_status");
      expect(statusEvents).toHaveLength(2);

      for (const event of results) {
        if (event.kind === "message" || event.kind === "delivery_status") {
          expect(event.event.rawPayloadHash).toBe(testRawPayloadHash);
        }
      }
    });

    it("should reject payload missing rawPayloadHash or with invalid hash format", () => {
      expect(() => {
        WabaWebhookNormalizer.normalize(WABA_INBOUND_TEXT_FIXTURE, {
          ...context,
          rawPayloadHash: "short_hash",
        });
      }).toThrow(/WABA_NORMALIZATION_ERROR: ChannelInboundContext.rawPayloadHash must be a 64-character lowercase hex/);
    });

    it("should reject payload with missing metadata (Truth in Data)", () => {
      const payloadWithoutMetadata = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "109876543210987",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  messages: [
                    {
                      from: "5511988887777",
                      id: "wamid.test001",
                      timestamp: "1726700000",
                      text: { body: "Sem metadata" },
                      type: "text",
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      expect(() => {
        WabaWebhookNormalizer.normalize(payloadWithoutMetadata, context);
      }).toThrow(WabaMetadataMissingError);
    });

    it("should reject payload with missing phone_number_id in metadata (Truth in Data)", () => {
      const payloadWithoutPhoneId = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "109876543210987",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+5511999998888",
                    phone_number_id: "", // empty
                  },
                  messages: [
                    {
                      from: "5511988887777",
                      id: "wamid.test002",
                      timestamp: "1726700000",
                      text: { body: "Sem phone_number_id" },
                      type: "text",
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      expect(() => {
        WabaWebhookNormalizer.normalize(payloadWithoutPhoneId, context);
      }).toThrow(WabaMetadataMissingError);
    });

    it("should REJECT unknown WABA delivery status and NEVER convert to 'sent'", () => {
      const payloadWithUnknownStatus = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "109876543210987",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+5511999998888",
                    phone_number_id: "123456",
                  },
                  statuses: [
                    {
                      id: "wamid.unknown_status_msg",
                      status: "sent_to_spacecraft", // Unknown/unsupported status
                      timestamp: "1726700010",
                      recipient_id: "5511988887777",
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      expect(() => {
        WabaWebhookNormalizer.normalize(payloadWithUnknownStatus, context);
      }).toThrow(WabaUnknownStatusError);
    });

    it("should reject empty message id or empty sender phone explicitly", () => {
      const payloadWithEmptyId = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "109876543210987",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+5511999998888",
                    phone_number_id: "123456",
                  },
                  messages: [
                    {
                      from: "5511988887777",
                      id: "   ", // whitespace only
                      timestamp: "1726700000",
                      text: { body: "Empty id" },
                      type: "text",
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      expect(() => {
        WabaWebhookNormalizer.normalize(payloadWithEmptyId, context);
      }).toThrow(WabaInvalidFieldError);
    });

    it("should reject when timestamp is missing and no explicit receivedAt provided", () => {
      const payloadWithoutTimestamp = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "109876543210987",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+5511999998888",
                    phone_number_id: "123456",
                  },
                  messages: [
                    {
                      from: "5511988887777",
                      id: "wamid.notime",
                      text: { body: "No timestamp" },
                      type: "text",
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      expect(() => {
        WabaWebhookNormalizer.normalize(payloadWithoutTimestamp, context);
      }).toThrow(/Missing or invalid timestamp/);
    });

    it("should accept explicit receivedAt from ingress caller when payload lacks timestamp", () => {
      const payloadWithoutTimestamp = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "109876543210987",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+5511999998888",
                    phone_number_id: "123456",
                  },
                  messages: [
                    {
                      from: "5511988887777",
                      id: "wamid.notime",
                      text: { body: "No timestamp" },
                      type: "text",
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const explicitReceivedAt = "2026-09-18T18:00:00.000Z";
      const results = WabaWebhookNormalizer.normalize(payloadWithoutTimestamp, {
        ...context,
        receivedAt: explicitReceivedAt,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.event.timestamp).toBe(explicitReceivedAt);
    });
  });

  describe("WahaWebhookNormalizer", () => {
    it("should normalize inbound message event", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_INBOUND_TEXT_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("message");
      if (result?.kind === "message") {
        expect(result.event.provider).toBe("waha");
        expect(result.event.senderPhoneE164).toBe("+5511988887777");
        expect(result.event.recipientPhoneE164).toBe("+5511999998888");
        expect(result.event.contentType).toBe("text");
        expect(result.event.body).toBe(
          "Olá, gostaria de saber mais sobre o plano comercial."
        );
        expect(result.event.rawPayloadHash).toBe(testRawPayloadHash);
      }
    });

    it("should normalize image message with caption", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_INBOUND_IMAGE_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("message");
      if (result?.kind === "message") {
        expect(result.event.contentType).toBe("image");
        expect(result.event.body).toBe("Segue o comprovante");
      }
    });

    it("should normalize ack 2 as delivered", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_ACK_DELIVERED_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("delivery_status");
      if (result?.kind === "delivery_status") {
        expect(result.event.status).toBe("delivered");
        expect(result.event.externalEventId).toMatch(/^v1:waha:.+:2:1726700015$/);
        expect(result.event.rawPayloadHash).toBe(testRawPayloadHash);
      }
    });

    it("should normalize ack 3 as read", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_ACK_READ_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("delivery_status");
      if (result?.kind === "delivery_status") {
        expect(result.event.status).toBe("read");
        expect(result.event.rawPayloadHash).toBe(testRawPayloadHash);
      }
    });

    it("should reject WAHA payload missing rawPayloadHash or invalid payload", () => {
      expect(() => {
        WahaWebhookNormalizer.normalize(WAHA_INBOUND_TEXT_FIXTURE, {
          ...context,
          rawPayloadHash: "invalid_hash",
        });
      }).toThrow(WahaNormalizationError);
    });

    it("should reject WAHA event with empty message id", () => {
      const invalidWahaPayload = {
        event: "message",
        payload: {
          id: "",
          from: "5511999991111@c.us",
          to: "5511999992222@c.us",
          timestamp: 1726700000,
        },
      };

      expect(() => {
        WahaWebhookNormalizer.normalize(invalidWahaPayload, context);
      }).toThrow(WahaNormalizationError);
    });

    it("should normalize inbound audio message with correct content type", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_INBOUND_AUDIO_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("message");
      if (result?.kind === "message") {
        expect(result.event.contentType).toBe("audio");
        expect(result.event.mediaUrl).toBe("https://storage.waha.internal/media/voice-note-123.ogg");
      }
    });

    it("should normalize inbound video message with correct content type and caption", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_INBOUND_VIDEO_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("message");
      if (result?.kind === "message") {
        expect(result.event.contentType).toBe("video");
        expect(result.event.body).toBe("Demonstração do produto");
        expect(result.event.mediaUrl).toBe("https://storage.waha.internal/media/demo-video-456.mp4");
      }
    });

    it("should normalize inbound document message with correct content type and caption", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_INBOUND_DOCUMENT_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("message");
      if (result?.kind === "message") {
        expect(result.event.contentType).toBe("document");
        expect(result.event.body).toBe("Contrato assinado em anexo");
        expect(result.event.mediaUrl).toBe("https://storage.waha.internal/media/contrato-final.pdf");
      }
    });

    it("should normalize negative ack as failed delivery status", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_ACK_FAILED_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("delivery_status");
      if (result?.kind === "delivery_status") {
        expect(result.event.status).toBe("failed");
        expect(result.event.externalEventId).toMatch(/^v1:waha:.+:-1:1726700045$/);
      }
    });

    it("should normalize session.status WORKING into connected lifecycle event", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_SESSION_STATUS_WORKING_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("lifecycle");
      if (result?.kind === "lifecycle") {
        expect(result.event.provider).toBe("waha");
        expect(result.event.eventType).toBe("connected");
        expect(result.event.details?.session).toBe("default");
        expect(result.event.details?.rawStatus).toBe("WORKING");
      }
    });

    it("should normalize session.status SCAN_QR_CODE into qr_received lifecycle event", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_SESSION_STATUS_SCAN_QR_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("lifecycle");
      if (result?.kind === "lifecycle") {
        expect(result.event.eventType).toBe("qr_received");
        expect(result.event.details?.rawStatus).toBe("SCAN_QR_CODE");
      }
    });

    it("should normalize session.status STOPPED into disconnected lifecycle event", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_SESSION_STATUS_STOPPED_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("lifecycle");
      if (result?.kind === "lifecycle") {
        expect(result.event.eventType).toBe("disconnected");
        expect(result.event.details?.rawStatus).toBe("STOPPED");
      }
    });

    it("should normalize session.qr event into qr_received lifecycle event with qr payload", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_SESSION_QR_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("lifecycle");
      if (result?.kind === "lifecycle") {
        expect(result.event.eventType).toBe("qr_received");
        expect(result.event.details?.qr).toContain("2@ABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234YZ==");
      }
    });

    it("should normalize session.auth_failure into auth_failure lifecycle event", () => {
      const results = WahaWebhookNormalizer.normalize(
        WAHA_SESSION_AUTH_FAILURE_FIXTURE,
        context
      );

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result?.kind).toBe("lifecycle");
      if (result?.kind === "lifecycle") {
        expect(result.event.eventType).toBe("auth_failure");
        expect(result.event.details?.reason).toBe("DEVICE_LOGOUT_BY_USER");
      }
    });

    it("should reject session.qr missing qr code", () => {
      const invalidQrEvent = {
        event: "session.qr",
        payload: {
          name: "default",
          qr: "",
        },
      };

      expect(() => {
        WahaWebhookNormalizer.normalize(invalidQrEvent, context);
      }).toThrow("Missing or empty qr code in session.qr event");
    });

    it("should reject WAHA event when payload object is missing", () => {
      const invalidEvent = {
        event: "message",
      };

      expect(() => {
        WahaWebhookNormalizer.normalize(invalidEvent as unknown as Record<string, unknown>, context);
      }).toThrow("Missing payload object in event");
    });
  });


  describe("QueueRetryPolicy (Formalized Retries & Dead-Letter Progression)", () => {
    const baseDate = new Date("2026-09-18T12:00:00.000Z");

    it("should throw error if parameter now is invalid Date (no Date.now() fallback)", () => {
      expect(() => {
        QueueRetryPolicy.evaluate(0, 3, new Date("invalid-date-string"));
      }).toThrow(/Parameter 'now' must be a valid Date object/);
    });

    it("should correctly handle boundary currentRetryCount = 0 (first failure -> 1st retry)", () => {
      const decision = QueueRetryPolicy.evaluate(0, 3, baseDate, {
        baseDelayMs: 5_000,
        backoffFactor: 2,
      });

      expect(decision.shouldRetry).toBe(true);
      expect(decision.nextStatus).toBe("failed");
      expect(decision.nextRetryCount).toBe(1);
      expect(decision.attemptsRemaining).toBe(2);
      expect(decision.totalAttemptsAllowed).toBe(4); // 1 initial + 3 retries
      expect(decision.delayMs).toBe(5_000); // 5000 * 2^0
      expect(decision.nextAttemptAt?.toISOString()).toBe("2026-09-18T12:00:05.000Z");
    });

    it("should correctly handle intermediate exponential backoff calculation", () => {
      // 2nd retry: retryCount = 1
      const decision1 = QueueRetryPolicy.evaluate(1, 3, baseDate, {
        baseDelayMs: 5_000,
        backoffFactor: 2,
      });
      expect(decision1.delayMs).toBe(10_000); // 5000 * 2^1
      expect(decision1.nextRetryCount).toBe(2);

      // 3rd retry: retryCount = 2
      const decision2 = QueueRetryPolicy.evaluate(2, 3, baseDate, {
        baseDelayMs: 5_000,
        backoffFactor: 2,
      });
      expect(decision2.delayMs).toBe(20_000); // 5000 * 2^2
      expect(decision2.nextRetryCount).toBe(3);
      expect(decision2.attemptsRemaining).toBe(0);
    });

    it("should correctly handle boundary currentRetryCount = maxRetries (transition to dead_letter)", () => {
      const decision = QueueRetryPolicy.evaluate(3, 3, baseDate);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.nextStatus).toBe("dead_letter");
      expect(decision.nextRetryCount).toBe(3);
      expect(decision.nextAttemptAt).toBeNull();
      expect(decision.attemptsRemaining).toBe(0);
      expect(decision.totalAttemptsAllowed).toBe(4);
    });

    it("should cap backoff delay at maxDelayMs", () => {
      const decision = QueueRetryPolicy.evaluate(10, 20, baseDate, {
        baseDelayMs: 5_000,
        maxDelayMs: 60_000, // 1 min cap
        backoffFactor: 2,
      });

      // 5000 * 2^10 would be 5,120,000 ms, but capped at 60,000 ms
      expect(decision.delayMs).toBe(60_000);
      expect(decision.nextAttemptAt?.toISOString()).toBe("2026-09-18T12:01:00.000Z");
    });
  });

  describe("SignatureVerificationService", () => {
    const mockAppSecret = "waba_super_secret_key_1234567890abcdef";
    const mockWahaToken = "waha_webhook_secret_token_xyz9876";
    const mockEvolutionKey = "evolution_apikey_mothership_2026";

    const mockResolver: ISigningSecretResolver = {
      async useSigningSecret<T>(
        channelInstanceId: string,
        _workspaceId: string,
        fn: (secret: string) => Promise<T> | T
      ): Promise<T | null> {
        if (channelInstanceId === "waba-instance") {
          return await fn(mockAppSecret);
        }
        if (channelInstanceId === "waha-instance") {
          return await fn(mockWahaToken);
        }
        if (channelInstanceId === "evolution-instance") {
          return await fn(mockEvolutionKey);
        }
        return null;
      },
    };

    const verifier = new SignatureVerificationService(mockResolver);

    it("should validate authentic Meta WABA HMAC-SHA256 signature using scoped callback", async () => {
      const rawPayload = JSON.stringify(WABA_INBOUND_TEXT_FIXTURE);
      const rawBuffer = Buffer.from(rawPayload, "utf-8");
      const validHmac = crypto
        .createHmac("sha256", mockAppSecret)
        .update(rawBuffer)
        .digest("hex");

      const result = await verifier.verify({
        channelInstanceId: "waba-instance",
        workspaceId: context.workspaceId,
        provider: "meta_waba",
        rawBody: rawBuffer,
        headers: {
          "x-hub-signature-256": `sha256=${validHmac}`,
        },
      });

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should reject tampered Meta WABA payload", async () => {
      const rawBuffer = Buffer.from(JSON.stringify(WABA_INBOUND_TEXT_FIXTURE));
      const validHmac = crypto
        .createHmac("sha256", mockAppSecret)
        .update(rawBuffer)
        .digest("hex");

      const tamperedBuffer = Buffer.from(
        JSON.stringify(WABA_INBOUND_TEXT_FIXTURE).replace("Maria", "Tampered")
      );

      const result = await verifier.verify({
        channelInstanceId: "waba-instance",
        workspaceId: context.workspaceId,
        provider: "meta_waba",
        rawBody: tamperedBuffer,
        headers: {
          "x-hub-signature-256": `sha256=${validHmac}`,
        },
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("signature_mismatch");
    });

    it("should reject missing or malformed signature header", async () => {
      const rawBuffer = Buffer.from("test");

      const noHeaderResult = await verifier.verify({
        channelInstanceId: "waba-instance",
        workspaceId: context.workspaceId,
        provider: "meta_waba",
        rawBody: rawBuffer,
        headers: {},
      });
      expect(noHeaderResult.valid).toBe(false);
      expect(noHeaderResult.reason).toBe("missing_signature_header");

      const malformedHeaderResult = await verifier.verify({
        channelInstanceId: "waba-instance",
        workspaceId: context.workspaceId,
        provider: "meta_waba",
        rawBody: rawBuffer,
        headers: {
          "x-hub-signature-256": "invalid_prefix_abc123",
        },
      });
      expect(malformedHeaderResult.valid).toBe(false);
      expect(malformedHeaderResult.reason).toBe("malformed_signature_prefix");
    });

    it("should validate authentic WAHA token header in constant time", async () => {
      const result = await verifier.verify({
        channelInstanceId: "waha-instance",
        workspaceId: context.workspaceId,
        provider: "waha",
        rawBody: Buffer.from("{}"),
        headers: {
          "x-api-key": mockWahaToken,
        },
      });

      expect(result.valid).toBe(true);
    });

    it("should reject incorrect WAHA token", async () => {
      const result = await verifier.verify({
        channelInstanceId: "waha-instance",
        workspaceId: context.workspaceId,
        provider: "waha",
        rawBody: Buffer.from("{}"),
        headers: {
          "x-api-key": "wrong_token_attempt",
        },
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("token_mismatch");
    });

    it("should validate authentic Evolution API apikey header in constant time", async () => {
      const result = await verifier.verify({
        channelInstanceId: "evolution-instance",
        workspaceId: context.workspaceId,
        provider: "evolution",
        rawBody: Buffer.from("{}"),
        headers: {
          apikey: mockEvolutionKey,
        },
      });

      expect(result.valid).toBe(true);
    });

    it("should reject incorrect Evolution API apikey", async () => {
      const result = await verifier.verify({
        channelInstanceId: "evolution-instance",
        workspaceId: context.workspaceId,
        provider: "evolution",
        rawBody: Buffer.from("{}"),
        headers: {
          apikey: "wrong_evo_key",
        },
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("token_mismatch");
    });

    it("should fail-closed when secret cannot be resolved", async () => {
      const result = await verifier.verify({
        channelInstanceId: "non-existent-instance",
        workspaceId: context.workspaceId,
        provider: "meta_waba",
        rawBody: Buffer.from("{}"),
        headers: {
          "x-hub-signature-256": "sha256=" + "a".repeat(64),
        },
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("secret_not_found");
    });
  });

  describe("MonotonicStatusService", () => {
    it("should allow positive progression along monotonic chain", () => {
      expect(MonotonicStatusService.shouldUpdateStatus("queued", "sent")).toBe(true);
      expect(MonotonicStatusService.shouldUpdateStatus("sent", "delivered")).toBe(true);
      expect(MonotonicStatusService.shouldUpdateStatus("delivered", "read")).toBe(true);
      expect(MonotonicStatusService.shouldUpdateStatus("queued", "read")).toBe(true);
    });

    it("should reject regression when delayed webhooks arrive out-of-order", () => {
      // Delivered arrives after read has already occurred
      expect(MonotonicStatusService.shouldUpdateStatus("read", "delivered")).toBe(false);
      // Sent arrives after delivered
      expect(MonotonicStatusService.shouldUpdateStatus("delivered", "sent")).toBe(false);
      // Sent arrives after read
      expect(MonotonicStatusService.shouldUpdateStatus("read", "sent")).toBe(false);
      // Same status is a no-op
      expect(MonotonicStatusService.shouldUpdateStatus("delivered", "delivered")).toBe(false);
    });

    it("should handle failure as terminal only from queued state", () => {
      expect(MonotonicStatusService.shouldUpdateStatus("queued", "failed")).toBe(true);
      expect(MonotonicStatusService.shouldUpdateStatus("sent", "failed")).toBe(false);
      expect(MonotonicStatusService.shouldUpdateStatus("delivered", "failed")).toBe(false);
      expect(MonotonicStatusService.shouldUpdateStatus("read", "failed")).toBe(false);
    });
  });

  describe("MockChannelGateway", () => {
    it("should record sent messages with opaque lease and return delivery receipt", async () => {
      const gateway = new MockChannelGateway("meta_waba");

      const request = {
        workspaceId: context.workspaceId,
        channelInstanceId: context.channelInstanceId,
        recipientPhoneE164: "+5511999998888",
        body: "Test message via mock gateway",
        idempotencyKey: "test-outbox-key-01",
      };

      const lease = {
        credentialId: "mock-cred-id",
        provider: "meta_waba" as const,
      };

      const receipt = await gateway.sendOutbound(request, lease);

      expect(receipt.status).toBe("sent");
      expect(receipt.externalMessageId).toMatch(/^mock_msg_/);
      expect(gateway.sentMessages).toHaveLength(1);
      expect(gateway.sentMessages[0]?.request.idempotencyKey).toBe("test-outbox-key-01");
      expect(gateway.sentMessages[0]?.lease.credentialId).toBe("mock-cred-id");
    });

    it("should simulate failure when configured", async () => {
      const gateway = new MockChannelGateway("waha");
      gateway.shouldFailNext = true;
      gateway.failureError = "Simulated WAHA instance disconnected";

      const receipt = await gateway.sendOutbound(
        {
          workspaceId: context.workspaceId,
          channelInstanceId: context.channelInstanceId,
          recipientPhoneE164: "+5511999998888",
          body: "Test failure message",
          idempotencyKey: "test-outbox-key-fail",
        },
        { credentialId: "cred-waha", provider: "waha" }
      );

      expect(receipt.status).toBe("failed");
      expect(receipt.error).toBe("Simulated WAHA instance disconnected");
    });
  });
});

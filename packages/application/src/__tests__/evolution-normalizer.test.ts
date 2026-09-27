import { describe, it, expect } from "vitest";
import { EvolutionWebhookNormalizer, EvolutionNormalizationError } from "../channels/normalizers/evolution-normalizer";

describe("EvolutionWebhookNormalizer (Evolution API v2)", () => {
  const dummyHash = "a".repeat(64);
  const context = {
    channelInstanceId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    rawPayloadHash: dummyHash,
    receivedAt: "2026-03-27T10:00:00.000Z",
  };

  it("normalizes an inbound text message (messages.upsert)", () => {
    const rawPayload = {
      event: "messages.upsert",
      instance: "chapeco-vendas",
      data: {
        key: {
          remoteJid: "5549999998888@s.whatsapp.net",
          fromMe: false,
          id: "3EB0123456789ABCDEF",
        },
        pushName: "Cliente Chapecó",
        message: {
          conversation: "Olá! Gostaria de uma cotação para o produto.",
        },
        messageType: "conversation",
        messageTimestamp: 1711533600,
      },
    };

    const events = EvolutionWebhookNormalizer.normalize(rawPayload, context);
    expect(events.length).toBe(1);

    const norm = events[0]!;
    expect(norm.kind).toBe("message");
    if (norm.kind === "message") {
      expect(norm.event.provider).toBe("evolution");
      expect(norm.event.externalMessageId).toBe("3EB0123456789ABCDEF");
      expect(norm.event.senderPhoneE164).toBe("+5549999998888");
      expect(norm.event.metadata?.direction).toBe("inbound");
      expect(norm.event.body).toBe("Olá! Gostaria de uma cotação para o produto.");
      expect(norm.event.metadata?.senderName).toBe("Cliente Chapecó");
      expect(norm.event.contentType).toBe("text");
    }
  });

  it("normalizes an outbound message from operator (fromMe: true)", () => {
    const rawPayload = {
      event: "messages.upsert",
      instance: "chapeco-vendas",
      data: {
        key: {
          remoteJid: "5549999998888@s.whatsapp.net",
          fromMe: true,
          id: "3EB0999999999FEDCBA",
        },
        message: {
          extendedTextMessage: {
            text: "Perfeito! O valor é R$ 1.500,00.",
          },
        },
        messageType: "extendedTextMessage",
        messageTimestamp: 1711533610,
      },
    };

    const events = EvolutionWebhookNormalizer.normalize(rawPayload, context);
    expect(events.length).toBe(1);

    const norm = events[0]!;
    expect(norm.kind).toBe("message");
    if (norm.kind === "message") {
      expect(norm.event.metadata?.direction).toBe("outbound");
      expect(norm.event.recipientPhoneE164).toBe("+5549999998888");
      expect(norm.event.body).toBe("Perfeito! O valor é R$ 1.500,00.");
    }
  });

  it("normalizes a delivery status update (messages.update)", () => {
    const rawPayload = {
      event: "messages.update",
      instance: "chapeco-vendas",
      data: {
        key: {
          remoteJid: "5549999998888@s.whatsapp.net",
          fromMe: true,
          id: "3EB0999999999FEDCBA",
        },
        status: "READ",
        messageTimestamp: 1711533620,
      },
    };

    const events = EvolutionWebhookNormalizer.normalize(rawPayload, context);
    expect(events.length).toBe(1);

    const norm = events[0]!;
    expect(norm.kind).toBe("delivery_status");
    if (norm.kind === "delivery_status") {
      expect(norm.event.status).toBe("read");
      expect(norm.event.externalMessageId).toBe("3EB0999999999FEDCBA");
      expect(norm.event.provider).toBe("evolution");
    }
  });

  it("normalizes a channel lifecycle connection update", () => {
    const rawPayload = {
      event: "connection.update",
      instance: "chapeco-vendas",
      data: {
        state: "open",
      },
    };

    const events = EvolutionWebhookNormalizer.normalize(rawPayload, context);
    expect(events.length).toBe(1);

    const norm = events[0]!;
    expect(norm.kind).toBe("lifecycle");
    if (norm.kind === "lifecycle") {
      expect(norm.event.eventType).toBe("connected");
      expect(norm.event.provider).toBe("evolution");
    }
  });

  it("throws fail-closed on invalid rawPayloadHash", () => {
    const invalidContext = {
      ...context,
      rawPayloadHash: "not-a-valid-hex-hash",
    };

    expect(() =>
      EvolutionWebhookNormalizer.normalize(
        { event: "messages.upsert", data: {} },
        invalidContext
      )
    ).toThrow(EvolutionNormalizationError);
  });
});

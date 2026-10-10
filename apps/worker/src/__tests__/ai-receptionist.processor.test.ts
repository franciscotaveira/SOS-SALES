import { describe, it, expect, beforeEach } from "vitest";
import type { Pool } from "pg";
import { AiReceptionistProcessor } from "../processors/ai-receptionist.processor";
import { OpenRouterClient } from "@sos-sales/application";

describe("AiReceptionistProcessor", () => {
  let mockOpenRouterClient: OpenRouterClient;
  let processor: AiReceptionistProcessor;

  beforeEach(() => {
    mockOpenRouterClient = new OpenRouterClient();
    processor = new AiReceptionistProcessor(mockOpenRouterClient as any);
    process.env.OPENROUTER_API_KEY = "test-api-key";
  });

  it("skips autonomous reply when inbound message body is empty", async () => {
    const mockPool = {} as Pool;
    const result = await processor.processInboundMessage(
      mockPool,
      {
        workspaceId: "b0000000-0000-0000-0000-000000000001",
        channelInstanceId: "c0000000-0000-0000-0000-000000000001",
        contactId: "d0000000-0000-0000-0000-000000000001",
        threadId: "e0000000-0000-0000-0000-000000000001",
        inboundMessageId: "f0000000-0000-0000-0000-000000000001",
        inboundBody: "",
        senderPhoneE164: "+5549999999999",
        recipientPhoneE164: "+5549888888888",
      },
      "test-worker"
    );

    expect(result.handled).toBe(false);
    expect(result.reason).toBe("empty_inbound_body");
  });
});

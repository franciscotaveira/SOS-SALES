import { describe, it, expect } from "vitest";
import { z } from "zod";

// Schema definition matching apps/api/src/routes/broadcasts.routes.ts
const createBroadcastBodySchema = z.object({
  name: z.string().max(120).optional(),
  channelInstanceId: z.string().uuid(),
  templateId: z.string().uuid(),
  isAbTest: z.boolean().optional().default(false),
  variantBTemplateId: z.string().uuid().optional(),
  audience: z.object({
    type: z.enum(["ALL_CONTACTS", "BY_STAGE", "MANUAL", "IMPORT_LIST", "SMART_FILTER"]),
    stage: z.string().max(50).optional(),
    customPhoneNumbers: z.array(z.string().regex(/^\+[1-9][0-9]{8,14}$/)).max(1000).optional(),
    importedContacts: z
      .array(
        z.object({
          phoneE164: z.string().regex(/^\+[1-9][0-9]{8,14}$/),
          name: z.string().max(150).nullable().optional(),
        })
      )
      .max(1000)
      .optional(),
    smartFilter: z.enum(["NON_BUYERS", "PIX_ABANDONED", "INACTIVE_30_DAYS", "CTWA_RESCUE"]).optional(),
  }),
  variables: z.record(z.string().max(200)).optional(),
  variantBVariables: z.record(z.string().max(200)).optional(),
});

import crypto from "node:crypto";

describe("Broadcast Audience Body Schema Validation", () => {
  const baseChannelId = crypto.randomUUID();
  const baseTemplateId = crypto.randomUUID();

  it("validates IMPORT_LIST with valid importedContacts", () => {
    const payload = {
      name: "Campanha Black Friday Planilha",
      channelInstanceId: baseChannelId,
      templateId: baseTemplateId,
      audience: {
        type: "IMPORT_LIST",
        importedContacts: [
          { phoneE164: "+5549999998888", name: "Carlos Eduardo" },
          { phoneE164: "+5511988887777", name: null },
        ],
      },
    };

    const parsed = createBroadcastBodySchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.audience.type).toBe("IMPORT_LIST");
      expect(parsed.data.audience.importedContacts?.length).toBe(2);
      expect(parsed.data.isAbTest).toBe(false);
    }
  });

  it("rejects IMPORT_LIST with malformed phone numbers", () => {
    const payload = {
      channelInstanceId: baseChannelId,
      templateId: baseTemplateId,
      audience: {
        type: "IMPORT_LIST",
        importedContacts: [
          { phoneE164: "49999998888", name: "Sem sinal de mais" },
        ],
      },
    };

    const parsed = createBroadcastBodySchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });

  it("validates SMART_FILTER with valid segment options", () => {
    for (const filter of ["NON_BUYERS", "PIX_ABANDONED", "INACTIVE_30_DAYS", "CTWA_RESCUE"] as const) {
      const payload = {
        name: `Campanha Filtro ${filter}`,
        channelInstanceId: baseChannelId,
        templateId: baseTemplateId,
        audience: {
          type: "SMART_FILTER",
          smartFilter: filter,
        },
      };

      const parsed = createBroadcastBodySchema.safeParse(payload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.audience.smartFilter).toBe(filter);
      }
    }
  });

  it("rejects unknown SMART_FILTER segment", () => {
    const payload = {
      channelInstanceId: baseChannelId,
      templateId: baseTemplateId,
      audience: {
        type: "SMART_FILTER",
        smartFilter: "UNKNOWN_FILTER",
      },
    };

    const parsed = createBroadcastBodySchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });

  it("validates ALL_CONTACTS and BY_STAGE", () => {
    const allContacts = createBroadcastBodySchema.safeParse({
      channelInstanceId: baseChannelId,
      templateId: baseTemplateId,
      audience: { type: "ALL_CONTACTS" },
    });
    expect(allContacts.success).toBe(true);

    const byStage = createBroadcastBodySchema.safeParse({
      channelInstanceId: baseChannelId,
      templateId: baseTemplateId,
      audience: { type: "BY_STAGE", stage: "NEGOTIATION" },
    });
    expect(byStage.success).toBe(true);
  });
});

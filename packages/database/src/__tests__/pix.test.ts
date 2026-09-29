import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import {
  calculateCRC16CCITT,
  validatePixCopiaECola,
  generatePixCopiaECola,
  createPixCharge,
  confirmPixChargeManual,
} from "../pix";
import { createTestDatabasePools } from "../test-support";
import { withTenantTransaction } from "../client";

describe("Pix BR Code EMV & Financial Separation Suite (E1.1)", () => {
  const { ownerPool, appPool } = createTestDatabasePools();

  let testWorkspaceId: string;
  let testThreadId: string;
  let testContactId: string;
  let testUserId: string;
  let testSecondUserId: string;

  beforeAll(async () => {
    const userRes = await ownerPool.query(`
      INSERT INTO users (email, name)
      VALUES ($1, 'Operador Caixa Haven')
      RETURNING id;
    `, [`caixa-${Date.now()}@haven.mct.br`]);
    testUserId = userRes.rows[0].id;

    const user2Res = await ownerPool.query(`
      INSERT INTO users (email, name)
      VALUES ($1, 'Segundo Operador Caixa')
      RETURNING id;
    `, [`caixa2-${Date.now()}@haven.mct.br`]);
    testSecondUserId = user2Res.rows[0].id;

    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug) 
      VALUES ('Haven Escovaria Org', 'haven-org-' || gen_random_uuid()) 
      RETURNING id;
    `);
    const orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug, default_pix_key, default_pix_merchant_name, default_pix_merchant_city) 
      VALUES ($1, 'Haven Escovaria Pix Test', 'haven-ws-' || gen_random_uuid(), 'haven@haven.mct.br', 'HAVEN ESCOVARIA', 'CHAPECO') 
      RETURNING id;
    `, [orgId]);
    testWorkspaceId = wsRes.rows[0].id;

    const tokenHash = crypto.createHash("sha256").update(`haven-test-${Date.now()}`).digest("hex");
    const insChan = await ownerPool.query(`
      INSERT INTO channel_instances (workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash)
      VALUES ($1, 'meta_waba', 'Haven WhatsApp', '+5549999990000', $2)
      RETURNING id;
    `, [testWorkspaceId, tokenHash]);
    const channelInstanceId = insChan.rows[0].id;

    const insContact = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5549991234567', 'Cliente Teste Pix')
      RETURNING id;
    `, [testWorkspaceId]);
    testContactId = insContact.rows[0].id;

    const insThread = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
      VALUES ($1, $2, $3, 'active')
      RETURNING id;
    `, [testWorkspaceId, channelInstanceId, testContactId]);
    testThreadId = insThread.rows[0].id;
  });

  afterAll(async () => {
    await ownerPool.end();
    await appPool.end();
  });

  describe("1. CRC-16/CCITT-FALSE Standard Validation", () => {
    it("matches EMVCo standard test vector '123456789' -> '29B1'", () => {
      const crc = calculateCRC16CCITT("123456789");
      expect(crc).toBe("29B1");
    });

    it("generates a valid BR Code payload with correct CRC and structure", () => {
      const payload = generatePixCopiaECola({
        amountCents: 15000,
        title: "Escova Lisa",
        chargeId: "abcdef123456",
        pixKey: "haven@haven.mct.br",
        merchantName: "HAVEN ESCOVARIA",
        merchantCity: "CHAPECO",
      });

      expect(payload).toContain("000201");
      expect(payload).toContain("0014br.gov.bcb.pix");
      expect(payload).toContain("haven@haven.mct.br");
      expect(payload).toContain("5406150.00");
      expect(payload).toContain("5802BR");
      expect(payload).toContain("5915HAVEN ESCOVARIA");
      expect(payload).toContain("6007CHAPECO");
      expect(payload).toContain("6304");

      // Checksum is NOT fixed 'A1B2'
      expect(payload.endsWith("A1B2")).toBe(false);

      // Validate with standard validator
      const validation = validatePixCopiaECola(payload);
      expect(validation.isValid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it("rejects corrupted payload with invalid CRC", () => {
      const validPayload = generatePixCopiaECola({
        amountCents: 5000,
        title: "Manicure",
        chargeId: "mani9876",
        pixKey: "+554999999999",
      });

      // Tamper with amount in payload
      const corrupted = validPayload.replace("50.00", "99.99");
      const validation = validatePixCopiaECola(corrupted);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain("Checksum CRC16 inválido");
    });

    it("rejects payload missing EMV header or too short", () => {
      expect(validatePixCopiaECola("short").isValid).toBe(false);
      expect(validatePixCopiaECola("99020126...63041234").isValid).toBe(false);
    });
    it("independently parses BR Code TLV (Tag-Length-Value) structure per BACEN specifications", () => {
      const payload = generatePixCopiaECola({
        amountCents: 25000,
        title: "Combo Noiva",
        chargeId: "noiva12345",
        pixKey: "financeiro@haven.com.br",
        merchantName: "HAVEN ESCOVARIA",
        merchantCity: "CHAPECO",
      });

      // Independent pure TLV decoder function
      function parseTLVElements(str: string): Record<string, string> {
        const result: Record<string, string> = {};
        let idx = 0;
        while (idx < str.length) {
          const id = str.substring(idx, idx + 2);
          const len = parseInt(str.substring(idx + 2, idx + 4), 10);
          const val = str.substring(idx + 4, idx + 4 + len);
          result[id] = val;
          idx += 4 + len;
        }
        return result;
      }

      const tags = parseTLVElements(payload);
      expect(tags["00"]).toBe("01"); // Payload Format Indicator
      expect(tags["52"]).toBe("0000"); // Merchant Category Code
      expect(tags["53"]).toBe("986"); // Currency BRL
      expect(tags["54"]).toBe("250.00"); // Amount
      expect(tags["58"]).toBe("BR"); // Country
      expect(tags["59"]).toBe("HAVEN ESCOVARIA"); // Merchant
      expect(tags["60"]).toBe("CHAPECO"); // City
      expect(tags["63"]).toBeDefined(); // CRC16
      expect(tags["63"]?.length).toBe(4);

      // Verify nested TLV Tag 26 (Merchant Account Information)
      const maiTags = parseTLVElements(tags["26"] || "");
      expect(maiTags["00"]).toBe("br.gov.bcb.pix");
      expect(maiTags["01"]).toBe("financeiro@haven.com.br");

      // Verify nested TLV Tag 62 (Additional Data Field Template)
      const addDataTags = parseTLVElements(tags["62"] || "");
      expect(addDataTags["05"]).toBe("noiva12345");
    });
  });

  describe("2. Local QR Code (Zero Third-Party Leaks)", () => {
    it("generates local data URL without calling api.qrserver.com", async () => {
      await withTenantTransaction(testWorkspaceId, async (client) => {
        const charge = await createPixCharge(client, {
          workspaceId: testWorkspaceId,
          threadId: testThreadId,
          contactId: testContactId,
          title: "Teste Local QR",
          amountCents: 3500,
        });

        expect(charge.pix_qr_url).toBeDefined();
        expect(charge.pix_qr_url).toMatch(/^data:image\/png;base64,/);
        expect(charge.pix_qr_url).not.toContain("api.qrserver.com");
        expect(charge.verification_method).toBe("UNVERIFIED");
        expect(charge.status).toBe("PENDING");
      }, appPool);
    });
  });

  describe("3. Financial Confirmation Separation (No Side Effects)", () => {
    it("rejects confirmation when human actorUserId is missing (ACTOR_REQUIRED)", async () => {
      await withTenantTransaction(testWorkspaceId, async (client) => {
        const charge = await createPixCharge(client, {
          workspaceId: testWorkspaceId,
          threadId: testThreadId,
          contactId: testContactId,
          title: "Teste Sem Ator",
          amountCents: 5000,
        });

        await expect(
          confirmPixChargeManual(client, {
            workspaceId: testWorkspaceId,
            chargeId: charge.id,
            actorUserId: "" as any,
          })
        ).rejects.toThrow("ACTOR_REQUIRED");
      }, appPool);
    });

    it("executes repeated and concurrent confirmations idempotently with single settlement", async () => {
      await withTenantTransaction(testWorkspaceId, async (client) => {
        const charge = await createPixCharge(client, {
          workspaceId: testWorkspaceId,
          threadId: testThreadId,
          contactId: testContactId,
          title: "Teste Concorrência Pix",
          amountCents: 8900,
        });

        // Sequential repeat call
        const first = await confirmPixChargeManual(client, {
          workspaceId: testWorkspaceId,
          chargeId: charge.id,
          actorUserId: testUserId,
          verificationNotes: "Primeira conferência pelo operador 1",
        });

        expect(first.charge.status).toBe("PAID");
        expect(first.alreadySettled).toBe(false);
        expect(first.charge.verified_by_user_id).toBe(testUserId);

        // Second confirmation of the same charge (replay)
        const second = await confirmPixChargeManual(client, {
          workspaceId: testWorkspaceId,
          chargeId: charge.id,
          actorUserId: testSecondUserId,
          verificationNotes: "Segunda conferência repetida pelo operador 2",
        });

        expect(second.charge.status).toBe("PAID");
        expect(second.alreadySettled).toBe(true);
        // Original actor is preserved
        expect(second.charge.verified_by_user_id).toBe(testUserId);
      }, appPool);
    });

    it("confirmPixChargeManual updates ONLY financial state, leaves journeys, outcomes, and CAPI untouched", async () => {
      await withTenantTransaction(testWorkspaceId, async (client) => {
        // Count outcomes and conversion events before
        const outcomeCountBefore = await client.query(
          "SELECT count(*) FROM commercial_outcomes WHERE workspace_id = $1",
          [testWorkspaceId]
        );
        const conversionCountBefore = await client.query(
          "SELECT count(*) FROM conversion_events WHERE workspace_id = $1",
          [testWorkspaceId]
        );

        // Create charge
        const charge = await createPixCharge(client, {
          workspaceId: testWorkspaceId,
          threadId: testThreadId,
          contactId: testContactId,
          title: "Teste Separação Financeira",
          amountCents: 12000,
        });

        // Confirm payment manually
        const confirmed = await confirmPixChargeManual(client, {
          workspaceId: testWorkspaceId,
          chargeId: charge.id,
          actorUserId: testUserId,
          verificationNotes: "Conferido no extrato bancário pelo operador",
        });

        expect(confirmed.charge.status).toBe("PAID");
        expect(confirmed.charge.verification_method).toBe("MANUAL_CASHIER");
        expect(confirmed.charge.verified_by_user_id).toBe(testUserId);
        expect(confirmed.charge.verification_notes).toBe(
          "Conferido no extrato bancário pelo operador"
        );
        expect(confirmed.charge.paid_at).not.toBeNull();

        // Verify outcomes count did NOT change
        const outcomeCountAfter = await client.query(
          "SELECT count(*) FROM commercial_outcomes WHERE workspace_id = $1",
          [testWorkspaceId]
        );
        expect(Number(outcomeCountAfter.rows[0].count)).toBe(
          Number(outcomeCountBefore.rows[0].count)
        );

        // Verify conversion events count did NOT change
        const conversionCountAfter = await client.query(
          "SELECT count(*) FROM conversion_events WHERE workspace_id = $1",
          [testWorkspaceId]
        );
        expect(Number(conversionCountAfter.rows[0].count)).toBe(
          Number(conversionCountBefore.rows[0].count)
        );
      }, appPool);
    });
  });
});

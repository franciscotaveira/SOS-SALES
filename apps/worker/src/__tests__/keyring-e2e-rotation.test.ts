import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import {
  createTestDatabasePools,
  encryptPayload,
  decryptPayload,
  resetTestQueueState,
  type Keyring,
} from "@sos-sales/database";
import { InboxProcessor } from "../processors/inbox-processor";

describe("CH-06: Keyring E2E & Zero-Downtime Key Rotation", () => {
  const { ownerPool, workerPool } = createTestDatabasePools();

  const keyV1 = "1111111111111111111111111111111111111111111111111111111111111111";
  const keyV2 = "2222222222222222222222222222222222222222222222222222222222222222";
  const endpointToken = `endpoint_token_keyring_rotation_${crypto.randomUUID()}`;
  const msgIdV1 = `wamid.keyring.v1.test.${crypto.randomUUID()}`;
  const msgIdV2 = `wamid.keyring.v2.test.${crypto.randomUUID()}`;

  const endpointTokenHash = crypto
    .createHash("sha256")
    .update(endpointToken)
    .digest("hex");

  let orgId: string;
  let workspaceId: string;
  let channelInstanceId: string;

  beforeAll(async () => {
    // 0. Reset operational queues
    await resetTestQueueState(ownerPool);

    // 1. Provision Workspace
    const orgRes = await ownerPool.query(
      `INSERT INTO organizations (name, slug) VALUES ('Keyring Org', $1) RETURNING id;`,
      [`org-keyring-${crypto.randomUUID()}`]
    );
    orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug) VALUES ($1, 'Keyring Workspace', $2) RETURNING id;`,
      [orgId, `ws-keyring-${crypto.randomUUID()}`]
    );
    workspaceId = wsRes.rows[0].id;

    // 2. Encrypt provider credentials under keyV1
    const credPayload = JSON.stringify({
      app_secret: "waba_shared_app_secret_rotation_2026",
      phone_number_id: "phone_keyring_test",
      access_token: "EAAB_test_keyring_token",
    });
    const encCred = encryptPayload(credPayload, keyV1, { keyVersion: 1 });

    const credRes = await ownerPool.query(
      `INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag, key_version
      ) VALUES ($1, 'meta_waba', 'waba_keyring_acc', $2, $3, $4, 'v1') RETURNING id;`,
      [workspaceId, encCred.encryptedBase64, encCred.ivBase64, encCred.authTagBase64]
    );
    const credentialId = credRes.rows[0].id;

    // 3. Provision Channel Instance
    const channelRes = await ownerPool.query(
      `INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, credential_id, is_active
      ) VALUES (
        $1, 'meta_waba', 'Keyring WABA Channel', '+5511999990001',
        $2, $3, true
      ) RETURNING id;`,
      [workspaceId, endpointTokenHash, credentialId]
    );
    channelInstanceId = channelRes.rows[0].id;
  });

  afterAll(async () => {
    await resetTestQueueState(ownerPool);
    try {
      if (orgId) {
        await ownerPool.query("DELETE FROM organizations WHERE id = $1;", [orgId]);
      }
    } catch {}
    await ownerPool.end();
    await workerPool.end();
  });

  it("1. should ingest webhook under initial keyring version 1 and persist key_version = 1", async () => {
    const rawBody = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-entry-1",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5511999990001", phone_number_id: "phone_keyring_test" },
                messages: [
                  {
                    from: "5511988880001",
                    id: msgIdV1,
                    timestamp: "1726700000",
                    type: "text",
                    text: { body: "Hello under Key Version 1" },
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    });

    const rawPayloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
    const aad = `${workspaceId}:${channelInstanceId}:${rawPayloadHash}`;
    const encV1 = encryptPayload(rawBody, keyV1, { aad, keyVersion: 1 });

    const insertRes = await ownerPool.query(
      `INSERT INTO public.channel_webhook_inbox (
        channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
        encrypted_payload, payload_iv, payload_auth_tag, key_version,
        status, retry_count, max_retries, next_attempt_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 0, 5, clock_timestamp())
      RETURNING id, key_version, status;`,
      [
        channelInstanceId,
        workspaceId,
        `event-v1-${crypto.randomUUID()}`,
        rawPayloadHash,
        encV1.encryptedBase64,
        encV1.ivBase64,
        encV1.authTagBase64,
        encV1.keyVersion,
      ]
    );

    expect(insertRes.rows.length).toBe(1);
    expect(insertRes.rows[0].key_version).toBe(1);
    expect(insertRes.rows[0].status).toBe("pending");

    // Decrypt directly with keyV1 to verify ciphertext integrity
    const decrypted = decryptPayload(
      encV1.encryptedBase64,
      encV1.ivBase64,
      encV1.authTagBase64,
      keyV1,
      { aad, keyVersion: 1 }
    );
    expect(decrypted).toBe(rawBody);
  });

  it("2. should ingest new webhook under rotated keyring version 2 and persist key_version = 2", async () => {
    const rawBodyV2 = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-entry-2",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5511999990001", phone_number_id: "phone_keyring_test" },
                messages: [
                  {
                    from: "5511988880002",
                    id: msgIdV2,
                    timestamp: "1726700010",
                    type: "text",
                    text: { body: "Hello under Key Version 2 after rotation" },
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    });

    const rawPayloadHashV2 = crypto.createHash("sha256").update(rawBodyV2).digest("hex");
    const aadV2 = `${workspaceId}:${channelInstanceId}:${rawPayloadHashV2}`;
    const encV2 = encryptPayload(rawBodyV2, { 2: keyV2 }, { aad: aadV2, keyVersion: 2 });

    const insertRes = await ownerPool.query(
      `INSERT INTO public.channel_webhook_inbox (
        channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
        encrypted_payload, payload_iv, payload_auth_tag, key_version,
        status, retry_count, max_retries, next_attempt_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 0, 5, clock_timestamp())
      RETURNING id, key_version, status;`,
      [
        channelInstanceId,
        workspaceId,
        `event-v2-${crypto.randomUUID()}`,
        rawPayloadHashV2,
        encV2.encryptedBase64,
        encV2.ivBase64,
        encV2.authTagBase64,
        encV2.keyVersion,
      ]
    );

    expect(insertRes.rows.length).toBe(1);
    expect(insertRes.rows[0].key_version).toBe(2);
    expect(insertRes.rows[0].status).toBe("pending");

    // Decrypt directly with keyV2 to verify ciphertext integrity
    const decryptedV2 = decryptPayload(
      encV2.encryptedBase64,
      encV2.ivBase64,
      encV2.authTagBase64,
      { 2: keyV2 },
      { aad: aadV2, keyVersion: 2 }
    );
    expect(decryptedV2).toBe(rawBodyV2);
  });

  it("3. should seamlessly process both historical v1 item and active v2 item in the same worker batch", async () => {
    // Worker is configured with rotated keyring { 1: keyV1, 2: keyV2 }
    const rotatedKeyring: Keyring = {
      1: keyV1,
      2: keyV2,
    };
    const processor = new InboxProcessor({ keyring: rotatedKeyring });

    // Claim both pending items
    const claimedItems = await processor.claimBatch(workerPool, "rotation-worker-1", 50);
    const workspaceItems = claimedItems.filter((i) => i.workspace_id === workspaceId);
    expect(workspaceItems.length).toBeGreaterThanOrEqual(2);

    const v1Item = workspaceItems.find((i) => i.key_version === 1);
    const v2Item = workspaceItems.find((i) => i.key_version === 2);

    expect(v1Item).toBeDefined();
    expect(v2Item).toBeDefined();

    // Process both items
    const resultV1 = await processor.processItem(workerPool, v1Item!, "rotation-worker-1");
    expect(resultV1.success).toBe(true);
    expect(resultV1.eventCount).toBe(1);

    const resultV2 = await processor.processItem(workerPool, v2Item!, "rotation-worker-1");
    expect(resultV2.success).toBe(true);
    expect(resultV2.eventCount).toBe(1);

    // Verify both items in database are now 'processed'
    const finalInboxRes = await ownerPool.query(
      `SELECT key_version, status FROM public.channel_webhook_inbox WHERE id IN ($1, $2);`,
      [v1Item!.id, v2Item!.id]
    );
    expect(finalInboxRes.rows.length).toBe(2);
    expect(finalInboxRes.rows.every((r) => r.status === "processed")).toBe(true);

    // Verify messages created in messages table for both v1 and v2
    const msgRes = await ownerPool.query(
      `SELECT provider_message_id, body FROM public.messages
       WHERE workspace_id = $1 AND provider_message_id IN ($2, $3);`,
      [workspaceId, msgIdV1, msgIdV2]
    );
    expect(msgRes.rows.length).toBe(2);
    const bodies = msgRes.rows.map((r) => r.body);
    expect(bodies).toContain("Hello under Key Version 1");
    expect(bodies).toContain("Hello under Key Version 2 after rotation");
  });

  it("4. should fail closed and record error without crashing when item has unknown key version", async () => {
    const unknownKey = "9999999999999999999999999999999999999999999999999999999999999999";
    const rawFakeBody = JSON.stringify({ fake: true });
    const fakeHash = crypto.createHash("sha256").update(rawFakeBody).digest("hex");
    const encFake = encryptPayload(rawFakeBody, { 99: unknownKey }, { keyVersion: 99 });

    const insertRes = await ownerPool.query(
      `INSERT INTO public.channel_webhook_inbox (
        channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
        encrypted_payload, payload_iv, payload_auth_tag, key_version,
        status, retry_count, max_retries, next_attempt_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 99, 'pending', 0, 5, clock_timestamp())
      RETURNING id;`,
      [
        channelInstanceId,
        workspaceId,
        `sha256:fake_${crypto.randomUUID()}`,
        fakeHash,
        encFake.encryptedBase64,
        encFake.ivBase64,
        encFake.authTagBase64,
      ]
    );
    const unknownItemId = insertRes.rows[0].id;

    // Worker with only { 1: keyV1, 2: keyV2 }
    const processor = new InboxProcessor({
      keyring: { 1: keyV1, 2: keyV2 },
    });

    const claimed = await processor.claimBatch(workerPool, "rotation-worker-2", 50);
    const unknownItem = claimed.find((i) => i.id === unknownItemId);
    expect(unknownItem).toBeDefined();

    // Processing must fail gracefully without throwing unhandled exception
    const result = await processor.processItem(workerPool, unknownItem!, "rotation-worker-2");
    expect(result.success).toBe(false);

    // Verify inbox item recorded failure with UNKNOWN_KEY_VERSION
    const failedRes = await ownerPool.query(
      `SELECT status, retry_count, error_message FROM public.channel_webhook_inbox WHERE id = $1;`,
      [unknownItemId]
    );
    expect(failedRes.rows[0].status).toBe("failed");
    expect(failedRes.rows[0].retry_count).toBe(1);
    expect(failedRes.rows[0].error_message).toContain("UNKNOWN_KEY_VERSION");
  });
});

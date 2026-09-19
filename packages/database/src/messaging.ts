import type { Pool, PoolClient } from "pg";

export type ChannelProvider =
  | "meta_waba"
  | "waha"
  | "evolution"
  | "meta_messenger"
  | "meta_instagram";

export type MessageDirection = "inbound" | "outbound";

export type MessageContentType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "location"
  | "template"
  | "interactive";

export type MessageDeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type CommercialThreadStatus =
  | "active"
  | "waiting_client"
  | "waiting_human"
  | "closed";

export interface ContactRecord {
  id: string;
  workspace_id: string;
  phone_e164: string;
  name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CommercialThreadRecord {
  id: string;
  workspace_id: string;
  channel_instance_id: string;
  contact_id: string;
  status: CommercialThreadStatus;
  last_message_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface MessageRecord {
  id: string;
  workspace_id: string;
  channel_instance_id: string;
  thread_id: string;
  provider: ChannelProvider;
  direction: MessageDirection;
  sender_e164: string;
  recipient_e164: string;
  content_type: MessageContentType;
  body: string | null;
  media_url: string | null;
  provider_message_id: string | null;
  delivery_status: MessageDeliveryStatus;
  status_rank: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateContactParams {
  workspaceId: string;
  phoneE164: string;
  name?: string | null;
}

export interface GetOrCreateThreadParams {
  workspaceId: string;
  channelInstanceId: string;
  contactId: string;
  status?: CommercialThreadStatus;
}

export interface CreateMessageParams {
  workspaceId: string;
  channelInstanceId: string;
  threadId: string;
  provider: ChannelProvider;
  direction: MessageDirection;
  senderE164: string;
  recipientE164: string;
  contentType: MessageContentType;
  body?: string | null;
  mediaUrl?: string | null;
  providerMessageId?: string | null;
  deliveryStatus?: MessageDeliveryStatus;
  statusRank?: number;
}

export interface ListThreadMessagesParams {
  workspaceId: string;
  threadId: string;
  limit?: number;
  ascending?: boolean;
}

/**
 * Creates or retrieves an existing contact by phone within a workspace.
 * Guaranteed tenant-safe with composite unique constraint (workspace_id, phone_e164).
 */
export async function createOrGetContact(
  client: Pool | PoolClient,
  params: CreateContactParams
): Promise<ContactRecord> {
  const res = await client.query<ContactRecord>(
    `INSERT INTO public.contacts (workspace_id, phone_e164, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, phone_e164)
     DO UPDATE SET 
       name = COALESCE(EXCLUDED.name, public.contacts.name),
       updated_at = now()
     RETURNING id, workspace_id, phone_e164, name, created_at, updated_at;`,
    [params.workspaceId, params.phoneE164, params.name || null]
  );
  return res.rows[0]!;
}

/**
 * Creates or retrieves a commercial thread between a channel instance and a contact.
 * Enforces composite FKs linking workspace_id with channel_instance_id and contact_id.
 */
export async function getOrCreateCommercialThread(
  client: Pool | PoolClient,
  params: GetOrCreateThreadParams
): Promise<CommercialThreadRecord> {
  const res = await client.query<CommercialThreadRecord>(
    `INSERT INTO public.commercial_threads (
       workspace_id, channel_instance_id, contact_id, status
     ) VALUES (
       $1, $2, $3, COALESCE($4, 'active')
     )
     ON CONFLICT (workspace_id, channel_instance_id, contact_id)
     DO UPDATE SET updated_at = now()
     RETURNING id, workspace_id, channel_instance_id, contact_id, status, last_message_at, created_at, updated_at;`,
    [
      params.workspaceId,
      params.channelInstanceId,
      params.contactId,
      params.status || "active",
    ]
  );
  return res.rows[0]!;
}

/**
 * Inserts a conversational message linked to a thread and channel instance,
 * and updates the thread's last_message_at timestamp.
 */
export async function insertMessage(
  client: Pool | PoolClient,
  params: CreateMessageParams
): Promise<MessageRecord> {
  const rank =
    params.statusRank !== undefined
      ? params.statusRank
      : params.deliveryStatus === "sent"
      ? 10
      : params.deliveryStatus === "delivered"
      ? 20
      : params.deliveryStatus === "read"
      ? 30
      : params.deliveryStatus === "failed"
      ? -1
      : 0;

  const res = await client.query<MessageRecord>(
    `INSERT INTO public.messages (
       workspace_id, channel_instance_id, thread_id, provider, direction,
       sender_e164, recipient_e164, content_type, body, media_url,
       provider_message_id, delivery_status, status_rank
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, COALESCE($12, 'queued'), $13
     )
     RETURNING *;`,
    [
      params.workspaceId,
      params.channelInstanceId,
      params.threadId,
      params.provider,
      params.direction,
      params.senderE164,
      params.recipientE164,
      params.contentType,
      params.body ?? null,
      params.mediaUrl ?? null,
      params.providerMessageId ?? null,
      params.deliveryStatus || "queued",
      rank,
    ]
  );

  // Update thread's last_message_at
  await client.query(
    `UPDATE public.commercial_threads
     SET last_message_at = now(), updated_at = now()
     WHERE workspace_id = $1 AND id = $2;`,
    [params.workspaceId, params.threadId]
  );

  return res.rows[0]!;
}

/**
 * Lists messages for a thread strictly within the specified tenant workspace.
 */
export async function listThreadMessages(
  client: Pool | PoolClient,
  params: ListThreadMessagesParams
): Promise<MessageRecord[]> {
  const order = params.ascending ? "ASC" : "DESC";
  const limit = params.limit ?? 50;

  const res = await client.query<MessageRecord>(
    `SELECT * FROM public.messages
     WHERE workspace_id = $1 AND thread_id = $2
     ORDER BY created_at ${order}
     LIMIT $3;`,
    [params.workspaceId, params.threadId, limit]
  );

  return res.rows;
}

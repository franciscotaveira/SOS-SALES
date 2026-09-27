import type { Pool, PoolClient } from "pg";
import crypto from "node:crypto";

export type JourneyStage = "lead" | "qualified" | "proposal" | "scheduled" | "won" | "lost";
export type JourneyStatus = "open" | "won" | "lost" | "archived";
export type AttributionSource = "ctwa_meta" | "lead_ads_meta" | "tracked_link_meta" | "organic_whatsapp" | "manual_input";
export type OutcomeStatus = "won" | "lost";
export type CanonicalConversionEvent =
  | "LeadCaptured"
  | "LeadQualified"
  | "AppointmentScheduled"
  | "ProposalAccepted"
  | "PurchaseCompleted"
  | "PurchaseRefunded";
export type CapiDispatchStatus = "QUEUED" | "ACCEPTED" | "FAILED" | "NOT_APPLICABLE";

export interface CommercialJourneyRecord {
  id: string;
  workspace_id: string;
  contact_id: string;
  thread_id: string | null;
  assigned_user_id: string | null;
  title: string;
  stage: JourneyStage;
  status: JourneyStatus;
  attribution_source: AttributionSource;
  campaign_id: string | null;
  ad_id: string | null;
  ctwa_clid: string | null;
  estimated_value_cents: number;
  created_at: Date;
  updated_at: Date;
}

export interface CommercialOutcomeRecord {
  id: string;
  workspace_id: string;
  journey_id: string;
  status: OutcomeStatus;
  value_cents: number;
  currency: string;
  reason: string | null;
  registered_by_user_id: string;
  created_at: Date;
}

export interface ConversionEventRecord {
  id: string;
  workspace_id: string;
  journey_id: string;
  outcome_id: string | null;
  event_name: CanonicalConversionEvent;
  event_time: Date;
  value_cents: number | null;
  currency: string;
  user_data: Record<string, unknown>;
  status: CapiDispatchStatus;
  provider_receipt: Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date;
}

export interface CreateJourneyInput {
  contactId: string;
  threadId?: string | null;
  assignedUserId?: string | null;
  title?: string;
  stage?: JourneyStage;
  attributionSource?: AttributionSource;
  campaignId?: string | null;
  adId?: string | null;
  ctwaClid?: string | null;
  estimatedValueCents?: number;
}

export interface RecordOutcomeInput {
  journeyId: string;
  status: OutcomeStatus;
  valueCents: number;
  currency?: string;
  reason?: string;
  registeredByUserId: string;
  userPhoneE164?: string;
}

/**
 * Creates a commercial journey (opportunity/deal) strictly bound to tenant RLS.
 */
export async function createCommercialJourney(
  client: Pool | PoolClient,
  workspaceId: string,
  input: CreateJourneyInput
): Promise<CommercialJourneyRecord> {
  const res = await client.query<CommercialJourneyRecord>(
    `INSERT INTO public.commercial_journeys (
      workspace_id, contact_id, thread_id, assigned_user_id,
      title, stage, status, attribution_source,
      campaign_id, ad_id, ctwa_clid, estimated_value_cents
    ) VALUES (
      $1, $2, $3, $4,
      COALESCE($5, 'Oportunidade Comercial'),
      COALESCE($6, 'lead'),
      'open',
      COALESCE($7, 'organic_whatsapp'),
      $8, $9, $10,
      COALESCE($11, 0)
    ) RETURNING *;`,
    [
      workspaceId,
      input.contactId,
      input.threadId || null,
      input.assignedUserId || null,
      input.title || null,
      input.stage || "lead",
      input.attributionSource || "organic_whatsapp",
      input.campaignId || null,
      input.adId || null,
      input.ctwaClid || null,
      input.estimatedValueCents || 0,
    ]
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error("Failed to insert commercial journey record under tenant scope");
  }
  return row;
}

/**
 * Finds or retrieves a commercial journey by contact ID under tenant scope.
 */
export async function getJourneyByContact(
  client: Pool | PoolClient,
  workspaceId: string,
  contactId: string
): Promise<CommercialJourneyRecord | null> {
  const res = await client.query<CommercialJourneyRecord>(
    `SELECT * FROM public.commercial_journeys
     WHERE workspace_id = $1 AND contact_id = $2
     ORDER BY created_at DESC
     LIMIT 1;`,
    [workspaceId, contactId]
  );
  return res.rows[0] ?? null;
}

/**
 * Retrieves a commercial journey by thread ID under tenant scope.
 */
export async function getJourneyByThread(
  client: Pool | PoolClient,
  workspaceId: string,
  threadId: string
): Promise<CommercialJourneyRecord | null> {
  const res = await client.query<CommercialJourneyRecord>(
    `SELECT * FROM public.commercial_journeys
     WHERE workspace_id = $1 AND thread_id = $2
     ORDER BY created_at DESC
     LIMIT 1;`,
    [workspaceId, threadId]
  );
  return res.rows[0] ?? null;
}

/**
 * Records a commercial outcome (closed deal) with real monetary value,
 * transitions the journey status, and automatically enqueues a Meta CAPI conversion event.
 */
export async function recordCommercialOutcome(
  client: Pool | PoolClient,
  workspaceId: string,
  input: RecordOutcomeInput
): Promise<{ outcome: CommercialOutcomeRecord; conversionEvent: ConversionEventRecord | null }> {
  // 1. Fetch journey under tenant RLS
  const journeyRes = await client.query<CommercialJourneyRecord>(
    `SELECT * FROM public.commercial_journeys WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, input.journeyId]
  );
  const journey = journeyRes.rows[0];
  if (!journey) {
    throw new Error(`Commercial journey ${input.journeyId} not found in workspace ${workspaceId}`);
  }

  // 2. Insert outcome
  const outcomeRes = await client.query<CommercialOutcomeRecord>(
    `INSERT INTO public.commercial_outcomes (
      workspace_id, journey_id, status, value_cents, currency, reason, registered_by_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;`,
    [
      workspaceId,
      input.journeyId,
      input.status,
      input.valueCents,
      input.currency || "BRL",
      input.reason || null,
      input.registeredByUserId,
    ]
  );
  const outcome = outcomeRes.rows[0];
  if (!outcome) {
    throw new Error("Failed to insert commercial outcome");
  }

  // 3. Update journey status and stage
  await client.query(
    `UPDATE public.commercial_journeys
     SET status = $1, stage = $1, updated_at = clock_timestamp()
     WHERE workspace_id = $2 AND id = $3;`,
    [input.status, workspaceId, input.journeyId]
  );

  // 4. Evaluate conversion policy for Meta CAPI return loop
  let conversionEvent: ConversionEventRecord | null = null;
  if (input.status === "won") {
    const eventName: CanonicalConversionEvent =
      input.valueCents > 0 ? "PurchaseCompleted" : "ProposalAccepted";

    const userData: Record<string, unknown> = {};
    if (input.userPhoneE164) {
      userData.hashedPhone = crypto
        .createHash("sha256")
        .update(input.userPhoneE164.trim().replace(/\D/g, ""))
        .digest("hex");
    }
    if (journey.ctwa_clid) {
      userData.ctwaClid = journey.ctwa_clid;
    }

    const convRes = await client.query<ConversionEventRecord>(
      `INSERT INTO public.conversion_events (
        workspace_id, journey_id, outcome_id, event_name, value_cents, currency, user_data, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'QUEUED')
      RETURNING *;`,
      [
        workspaceId,
        input.journeyId,
        outcome.id,
        eventName,
        input.valueCents,
        input.currency || "BRL",
        JSON.stringify(userData),
      ]
    );
    conversionEvent = convRes.rows[0] ?? null;
  }

  return { outcome, conversionEvent };
}

/**
 * Lists all commercial journeys in the workspace for CRM / Cockpit pipelines.
 */
export async function listCommercialJourneys(
  client: Pool | PoolClient,
  workspaceId: string,
  options: { status?: JourneyStatus; limit?: number } = {}
): Promise<CommercialJourneyRecord[]> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 100);
  if (options.status) {
    const res = await client.query<CommercialJourneyRecord>(
      `SELECT * FROM public.commercial_journeys
       WHERE workspace_id = $1 AND status = $2
       ORDER BY updated_at DESC
       LIMIT $3;`,
      [workspaceId, options.status, limit]
    );
    return res.rows;
  }

  const res = await client.query<CommercialJourneyRecord>(
    `SELECT * FROM public.commercial_journeys
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT $2;`,
    [workspaceId, limit]
  );
  return res.rows;
}

/**
 * Claims a batch of queued conversion events for the CAPI dispatcher.
 */
export async function claimQueuedConversionEvents(
  pool: Pool,
  limit = 10
): Promise<ConversionEventRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const res = await pool.query<ConversionEventRecord>(
    `SELECT * FROM public.conversion_events
     WHERE status = 'QUEUED'
     ORDER BY created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED;`,
    [safeLimit]
  );
  return res.rows;
}

/**
 * Marks a conversion event as processed with Meta receipt or error.
 */
export async function markConversionEventResult(
  client: Pool | PoolClient,
  eventId: string,
  result: { success: boolean; receipt?: Record<string, unknown>; error?: string }
): Promise<void> {
  if (result.success) {
    await client.query(
      `UPDATE public.conversion_events
       SET status = 'ACCEPTED',
           provider_receipt = $1,
           error_message = NULL
       WHERE id = $2;`,
      [JSON.stringify(result.receipt || {}), eventId]
    );
  } else {
    await client.query(
      `UPDATE public.conversion_events
       SET status = 'FAILED',
           error_message = $1
       WHERE id = $2;`,
      [result.error || "Unknown dispatch failure", eventId]
    );
  }
}

-- ==============================================================================
-- TX COMMERCIAL CORE — WAHA INBOUND INGESTION (P0.3A-R2C)
-- Architecture: Forward-Only Migration for Raw Ingestion & Normalized Message Processing
-- Security: Strict Service-Role Guarded Ingestion & Normalization RPCs, Partial Unique Open Journey
-- Invariants: Strict WAHA CONNECTED validation, E.164 Regex Validation, whatsapp_id storage, provider/event_type guards
-- ==============================================================================

-- 1. UNIQUE PARTIAL INDEX: AT MOST ONE OPEN JOURNEY PER CONTACT PER WORKSPACE
CREATE UNIQUE INDEX IF NOT EXISTS uq_journeys_open_per_contact
ON public.commercial_journeys(workspace_id, contact_id)
WHERE status = 'OPEN';

-- 2. RPC: INGEST CHANNEL EVENT (Asynchronous Raw Envelope Ingestion)
-- Strictly validates channel_connections.provider = 'waha' and status = 'CONNECTED'
CREATE OR REPLACE FUNCTION public.ingest_channel_event(
  p_channel_connection_id UUID,
  p_provider_event_id TEXT,
  p_event_type TEXT,
  p_raw_payload JSONB
)
RETURNS TABLE (
  inbound_event_id UUID,
  workspace_id UUID,
  is_duplicate BOOLEAN
) AS $$
#variable_conflict use_column
DECLARE
  v_workspace_id UUID;
  v_provider TEXT;
  v_status TEXT;
  v_inbound_event_id UUID;
  v_is_duplicate BOOLEAN := FALSE;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: ingest_channel_event requires service_role';
  END IF;

  -- 1. Derive and strictly validate channel connection: must be waha and CONNECTED
  SELECT cc.workspace_id, cc.provider, cc.status
  INTO v_workspace_id, v_provider, v_status
  FROM public.channel_connections cc
  WHERE cc.id = p_channel_connection_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Channel connection % not found', p_channel_connection_id;
  END IF;

  IF pg_catalog.lower(v_provider) <> 'waha' THEN
    RAISE EXCEPTION 'Invalid channel provider: expected waha, found %', v_provider;
  END IF;

  IF v_status <> 'CONNECTED' THEN
    RAISE EXCEPTION 'Channel connection % is not connected (status: %)', p_channel_connection_id, v_status;
  END IF;

  IF p_provider_event_id IS NULL OR pg_catalog.btrim(p_provider_event_id) = '' THEN
    RAISE EXCEPTION 'provider_event_id is required';
  END IF;

  -- 2. Insert raw envelope with deduplication
  INSERT INTO public.inbound_channel_events (
    workspace_id, channel_connection_id, provider, provider_event_id, event_type, raw_payload
  ) VALUES (
    v_workspace_id, p_channel_connection_id, v_provider, p_provider_event_id, p_event_type, p_raw_payload
  )
  ON CONFLICT (workspace_id, provider, provider_event_id) DO NOTHING
  RETURNING id INTO v_inbound_event_id;

  -- If duplicate, fetch existing ID and do not re-queue outbox
  IF v_inbound_event_id IS NULL THEN
    SELECT ice.id INTO v_inbound_event_id
    FROM public.inbound_channel_events ice
    WHERE ice.workspace_id = v_workspace_id
      AND ice.provider = v_provider
      AND ice.provider_event_id = p_provider_event_id;

    v_is_duplicate := TRUE;
  ELSE
    -- Queue outbox event for asynchronous ingestion processing
    INSERT INTO public.outbox_events (
      workspace_id, event_name, aggregate_type, aggregate_id, payload, idempotency_key
    ) VALUES (
      v_workspace_id,
      'inbound.channel_event_received',
      'InboundChannelEvent',
      v_inbound_event_id,
      jsonb_build_object(
        'inboundEventId', v_inbound_event_id,
        'channelConnectionId', p_channel_connection_id,
        'provider', v_provider,
        'providerEventId', p_provider_event_id,
        'eventType', p_event_type
      ),
      'outbox_inbound_' || v_inbound_event_id::text
    )
    ON CONFLICT (workspace_id, idempotency_key) DO NOTHING;
  END IF;

  inbound_event_id := v_inbound_event_id;
  workspace_id := v_workspace_id;
  is_duplicate := v_is_duplicate;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.ingest_channel_event(UUID, TEXT, TEXT, JSONB) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_channel_event(UUID, TEXT, TEXT, JSONB) TO service_role;

-- 3. RPC: NORMALIZE WAHA INBOUND MESSAGE (Executed Exclusively by the Inbound Worker)
-- Derives workspace_id, channel_connection_id, provider and event_type strictly from inbound_channel_events(id)
-- Enforces provider = 'waha' AND event_type IN ('message', 'message.any')
-- Enforces regex E.164 (+[1-9][0-9]{7,14}) and persists contacts.whatsapp_id
CREATE OR REPLACE FUNCTION public.normalize_waha_inbound_message(
  p_inbound_event_id UUID,
  p_contact_phone TEXT,
  p_whatsapp_id TEXT DEFAULT NULL,
  p_contact_name TEXT DEFAULT NULL,
  p_provider_message_id TEXT DEFAULT NULL,
  p_text_content TEXT DEFAULT NULL,
  p_media_payload JSONB DEFAULT NULL,
  p_sent_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  contact_id UUID,
  journey_id UUID,
  message_id UUID,
  is_duplicate_message BOOLEAN
) AS $$
#variable_conflict use_column
DECLARE
  v_workspace_id UUID;
  v_channel_connection_id UUID;
  v_provider TEXT;
  v_event_type TEXT;
  v_contact_id UUID;
  v_journey_id UUID;
  v_message_id UUID;
  v_is_duplicate_msg BOOLEAN := FALSE;
  v_clean_phone TEXT;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: normalize_waha_inbound_message requires service_role';
  END IF;

  -- 1. Derive workspace, channel connection, provider and event_type strictly from inbound_channel_events
  SELECT ice.workspace_id, ice.channel_connection_id, ice.provider, ice.event_type
  INTO v_workspace_id, v_channel_connection_id, v_provider, v_event_type
  FROM public.inbound_channel_events ice
  WHERE ice.id = p_inbound_event_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Inbound channel event % not found', p_inbound_event_id;
  END IF;

  IF pg_catalog.lower(v_provider) <> 'waha' THEN
    RAISE EXCEPTION 'Invalid inbound event provider: expected waha, found %', v_provider;
  END IF;

  IF v_event_type NOT IN ('message', 'message.any') THEN
    RAISE EXCEPTION 'Invalid inbound event_type for message normalization: expected message or message.any, found %', v_event_type;
  END IF;

  -- 2. Strict E.164 phone validation (international standard: + followed by 8 to 15 digits)
  v_clean_phone := pg_catalog.btrim(p_contact_phone);
  IF v_clean_phone IS NULL OR v_clean_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Invalid E.164 phone number: %', p_contact_phone;
  END IF;

  -- 3. Mandatory Provider Message ID
  IF p_provider_message_id IS NULL OR pg_catalog.btrim(p_provider_message_id) = '' THEN
    RAISE EXCEPTION 'provider_message_id is required';
  END IF;

  -- 4. Atomically upsert contact by (workspace_id, phone), storing whatsapp_id
  INSERT INTO public.contacts (
    workspace_id, phone, whatsapp_id, name
  ) VALUES (
    v_workspace_id, v_clean_phone, p_whatsapp_id, p_contact_name
  )
  ON CONFLICT (workspace_id, phone) DO UPDATE
  SET whatsapp_id = COALESCE(EXCLUDED.whatsapp_id, public.contacts.whatsapp_id),
      name = COALESCE(EXCLUDED.name, public.contacts.name),
      updated_at = NOW()
  RETURNING id INTO v_contact_id;

  -- 5. Locate active OPEN journey or atomically create new one with advisory lock per contact
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_workspace_id::text || ':journey_contact:' || v_contact_id::text, 0)
  );

  SELECT j.id INTO v_journey_id
  FROM public.commercial_journeys j
  WHERE j.workspace_id = v_workspace_id
    AND j.contact_id = v_contact_id
    AND j.status = 'OPEN'
  LIMIT 1;

  IF v_journey_id IS NULL THEN
    INSERT INTO public.commercial_journeys (
      workspace_id, contact_id, status, started_at
    ) VALUES (
      v_workspace_id, v_contact_id, 'OPEN', COALESCE(p_sent_at, NOW())
    )
    RETURNING id INTO v_journey_id;
  END IF;

  -- 6. Insert conversation message with deduplication by (channel_connection_id, provider_message_id)
  INSERT INTO public.conversation_messages (
    workspace_id,
    channel_connection_id,
    journey_id,
    contact_id,
    direction,
    sender_type,
    provider_message_id,
    text_content,
    media_payload,
    sent_at
  ) VALUES (
    v_workspace_id,
    v_channel_connection_id,
    v_journey_id,
    v_contact_id,
    'inbound',
    'customer',
    p_provider_message_id,
    p_text_content,
    p_media_payload,
    COALESCE(p_sent_at, NOW())
  )
  ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING
  RETURNING id INTO v_message_id;

  IF v_message_id IS NULL THEN
    SELECT cm.id INTO v_message_id
    FROM public.conversation_messages cm
    WHERE cm.channel_connection_id = v_channel_connection_id
      AND cm.provider_message_id = p_provider_message_id;

    v_is_duplicate_msg := TRUE;
  ELSE
    -- Queue Outbox Event for downstream cognitive decision engine
    INSERT INTO public.outbox_events (
      workspace_id, event_name, aggregate_type, aggregate_id, payload, idempotency_key
    ) VALUES (
      v_workspace_id,
      'message.inbound_received',
      'ConversationMessage',
      v_message_id,
      jsonb_build_object(
        'messageId', v_message_id,
        'journeyId', v_journey_id,
        'contactId', v_contact_id,
        'channelConnectionId', v_channel_connection_id,
        'inboundEventId', p_inbound_event_id,
        'providerMessageId', p_provider_message_id,
        'hasText', (p_text_content IS NOT NULL),
        'hasMedia', (p_media_payload IS NOT NULL)
      ),
      'outbox_msg_inbound_' || v_message_id::text
    )
    ON CONFLICT (workspace_id, idempotency_key) DO NOTHING;
  END IF;

  contact_id := v_contact_id;
  journey_id := v_journey_id;
  message_id := v_message_id;
  is_duplicate_message := v_is_duplicate_msg;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.normalize_waha_inbound_message(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_waha_inbound_message(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO service_role;

-- 4. RPC: CLAIM OUTBOX BATCH FOR SPECIFIC EVENT TYPES
CREATE OR REPLACE FUNCTION public.claim_outbox_batch_for_events(
  p_worker_id TEXT,
  p_event_names TEXT[],
  p_batch_size INT DEFAULT 10,
  p_lease_seconds INT DEFAULT 60
)
RETURNS TABLE (
  id UUID,
  workspace_id UUID,
  event_name TEXT,
  aggregate_type TEXT,
  aggregate_id UUID,
  payload JSONB,
  idempotency_key TEXT,
  claim_token UUID,
  attempts INT
) AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: claim_outbox_batch_for_events requires service_role';
  END IF;

  IF NULLIF(pg_catalog.btrim(p_worker_id), '') IS NULL THEN
    RAISE EXCEPTION 'worker_id is required';
  END IF;

  IF p_batch_size < 1 OR p_batch_size > 100 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 100';
  END IF;

  IF p_lease_seconds < 5 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'lease_seconds must be between 5 and 3600';
  END IF;

  IF p_event_names IS NULL OR pg_catalog.cardinality(p_event_names) = 0 THEN
    RAISE EXCEPTION 'event_names array cannot be empty';
  END IF;

  -- Expire dead letter candidates
  UPDATE public.outbox_events e
  SET status = 'DEAD_LETTER',
      last_error = COALESCE(e.last_error, 'Maximum delivery attempts exceeded'),
      locked_at = NULL,
      locked_by = NULL,
      claim_token = NULL
  WHERE e.status = 'PROCESSING'
    AND e.event_name = ANY(p_event_names)
    AND e.attempts >= e.max_attempts
    AND e.locked_at < NOW() - (p_lease_seconds || ' seconds')::interval;

  RETURN QUERY
  WITH candidates AS (
    SELECT e.id
    FROM public.outbox_events e
    WHERE e.event_name = ANY(p_event_names)
      AND (
        (e.status = 'PENDING' AND e.scheduled_for <= NOW())
        OR (e.status = 'FAILED' AND e.attempts < e.max_attempts AND e.scheduled_for <= NOW())
        OR (e.status = 'PROCESSING' AND e.attempts < e.max_attempts AND e.locked_at < NOW() - (p_lease_seconds || ' seconds')::interval)
      )
    ORDER BY e.scheduled_for ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_events target
  SET status = 'PROCESSING',
      locked_at = NOW(),
      locked_by = p_worker_id,
      claim_token = gen_random_uuid(),
      attempts = target.attempts + 1
  FROM candidates c
  WHERE target.id = c.id
  RETURNING target.id, target.workspace_id, target.event_name, target.aggregate_type,
            target.aggregate_id, target.payload, target.idempotency_key, target.claim_token, target.attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.claim_outbox_batch_for_events(TEXT, TEXT[], INT, INT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbox_batch_for_events(TEXT, TEXT[], INT, INT) TO service_role;

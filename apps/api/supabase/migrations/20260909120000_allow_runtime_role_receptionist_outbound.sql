-- Migration: Allow sos_sales_runtime role in receptionist outbound reservations
-- Enables the production API pool (which connects as sos_sales_runtime) to safely reserve and complete outbound messages.

CREATE OR REPLACE FUNCTION public.reserve_receptionist_outbound(
  p_workspace_id UUID,
  p_conversation_message_id UUID,
  p_journey_id UUID,
  p_contact_id UUID,
  p_channel_connection_id UUID,
  p_provider TEXT,
  p_message_kind TEXT,
  p_reply_text TEXT,
  p_reply_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.receptionist_outbound_reservations%ROWTYPE;
  v_provider TEXT := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_provider, '')));
  v_kind TEXT := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_message_kind, '')));
  v_reply TEXT := COALESCE(p_reply_text, '');
  v_fingerprint TEXT := pg_catalog.btrim(COALESCE(p_reply_fingerprint, ''));
BEGIN
  -- The function is executable by server-side identities (postgres, service_role, supabase_admin, sos_sales_runtime)
  IF session_user NOT IN ('postgres', 'service_role', 'supabase_admin', 'sos_sales_runtime')
     AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: receptionist outbound reservation requires server role';
  END IF;

  IF p_workspace_id IS NULL OR p_conversation_message_id IS NULL
     OR p_journey_id IS NULL OR p_contact_id IS NULL
     OR p_channel_connection_id IS NULL
     OR v_provider NOT IN ('waha', 'meta_cloud')
     OR v_kind NOT IN ('TEXT', 'FLOW')
     OR char_length(v_reply) > 4096
     OR char_length(v_fingerprint) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'Invalid receptionist outbound reservation request';
  END IF;

  INSERT INTO public.receptionist_outbound_reservations (
    workspace_id, conversation_message_id, journey_id, contact_id,
    channel_connection_id, provider, message_kind, reply_fingerprint,
    reply_text, status, attempts
  ) VALUES (
    p_workspace_id, p_conversation_message_id, p_journey_id, p_contact_id,
    p_channel_connection_id, v_provider, v_kind, v_fingerprint,
    v_reply, 'SENDING', 1
  )
  ON CONFLICT (workspace_id, conversation_message_id, message_kind) DO NOTHING
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row
    FROM public.receptionist_outbound_reservations
    WHERE workspace_id = p_workspace_id
      AND conversation_message_id = p_conversation_message_id
      AND message_kind = v_kind
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Receptionist outbound reservation disappeared';
    END IF;

    IF v_row.reply_fingerprint <> v_fingerprint
       OR v_row.provider <> v_provider
       OR v_row.journey_id <> p_journey_id
       OR v_row.channel_connection_id <> p_channel_connection_id THEN
      RAISE EXCEPTION 'Receptionist outbound reservation fingerprint conflict';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'reservationId', v_row.id,
      'status', v_row.status,
      'providerMessageId', v_row.provider_message_id,
      'shouldSend', false,
      'attempts', v_row.attempts
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'reservationId', v_row.id,
    'status', v_row.status,
    'providerMessageId', v_row.provider_message_id,
    'shouldSend', true,
    'attempts', v_row.attempts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_receptionist_outbound(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) TO postgres, service_role, sos_sales_runtime;

CREATE OR REPLACE FUNCTION public.complete_receptionist_outbound(
  p_reservation_id UUID,
  p_provider_message_id TEXT,
  p_media_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.receptionist_outbound_reservations%ROWTYPE;
  v_provider_id TEXT := pg_catalog.btrim(COALESCE(p_provider_message_id, ''));
  v_message_id UUID;
BEGIN
  IF session_user NOT IN ('postgres', 'service_role', 'supabase_admin', 'sos_sales_runtime')
     AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: receptionist outbound completion requires server role';
  END IF;
  IF p_reservation_id IS NULL OR v_provider_id = ''
     OR p_media_payload IS NULL OR pg_catalog.jsonb_typeof(p_media_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid receptionist outbound completion request';
  END IF;

  SELECT * INTO v_row
  FROM public.receptionist_outbound_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receptionist outbound reservation not found';
  END IF;

  IF v_row.status = 'SENT' THEN
    IF v_row.provider_message_id IS DISTINCT FROM v_provider_id THEN
      RAISE EXCEPTION 'Receptionist outbound provider id conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'reservationId', v_row.id, 'status', v_row.status,
      'providerMessageId', v_row.provider_message_id, 'idempotent', true
    );
  END IF;

  IF v_row.status <> 'SENDING' THEN
    RAISE EXCEPTION 'Receptionist outbound reservation is not sending (status: %)', v_row.status;
  END IF;

  INSERT INTO public.conversation_messages (
    id, workspace_id, channel_connection_id, journey_id, contact_id,
    direction, sender_type, provider_message_id, text_content,
    media_payload, sent_at
  ) VALUES (
    pg_catalog.gen_random_uuid(),
    v_row.workspace_id,
    v_row.channel_connection_id,
    v_row.journey_id,
    v_row.contact_id,
    'outbound',
    'ai',
    v_provider_id,
    v_row.reply_text,
    p_media_payload,
    pg_catalog.clock_timestamp()
  )
  ON CONFLICT (channel_connection_id, provider_message_id)
  DO UPDATE SET text_content = EXCLUDED.text_content
  RETURNING id INTO v_message_id;

  UPDATE public.receptionist_outbound_reservations
  SET status = 'SENT',
      provider_message_id = v_provider_id,
      outbound_message_id = v_message_id,
      failure_code = NULL,
      updated_at = NOW()
  WHERE id = v_row.id;

  RETURN pg_catalog.jsonb_build_object(
    'reservationId', v_row.id,
    'status', 'SENT',
    'providerMessageId', v_provider_id,
    'outboundMessageId', v_message_id,
    'idempotent', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_receptionist_outbound(UUID, TEXT, JSONB)
  TO postgres, service_role, sos_sales_runtime;

CREATE OR REPLACE FUNCTION public.mark_receptionist_outbound_unknown(
  p_reservation_id UUID,
  p_failure_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.receptionist_outbound_reservations%ROWTYPE;
BEGIN
  IF session_user NOT IN ('postgres', 'service_role', 'supabase_admin', 'sos_sales_runtime')
     AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: receptionist outbound failure requires server role';
  END IF;

  UPDATE public.receptionist_outbound_reservations
  SET status = CASE WHEN status = 'SENT' THEN status ELSE 'UNKNOWN' END,
      failure_code = NULLIF(pg_catalog.btrim(COALESCE(p_failure_code, '')), ''),
      attempts = attempts + CASE WHEN status = 'SENT' THEN 0 ELSE 1 END,
      updated_at = NOW()
  WHERE id = p_reservation_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receptionist outbound reservation not found';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'reservationId', v_row.id,
    'status', v_row.status,
    'failureCode', v_row.failure_code,
    'attempts', v_row.attempts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_receptionist_outbound_unknown(UUID, TEXT)
  TO postgres, service_role, sos_sales_runtime;

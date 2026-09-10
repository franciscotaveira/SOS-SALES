-- Keep journey lifecycle and irreversible receptionist sends in one database order.
-- A new outbound reservation locks and validates the journey before the provider
-- call. Closing an OPEN journey is rejected while a send is still SENDING.

ALTER TABLE public.receptionist_outbound_reservations
  DROP CONSTRAINT IF EXISTS receptionist_outbound_reservations_message_kind_check;

ALTER TABLE public.receptionist_outbound_reservations
  ADD CONSTRAINT receptionist_outbound_reservations_message_kind_check
  CHECK (message_kind IN ('TEXT', 'TEXT_SECONDARY', 'FLOW'));

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
  v_journey public.commercial_journeys%ROWTYPE;
  v_provider TEXT := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_provider, '')));
  v_kind TEXT := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_message_kind, '')));
  v_reply TEXT := COALESCE(p_reply_text, '');
  v_fingerprint TEXT := pg_catalog.btrim(COALESCE(p_reply_fingerprint, ''));
BEGIN
  IF session_user NOT IN ('postgres', 'service_role', 'supabase_admin', 'sos_sales_runtime')
     AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: receptionist outbound reservation requires server role';
  END IF;

  IF p_workspace_id IS NULL OR p_conversation_message_id IS NULL
     OR p_journey_id IS NULL OR p_contact_id IS NULL
     OR p_channel_connection_id IS NULL
     OR v_provider NOT IN ('waha', 'meta_cloud')
     OR v_kind NOT IN ('TEXT', 'TEXT_SECONDARY', 'FLOW')
     OR char_length(v_reply) > 4096
     OR char_length(v_fingerprint) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'Invalid receptionist outbound reservation request';
  END IF;

  -- Serialize reserve versus close on the journey row. Whichever transaction
  -- obtains this lock first defines the only valid outcome of the race.
  SELECT * INTO v_journey
  FROM public.commercial_journeys
  WHERE id = p_journey_id
    AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_journey.contact_id <> p_contact_id
     OR v_journey.channel_connection_id <> p_channel_connection_id THEN
    RAISE EXCEPTION 'Receptionist outbound journey mismatch';
  END IF;

  IF v_journey.status <> 'OPEN'
     OR v_journey.bot_enabled IS DISTINCT FROM true
     OR v_journey.bot_paused_at IS NOT NULL
     OR v_journey.responder_owner = 'human' THEN
    RETURN pg_catalog.jsonb_build_object(
      'reservationId', NULL,
      'status', 'BLOCKED_JOURNEY',
      'providerMessageId', NULL,
      'shouldSend', false,
      'attempts', 0
    );
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
       OR v_row.contact_id <> p_contact_id
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

REVOKE ALL ON FUNCTION public.reserve_receptionist_outbound(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_receptionist_outbound(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) TO postgres, service_role, sos_sales_runtime;

CREATE OR REPLACE FUNCTION public.block_journey_close_during_receptionist_send()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'OPEN'
     AND OLD.bot_enabled IS TRUE
     AND OLD.bot_paused_at IS NULL
     AND OLD.responder_owner IS DISTINCT FROM 'human'
     AND (
       NEW.status <> 'OPEN'
       OR NEW.bot_enabled IS DISTINCT FROM true
       OR NEW.bot_paused_at IS NOT NULL
       OR NEW.responder_owner = 'human'
     )
     AND EXISTS (
       SELECT 1
       FROM public.receptionist_outbound_reservations reservation
       WHERE reservation.workspace_id = OLD.workspace_id
         AND reservation.journey_id = OLD.id
         AND reservation.status = 'SENDING'
     ) THEN
    RAISE EXCEPTION 'Journey cannot transition while a receptionist outbound is in progress'
      USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_journey_close_during_receptionist_send
  ON public.commercial_journeys;
CREATE TRIGGER trg_block_journey_close_during_receptionist_send
BEFORE UPDATE OF status, bot_enabled, bot_paused_at, responder_owner ON public.commercial_journeys
FOR EACH ROW
EXECUTE FUNCTION public.block_journey_close_during_receptionist_send();

REVOKE ALL ON FUNCTION public.block_journey_close_during_receptionist_send()
  FROM PUBLIC, anon, authenticated;

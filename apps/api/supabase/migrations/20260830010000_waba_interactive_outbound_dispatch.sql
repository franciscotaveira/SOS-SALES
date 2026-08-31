-- Durable Meta Cloud interactive outbound. Existing TEXT dispatches remain valid.
ALTER TABLE public.outbound_dispatches
  ADD COLUMN IF NOT EXISTS message_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.outbound_dispatches
  DROP CONSTRAINT IF EXISTS outbound_dispatches_message_kind_check;
ALTER TABLE public.outbound_dispatches
  ADD CONSTRAINT outbound_dispatches_message_kind_check
  CHECK (message_kind IN ('TEXT','WABA_TEMPLATE','WABA_BUTTONS','WABA_LIST','WABA_FLOW','WABA_MEDIA'));

CREATE OR REPLACE FUNCTION public.create_waba_outbound_draft(
  p_workspace_id UUID,
  p_journey_id UUID,
  p_message_kind TEXT,
  p_text_content TEXT,
  p_message_payload JSONB,
  p_idempotency_key TEXT
) RETURNS JSONB AS $$
DECLARE
  v_actor UUID;
  v_journey public.commercial_journeys%ROWTYPE;
  v_dispatch public.outbound_dispatches%ROWTYPE;
BEGIN
  IF p_message_kind NOT IN ('WABA_TEMPLATE','WABA_BUTTONS','WABA_LIST','WABA_FLOW','WABA_MEDIA')
    OR p_text_content IS NULL OR char_length(btrim(p_text_content)) NOT BETWEEN 1 AND 4096
    OR p_message_payload IS NULL OR jsonb_typeof(p_message_payload) <> 'object'
    OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid WABA outbound draft request';
  END IF;
  v_actor := public.require_workspace_operator(p_workspace_id);
  SELECT * INTO v_dispatch FROM public.outbound_dispatches
  WHERE workspace_id = p_workspace_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('dispatchId',v_dispatch.id,'status',v_dispatch.status,'idempotent',true);
  END IF;
  SELECT * INTO v_journey FROM public.commercial_journeys
  WHERE id=p_journey_id AND workspace_id=p_workspace_id AND status='OPEN' FOR UPDATE;
  IF NOT FOUND OR v_journey.channel_connection_id IS NULL THEN
    RAISE EXCEPTION 'Open journey with a channel is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.channel_connections
    WHERE id=v_journey.channel_connection_id AND workspace_id=p_workspace_id
      AND provider='meta_cloud' AND status='CONNECTED'
  ) THEN
    RAISE EXCEPTION 'WABA outbound requires the journey Meta Cloud channel to be connected';
  END IF;
  INSERT INTO public.outbound_dispatches(
    workspace_id, journey_id, contact_id, channel_connection_id, message_kind,
    text_content, message_payload, created_by_user_id, idempotency_key
  ) VALUES (
    p_workspace_id, v_journey.id, v_journey.contact_id, v_journey.channel_connection_id,
    p_message_kind, btrim(p_text_content), p_message_payload, v_actor, btrim(p_idempotency_key)
  ) RETURNING * INTO v_dispatch;
  INSERT INTO public.outbound_dispatch_events(
    workspace_id,outbound_dispatch_id,event_type,actor_user_id,idempotency_key,detail
  ) VALUES (
    p_workspace_id,v_dispatch.id,'DRAFT_CREATED',v_actor,'draft:'||btrim(p_idempotency_key),
    jsonb_build_object('messageKind',p_message_kind)
  );
  RETURN jsonb_build_object('dispatchId',v_dispatch.id,'status','DRAFT','idempotent',false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.create_waba_outbound_draft(UUID,UUID,TEXT,TEXT,JSONB,TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_waba_outbound_draft(UUID,UUID,TEXT,TEXT,JSONB,TEXT)
  TO authenticated;

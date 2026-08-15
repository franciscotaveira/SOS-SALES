-- =============================================================================
-- SALES OS — P0.4B: SUPERVISED WAHA OUTBOUND CONTRACT
--
-- This migration intentionally does not perform HTTP requests or enqueue a
-- provider job. It creates only the audited state machine a future worker must
-- consume: human-created draft -> explicit human approval -> leased dispatch ->
-- provider acceptance/failure record. Missing controls always fail closed.
-- =============================================================================

-- Repair the inbound projection introduced before the journey/channel boundary
-- existed. An open journey may be backfilled only when its channel is NULL;
-- mixing channels in one open journey is rejected rather than guessed.
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
RETURNS TABLE (contact_id UUID, journey_id UUID, message_id UUID, is_duplicate_message BOOLEAN) AS $$
#variable_conflict use_column
DECLARE
  v_workspace_id UUID; v_channel_connection_id UUID; v_provider TEXT; v_event_type TEXT;
  v_contact_id UUID; v_journey_id UUID; v_message_id UUID; v_is_duplicate_msg BOOLEAN := FALSE;
  v_clean_phone TEXT;
BEGIN
  IF NOT public.is_service_role() THEN RAISE EXCEPTION 'Unauthorized: normalize_waha_inbound_message requires service_role'; END IF;
  SELECT ice.workspace_id, ice.channel_connection_id, ice.provider, ice.event_type
    INTO v_workspace_id, v_channel_connection_id, v_provider, v_event_type
    FROM public.inbound_channel_events ice WHERE ice.id = p_inbound_event_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Inbound channel event % not found', p_inbound_event_id; END IF;
  IF pg_catalog.lower(v_provider) <> 'waha' THEN RAISE EXCEPTION 'Invalid inbound event provider: expected waha, found %', v_provider; END IF;
  IF v_event_type NOT IN ('message', 'message.any') THEN RAISE EXCEPTION 'Invalid inbound event_type for message normalization: expected message or message.any, found %', v_event_type; END IF;
  v_clean_phone := pg_catalog.btrim(p_contact_phone);
  IF v_clean_phone IS NULL OR v_clean_phone !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'Invalid E.164 phone number: %', p_contact_phone; END IF;
  IF p_provider_message_id IS NULL OR pg_catalog.btrim(p_provider_message_id) = '' THEN RAISE EXCEPTION 'provider_message_id is required'; END IF;

  INSERT INTO public.contacts (workspace_id, phone, whatsapp_id, name)
  VALUES (v_workspace_id, v_clean_phone, p_whatsapp_id, p_contact_name)
  ON CONFLICT (workspace_id, phone) DO UPDATE SET
    whatsapp_id = COALESCE(EXCLUDED.whatsapp_id, public.contacts.whatsapp_id),
    name = COALESCE(EXCLUDED.name, public.contacts.name), updated_at = NOW()
  RETURNING id INTO v_contact_id;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_workspace_id::text || ':journey_contact:' || v_contact_id::text, 0));
  SELECT j.id INTO v_journey_id FROM public.commercial_journeys j
  WHERE j.workspace_id = v_workspace_id AND j.contact_id = v_contact_id AND j.status = 'OPEN' LIMIT 1;
  IF v_journey_id IS NULL THEN
    INSERT INTO public.commercial_journeys (workspace_id, contact_id, channel_connection_id, status, started_at)
    VALUES (v_workspace_id, v_contact_id, v_channel_connection_id, 'OPEN', COALESCE(p_sent_at, NOW())) RETURNING id INTO v_journey_id;
  ELSIF EXISTS (SELECT 1 FROM public.commercial_journeys WHERE id = v_journey_id AND channel_connection_id IS NOT NULL AND channel_connection_id <> v_channel_connection_id) THEN
    RAISE EXCEPTION 'Open journey % belongs to a different channel', v_journey_id;
  ELSE
    UPDATE public.commercial_journeys SET channel_connection_id = v_channel_connection_id
    WHERE id = v_journey_id AND channel_connection_id IS NULL;
  END IF;

  INSERT INTO public.conversation_messages (workspace_id, channel_connection_id, journey_id, contact_id, direction, sender_type, provider_message_id, text_content, media_payload, sent_at)
  VALUES (v_workspace_id, v_channel_connection_id, v_journey_id, v_contact_id, 'inbound', 'customer', p_provider_message_id, p_text_content, p_media_payload, COALESCE(p_sent_at, NOW()))
  ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING RETURNING id INTO v_message_id;
  IF v_message_id IS NULL THEN
    SELECT cm.id INTO v_message_id FROM public.conversation_messages cm WHERE cm.channel_connection_id = v_channel_connection_id AND cm.provider_message_id = p_provider_message_id;
    v_is_duplicate_msg := TRUE;
  ELSE
    INSERT INTO public.outbox_events (workspace_id, event_name, aggregate_type, aggregate_id, payload, idempotency_key)
    VALUES (v_workspace_id, 'message.inbound_received', 'ConversationMessage', v_message_id,
      jsonb_build_object('messageId',v_message_id,'journeyId',v_journey_id,'contactId',v_contact_id,'channelConnectionId',v_channel_connection_id,'inboundEventId',p_inbound_event_id,'providerMessageId',p_provider_message_id,'hasText',(p_text_content IS NOT NULL),'hasMedia',(p_media_payload IS NOT NULL)),
      'outbox_msg_inbound_' || v_message_id::text) ON CONFLICT (workspace_id, idempotency_key) DO NOTHING;
  END IF;
  contact_id := v_contact_id; journey_id := v_journey_id; message_id := v_message_id; is_duplicate_message := v_is_duplicate_msg; RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TABLE public.outbound_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  channel_connection_id UUID NOT NULL,
  message_kind TEXT NOT NULL DEFAULT 'TEXT' CHECK (message_kind = 'TEXT'),
  text_content TEXT NOT NULL CHECK (char_length(btrim(text_content)) BETWEEN 1 AND 4096),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','CLAIMED','ACCEPTED','FAILED','CANCELLED')),
  created_by_user_id UUID NOT NULL,
  approved_by_user_id UUID,
  approved_at TIMESTAMPTZ,
  approval_idempotency_key TEXT UNIQUE,
  cancelled_by_user_id UUID,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  claim_token UUID,
  claimed_by TEXT,
  claim_expires_at TIMESTAMPTZ,
  provider_message_id TEXT,
  provider_accepted_at TIMESTAMPTZ,
  provider_failure_code TEXT,
  provider_failure_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_outbound_dispatch_workspace_idempotency UNIQUE (workspace_id, idempotency_key),
  CONSTRAINT uq_outbound_dispatch_workspace_id UNIQUE (workspace_id, id),
  CONSTRAINT fk_outbound_dispatch_journey_same_workspace FOREIGN KEY (workspace_id, journey_id) REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_outbound_dispatch_contact_same_workspace FOREIGN KEY (workspace_id, contact_id) REFERENCES public.contacts(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_outbound_dispatch_channel_same_workspace FOREIGN KEY (workspace_id, channel_connection_id) REFERENCES public.channel_connections(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_outbound_approval_shape CHECK ((status IN ('APPROVED','CLAIMED','ACCEPTED','FAILED') AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL) OR (status IN ('DRAFT','CANCELLED'))),
  CONSTRAINT ck_outbound_cancel_shape CHECK ((status = 'CANCELLED' AND cancelled_by_user_id IS NOT NULL AND cancelled_at IS NOT NULL AND char_length(btrim(cancellation_reason)) >= 3) OR status <> 'CANCELLED'),
  CONSTRAINT ck_outbound_claim_shape CHECK ((status = 'CLAIMED' AND claim_token IS NOT NULL AND claimed_by IS NOT NULL AND claim_expires_at IS NOT NULL) OR status <> 'CLAIMED'),
  CONSTRAINT ck_outbound_accept_shape CHECK ((status = 'ACCEPTED' AND provider_message_id IS NOT NULL AND provider_accepted_at IS NOT NULL) OR status <> 'ACCEPTED'),
  CONSTRAINT ck_outbound_failure_shape CHECK ((status = 'FAILED' AND provider_failure_code IS NOT NULL AND provider_failure_at IS NOT NULL) OR status <> 'FAILED')
);
CREATE INDEX idx_outbound_dispatches_claimable ON public.outbound_dispatches(status, claim_expires_at) WHERE status IN ('APPROVED','CLAIMED');
CREATE INDEX idx_outbound_dispatches_journey_created ON public.outbound_dispatches(journey_id, created_at DESC);
CREATE TRIGGER trg_outbound_dispatches_updated_at BEFORE UPDATE ON public.outbound_dispatches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.outbound_dispatch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  outbound_dispatch_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('DRAFT_CREATED','APPROVED','CANCELLED','CLAIMED','PROVIDER_ACCEPTED','PROVIDER_FAILED')),
  actor_user_id UUID,
  worker_id TEXT,
  idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 240),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_outbound_dispatch_events_same_workspace FOREIGN KEY (workspace_id, outbound_dispatch_id) REFERENCES public.outbound_dispatches(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_outbound_dispatch_event_idempotency UNIQUE (workspace_id, outbound_dispatch_id, idempotency_key)
);
CREATE INDEX idx_outbound_dispatch_events_dispatch_created ON public.outbound_dispatch_events(outbound_dispatch_id, created_at DESC);
CREATE TRIGGER trg_outbound_dispatch_events_immutable BEFORE UPDATE OR DELETE ON public.outbound_dispatch_events FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

ALTER TABLE public.outbound_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_dispatch_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_outbound_dispatches ON public.outbound_dispatches FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_outbound_dispatch_events ON public.outbound_dispatch_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_select_outbound_dispatches ON public.outbound_dispatches FOR SELECT TO authenticated USING (workspace_id IN (SELECT public.current_user_workspace_ids()));
CREATE POLICY tenant_select_outbound_dispatch_events ON public.outbound_dispatch_events FOR SELECT TO authenticated USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE OR REPLACE FUNCTION public.create_outbound_draft(p_workspace_id UUID, p_journey_id UUID, p_text_content TEXT, p_idempotency_key TEXT)
RETURNS JSONB AS $$
DECLARE v_actor UUID; v_journey public.commercial_journeys%ROWTYPE; v_dispatch public.outbound_dispatches%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) < 8 OR p_text_content IS NULL OR char_length(btrim(p_text_content)) NOT BETWEEN 1 AND 4096 THEN RAISE EXCEPTION 'Invalid outbound draft request'; END IF;
  v_actor := public.require_workspace_operator(p_workspace_id);
  SELECT * INTO v_dispatch FROM public.outbound_dispatches WHERE workspace_id = p_workspace_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('dispatchId',v_dispatch.id,'status',v_dispatch.status,'idempotent',true); END IF;
  SELECT * INTO v_journey FROM public.commercial_journeys WHERE id=p_journey_id AND workspace_id=p_workspace_id AND status='OPEN' FOR UPDATE;
  IF NOT FOUND OR v_journey.channel_connection_id IS NULL THEN RAISE EXCEPTION 'Open journey with a channel is required'; END IF;
  INSERT INTO public.outbound_dispatches(workspace_id,journey_id,contact_id,channel_connection_id,text_content,created_by_user_id,idempotency_key)
  VALUES(p_workspace_id,p_journey_id,v_journey.contact_id,v_journey.channel_connection_id,btrim(p_text_content),v_actor,btrim(p_idempotency_key)) RETURNING * INTO v_dispatch;
  INSERT INTO public.outbound_dispatch_events(workspace_id,outbound_dispatch_id,event_type,actor_user_id,idempotency_key,detail)
  VALUES(p_workspace_id,v_dispatch.id,'DRAFT_CREATED',v_actor,'draft:'||btrim(p_idempotency_key),jsonb_build_object('messageKind','TEXT'));
  RETURN jsonb_build_object('dispatchId',v_dispatch.id,'status','DRAFT','idempotent',false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.approve_outbound_dispatch(p_workspace_id UUID, p_dispatch_id UUID, p_idempotency_key TEXT)
RETURNS JSONB AS $$
DECLARE v_actor UUID; v_dispatch public.outbound_dispatches%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) < 8 THEN RAISE EXCEPTION 'Invalid idempotency key'; END IF;
  v_actor := public.require_workspace_operator(p_workspace_id);
  SELECT * INTO v_dispatch FROM public.outbound_dispatches WHERE id=p_dispatch_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Outbound dispatch not found'; END IF;
  IF v_dispatch.approval_idempotency_key = btrim(p_idempotency_key) THEN RETURN jsonb_build_object('dispatchId',v_dispatch.id,'status',v_dispatch.status,'idempotent',true); END IF;
  IF v_dispatch.status <> 'DRAFT' THEN RAISE EXCEPTION 'Outbound dispatch is not awaiting human approval'; END IF;
  UPDATE public.outbound_dispatches SET status='APPROVED', approved_by_user_id=v_actor, approved_at=NOW(), approval_idempotency_key=btrim(p_idempotency_key) WHERE id=v_dispatch.id;
  INSERT INTO public.outbound_dispatch_events(workspace_id,outbound_dispatch_id,event_type,actor_user_id,idempotency_key) VALUES(p_workspace_id,v_dispatch.id,'APPROVED',v_actor,'approve:'||btrim(p_idempotency_key));
  RETURN jsonb_build_object('dispatchId',v_dispatch.id,'status','APPROVED','idempotent',false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.cancel_outbound_dispatch(p_workspace_id UUID, p_dispatch_id UUID, p_reason TEXT, p_idempotency_key TEXT)
RETURNS JSONB AS $$
DECLARE v_actor UUID; v_dispatch public.outbound_dispatches%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) < 8 THEN RAISE EXCEPTION 'Invalid cancellation request'; END IF;
  v_actor := public.require_workspace_operator(p_workspace_id);
  SELECT * INTO v_dispatch FROM public.outbound_dispatches WHERE id=p_dispatch_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Outbound dispatch not found'; END IF;
  IF v_dispatch.status='CANCELLED' AND EXISTS(SELECT 1 FROM public.outbound_dispatch_events WHERE outbound_dispatch_id=v_dispatch.id AND idempotency_key='cancel:'||btrim(p_idempotency_key)) THEN RETURN jsonb_build_object('dispatchId',v_dispatch.id,'status','CANCELLED','idempotent',true); END IF;
  IF v_dispatch.status NOT IN ('DRAFT','APPROVED') THEN RAISE EXCEPTION 'Only an unclaimed dispatch can be cancelled'; END IF;
  UPDATE public.outbound_dispatches SET status='CANCELLED',cancelled_by_user_id=v_actor,cancelled_at=NOW(),cancellation_reason=btrim(p_reason) WHERE id=v_dispatch.id;
  INSERT INTO public.outbound_dispatch_events(workspace_id,outbound_dispatch_id,event_type,actor_user_id,idempotency_key,detail) VALUES(p_workspace_id,v_dispatch.id,'CANCELLED',v_actor,'cancel:'||btrim(p_idempotency_key),jsonb_build_object('reason',btrim(p_reason)));
  RETURN jsonb_build_object('dispatchId',v_dispatch.id,'status','CANCELLED','idempotent',false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.claim_outbound_dispatch(p_dispatch_id UUID, p_worker_id TEXT, p_lease_seconds INTEGER DEFAULT 60)
RETURNS JSONB AS $$
DECLARE v_dispatch public.outbound_dispatches%ROWTYPE; v_token UUID := gen_random_uuid();
BEGIN
  IF NOT public.is_service_role() THEN RAISE EXCEPTION 'Unauthorized: outbound claim requires service_role'; END IF;
  IF p_worker_id IS NULL OR char_length(btrim(p_worker_id)) < 3 OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN RAISE EXCEPTION 'Invalid outbound claim request'; END IF;
  SELECT * INTO v_dispatch FROM public.outbound_dispatches WHERE id=p_dispatch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Outbound dispatch not found'; END IF;
  IF v_dispatch.status <> 'APPROVED' OR v_dispatch.approved_by_user_id IS NULL OR v_dispatch.approved_at IS NULL THEN RAISE EXCEPTION 'Outbound dispatch is not human-approved'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=v_dispatch.workspace_id AND active) THEN RAISE EXCEPTION 'Workspace is inactive'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.commercial_journeys WHERE id=v_dispatch.journey_id AND workspace_id=v_dispatch.workspace_id AND contact_id=v_dispatch.contact_id AND channel_connection_id=v_dispatch.channel_connection_id AND status='OPEN') THEN RAISE EXCEPTION 'Journey no longer permits outbound'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.channel_connections WHERE id=v_dispatch.channel_connection_id AND workspace_id=v_dispatch.workspace_id AND provider='waha' AND status='CONNECTED') THEN RAISE EXCEPTION 'WAHA channel is not connected'; END IF;
  IF NOT public.is_outbound_enabled(v_dispatch.workspace_id,v_dispatch.channel_connection_id) THEN RAISE EXCEPTION 'Outbound is disabled by workspace or channel control'; END IF;
  UPDATE public.outbound_dispatches SET status='CLAIMED',claim_token=v_token,claimed_by=btrim(p_worker_id),claim_expires_at=NOW()+make_interval(secs=>p_lease_seconds) WHERE id=v_dispatch.id;
  INSERT INTO public.outbound_dispatch_events(workspace_id,outbound_dispatch_id,event_type,worker_id,idempotency_key,detail) VALUES(v_dispatch.workspace_id,v_dispatch.id,'CLAIMED',btrim(p_worker_id),'claim:'||v_token::text,jsonb_build_object('leaseSeconds',p_lease_seconds));
  RETURN jsonb_build_object('dispatchId',v_dispatch.id,'claimToken',v_token,'textContent',v_dispatch.text_content,'channelConnectionId',v_dispatch.channel_connection_id,'contactId',v_dispatch.contact_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.record_outbound_provider_acceptance(p_dispatch_id UUID, p_claim_token UUID, p_worker_id TEXT, p_provider_message_id TEXT)
RETURNS JSONB AS $$
DECLARE v_dispatch public.outbound_dispatches%ROWTYPE; v_message_id UUID;
BEGIN
  IF NOT public.is_service_role() THEN RAISE EXCEPTION 'Unauthorized: provider acceptance requires service_role'; END IF;
  IF p_provider_message_id IS NULL OR char_length(btrim(p_provider_message_id)) < 1 THEN RAISE EXCEPTION 'Provider message id is required'; END IF;
  SELECT * INTO v_dispatch FROM public.outbound_dispatches WHERE id=p_dispatch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Outbound dispatch not found'; END IF;
  IF v_dispatch.status='ACCEPTED' AND v_dispatch.provider_message_id=btrim(p_provider_message_id) THEN RETURN jsonb_build_object('dispatchId',v_dispatch.id,'status','ACCEPTED','idempotent',true); END IF;
  IF v_dispatch.status <> 'CLAIMED' OR v_dispatch.claim_token IS DISTINCT FROM p_claim_token OR v_dispatch.claimed_by IS DISTINCT FROM btrim(p_worker_id) OR v_dispatch.claim_expires_at < NOW() THEN RAISE EXCEPTION 'Stale or invalid outbound claim'; END IF;
  -- Provider acceptance is not complete until the operator cockpit can read a
  -- normalized outbound message and its append-only SENT lifecycle event.
  INSERT INTO public.conversation_messages (
    workspace_id, channel_connection_id, journey_id, contact_id,
    direction, sender_type, provider_message_id, text_content, sent_at
  ) VALUES (
    v_dispatch.workspace_id, v_dispatch.channel_connection_id, v_dispatch.journey_id, v_dispatch.contact_id,
    'outbound', 'operator', btrim(p_provider_message_id), v_dispatch.text_content, NOW()
  )
  ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING
  RETURNING id INTO v_message_id;
  IF v_message_id IS NULL THEN
    SELECT cm.id INTO v_message_id
    FROM public.conversation_messages cm
    WHERE cm.channel_connection_id = v_dispatch.channel_connection_id
      AND cm.provider_message_id = btrim(p_provider_message_id)
      AND cm.workspace_id = v_dispatch.workspace_id
      AND cm.journey_id = v_dispatch.journey_id
      AND cm.contact_id = v_dispatch.contact_id
      AND cm.direction = 'outbound'
      AND cm.text_content = v_dispatch.text_content;
    IF v_message_id IS NULL THEN
      RAISE EXCEPTION 'Provider message id is already bound to a different commercial message';
    END IF;
  END IF;
  INSERT INTO public.conversation_message_events (
    workspace_id, channel_connection_id, message_id, provider_event_id, status, provider_timestamp, raw_payload
  ) VALUES (
    v_dispatch.workspace_id, v_dispatch.channel_connection_id, v_message_id,
    'outbound-sent:' || btrim(p_provider_message_id), 'SENT', NOW(), '{}'::jsonb
  )
  ON CONFLICT (channel_connection_id, provider_event_id) DO NOTHING;
  UPDATE public.outbound_dispatches SET status='ACCEPTED',provider_message_id=btrim(p_provider_message_id),provider_accepted_at=NOW(),claim_token=NULL,claimed_by=NULL,claim_expires_at=NULL WHERE id=v_dispatch.id;
  INSERT INTO public.outbound_dispatch_events(workspace_id,outbound_dispatch_id,event_type,worker_id,idempotency_key,detail) VALUES(v_dispatch.workspace_id,v_dispatch.id,'PROVIDER_ACCEPTED',btrim(p_worker_id),'accepted:'||btrim(p_provider_message_id),jsonb_build_object('providerMessageId',btrim(p_provider_message_id)));
  RETURN jsonb_build_object('dispatchId',v_dispatch.id,'status','ACCEPTED','idempotent',false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.record_outbound_provider_failure(p_dispatch_id UUID, p_claim_token UUID, p_worker_id TEXT, p_failure_code TEXT)
RETURNS JSONB AS $$
DECLARE v_dispatch public.outbound_dispatches%ROWTYPE;
BEGIN
  IF NOT public.is_service_role() THEN RAISE EXCEPTION 'Unauthorized: provider failure requires service_role'; END IF;
  IF p_failure_code IS NULL OR char_length(btrim(p_failure_code)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid provider failure code'; END IF;
  SELECT * INTO v_dispatch FROM public.outbound_dispatches WHERE id=p_dispatch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Outbound dispatch not found'; END IF;
  IF v_dispatch.status='FAILED' AND v_dispatch.provider_failure_code=btrim(p_failure_code) THEN RETURN jsonb_build_object('dispatchId',v_dispatch.id,'status','FAILED','idempotent',true); END IF;
  IF v_dispatch.status <> 'CLAIMED' OR v_dispatch.claim_token IS DISTINCT FROM p_claim_token OR v_dispatch.claimed_by IS DISTINCT FROM btrim(p_worker_id) OR v_dispatch.claim_expires_at < NOW() THEN RAISE EXCEPTION 'Stale or invalid outbound claim'; END IF;
  UPDATE public.outbound_dispatches SET status='FAILED',provider_failure_code=btrim(p_failure_code),provider_failure_at=NOW(),claim_token=NULL,claimed_by=NULL,claim_expires_at=NULL WHERE id=v_dispatch.id;
  INSERT INTO public.outbound_dispatch_events(workspace_id,outbound_dispatch_id,event_type,worker_id,idempotency_key,detail) VALUES(v_dispatch.workspace_id,v_dispatch.id,'PROVIDER_FAILED',btrim(p_worker_id),'failed:'||btrim(p_failure_code)||':'||p_claim_token::text,jsonb_build_object('failureCode',btrim(p_failure_code)));
  RETURN jsonb_build_object('dispatchId',v_dispatch.id,'status','FAILED','idempotent',false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON public.outbound_dispatches, public.outbound_dispatch_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.outbound_dispatches, public.outbound_dispatch_events FROM authenticated, service_role;
GRANT SELECT ON public.outbound_dispatches, public.outbound_dispatch_events TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_outbound_draft(UUID,UUID,TEXT,TEXT), public.approve_outbound_dispatch(UUID,UUID,TEXT), public.cancel_outbound_dispatch(UUID,UUID,TEXT,TEXT), public.claim_outbound_dispatch(UUID,TEXT,INTEGER), public.record_outbound_provider_acceptance(UUID,UUID,TEXT,TEXT), public.record_outbound_provider_failure(UUID,UUID,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_outbound_draft(UUID,UUID,TEXT,TEXT), public.approve_outbound_dispatch(UUID,UUID,TEXT), public.cancel_outbound_dispatch(UUID,UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_dispatch(UUID,TEXT,INTEGER), public.record_outbound_provider_acceptance(UUID,UUID,TEXT,TEXT), public.record_outbound_provider_failure(UUID,UUID,TEXT,TEXT) TO service_role;

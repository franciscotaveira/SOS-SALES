-- =============================================================================
-- SOS Sales — allow one open journey per contact and channel
--
-- A contact can legitimately reach the same workspace through Meta Cloud and
-- WAHA. The former global `(workspace_id, contact_id)` partial index forced
-- the second provider either to fail or to inherit the first provider's
-- journey. Keep legacy NULL-channel rows isolated while making the channel
-- binding part of the open-journey identity.
-- =============================================================================

DROP INDEX IF EXISTS public.uq_journeys_open_per_contact;
DROP INDEX IF EXISTS public.uq_journeys_open_per_contact_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journeys_open_per_contact_channel
  ON public.commercial_journeys(workspace_id, contact_id, channel_connection_id)
  WHERE status = 'OPEN' AND channel_connection_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journeys_open_per_contact_unbound
  ON public.commercial_journeys(workspace_id, contact_id)
  WHERE status = 'OPEN' AND channel_connection_id IS NULL;

-- Rebind the durable WAHA normalizer to the exact channel. The advisory lock
-- still serializes concurrent messages for one workspace/contact, while the
-- new index fences races for each channel independently.
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
RETURNS TABLE(contact_id UUID, journey_id UUID, message_id UUID, is_duplicate_message BOOLEAN) AS $$
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

  v_clean_phone := pg_catalog.btrim(p_contact_phone);
  IF v_clean_phone IS NULL OR v_clean_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Invalid E.164 phone number: %', p_contact_phone;
  END IF;
  IF p_provider_message_id IS NULL OR pg_catalog.btrim(p_provider_message_id) = '' THEN
    RAISE EXCEPTION 'provider_message_id is required';
  END IF;
  IF v_channel_connection_id IS NULL THEN
    RAISE EXCEPTION 'WAHA inbound event is missing a channel connection';
  END IF;

  INSERT INTO public.contacts(workspace_id, phone, whatsapp_id, name)
  VALUES(v_workspace_id, v_clean_phone, p_whatsapp_id, p_contact_name)
  ON CONFLICT (workspace_id, phone) DO UPDATE SET
    whatsapp_id = COALESCE(EXCLUDED.whatsapp_id, public.contacts.whatsapp_id),
    name = COALESCE(EXCLUDED.name, public.contacts.name),
    updated_at = NOW()
  RETURNING id INTO v_contact_id;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_workspace_id::text || ':journey_contact:' || v_contact_id::text, 0)
  );

  SELECT j.id INTO v_journey_id
  FROM public.commercial_journeys j
  WHERE j.workspace_id = v_workspace_id
    AND j.contact_id = v_contact_id
    AND j.status = 'OPEN'
    AND (j.channel_connection_id = v_channel_connection_id OR j.channel_connection_id IS NULL)
  ORDER BY (j.channel_connection_id = v_channel_connection_id) DESC, j.updated_at DESC
  LIMIT 1;

  IF v_journey_id IS NULL THEN
    INSERT INTO public.commercial_journeys(workspace_id, contact_id, channel_connection_id, status, started_at)
    VALUES(v_workspace_id, v_contact_id, v_channel_connection_id, 'OPEN', COALESCE(p_sent_at, NOW()))
    RETURNING id INTO v_journey_id;
  ELSE
    UPDATE public.commercial_journeys
    SET channel_connection_id = COALESCE(channel_connection_id, v_channel_connection_id),
        updated_at = NOW()
    WHERE id = v_journey_id;
  END IF;

  INSERT INTO public.conversation_messages(
    workspace_id, channel_connection_id, journey_id, contact_id,
    direction, sender_type, provider_message_id, text_content, media_payload, sent_at
  ) VALUES(
    v_workspace_id, v_channel_connection_id, v_journey_id, v_contact_id,
    'inbound', 'customer', p_provider_message_id, p_text_content, p_media_payload,
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
    INSERT INTO public.outbox_events(
      workspace_id, event_name, aggregate_type, aggregate_id, payload, idempotency_key
    ) VALUES(
      v_workspace_id, 'message.inbound_received', 'ConversationMessage', v_message_id,
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
    ) ON CONFLICT (workspace_id, idempotency_key) DO NOTHING;

    -- WAHA messages use the same durable Receptionist worker as WABA.  The
    -- provider is resolved later from channel_connection_id; phone_number_id
    -- is intentionally NULL because it is a Meta-only identifier.  Keep
    -- media-only events out of the AI queue, while preserving them in the
    -- conversation history for the operator.
    IF p_text_content IS NOT NULL AND pg_catalog.btrim(p_text_content) <> '' THEN
      PERFORM public.enqueue_receptionist_inbound(
        v_message_id,
        v_workspace_id,
        v_journey_id,
        v_contact_id,
        v_channel_connection_id,
        v_clean_phone,
        p_contact_name,
        p_text_content,
        CASE
          WHEN p_media_payload IS NULL THEN 'text'
          ELSE COALESCE(NULLIF(p_media_payload->>'mediaType', ''), 'media')
        END,
        NULL
      );
    END IF;
  END IF;

  contact_id := v_contact_id;
  journey_id := v_journey_id;
  message_id := v_message_id;
  is_duplicate_message := v_is_duplicate_msg;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.normalize_waha_inbound_message(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_waha_inbound_message(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ
) TO service_role;

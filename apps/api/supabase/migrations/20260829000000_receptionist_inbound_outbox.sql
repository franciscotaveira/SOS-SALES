-- ==============================================================================
-- TX COMMERCIAL CORE — RECEPTIONIST INBOUND OUTBOX (QA-P0 §4.1)
-- Architecture: Durable transactional outbox for the AI Receptionist trigger.
-- Replaces the non-recoverable setImmediate() fire-and-forget in waba-webhook.ts
-- with a service-role-guarded enqueue consumed by a leased/fenced worker.
-- Security: SECURITY DEFINER + is_service_role() guard, empty search_path.
-- Invariants: idempotency keyed on conversation_messages.id, ON CONFLICT DO NOTHING.
-- ==============================================================================

-- RPC: ENQUEUE RECEPTIONIST INBOUND
-- Enqueues a durable 'receptionist.inbound_received' outbox row so the AI
-- Receptionist can be processed by a recoverable background worker instead of
-- an in-process fire-and-forget. The full ReceptionistInput is carried in the
-- payload so the worker needs no additional lookups.
CREATE OR REPLACE FUNCTION public.enqueue_receptionist_inbound(
  p_conversation_message_id UUID,
  p_workspace_id UUID,
  p_journey_id UUID,
  p_contact_id UUID,
  p_channel_connection_id UUID,
  p_from_phone TEXT,
  p_push_name TEXT,
  p_text_content TEXT,
  p_message_type TEXT,
  p_phone_number_id TEXT
)
RETURNS UUID AS $$
DECLARE
  v_outbox_id UUID;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: enqueue_receptionist_inbound requires service_role';
  END IF;

  IF p_conversation_message_id IS NULL THEN
    RAISE EXCEPTION 'conversation_message_id is required';
  END IF;
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required';
  END IF;

  INSERT INTO public.outbox_events (
    workspace_id, event_name, aggregate_type, aggregate_id, payload, idempotency_key
  ) VALUES (
    p_workspace_id,
    'receptionist.inbound_received',
    'ConversationMessage',
    p_conversation_message_id,
    jsonb_build_object(
      'workspaceId', p_workspace_id,
      'journeyId', p_journey_id,
      'contactId', p_contact_id,
      'channelConnectionId', p_channel_connection_id,
      'fromPhone', p_from_phone,
      'pushName', p_push_name,
      'textContent', p_text_content,
      'messageType', p_message_type,
      'phoneNumberId', p_phone_number_id
    ),
    'outbox_receptionist_' || p_conversation_message_id::text
  )
  ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_outbox_id;

  RETURN v_outbox_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.enqueue_receptionist_inbound(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_receptionist_inbound(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

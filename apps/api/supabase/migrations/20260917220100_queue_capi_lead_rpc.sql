CREATE OR REPLACE FUNCTION public.queue_capi_lead(
  uuid, uuid, uuid, text, text, timestamptz
) RETURNS TABLE(id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $function$
    WITH inserted AS (
      INSERT INTO public.capi_lead_deliveries
        (workspace_id, channel_connection_id, journey_id, click_key, ctwa_clid,
         dataset_id, waba_id, occurred_at)
      SELECT j.workspace_id, c.id, j.id, $4, $5,
        c.public_config->>'metaDatasetId', c.public_config->>'wabaId', $6
      FROM public.commercial_journeys j
      JOIN public.channel_connections c ON c.workspace_id=j.workspace_id
        AND c.id=j.channel_connection_id
      WHERE j.workspace_id=$1 AND c.id=$2 AND j.id=$3
        AND c.public_config->>'metaCapiEnabled'='true'
        AND c.public_config->>'metaCapiActionSource'='business_messaging'
        AND c.public_config->>'metaDatasetId' ~ '^[0-9]+$'
        AND c.public_config->>'wabaId' ~ '^[0-9]+$'
      ON CONFLICT (workspace_id, channel_connection_id, click_key) DO NOTHING
      RETURNING id, workspace_id
    ), queued AS (
      INSERT INTO public.outbox_events
        (workspace_id, event_name, aggregate_type, aggregate_id, payload, idempotency_key)
      SELECT workspace_id, 'commercial.lead_capi_queued', 'capi_lead', id,
        jsonb_build_object('leadId', id), 'capi-lead:' || id::text FROM inserted
      RETURNING aggregate_id
    ) SELECT aggregate_id AS id FROM queued;
$function$;
REVOKE ALL ON FUNCTION public.queue_capi_lead(uuid,uuid,uuid,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_capi_lead(uuid,uuid,uuid,text,text,timestamptz) TO service_role;

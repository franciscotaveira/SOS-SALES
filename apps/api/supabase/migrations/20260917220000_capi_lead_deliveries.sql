-- Lead conversions are independent of revenue outcomes. No historical backfill.
CREATE TABLE IF NOT EXISTS public.capi_lead_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  channel_connection_id uuid NOT NULL,
  journey_id uuid NOT NULL,
  click_key text NOT NULL CHECK (length(click_key) = 64),
  ctwa_clid text NOT NULL CHECK (length(trim(ctwa_clid)) > 0),
  dataset_id text NOT NULL CHECK (dataset_id ~ '^[0-9]+$'),
  waba_id text NOT NULL CHECK (waba_id ~ '^[0-9]+$'),
  occurred_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'DISPATCHED', 'FAILED', 'NOT_APPLICABLE')),
  error_code text,
  fbtrace_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, channel_connection_id)
    REFERENCES public.channel_connections(workspace_id, id),
  FOREIGN KEY (workspace_id, journey_id)
    REFERENCES public.commercial_journeys(workspace_id, id),
  UNIQUE (workspace_id, channel_connection_id, click_key)
);

ALTER TABLE public.capi_lead_deliveries ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.capi_lead_deliveries TO authenticated;
GRANT ALL ON public.capi_lead_deliveries TO service_role;
CREATE POLICY capi_lead_deliveries_read ON public.capi_lead_deliveries
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

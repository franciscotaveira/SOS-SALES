-- Delivery state is mutable; commercial facts remain immutable.
CREATE TABLE IF NOT EXISTS public.capi_deliveries (
  outcome_id uuid PRIMARY KEY REFERENCES public.commercial_outcomes(id),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  status text NOT NULL CHECK (status IN ('QUEUED','DISPATCHED','FAILED','NOT_APPLICABLE')),
  error_code text,
  fbtrace_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.capi_deliveries ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.capi_deliveries TO authenticated;
GRANT ALL ON public.capi_deliveries TO service_role;
CREATE POLICY capi_deliveries_read ON public.capi_deliveries FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

-- Migration 032: Meta WABA Billing Guardrail and Direct Card Verification
-- Ensures SOS Sales never acts as a billing intermediary for Meta conversation fees.
-- Clients must have their credit card registered directly in Meta Business Manager.

ALTER TABLE public.channel_instances
ADD COLUMN IF NOT EXISTS meta_billing_configured boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS meta_billing_account_id text;

-- Index for filtering WABA channels ready for broadcast
CREATE INDEX IF NOT EXISTS idx_channel_instances_meta_billing
ON public.channel_instances(workspace_id, provider, meta_billing_configured)
WHERE provider = 'meta_waba';

-- Migration 035: Broadcast Pix Sales Attribution Indexes (MCT OS v2.0)
-- Enables high-performance attribution queries between broadcast recipients and paid Pix charges.

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_contact_camp
    ON public.broadcast_recipients(workspace_id, contact_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_pix_charges_contact_paid
    ON public.pix_charges(workspace_id, contact_id, status, paid_at DESC);

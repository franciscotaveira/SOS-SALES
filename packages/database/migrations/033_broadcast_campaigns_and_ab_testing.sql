-- =========================================================================
-- SOS Sales V3 — Migration 033: Broadcast Campaigns & A/B Testing Tracking
-- =========================================================================
-- Architecture: Email-Marketing Style Delivery, Read, Click & Reply Funnel
-- Features:
--   1. broadcast_campaigns: Tracks bulk send batches, metrics, and A/B test splits
--   2. broadcast_recipients: Tracks granular per-contact delivery, read, click, and reply
--   3. Real-time reconciliation via Webhooks and Inbound Messages
-- =========================================================================

-- 1. Broadcast Campaigns Table
CREATE TABLE IF NOT EXISTS public.broadcast_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    channel_instance_id uuid NOT NULL REFERENCES public.channel_instances(id) ON DELETE CASCADE,
    is_ab_test boolean NOT NULL DEFAULT false,
    variant_a_template_id uuid NOT NULL REFERENCES public.message_templates(id) ON DELETE RESTRICT,
    variant_b_template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
    audience_type text NOT NULL DEFAULT 'ALL_CONTACTS',
    audience_stage text,
    total_targeted integer NOT NULL DEFAULT 0,
    sent_count integer NOT NULL DEFAULT 0,
    delivered_count integer NOT NULL DEFAULT 0,
    read_count integer NOT NULL DEFAULT 0,
    replied_count integer NOT NULL DEFAULT 0,
    clicked_count integer NOT NULL DEFAULT 0,
    failed_count integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'completed',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS & Tenant Isolation on Campaigns
ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_campaigns FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_user_broadcast_campaigns ON public.broadcast_campaigns;
CREATE POLICY app_user_broadcast_campaigns ON public.broadcast_campaigns
    FOR ALL TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

DROP POLICY IF EXISTS worker_user_broadcast_campaigns ON public.broadcast_campaigns;
CREATE POLICY worker_user_broadcast_campaigns ON public.broadcast_campaigns
    FOR ALL TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

DROP POLICY IF EXISTS migration_owner_broadcast_campaigns ON public.broadcast_campaigns;
CREATE POLICY migration_owner_broadcast_campaigns ON public.broadcast_campaigns
    FOR ALL TO sos_migration_owner
    USING (true)
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_workspace_created
    ON public.broadcast_campaigns(workspace_id, created_at DESC);

-- 2. Broadcast Recipients Table (Granular Event Tracking per Contact)
CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES public.broadcast_campaigns(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
    phone_e164 text NOT NULL,
    variant text NOT NULL DEFAULT 'A', -- 'A' or 'B'
    template_id uuid NOT NULL REFERENCES public.message_templates(id) ON DELETE RESTRICT,
    outbound_command_id uuid REFERENCES public.outbound_commands(id) ON DELETE SET NULL,
    external_message_id text,
    status text NOT NULL DEFAULT 'sent', -- 'sent', 'delivered', 'read', 'clicked', 'replied', 'failed'
    sent_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz,
    read_at timestamptz,
    replied_at timestamptz,
    clicked_at timestamptz,
    clicked_button text,
    error_message text
);

-- RLS & Tenant Isolation on Recipients
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_recipients FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_user_broadcast_recipients ON public.broadcast_recipients;
CREATE POLICY app_user_broadcast_recipients ON public.broadcast_recipients
    FOR ALL TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

DROP POLICY IF EXISTS worker_user_broadcast_recipients ON public.broadcast_recipients;
CREATE POLICY worker_user_broadcast_recipients ON public.broadcast_recipients
    FOR ALL TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

DROP POLICY IF EXISTS migration_owner_broadcast_recipients ON public.broadcast_recipients;
CREATE POLICY migration_owner_broadcast_recipients ON public.broadcast_recipients
    FOR ALL TO sos_migration_owner
    USING (true)
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_campaign
    ON public.broadcast_recipients(workspace_id, campaign_id, variant);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_phone
    ON public.broadcast_recipients(workspace_id, phone_e164, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_ext_msg
    ON public.broadcast_recipients(workspace_id, external_message_id)
    WHERE external_message_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_campaigns TO sos_app_user, sos_worker_user, sos_migration_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_recipients TO sos_app_user, sos_worker_user, sos_migration_owner;

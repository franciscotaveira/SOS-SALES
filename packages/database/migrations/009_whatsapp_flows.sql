-- =========================================================================
-- SOS Sales V3 — Migration 009: WhatsApp Native Flows (Meta Official Flows)
-- =========================================================================
-- Context: Meta WhatsApp Flows (v21.0+) — Native in-app interactive forms
-- Compliance:
--   - Native bottom-sheet form interactions (Lead Gen, Booking, Surveys)
--   - Tenant Isolation: FORCE ROW LEVEL SECURITY (RLS) under app.current_workspace_id
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_flows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL DEFAULT 'LEAD_GENERATION' CHECK (category IN ('LEAD_GENERATION', 'APPOINTMENT_BOOKING', 'CUSTOMER_SUPPORT', 'SURVEY')),
    status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'PUBLISHED', 'DEPRECATED', 'BLOCKED')),
    meta_flow_id text NOT NULL,
    cta_label text NOT NULL DEFAULT 'Preencher Formulário',
    header_text text,
    body_text text NOT NULL,
    footer_text text,
    initial_screen text NOT NULL DEFAULT 'START_SCREEN',
    screens_preview jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_whatsapp_flows_workspace_name UNIQUE (workspace_id, name)
);

ALTER TABLE public.outbound_commands ADD COLUMN IF NOT EXISTS interactive_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_whatsapp_flows_workspace ON public.whatsapp_flows(workspace_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_flows_status ON public.whatsapp_flows(workspace_id, status);

ALTER TABLE public.whatsapp_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_flows FORCE ROW LEVEL SECURITY;

CREATE POLICY migration_owner_flows ON public.whatsapp_flows TO sos_migration_owner USING (true) WITH CHECK (true);

CREATE POLICY app_user_flows ON public.whatsapp_flows TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY worker_user_flows ON public.whatsapp_flows TO sos_worker_user
    USING (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                true
        END
    )
    WITH CHECK (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                true
        END
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_flows TO sos_app_user;
GRANT SELECT ON TABLE public.whatsapp_flows TO sos_worker_user;

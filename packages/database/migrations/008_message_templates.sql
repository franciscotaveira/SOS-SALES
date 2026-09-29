-- =========================================================================
-- SOS Sales V3 — Migration 008: Message Templates (Meta WABA Cost Optimizer)
-- =========================================================================
-- Context: Official WhatsApp Business API (WABA) Template Engineering & Governance
-- Compliance:
--   - Meta WhatsApp Business Platform v21.0+ (Utility, Marketing, Authentication)
--   - WABA Cost Optimizer: Utility Trojan Horse (~R$ 0,04) vs Marketing (~R$ 0,40)
--   - Tenant Isolation: FORCE ROW LEVEL SECURITY (RLS) under app.current_workspace_id
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.message_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    category text NOT NULL CHECK (category IN ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
    language text NOT NULL DEFAULT 'pt_BR',
    header_text text,
    body_text text NOT NULL,
    footer_text text,
    buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
    variables jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('APPROVED', 'PENDING', 'REJECTED', 'PAUSED')),
    meta_template_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_message_templates_workspace_name UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_message_templates_workspace ON public.message_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_category ON public.message_templates(workspace_id, category);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY migration_owner_templates ON public.message_templates TO sos_migration_owner USING (true) WITH CHECK (true);

CREATE POLICY app_user_templates ON public.message_templates TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY worker_user_templates ON public.message_templates TO sos_worker_user
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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.message_templates TO sos_app_user;
GRANT SELECT ON TABLE public.message_templates TO sos_worker_user;

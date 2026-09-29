-- =========================================================================
-- SOS Sales V3 — Migration 011: Pix Payments & Instant Charges
-- =========================================================================
-- Context: 1-Click Pix Checkout in WhatsApp (Sales Engine)
-- Compliance:
--   - Pix Copia e Cola (BACEN EMV Standard) & QR Code Payload
--   - Automatic Commercial Outcome Loop (Closed Loop Won Deal & Meta CAPI)
--   - Tenant Isolation: FORCE ROW LEVEL SECURITY (RLS) under app.current_workspace_id
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.pix_charges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    thread_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    title text NOT NULL,
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    currency text NOT NULL DEFAULT 'BRL',
    pix_code text NOT NULL,
    pix_qr_url text,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED')),
    expires_at timestamptz NOT NULL,
    paid_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_pix_charges_thread FOREIGN KEY (workspace_id, thread_id)
        REFERENCES public.commercial_threads(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_pix_charges_contact FOREIGN KEY (workspace_id, contact_id)
        REFERENCES public.contacts(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_pix_charges_workspace_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_pix_charges_workspace ON public.pix_charges(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pix_charges_thread ON public.pix_charges(workspace_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_pix_charges_status ON public.pix_charges(workspace_id, status);

ALTER TABLE public.pix_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pix_charges FORCE ROW LEVEL SECURITY;

CREATE POLICY migration_owner_pix_charges ON public.pix_charges TO sos_migration_owner USING (true) WITH CHECK (true);

CREATE POLICY app_user_pix_charges ON public.pix_charges TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY worker_user_pix_charges ON public.pix_charges TO sos_worker_user
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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pix_charges TO sos_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pix_charges TO sos_worker_user;

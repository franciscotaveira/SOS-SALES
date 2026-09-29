-- =========================================================================
-- SOS Sales V3 — Migration 010: WhatsApp Catalogs & Native Product Messages
-- =========================================================================
-- Context: Meta WhatsApp Business API (v21.0+) — Catalogs & Product Messages
-- Compliance:
--   - Single-Product Messages & Multi-Product Messages (MPM)
--   - Native In-App Shopping Cart & Order Processing
--   - Tenant Isolation: FORCE ROW LEVEL SECURITY (RLS) under app.current_workspace_id
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    catalog_id text NOT NULL DEFAULT 'meta_catalog_default',
    retailer_id text NOT NULL,
    title text NOT NULL,
    subtitle text,
    description text NOT NULL,
    price_cents integer NOT NULL CHECK (price_cents >= 0),
    currency text NOT NULL DEFAULT 'BRL',
    category text NOT NULL DEFAULT 'Geral',
    image_url text NOT NULL,
    badge text,
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'OUT_OF_STOCK')),
    is_featured boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_products_workspace_retailer UNIQUE (workspace_id, retailer_id)
);

CREATE INDEX IF NOT EXISTS idx_products_workspace ON public.products(workspace_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(workspace_id, category);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(workspace_id, status);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

CREATE POLICY migration_owner_products ON public.products TO sos_migration_owner USING (true) WITH CHECK (true);

CREATE POLICY app_user_products ON public.products TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY worker_user_products ON public.products TO sos_worker_user
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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO sos_app_user;
GRANT SELECT ON TABLE public.products TO sos_worker_user;

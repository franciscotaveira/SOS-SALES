-- =========================================================================
-- Chat Sales — Migration 017: F1.1 Radar Hardening & Origin Revalidation
-- =========================================================================
-- Context: F1.1 — Segurança, Contrato, Idempotência Semântica e Revalidação Transacional
-- Compliance:
--   - Tenant Isolation (FORCE RLS, composite FK with workspace_id)
--   - Semantic Idempotency (fingerprint verification on conflict)
--   - Origin Snapshot & Stale Invalidation
--   - Truth in Data (no mock, honest timestamps)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. EXTEND INTEGRATION_SUGGESTIONS WITH FINGERPRINT & SNAPSHOT
-- -------------------------------------------------------------------------

ALTER TABLE public.integration_suggestions
    ADD COLUMN IF NOT EXISTS payload_fingerprint text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS origin_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Update status check constraint to include 'invalidated'
ALTER TABLE public.integration_suggestions
    DROP CONSTRAINT IF EXISTS integration_suggestions_status_check;

ALTER TABLE public.integration_suggestions
    ADD CONSTRAINT integration_suggestions_status_check
    CHECK (status IN ('pending', 'accepted', 'dismissed', 'expired', 'invalidated'));

-- Update check_decided_consistency constraint
ALTER TABLE public.integration_suggestions
    DROP CONSTRAINT IF EXISTS check_decided_consistency;

ALTER TABLE public.integration_suggestions
    ADD CONSTRAINT check_decided_consistency CHECK (
        (status IN ('pending') AND decided_by_user_id IS NULL AND decided_at IS NULL)
        OR (status IN ('accepted', 'dismissed') AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
        OR (status IN ('expired', 'invalidated') AND decided_at IS NOT NULL)
    );

-- -------------------------------------------------------------------------
-- 2. CONTACTS OPT-OUT & METADATA SUPPORT
-- -------------------------------------------------------------------------

ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS opt_out boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- -------------------------------------------------------------------------
-- 3. PERFORMANCE INDEXES
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_integration_suggestions_payload_hash 
    ON public.integration_suggestions(workspace_id, idempotency_key, payload_fingerprint);

CREATE INDEX IF NOT EXISTS idx_integration_suggestions_active_queue
    ON public.integration_suggestions(workspace_id, status, priority, created_at DESC)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_contacts_opt_out
    ON public.contacts(workspace_id, opt_out)
    WHERE opt_out = true;

-- -------------------------------------------------------------------------
-- 4. PERMISSIONS CONFIRMATION
-- -------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON TABLE public.integration_suggestions TO sos_app_user;
GRANT SELECT, UPDATE ON TABLE public.integration_suggestions TO sos_worker_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.contacts TO sos_app_user, sos_worker_user;

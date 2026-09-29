-- =========================================================================
-- Chat Sales — Migration 018: F1.1-B Radar Governance & Persistence Hardening
-- =========================================================================
-- Context: F1.1-B — Persistência segura, snapshot do servidor, cooldown real e módulo habilitado
-- Compliance:
--   - Tenant Isolation (FORCE RLS, composite FK with workspace_id)
--   - Truth in Data (PostgreSQL clock_timestamp(), state_version increment, honest audit)
--   - Deterministic cooldown & module configuration per workspace
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. WORKSPACE RADAR MODULE CONFIGURATION
-- -------------------------------------------------------------------------

ALTER TABLE public.workspaces
    ADD COLUMN IF NOT EXISTS radar_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS radar_rule_version text NOT NULL DEFAULT '1.0.0',
    ADD COLUMN IF NOT EXISTS radar_cooldown_seconds integer NOT NULL DEFAULT 86400;

COMMENT ON COLUMN public.workspaces.radar_enabled IS 'Controls whether the Radar suggestion engine is active for this workspace';
COMMENT ON COLUMN public.workspaces.radar_rule_version IS 'Active rule version for radar_m01 suggestion evaluation';
COMMENT ON COLUMN public.workspaces.radar_cooldown_seconds IS 'Cooldown duration in seconds after any suggestion for the same thread/module';

-- -------------------------------------------------------------------------
-- 2. SUGGESTION MODULE & RULE VERSIONING
-- -------------------------------------------------------------------------

ALTER TABLE public.integration_suggestions
    ADD COLUMN IF NOT EXISTS module_key text NOT NULL DEFAULT 'radar_m01',
    ADD COLUMN IF NOT EXISTS rule_version text NOT NULL DEFAULT '1.0.0';

-- -------------------------------------------------------------------------
-- 3. DETERMINISTIC BACKFILL FOR LEGACY FINGERPRINTS
-- -------------------------------------------------------------------------

UPDATE public.integration_suggestions
SET payload_fingerprint = encode(digest(
    workspace_id::text || ':' || idempotency_key || ':' || coalesce(thread_id::text, '') || ':' || suggestion_type || ':' || title || ':' || body,
    'sha256'
), 'hex')
WHERE payload_fingerprint = '';

-- -------------------------------------------------------------------------
-- 4. PERFORMANCE & COOLDOWN INDEXES
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_integration_suggestions_cooldown
    ON public.integration_suggestions(workspace_id, thread_id, module_key, rule_version, created_at DESC)
    WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integration_suggestions_module
    ON public.integration_suggestions(workspace_id, module_key, status, created_at DESC);

-- -------------------------------------------------------------------------
-- 5. PERMISSIONS
-- -------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON TABLE public.integration_suggestions TO sos_app_user;
GRANT SELECT, UPDATE ON TABLE public.integration_suggestions TO sos_worker_user;
GRANT SELECT ON TABLE public.workspaces TO sos_app_user, sos_worker_user;

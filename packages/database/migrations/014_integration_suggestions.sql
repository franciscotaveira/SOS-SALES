-- =========================================================================
-- Chat Sales — Migration 014: Integration Suggestions (F1 Radar)
-- =========================================================================
-- Context: F1 — n8n Radar M01 integration suggestions surface
-- Compliance:
--   - Tenant Isolation (FORCE RLS, composite FK with workspace_id)
--   - Idempotency (unique idempotency_key per workspace)
--   - State Versioning (optimistic concurrency via state_version)
--   - Truth in Data (no mock data, real timestamps, honest state)
-- Constraints:
--   - Docker Lab only. No production, no staging.
--   - No AI/LLM dependency. Pure deterministic logic.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. TABLE DEFINITION
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.integration_suggestions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    
    -- Idempotency: same external system cannot create duplicate suggestions
    idempotency_key text NOT NULL,
    
    -- Source identification
    source text NOT NULL DEFAULT 'n8n' CHECK (source IN ('n8n', 'manual', 'system')),
    
    -- Thread reference (optional — some suggestions may target contacts without active threads)
    thread_id uuid,
    contact_id uuid,
    
    -- Suggestion payload
    suggestion_type text NOT NULL DEFAULT 'follow_up' CHECK (suggestion_type IN ('follow_up', 'reengagement', 'upsell', 'reminder', 'custom')),
    title text NOT NULL CHECK (length(title) >= 1 AND length(title) <= 200),
    body text NOT NULL CHECK (length(body) >= 1 AND length(body) <= 2000),
    
    -- Draft message for composer pre-fill (operator can edit before sending)
    draft_message text CHECK (draft_message IS NULL OR length(draft_message) <= 2000),
    
    -- Priority and metadata
    priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    
    -- State machine with optimistic concurrency
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'expired')),
    state_version integer NOT NULL DEFAULT 1 CHECK (state_version >= 1),
    
    -- Audit trail
    decided_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    decided_at timestamptz,
    
    -- Timestamps
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT uq_integration_suggestions_idempotency UNIQUE (workspace_id, idempotency_key),
    CONSTRAINT uq_integration_suggestions_workspace_id UNIQUE (workspace_id, id),
    CONSTRAINT fk_integration_suggestions_thread FOREIGN KEY (workspace_id, thread_id)
        REFERENCES public.commercial_threads(workspace_id, id) ON DELETE SET NULL,
    CONSTRAINT fk_integration_suggestions_contact FOREIGN KEY (workspace_id, contact_id)
        REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL,
    CONSTRAINT check_decided_consistency CHECK (
        (status IN ('pending') AND decided_by_user_id IS NULL AND decided_at IS NULL)
        OR (status IN ('accepted', 'dismissed') AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
        OR (status = 'expired' AND decided_at IS NOT NULL)
    )
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_integration_suggestions_pending 
    ON public.integration_suggestions(workspace_id, status, priority DESC, created_at DESC)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_integration_suggestions_thread 
    ON public.integration_suggestions(workspace_id, thread_id)
    WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integration_suggestions_expires 
    ON public.integration_suggestions(expires_at)
    WHERE status = 'pending' AND expires_at IS NOT NULL;

-- -------------------------------------------------------------------------
-- 2. FORCE ROW LEVEL SECURITY (RLS) POLICIES
-- -------------------------------------------------------------------------

ALTER TABLE public.integration_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_suggestions FORCE ROW LEVEL SECURITY;

-- Migration owner full maintenance access
CREATE POLICY migration_owner_suggestions 
    ON public.integration_suggestions TO sos_migration_owner 
    USING (true) WITH CHECK (true);

-- App user tenant isolation (fail-closed)
CREATE POLICY app_user_suggestions 
    ON public.integration_suggestions TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- Worker user tenant isolation (for expiration jobs)
CREATE POLICY worker_user_suggestions 
    ON public.integration_suggestions TO sos_worker_user
    USING (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                status = 'pending'
        END
    )
    WITH CHECK (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                status IN ('expired')
        END
    );

-- -------------------------------------------------------------------------
-- 3. LEAST PRIVILEGE GRANTS & REVOCATIONS
-- -------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON TABLE public.integration_suggestions TO sos_app_user;
REVOKE DELETE ON TABLE public.integration_suggestions FROM sos_app_user;

GRANT SELECT, UPDATE ON TABLE public.integration_suggestions TO sos_worker_user;
REVOKE DELETE, INSERT ON TABLE public.integration_suggestions FROM sos_worker_user;

-- Column-level reference grants for composite FK safety
GRANT REFERENCES (id, workspace_id) ON TABLE public.integration_suggestions TO sos_app_user, sos_worker_user;

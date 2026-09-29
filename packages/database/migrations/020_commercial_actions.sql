-- =========================================================================
-- Chat Sales — Migration 020: Commercial Actions E2 & Operational Commitments
-- =========================================================================
-- Context: E2 Next Commercial Action & Cockpit Contextual Action Surface
-- Compliance:
--   - Tenant Isolation (FORCE RLS, composite FK with workspace_id)
--   - Single Open Action Rule (unique partial index per workspace + thread)
--   - Postponement Auditability (immutable history log)
--   - Deterministic State Machine (open -> completed | cancelled)
--   - Truth in Data (Real timestamps with timezone, real user attribution)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. TABLE DEFINITIONS
-- -------------------------------------------------------------------------

-- 1.1 Commercial Actions
CREATE TABLE IF NOT EXISTS public.commercial_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    thread_id uuid NOT NULL,
    journey_id uuid,
    suggestion_id uuid REFERENCES public.integration_suggestions(id) ON DELETE SET NULL,
    
    -- Action details
    title text NOT NULL CHECK (length(title) >= 1 AND length(title) <= 200),
    description text CHECK (description IS NULL OR length(description) <= 2000),
    assignee_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    due_at timestamptz NOT NULL,
    
    -- State machine
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
    origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'radar_suggestion', 'system')),
    
    -- Rescheduling tracking
    postponed_count integer NOT NULL DEFAULT 0 CHECK (postponed_count >= 0),
    postponed_reason text,
    postponed_at timestamptz,
    
    -- Completion / Cancellation audit
    completed_at timestamptz,
    completed_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    cancelled_at timestamptz,
    cancelled_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    
    -- Metadata & Timestamps
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Foreign keys & composite uniqueness
    CONSTRAINT fk_commercial_actions_thread FOREIGN KEY (workspace_id, thread_id)
        REFERENCES public.commercial_threads(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_commercial_actions_journey FOREIGN KEY (workspace_id, journey_id)
        REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE SET NULL,
    CONSTRAINT uq_commercial_actions_workspace_id UNIQUE (workspace_id, id)
);

-- Partial unique index: strictly one open action per thread/opportunity in each workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_commercial_actions_open_thread 
    ON public.commercial_actions(workspace_id, thread_id) 
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_commercial_actions_due 
    ON public.commercial_actions(workspace_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_commercial_actions_thread 
    ON public.commercial_actions(workspace_id, thread_id);

CREATE INDEX IF NOT EXISTS idx_commercial_actions_assignee 
    ON public.commercial_actions(workspace_id, assignee_user_id) 
    WHERE assignee_user_id IS NOT NULL;

-- 1.2 Commercial Action History (Audit log for creation, postponement, assignment, completion)
CREATE TABLE IF NOT EXISTS public.commercial_action_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    action_id uuid NOT NULL,
    action_type text NOT NULL CHECK (action_type IN ('created', 'assigned', 'rescheduled', 'completed', 'cancelled')),
    
    previous_due_at timestamptz,
    new_due_at timestamptz,
    previous_assignee_id uuid,
    new_assignee_id uuid,
    reason text,
    
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT fk_commercial_action_history_action FOREIGN KEY (workspace_id, action_id)
        REFERENCES public.commercial_actions(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_commercial_action_history_workspace_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_action_history_action 
    ON public.commercial_action_history(workspace_id, action_id, created_at DESC);

-- -------------------------------------------------------------------------
-- 2. FORCE ROW LEVEL SECURITY (RLS) POLICIES
-- -------------------------------------------------------------------------

ALTER TABLE public.commercial_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_actions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.commercial_action_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_action_history FORCE ROW LEVEL SECURITY;

-- 2.1 Migration Owner Policies
DROP POLICY IF EXISTS migration_owner_actions ON public.commercial_actions;
CREATE POLICY migration_owner_actions 
    ON public.commercial_actions TO sos_migration_owner 
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS migration_owner_action_history ON public.commercial_action_history;
CREATE POLICY migration_owner_action_history 
    ON public.commercial_action_history TO sos_migration_owner 
    USING (true) WITH CHECK (true);

-- 2.2 App User Policies (Fail-closed isolation by workspace context)
DROP POLICY IF EXISTS app_user_actions ON public.commercial_actions;
CREATE POLICY app_user_actions 
    ON public.commercial_actions TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

DROP POLICY IF EXISTS app_user_action_history ON public.commercial_action_history;
CREATE POLICY app_user_action_history 
    ON public.commercial_action_history TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- 2.3 Worker User Policies
DROP POLICY IF EXISTS worker_user_actions ON public.commercial_actions;
CREATE POLICY worker_user_actions 
    ON public.commercial_actions TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

DROP POLICY IF EXISTS worker_user_action_history ON public.commercial_action_history;
CREATE POLICY worker_user_action_history 
    ON public.commercial_action_history TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- -------------------------------------------------------------------------
-- 3. PERMISSIONS (Least Privilege: NO DELETE for app/worker users)
-- -------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.commercial_actions TO sos_app_user;
GRANT SELECT, INSERT, UPDATE ON public.commercial_actions TO sos_worker_user;

GRANT SELECT, INSERT ON public.commercial_action_history TO sos_app_user;
GRANT SELECT, INSERT ON public.commercial_action_history TO sos_worker_user;

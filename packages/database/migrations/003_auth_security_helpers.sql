-- SOS Sales V3 — Migration 003: Auth & Security Audit Helper Functions
-- Allows safe membership discovery and tamper-proof security auditing under FORCE RLS

-- 1. Helper to securely query workspaces for an authenticated user
CREATE OR REPLACE FUNCTION get_user_workspaces(p_user_id UUID)
RETURNS TABLE(workspace_id UUID, workspace_name VARCHAR, role VARCHAR)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT m.workspace_id, w.name, m.role
    FROM workspace_memberships m
    JOIN workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = p_user_id;
$$;

-- 2. Helper to record security audit events (even during rejected cross-tenant attempts)
CREATE OR REPLACE FUNCTION record_security_audit_event(
    p_workspace_id UUID,
    p_actor_id UUID,
    p_actor_type VARCHAR,
    p_action VARCHAR,
    p_resource_type VARCHAR,
    p_resource_id VARCHAR,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_ip_address VARCHAR DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO audit_events (
        workspace_id, actor_id, actor_type, action, resource_type, resource_id, metadata, ip_address, user_agent
    ) VALUES (
        p_workspace_id, p_actor_id, p_actor_type, p_action, p_resource_type, p_resource_id, p_metadata, p_ip_address, p_user_agent
    ) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Grant execution to sos_app_user
GRANT EXECUTE ON FUNCTION get_user_workspaces(UUID) TO sos_app_user;
GRANT EXECUTE ON FUNCTION record_security_audit_event(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, VARCHAR, TEXT) TO sos_app_user;

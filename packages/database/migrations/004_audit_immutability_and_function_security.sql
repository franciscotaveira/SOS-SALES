-- SOS Sales V3 — Migration 004: Audit Immutability & Function Security Hardening
-- Enforces append-only immutable audit trail and least-privilege SECURITY DEFINER ownership

-- 1. Transfer ownership of security functions to sos_migration_owner (non-superuser schema owner)
ALTER FUNCTION get_user_workspaces(UUID) OWNER TO sos_migration_owner;
ALTER FUNCTION record_security_audit_event(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, VARCHAR, TEXT) OWNER TO sos_migration_owner;

-- 2. Revoke execution from PUBLIC on SECURITY DEFINER functions (prevent unauthorized execution)
REVOKE ALL ON FUNCTION get_user_workspaces(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_security_audit_event(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, VARCHAR, TEXT) FROM PUBLIC;

-- 3. Explicitly grant execution ONLY to sos_app_user
GRANT EXECUTE ON FUNCTION get_user_workspaces(UUID) TO sos_app_user;
GRANT EXECUTE ON FUNCTION record_security_audit_event(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, VARCHAR, TEXT) TO sos_app_user;

-- 4. Revoke mutation privileges on audit_events from PUBLIC and sos_app_user
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC, sos_app_user;

-- 5. Trigger-level immutability enforcement on audit_events (fails closed even for table owner)
CREATE OR REPLACE FUNCTION prevent_audit_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is an immutable append-only ledger: % operations are strictly prohibited', TG_OP
        USING ERRCODE = '23514'; -- check_violation
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events;
CREATE TRIGGER trg_audit_events_immutable
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_events_mutation();

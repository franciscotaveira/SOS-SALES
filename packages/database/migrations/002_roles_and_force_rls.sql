-- SOS Sales V3 — Migration 002: Hardened Tenant Isolation & Role Separation
-- 1. Create separate roles: sos_migration_owner (DDL) and sos_app_user (DML with RLS)
-- 2. Apply FORCE ROW LEVEL SECURITY to all tenant-owned tables
-- 3. Add explicit WITH CHECK to tenant policies to block cross-tenant INSERT/UPDATE

-- Role: sos_migration_owner (Schema/Table owner for DDL and migrations)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sos_migration_owner') THEN
        CREATE ROLE sos_migration_owner WITH LOGIN PASSWORD 'sos_migration_secret_2026';
    END IF;
END $$;

-- Role: sos_app_user (Restricted runtime application user for DML only, strictly bound by RLS)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sos_app_user') THEN
        CREATE ROLE sos_app_user WITH LOGIN PASSWORD 'sos_app_secret_2026' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
END $$;

-- Transfer table ownership to sos_migration_owner
ALTER TABLE organizations OWNER TO sos_migration_owner;
ALTER TABLE users OWNER TO sos_migration_owner;
ALTER TABLE workspaces OWNER TO sos_migration_owner;
ALTER TABLE workspace_memberships OWNER TO sos_migration_owner;
ALTER TABLE provider_credentials OWNER TO sos_migration_owner;
ALTER TABLE audit_events OWNER TO sos_migration_owner;

-- Enforce FORCE ROW LEVEL SECURITY (applies policies to all roles, ensuring no implicit bypass)
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

-- Drop previous policies
DROP POLICY IF EXISTS workspace_isolation_policy ON workspaces;
DROP POLICY IF EXISTS workspace_app_user_policy ON workspaces;
DROP POLICY IF EXISTS workspace_app_user_insert ON workspaces;
DROP POLICY IF EXISTS migration_owner_workspaces ON workspaces;

DROP POLICY IF EXISTS memberships_isolation_policy ON workspace_memberships;
DROP POLICY IF EXISTS memberships_app_user_policy ON workspace_memberships;
DROP POLICY IF EXISTS migration_owner_memberships ON workspace_memberships;

DROP POLICY IF EXISTS credentials_isolation_policy ON provider_credentials;
DROP POLICY IF EXISTS credentials_app_user_policy ON provider_credentials;
DROP POLICY IF EXISTS migration_owner_credentials ON provider_credentials;

DROP POLICY IF EXISTS audit_isolation_policy ON audit_events;
DROP POLICY IF EXISTS audit_app_user_policy ON audit_events;
DROP POLICY IF EXISTS migration_owner_audit ON audit_events;

-- 1. Administrative policies for sos_migration_owner (explicit maintenance / migrations access)
CREATE POLICY migration_owner_workspaces ON workspaces TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY migration_owner_memberships ON workspace_memberships TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY migration_owner_credentials ON provider_credentials TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY migration_owner_audit ON audit_events TO sos_migration_owner USING (true) WITH CHECK (true);

-- 2. Tenant isolation policies for sos_app_user (Strictly fail-closed and tenant-bound)
CREATE POLICY workspace_app_user_policy ON workspaces
    FOR ALL
    TO sos_app_user
    USING (id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY workspace_app_user_insert ON workspaces
    FOR INSERT
    TO sos_app_user
    WITH CHECK (true);

CREATE POLICY memberships_app_user_policy ON workspace_memberships
    FOR ALL
    TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY credentials_app_user_policy ON provider_credentials
    FOR ALL
    TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY audit_app_user_policy ON audit_events
    FOR ALL
    TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- Grant schema USAGE and permissions to sos_migration_owner
GRANT ALL ON SCHEMA public TO sos_migration_owner;
GRANT ALL ON ALL TABLES IN SCHEMA public TO sos_migration_owner;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO sos_migration_owner;

-- Grant minimal DML privileges to sos_app_user (NO DDL, NO DROP, NO ALTER)
GRANT USAGE ON SCHEMA public TO sos_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sos_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sos_app_user;

-- Ensure future tables created by sos_migration_owner automatically grant DML to sos_app_user
ALTER DEFAULT PRIVILEGES FOR ROLE sos_migration_owner IN SCHEMA public 
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sos_app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE sos_migration_owner IN SCHEMA public 
    GRANT USAGE, SELECT ON SEQUENCES TO sos_app_user;

-- Migration 034: Native User Passwords and Team Management (MCT OS v2.0)
-- Adds secure password hash storage to public.users and ensures explicit grants.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;

-- Index for fast, case-insensitive email authentication lookups
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON public.users(LOWER(email));

-- Ensure explicit permissions for application and migration roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO sos_app_user, sos_migration_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_memberships TO sos_app_user, sos_migration_owner;

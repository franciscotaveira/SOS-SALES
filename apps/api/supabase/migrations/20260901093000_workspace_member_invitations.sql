-- One-time, email-bound access codes. The service stores only a SHA-256 hash,
-- so the plain code is visible solely to the owner at creation time.
BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_member_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL CHECK (invitee_email = lower(invitee_email)),
  role TEXT NOT NULL CHECK (role IN ('operator', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_member_invitations_acceptance_check
    CHECK ((accepted_at IS NULL AND accepted_by IS NULL) OR (accepted_at IS NOT NULL AND accepted_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_workspace_member_invitations_workspace_pending
  ON public.workspace_member_invitations (workspace_id, expires_at)
  WHERE accepted_at IS NULL;

ALTER TABLE public.workspace_member_invitations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_member_invitations TO service_role;

CREATE POLICY service_role_workspace_member_invitations
  ON public.workspace_member_invitations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;

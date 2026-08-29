-- Internal provisioning and receptionist runtime need explicit table access.
-- RLS continues to govern authenticated browser users.
GRANT SELECT, INSERT, UPDATE ON public.workspace_agent_config TO service_role;

ALTER TABLE public.workspace_agent_config
  DROP CONSTRAINT IF EXISTS fk_workspace_agent_config_workspace;
ALTER TABLE public.workspace_agent_config
  ADD CONSTRAINT fk_workspace_agent_config_workspace
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

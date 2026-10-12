-- Migration 026: standard product capabilities for every workspace
-- Radar remains governed and review-only, but is available by default to every
-- new customer instead of requiring a customer-specific database adjustment.

ALTER TABLE public.workspaces
  ALTER COLUMN radar_enabled SET DEFAULT true;

COMMENT ON COLUMN public.workspaces.radar_enabled IS
  'Enables the governed, review-only opportunity radar. Defaults to true for every new workspace and can be disabled per tenant.';

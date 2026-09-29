-- Migration 019: Radar Final Governance, Safe Defaults and Constraint Hardening (F1.1-C)
-- Changes default of radar_enabled to false (opt-in module policy).
-- Adds check constraints for non-empty rule_version and bounded cooldown_seconds.

-- 1. Alter default for radar_enabled to false
ALTER TABLE public.workspaces ALTER COLUMN radar_enabled SET DEFAULT false;

-- 2. Normalize existing workspaces to false (explicit opt-in)
UPDATE public.workspaces SET radar_enabled = false WHERE radar_enabled IS TRUE;

-- 3. Check constraint for radar_cooldown_seconds (bounded between 0 and 30 days = 2592000s)
ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS chk_workspaces_radar_cooldown,
  ADD CONSTRAINT chk_workspaces_radar_cooldown
  CHECK (radar_cooldown_seconds >= 0 AND radar_cooldown_seconds <= 2592000);

-- 4. Check constraint for radar_rule_version (non-empty string)
ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS chk_workspaces_radar_rule_version,
  ADD CONSTRAINT chk_workspaces_radar_rule_version
  CHECK (length(trim(radar_rule_version)) > 0);

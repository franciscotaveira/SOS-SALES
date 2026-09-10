-- Keep the pre-existing learning side effect idempotent after removing the
-- invalid attempt to mutate an immutable outcome as a dispatch claim.
CREATE TABLE public.commercial_effect_claims (
  outcome_id uuid NOT NULL REFERENCES public.commercial_outcomes(id),
  effect text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(outcome_id,effect)
);
ALTER TABLE public.commercial_effect_claims ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.commercial_effect_claims TO service_role;

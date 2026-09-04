-- Meta Messenger/Instagram message IDs (MIDs) are opaque strings, not UUIDs.
-- Keep the local conversation UUID in this column when available, while
-- allowing legacy/provider IDs to be retained for forensic reconciliation.
-- Some production installations never created the optional NLP table.  Do
-- not make the whole forward-only release depend on that legacy surface.
DO $$
BEGIN
  IF to_regclass('public.nlp_extracted_entities') IS NOT NULL THEN
    ALTER TABLE public.nlp_extracted_entities
      ALTER COLUMN message_id TYPE text
      USING message_id::text;
  END IF;
END $$;

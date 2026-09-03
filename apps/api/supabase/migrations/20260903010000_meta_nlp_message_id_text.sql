-- Meta Messenger/Instagram message IDs (MIDs) are opaque strings, not UUIDs.
-- Keep the local conversation UUID in this column when available, while
-- allowing legacy/provider IDs to be retained for forensic reconciliation.
ALTER TABLE public.nlp_extracted_entities
  ALTER COLUMN message_id TYPE text
  USING message_id::text;


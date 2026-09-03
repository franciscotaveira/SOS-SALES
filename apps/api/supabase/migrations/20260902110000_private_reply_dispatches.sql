-- Durable idempotency boundary for Meta Messenger Private Replies.
-- Meta allows at most one private reply for a comment; a browser/local
-- duplicate check is not sufficient when two requests race or the process
-- restarts after Meta accepted the message.

CREATE TABLE IF NOT EXISTS public.meta_private_reply_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_connection_id UUID NOT NULL,
  comment_id TEXT NOT NULL CHECK (char_length(btrim(comment_id)) BETWEEN 1 AND 512),
  comment_text TEXT NOT NULL DEFAULT '',
  author_name TEXT,
  reply_text TEXT NOT NULL CHECK (char_length(btrim(reply_text)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'UNKNOWN')),
  provider_message_id TEXT,
  provider_recipient_id TEXT,
  failure_code TEXT,
  failure_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_private_reply_channel_same_workspace
    FOREIGN KEY (workspace_id, channel_connection_id)
    REFERENCES public.channel_connections(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_private_reply_workspace_comment UNIQUE (workspace_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_private_reply_workspace_created
  ON public.meta_private_reply_dispatches(workspace_id, created_at DESC);

ALTER TABLE public.meta_private_reply_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_meta_private_reply_dispatches
  ON public.meta_private_reply_dispatches FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY tenant_select_meta_private_reply_dispatches
  ON public.meta_private_reply_dispatches FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

REVOKE INSERT, UPDATE, DELETE ON public.meta_private_reply_dispatches FROM public, anon, authenticated;
GRANT SELECT ON public.meta_private_reply_dispatches TO authenticated;
GRANT ALL ON public.meta_private_reply_dispatches TO service_role;

CREATE TRIGGER trg_meta_private_reply_dispatches_updated_at
  BEFORE UPDATE ON public.meta_private_reply_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


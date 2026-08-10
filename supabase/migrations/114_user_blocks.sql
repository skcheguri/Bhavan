-- 114: blocking someone, enforced where contact actually happens
--
-- soft_block_states already exists and is a different thing: it is
-- moderation, raised by an owner reporting a tenant as a broker and
-- resolved by Bhavan. This is the personal one -- "I do not want to hear
-- from this person" -- and nobody reviews it.
--
-- A block that only hides a name is theatre. There are exactly two ways
-- one member reaches another here, so both are closed:
--
--   connection_requests  a renter enquiring about a listing
--   chat_messages        either party writing in an approved thread
--
-- Both directions stop, not just the blocked person's. A block that let
-- the blocker keep writing would leave the other side reading messages
-- they cannot answer, which is worse than silence.
--
-- What a block deliberately does NOT do: it does not touch society
-- notices, polls, maintenance or collections. Two owners in the same
-- building who cannot stand each other still share a lift and a water
-- tank, and hiding a poll from one of them breaks the building's
-- business rather than protecting anyone.

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- You can see, make and undo your own blocks. Deliberately no policy for
-- blocked_id: "X has blocked you" is not something to hand back to the
-- person who was blocked, and a query that returns it would let anyone
-- enumerate who has blocked them.
DROP POLICY IF EXISTS "Read own blocks" ON public.user_blocks;
CREATE POLICY "Read own blocks" ON public.user_blocks
  FOR SELECT TO authenticated USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Block someone" ON public.user_blocks;
CREATE POLICY "Block someone" ON public.user_blocks
  FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Unblock someone" ON public.user_blocks;
CREATE POLICY "Unblock someone" ON public.user_blocks
  FOR DELETE TO authenticated USING (blocker_id = auth.uid());

-- Definer, because the policies below have to see blocks in both
-- directions and the blocked party cannot read the row that names them.
CREATE OR REPLACE FUNCTION public.blocked_between(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_blocks b
    WHERE (b.blocker_id = p_a AND b.blocked_id = p_b)
       OR (b.blocker_id = p_b AND b.blocked_id = p_a)
  );
$$;

GRANT EXECUTE ON FUNCTION public.blocked_between(uuid, uuid) TO authenticated;

/* ------------------------------------------------------------------ */
/* Enquiries                                                          */
/* ------------------------------------------------------------------ */

-- There were two INSERT policies here saying the same thing, "Tenants
-- can create requests" and "Tenants can insert own connection requests".
-- Permissive policies OR together, so adding the block condition to one
-- of them would have changed nothing at all -- the other kept letting
-- the row in. They collapse into one.
DROP POLICY IF EXISTS "Tenants can create requests" ON public.connection_requests;
DROP POLICY IF EXISTS "Tenants can insert own connection requests" ON public.connection_requests;

CREATE POLICY "Tenants can create requests" ON public.connection_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = auth.uid()
    AND NOT blocked_between(auth.uid(), owner_id)
  );

COMMENT ON POLICY "Tenants can create requests" ON public.connection_requests IS
  'A renter may enquire as themselves, unless either party has blocked the other.';

/* ------------------------------------------------------------------ */
/* Messages                                                           */
/* ------------------------------------------------------------------ */

-- The existing policy let either party on the request write. A block
-- freezes the thread rather than deleting it: what was already said
-- stays readable to both, which is what someone needs if the exchange
-- ends in a dispute.
DROP POLICY IF EXISTS "Chat parties can send messages" ON public.chat_messages;

CREATE POLICY "Chat parties can send messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM connection_requests cr
      WHERE cr.id = chat_messages.request_id
        AND (cr.tenant_id = auth.uid() OR cr.owner_id = auth.uid())
        AND NOT blocked_between(cr.tenant_id, cr.owner_id)
    )
  );

COMMENT ON POLICY "Chat parties can send messages" ON public.chat_messages IS
  'Either party on an enquiry may write, until one of them blocks the other. Existing messages stay readable.';

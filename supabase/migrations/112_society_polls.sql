-- 112: society polls, where "anonymous" is a property of the data
--
-- A society admin asks a question, members answer, and the admin decides
-- per poll whether the answers are anonymous. "Who is coming to the
-- Diwali party" wants names next to it. "Who should be president" must
-- not have them.
--
-- The obvious schema is one row per vote -- (poll_id, user_id,
-- option_id) -- with an is_anonymous flag deciding whether the names are
-- rendered. That makes anonymity a property of the screen. Every ballot
-- is still signed in the table, so the admin running the election,
-- anyone with a service-role key and anyone reading a backup can see who
-- voted for whom. A promise the storage does not keep is worse than no
-- promise, because people vote differently when they believe it.
--
-- So the two kinds of poll are stored differently, and the anonymous one
-- has nowhere to put a name:
--
--   community_poll_voters      this person voted   (both kinds)
--   community_poll_ballots     this was the choice (anonymous only)
--   community_poll_open_votes  person and choice   (named only)
--
-- For an anonymous poll cast_poll_vote() writes a voters row and a
-- ballot, and nothing links them. Double voting is stopped by the
-- primary key on voters, which is the only reason to record a voter at
-- all. community_poll_ballots has no voter column, so no future change
-- to a flag, a policy or a query can expose one.
--
-- Two details that would quietly undo it:
--
--   The ballot carries no timestamp. If both rows had a created_at they
--   would pair off one-to-one by time and the split would be
--   decorative. Its id is a random uuid for the same reason: a sequence
--   would order ballots exactly as voters are ordered.
--
--   Neither vote table has a SELECT policy. Not "members cannot read
--   them" -- nobody can, including society admins. Tallies come only
--   from the aggregate in get_community_polls(), which returns counts.
--
-- One consequence worth stating plainly, because the UI has to say it:
-- in an anonymous poll the application cannot tell a member what they
-- voted for. Nothing stores it. That is the feature working.
--
-- What this does not defend against: a poll with few voters and a
-- distinctive combination of answers can still be narrowed by
-- inference, and a superuser can read physical row order. Anonymity here
-- means no stored link, not unobservability.

/* ------------------------------------------------------------------ */
/* Tables                                                             */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS community_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question text NOT NULL,
  allow_multiple boolean NOT NULL DEFAULT false,
  -- Defaults to anonymous. The failure that matters is a member finding
  -- out afterwards that a vote they thought was secret was not.
  is_anonymous boolean NOT NULL DEFAULT true,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_polls_community
  ON community_polls (community_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer NOT NULL,
  UNIQUE (poll_id, position)
);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll
  ON community_poll_options (poll_id, position);

-- Who voted, in either kind of poll. Never what they chose.
CREATE TABLE IF NOT EXISTS community_poll_voters (
  poll_id uuid NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  voted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);

-- Anonymous polls only. No voter column, and no timestamp: see header.
CREATE TABLE IF NOT EXISTS community_poll_ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  option_ids uuid[] NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_poll_ballots_poll
  ON community_poll_ballots (poll_id);

-- Named polls only, where showing who chose what is the point.
CREATE TABLE IF NOT EXISTS community_poll_open_votes (
  poll_id uuid NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_ids uuid[] NOT NULL,
  voted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);

COMMENT ON TABLE community_poll_ballots IS
  'Ballots for anonymous polls. No voter column and no timestamp, so a ballot cannot be paired with a row in community_poll_voters.';
COMMENT ON TABLE community_poll_open_votes IS
  'Votes for polls the admin marked non-anonymous, where the voter is shown beside their answer.';

/* ------------------------------------------------------------------ */
/* Which society a poll belongs to                                    */
/* ------------------------------------------------------------------ */

-- Child rows are keyed by poll_id, so their policies need the society
-- one hop up. Definer for the same reason as the lookups in 084 and
-- 085: a policy that reads the parent under RLS recurses.
CREATE OR REPLACE FUNCTION public.poll_community(p_poll uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT community_id FROM community_polls WHERE id = p_poll;
$$;

GRANT EXECUTE ON FUNCTION public.poll_community(uuid) TO authenticated;

/* ------------------------------------------------------------------ */
/* A poll cannot be rewritten once it has been answered                */
/* ------------------------------------------------------------------ */

-- Closing is the only edit a poll is meant to receive. Without this an
-- admin could change the question, turn a single-answer poll into a
-- multiple-answer one, or -- worst -- flip is_anonymous after members
-- had voted believing otherwise. Flipping it would not expose the old
-- ballots, since they are in a table with no voter column, but it would
-- name everyone who voted after the change under a question they
-- answered before it.
CREATE OR REPLACE FUNCTION public.enforce_poll_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.id             := OLD.id;
  NEW.community_id   := OLD.community_id;
  NEW.author_id      := OLD.author_id;
  NEW.question       := OLD.question;
  NEW.allow_multiple := OLD.allow_multiple;
  NEW.is_anonymous   := OLD.is_anonymous;
  NEW.created_at     := OLD.created_at;
  NEW.updated_at     := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_poll_immutable ON community_polls;
CREATE TRIGGER trg_enforce_poll_immutable
  BEFORE UPDATE ON community_polls
  FOR EACH ROW EXECUTE FUNCTION enforce_poll_immutable();

/* ------------------------------------------------------------------ */
/* RLS                                                                */
/* ------------------------------------------------------------------ */

ALTER TABLE community_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_poll_voters ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_poll_ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_poll_open_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read polls" ON community_polls;
CREATE POLICY "Members read polls" ON community_polls
  FOR SELECT TO authenticated
  USING (is_community_member(community_id) OR is_admin());

-- Creation goes through create_community_poll(), which writes the poll
-- and its answers together. No INSERT policy on purpose: a poll inserted
-- on its own would be announced to the whole society before it had any
-- answers to click.
DROP POLICY IF EXISTS "Admins close polls" ON community_polls;
CREATE POLICY "Admins close polls" ON community_polls
  FOR UPDATE TO authenticated
  USING (is_community_admin(community_id))
  WITH CHECK (is_community_admin(community_id));

DROP POLICY IF EXISTS "Admins delete polls" ON community_polls;
CREATE POLICY "Admins delete polls" ON community_polls
  FOR DELETE TO authenticated
  USING (is_community_admin(community_id));

DROP POLICY IF EXISTS "Members read poll options" ON community_poll_options;
CREATE POLICY "Members read poll options" ON community_poll_options
  FOR SELECT TO authenticated
  USING (is_community_member(poll_community(poll_id)) OR is_admin());

-- The three vote tables get RLS enabled and no policies at all. That is
-- the point: with RLS on and nothing granted, no authenticated role can
-- read them, so no query -- not the admin's, not a mistaken join in some
-- future feature -- can put a person beside a choice in an anonymous
-- poll. All three are written and counted only by the definer functions
-- below.

/* ------------------------------------------------------------------ */
/* Create a poll, then tell the society                                */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.create_community_poll(
  p_community uuid,
  p_question text,
  p_allow_multiple boolean,
  p_is_anonymous boolean,
  p_options text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll uuid;
  v_name text;
  v_clean text[];
BEGIN
  IF NOT is_community_admin(p_community) THEN
    RAISE EXCEPTION 'Only a society admin can create a poll.';
  END IF;
  IF NOT community_is_open(p_community) THEN
    RAISE EXCEPTION 'This society is closed.';
  END IF;
  IF btrim(coalesce(p_question, '')) = '' THEN
    RAISE EXCEPTION 'A poll needs a question.';
  END IF;

  -- Trim, drop blanks, drop repeats, keep the order they were typed in.
  -- Two identical answers would split the vote between them while
  -- reading as one option to the person clicking.
  SELECT array_agg(s.label ORDER BY s.ord) INTO v_clean
  FROM (
    SELECT DISTINCT ON (btrim(u.o)) btrim(u.o) AS label, u.ord
    FROM unnest(p_options) WITH ORDINALITY AS u(o, ord)
    WHERE btrim(u.o) <> ''
    ORDER BY btrim(u.o), u.ord
  ) s;

  IF v_clean IS NULL OR array_length(v_clean, 1) < 2 THEN
    RAISE EXCEPTION 'A poll needs at least two different answers.';
  END IF;
  IF array_length(v_clean, 1) > 10 THEN
    RAISE EXCEPTION 'A poll can have at most 10 answers.';
  END IF;

  INSERT INTO community_polls (community_id, author_id, question, allow_multiple, is_anonymous)
  VALUES (
    p_community,
    auth.uid(),
    btrim(p_question),
    coalesce(p_allow_multiple, false),
    coalesce(p_is_anonymous, true)
  )
  RETURNING id INTO v_poll;

  INSERT INTO community_poll_options (poll_id, label, position)
  SELECT v_poll, t.label, t.ord
  FROM unnest(v_clean) WITH ORDINALITY AS t(label, ord);

  -- Notified here rather than from a trigger on community_polls, because
  -- a trigger fires before the answers are written: every member would
  -- be told to go and vote on a poll that had nothing to click yet.
  --
  -- Wrapped, because this runs inside the caller's transaction. A
  -- notification that fails must not take the poll down with it (see the
  -- outage documented in 071).
  BEGIN
    SELECT name INTO v_name FROM communities WHERE id = p_community;

    INSERT INTO notifications (user_id, type, title, message, action_url)
    SELECT m.user_id,
           'platform',
           'New poll in your society',
           coalesce(v_name, 'Your society') || ': ' || left(btrim(p_question), 140),
           '/society?tab=polls'
    FROM community_members m
    WHERE m.community_id = p_community
      AND m.status = 'approved'
      AND m.user_id <> auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'poll notification failed: %', SQLERRM;
  END;

  RETURN v_poll;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_community_poll(uuid, text, boolean, boolean, text[]) TO authenticated;

/* ------------------------------------------------------------------ */
/* Vote                                                                */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.cast_poll_vote(p_poll uuid, p_option_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community uuid;
  v_multiple boolean;
  v_anonymous boolean;
  v_closed timestamptz;
  v_chosen uuid[];
  v_known integer;
BEGIN
  SELECT p.community_id, p.allow_multiple, p.is_anonymous, p.closed_at
    INTO v_community, v_multiple, v_anonymous, v_closed
  FROM community_polls p WHERE p.id = p_poll;

  IF v_community IS NULL THEN
    RAISE EXCEPTION 'That poll no longer exists.';
  END IF;
  IF NOT is_community_member(v_community) THEN
    RAISE EXCEPTION 'You are not a member of this society.';
  END IF;
  IF v_closed IS NOT NULL THEN
    RAISE EXCEPTION 'This poll has closed.';
  END IF;

  SELECT array_agg(DISTINCT x) INTO v_chosen FROM unnest(coalesce(p_option_ids, '{}')) x;

  IF v_chosen IS NULL THEN
    RAISE EXCEPTION 'Choose an answer before voting.';
  END IF;
  IF NOT v_multiple AND array_length(v_chosen, 1) > 1 THEN
    RAISE EXCEPTION 'This poll takes one answer only.';
  END IF;

  -- Every id has to be an answer on this poll. Without this a member
  -- could send the id of an option from another society's poll and have
  -- it counted here.
  SELECT count(*) INTO v_known
  FROM community_poll_options o
  WHERE o.poll_id = p_poll AND o.id = ANY (v_chosen);

  IF v_known <> array_length(v_chosen, 1) THEN
    RAISE EXCEPTION 'That answer is not on this poll.';
  END IF;

  -- The voters row goes first in both branches: it is what stops a
  -- second ballot, so if it collides nothing else runs.
  INSERT INTO community_poll_voters (poll_id, user_id) VALUES (p_poll, auth.uid());

  IF v_anonymous THEN
    INSERT INTO community_poll_ballots (poll_id, option_ids) VALUES (p_poll, v_chosen);
  ELSE
    INSERT INTO community_poll_open_votes (poll_id, user_id, option_ids)
    VALUES (p_poll, auth.uid(), v_chosen);
  END IF;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'You have already voted in this poll.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_poll_vote(uuid, uuid[]) TO authenticated;

/* ------------------------------------------------------------------ */
/* Read polls, with tallies only where they are allowed to be seen     */
/* ------------------------------------------------------------------ */

-- Counts are withheld until the member has voted, or the poll has
-- closed. Live tallies on an open election tell a late voter which way
-- it is going, which is the thing a secret ballot exists to prevent.
--
-- my_option_ids is what the caller chose, and is null for an anonymous
-- poll because nothing recorded it. The UI says so rather than leaving
-- the member wondering whether their vote registered.
CREATE OR REPLACE FUNCTION public.get_community_polls(
  p_community uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  community_id uuid,
  author_id uuid,
  question text,
  allow_multiple boolean,
  is_anonymous boolean,
  closed_at timestamptz,
  created_at timestamptz,
  author_name text,
  has_voted boolean,
  voter_count bigint,
  results_visible boolean,
  my_option_ids uuid[],
  options jsonb,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT (is_community_member(p_community) OR is_admin()) THEN
    RAISE EXCEPTION 'You are not a member of this society';
  END IF;

  RETURN QUERY
  WITH page AS (
    SELECT p.id,
           p.community_id,
           p.author_id,
           p.question,
           p.allow_multiple,
           p.is_anonymous,
           p.closed_at,
           p.created_at,
           EXISTS (
             SELECT 1 FROM community_poll_voters v
             WHERE v.poll_id = p.id AND v.user_id = auth.uid()
           ) AS voted,
           (SELECT count(*) FROM community_poll_voters v WHERE v.poll_id = p.id) AS voters,
           (
             SELECT ov.option_ids FROM community_poll_open_votes ov
             WHERE ov.poll_id = p.id AND ov.user_id = auth.uid()
           ) AS mine,
           count(*) OVER () AS total
    FROM community_polls p
    WHERE p.community_id = p_community
    ORDER BY p.created_at DESC
    LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
  )
  SELECT page.id,
         page.community_id,
         page.author_id,
         page.question,
         page.allow_multiple,
         page.is_anonymous,
         page.closed_at,
         page.created_at,
         u.name,
         page.voted,
         page.voters,
         (page.voted OR page.closed_at IS NOT NULL),
         page.mine,
         (
           SELECT coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'id', o.id,
                 'label', o.label,
                 'position', o.position,
                 'votes',
                 CASE WHEN page.voted OR page.closed_at IS NOT NULL THEN
                   CASE WHEN page.is_anonymous THEN (
                     SELECT count(*) FROM community_poll_ballots b
                     WHERE b.poll_id = page.id AND o.id = ANY (b.option_ids)
                   ) ELSE (
                     SELECT count(*) FROM community_poll_open_votes ov
                     WHERE ov.poll_id = page.id AND o.id = ANY (ov.option_ids)
                   ) END
                 ELSE NULL END,
                 -- Names only where the admin chose a named poll. For an
                 -- anonymous one there is no table to read them from.
                 'voters',
                 CASE WHEN (page.voted OR page.closed_at IS NOT NULL) AND NOT page.is_anonymous THEN (
                   SELECT coalesce(jsonb_agg(vu.name ORDER BY vu.name), '[]'::jsonb)
                   FROM community_poll_open_votes ov
                   JOIN users vu ON vu.id = ov.user_id
                   WHERE ov.poll_id = page.id AND o.id = ANY (ov.option_ids)
                 ) ELSE NULL END
               )
               ORDER BY o.position
             ),
             '[]'::jsonb
           )
           FROM community_poll_options o
           WHERE o.poll_id = page.id
         ),
         page.total
  FROM page
  LEFT JOIN users u ON u.id = page.author_id
  ORDER BY page.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_polls(uuid, integer, integer) TO authenticated;

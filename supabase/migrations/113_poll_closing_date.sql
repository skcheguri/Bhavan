-- 113: polls that close themselves
--
-- 112 gave an admin a lock button and nothing else, so every poll stayed
-- open until somebody remembered it. A deadline is the normal way to run
-- a vote: "nominations close Friday" is the sentence people already say.
--
-- No scheduled job stamps these shut. A poll whose closes_at has passed
-- IS closed -- it is a fact about the clock, not a row that has to be
-- updated -- so there is no window between the deadline and a cron run
-- in which a late vote sneaks in, and nothing breaks if a job fails to
-- fire. The trade is that "closed" is now a computed thing, and a rule
-- computed in more than one place drifts: the display says closed while
-- the vote path still accepts ballots. So it is written once, in
-- poll_closed(), and every caller asks that.

ALTER TABLE public.community_polls
  ADD COLUMN IF NOT EXISTS closes_at timestamptz;

COMMENT ON COLUMN public.community_polls.closes_at IS
  'When the poll shuts on its own. Null means it stays open until an admin closes it. Closing is computed, not stamped -- see poll_closed().';

-- The one definition of closed: an admin shut it, or the deadline has
-- passed.
CREATE OR REPLACE FUNCTION public.poll_closed(p_closed_at timestamptz, p_closes_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_closed_at IS NOT NULL
      OR (p_closes_at IS NOT NULL AND p_closes_at <= now());
$$;

GRANT EXECUTE ON FUNCTION public.poll_closed(timestamptz, timestamptz) TO authenticated;

/* ------------------------------------------------------------------ */
/* A closed poll stays closed                                          */
/* ------------------------------------------------------------------ */

-- closes_at is editable while the poll is open, because a deadline typed
-- wrongly would otherwise only be fixable by deleting the poll and every
-- vote already cast on it.
--
-- Once the poll has closed, both dates freeze. Without that, moving
-- closes_at into the future reopens a finished election and lets someone
-- vote after seeing the result -- which is exactly the situation the
-- deadline existed to prevent.
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

  IF poll_closed(OLD.closed_at, OLD.closes_at) THEN
    NEW.closed_at  := OLD.closed_at;
    NEW.closes_at  := OLD.closes_at;
  END IF;

  RETURN NEW;
END;
$$;

/* ------------------------------------------------------------------ */
/* Create a poll, now with an optional deadline                        */
/* ------------------------------------------------------------------ */

-- Dropped rather than replaced: the argument list is changing, and
-- CREATE OR REPLACE cannot do that (see the note in 090).
DROP FUNCTION IF EXISTS public.create_community_poll(uuid, text, boolean, boolean, text[]);

CREATE FUNCTION public.create_community_poll(
  p_community uuid,
  p_question text,
  p_allow_multiple boolean,
  p_is_anonymous boolean,
  p_options text[],
  p_closes_at timestamptz DEFAULT NULL
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

  -- A poll created already shut would be announced to the whole society
  -- and then refuse every one of them.
  IF p_closes_at IS NOT NULL AND p_closes_at <= now() THEN
    RAISE EXCEPTION 'The closing time has to be in the future.';
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

  INSERT INTO community_polls (community_id, author_id, question, allow_multiple, is_anonymous, closes_at)
  VALUES (
    p_community,
    auth.uid(),
    btrim(p_question),
    coalesce(p_allow_multiple, false),
    coalesce(p_is_anonymous, true),
    p_closes_at
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
           coalesce(v_name, 'Your society') || ': ' || left(btrim(p_question), 140)
             || coalesce(' Closes ' || to_char(p_closes_at, 'DD Mon at HH24:MI') || '.', ''),
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

GRANT EXECUTE ON FUNCTION public.create_community_poll(uuid, text, boolean, boolean, text[], timestamptz) TO authenticated;

/* ------------------------------------------------------------------ */
/* Voting asks poll_closed(), not closed_at                            */
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
  v_shut boolean;
  v_chosen uuid[];
  v_known integer;
BEGIN
  SELECT p.community_id, p.allow_multiple, p.is_anonymous,
         poll_closed(p.closed_at, p.closes_at)
    INTO v_community, v_multiple, v_anonymous, v_shut
  FROM community_polls p WHERE p.id = p_poll;

  IF v_community IS NULL THEN
    RAISE EXCEPTION 'That poll no longer exists.';
  END IF;
  IF NOT is_community_member(v_community) THEN
    RAISE EXCEPTION 'You are not a member of this society.';
  END IF;
  IF v_shut THEN
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
/* Reading: hand the client the answer, not the ingredients            */
/* ------------------------------------------------------------------ */

-- is_closed is returned rather than left for the client to work out from
-- two dates and a clock. The browser's clock is not the database's, and
-- a card that says "open" beside a vote button the server will refuse is
-- the exact drift this migration is trying to avoid.
DROP FUNCTION IF EXISTS public.get_community_polls(uuid, integer, integer);

CREATE FUNCTION public.get_community_polls(
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
  closes_at timestamptz,
  is_closed boolean,
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
           p.closes_at,
           poll_closed(p.closed_at, p.closes_at) AS shut,
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
         page.closes_at,
         page.shut,
         page.created_at,
         u.name,
         page.voted,
         page.voters,
         (page.voted OR page.shut),
         page.mine,
         (
           SELECT coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'id', o.id,
                 'label', o.label,
                 'position', o.position,
                 'votes',
                 CASE WHEN page.voted OR page.shut THEN
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
                 CASE WHEN (page.voted OR page.shut) AND NOT page.is_anonymous THEN (
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

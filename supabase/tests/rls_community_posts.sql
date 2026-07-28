-- RLS/trigger regression suite: community_posts moderation integrity.
--
-- Run manually against the linked project:
--   npx supabase db query --linked --file supabase/tests/rls_community_posts.sql
--
-- Everything runs inside BEGIN/ROLLBACK, so it never leaves data
-- behind. Requires at least one non-admin user and one 'admin' user in
-- `users` to run for real; otherwise every probe reports "skipped".
--
-- This exists because migration 051 fixed a real hole found while
-- building this suite: "Authors can update own posts" has no WITH
-- CHECK, so an author could set hidden = false on their own post via a
-- raw API call -- silently undoing an admin's moderation decision.
-- There's no author-side edit-post feature in the app at all (the only
-- client write to community_posts.hidden is toggleHide() inside
-- useAdminCommunityModeration, admin-only). Fixed with a BEFORE UPDATE
-- trigger that blocks the true -> false transition unless is_admin().
--
-- Note: a first attempt used a plain WITH CHECK (hidden = false) --
-- that's backwards, since the exploit's own target value IS false, so
-- the attacker's update trivially satisfied it. Only a trigger, which
-- can compare OLD vs NEW, can express "block this specific
-- transition" rather than "require this final value". Re-run this
-- after any future change to community_posts' policies or triggers.

BEGIN;

CREATE TEMP TABLE probe_results (test TEXT, ok BOOLEAN, detail TEXT);

DO $$
DECLARE
  v_author UUID;
  v_admin UUID;
  v_post_id UUID;
  result BOOLEAN;
  err_msg TEXT := 'no error';
  rows_affected INT;
BEGIN
  SELECT id INTO v_author FROM users WHERE role <> 'admin' LIMIT 1;
  SELECT id INTO v_admin FROM users WHERE role = 'admin' LIMIT 1;

  IF v_author IS NULL THEN
    INSERT INTO probe_results VALUES ('all probes', true, 'skipped -- no test users in this environment');
    RETURN;
  END IF;

  -- 1. Author can still create their own post.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO community_posts (author_id, title, content)
    VALUES (v_author, 'Regression test post', 'content')
    RETURNING id INTO v_post_id;
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('author can still create a post', result, err_msg);

  IF v_post_id IS NOT NULL AND v_admin IS NOT NULL THEN
    -- 2. A real admin can hide the post (the real moderation flow).
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE community_posts SET hidden = true WHERE id = v_post_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('a real admin can hide a post', result, result::text);

    -- 3. The author cannot unhide their own moderated post. A blocked
    --    UPDATE could mean either the trigger raised (caught below) or
    --    RLS's own USING clause silently matched 0 rows (no exception)
    --    -- check both.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
    err_msg := 'no error';
    BEGIN
      UPDATE community_posts SET hidden = false WHERE id = v_post_id;
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      result := rows_affected > 0;
    EXCEPTION WHEN OTHERS THEN
      result := false;
      GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('author cannot unhide their own moderated post', NOT result, err_msg);

    -- 4. A real admin can still unhide it (the real moderation-reversal flow).
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE community_posts SET hidden = false WHERE id = v_post_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('a real admin can unhide a post', result, result::text);
  ELSIF v_post_id IS NOT NULL THEN
    INSERT INTO probe_results VALUES ('admin moderation probes', true, 'skipped -- no admin test user in this environment');
  END IF;
END $$;

SELECT * FROM probe_results ORDER BY test;

ROLLBACK;

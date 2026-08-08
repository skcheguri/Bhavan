-- Keep migration text ASCII-only.
--
-- 080 used an em dash in a notification message. The file is correct
-- UTF-8, but it reached Postgres through a client encoding that treated
-- those three bytes as three Latin-1 characters, so subscribers were sent:
--
--   Gate light out a<eu>" reported in your society
--
-- Confirmed against production. Nothing is wrong with the file or the
-- database -- the loss happens in transit, which makes it invisible to
-- code review and to anyone reading the migration afterwards.
--
-- The rule this establishes: no non-ASCII in migrations, in SQL string
-- literals above all. Comments are lower risk (073 has a rupee sign and
-- nobody will ever see it), but a plain hyphen costs nothing and cannot
-- be corrupted by any encoding in the path. User-facing text with real
-- typography belongs in the React layer, which is served as UTF-8 and
-- tested in a browser.

CREATE OR REPLACE FUNCTION public.notify_community_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    SELECT m.user_id, 'maintenance', 'New maintenance issue',
           NEW.title || ' - reported in your society',
           '/society'
    FROM community_members m
    WHERE m.community_id = NEW.community_id
      AND m.status = 'approved'
      AND m.role = 'admin'
      AND m.user_id <> NEW.raised_by;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ticket notification failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

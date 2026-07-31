-- Found while building the community_posts RLS regression suite:
-- "Authors can update own posts" has no WITH CHECK, so an author can
-- set `hidden = false` on their own post via a raw API call --
-- silently undoing an admin's moderation decision. There is no
-- author-side edit-post feature in the app at all today (grep confirms
-- the only client write to community_posts.hidden is toggleHide()
-- inside useAdminCommunityModeration, called only from the admin
-- moderation page), so this closes a hole with zero current legitimate
-- use, before a real "edit my post" feature gives it one.
--
-- A first attempt at this used a plain WITH CHECK requiring the
-- resulting row to have hidden = false -- but that's backwards: the
-- exploit's whole goal IS to make hidden end up false, so the
-- attacker's own update trivially satisfied that check. The dangerous
-- thing isn't the final value, it's the *transition* (true -> false
-- without being an admin) -- and a plain WITH CHECK can't see the OLD
-- row to detect a transition, only the NEW one. This needs a trigger,
-- same as the connection_requests/maintenance_requests fixes.
--
-- The false -> true direction (an author hiding their own post) is
-- left alone -- that's harmless self-moderation, not privilege
-- escalation.

CREATE OR REPLACE FUNCTION enforce_community_post_no_self_unhide()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_admin() AND OLD.hidden = true AND NEW.hidden = false THEN
        RAISE EXCEPTION 'Only an admin can unhide a moderated post.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_posts_no_self_unhide ON community_posts;
CREATE TRIGGER trg_community_posts_no_self_unhide
    BEFORE UPDATE ON community_posts
    FOR EACH ROW EXECUTE FUNCTION enforce_community_post_no_self_unhide();

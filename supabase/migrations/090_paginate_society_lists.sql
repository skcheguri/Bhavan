-- Page the society lists.
--
-- get_community_tickets, get_community_announcements and
-- get_community_members each returned everything. At today's scale that is
-- invisible; at the scale this feature is sold for it is not. A 200-flat
-- society opening the maintenance tab pulled every issue ever raised,
-- with its description and admin notes, over a phone connection -- and the
-- member directory pulled 200 rows to render the first screenful.
--
-- Adding parameters means DROP then CREATE: CREATE OR REPLACE cannot
-- change a function's argument list, even to add one with a default.
-- The defaults are chosen so an un-upgraded caller keeps working rather
-- than silently getting one page and believing it is everything.

DROP FUNCTION IF EXISTS public.get_community_tickets(uuid);

CREATE FUNCTION public.get_community_tickets(
  p_community uuid,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  community_id uuid,
  raised_by uuid,
  category text,
  title text,
  description text,
  location text,
  priority text,
  status text,
  images text[],
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz,
  raised_by_name text,
  raised_by_units text[],
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
BEGIN
  IF NOT (is_community_member(p_community) OR is_admin()) THEN
    RAISE EXCEPTION 'You are not a member of this society';
  END IF;

  -- total_count rides along on every row so the caller knows whether to
  -- offer "show more" without a second round trip. A separate count query
  -- would also be a second chance to disagree with the page it describes.
  RETURN QUERY
  SELECT t.id, t.community_id, t.raised_by, t.category, t.title, t.description,
         t.location, t.priority, t.status, t.images, t.admin_notes,
         t.resolved_at, t.created_at,
         u.name,
         coalesce(m.unit_numbers, '{}'),
         count(*) OVER () AS total_count
  FROM community_tickets t
  JOIN users u ON u.id = t.raised_by
  LEFT JOIN community_members m
    ON m.community_id = t.community_id AND m.user_id = t.raised_by
  WHERE t.community_id = p_community
  ORDER BY
    CASE t.status WHEN 'resolved' THEN 1 ELSE 0 END,
    CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
    t.created_at DESC
  LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_tickets(uuid, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_community_announcements(uuid);

CREATE FUNCTION public.get_community_announcements(
  p_community uuid,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  community_id uuid,
  author_id uuid,
  title text,
  body text,
  pinned boolean,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
BEGIN
  IF NOT (is_community_member(p_community) OR is_admin()) THEN
    RAISE EXCEPTION 'You are not a member of this society';
  END IF;

  RETURN QUERY
  SELECT a.id, a.community_id, a.author_id, a.title, a.body, a.pinned,
         a.created_at, a.updated_at, u.name,
         count(*) OVER () AS total_count
  FROM community_announcements a
  JOIN users u ON u.id = a.author_id
  WHERE a.community_id = p_community
  ORDER BY a.pinned DESC, a.created_at DESC
  LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_announcements(uuid, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_community_members(uuid);

CREATE FUNCTION public.get_community_members(
  p_community uuid,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  community_id uuid,
  user_id uuid,
  unit_numbers text[],
  role text,
  status text,
  rejection_reason text,
  approved_at timestamptz,
  created_at timestamptz,
  name text,
  email text,
  avatar_url text,
  phone text,
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_admin boolean := is_community_admin(p_community) OR is_admin();
BEGIN
  IF NOT (is_community_member(p_community) OR v_admin) THEN
    RAISE EXCEPTION 'You are not a member of this society';
  END IF;

  -- Pending requests sort first. They are what an admin opened this to
  -- deal with, and a page boundary must never bury them behind a
  -- directory of people who joined months ago.
  RETURN QUERY
  SELECT m.id, m.community_id, m.user_id, m.unit_numbers, m.role, m.status,
         m.rejection_reason, m.approved_at, m.created_at,
         u.name,
         CASE WHEN v_admin THEN u.email END,
         u.avatar_url,
         CASE WHEN v_admin THEN u.phone END,
         count(*) OVER () AS total_count
  FROM community_members m
  JOIN users u ON u.id = m.user_id
  WHERE m.community_id = p_community
  ORDER BY
    CASE m.status WHEN 'pending' THEN 0 ELSE 1 END,
    m.created_at ASC
  LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_members(uuid, integer, integer) TO authenticated;

-- Announcements gained updated_at in the return above, because editing a
-- notice is now possible and a reader deserves to know they are not
-- looking at what was originally posted.
CREATE OR REPLACE FUNCTION public.touch_announcement_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_announcement_updated_at ON community_announcements;
CREATE TRIGGER trg_touch_announcement_updated_at
  BEFORE UPDATE ON community_announcements
  FOR EACH ROW EXECUTE FUNCTION touch_announcement_updated_at();

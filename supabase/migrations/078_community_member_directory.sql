-- Let a society see who is in it, without opening up the users table.
--
-- The members screen needs a name against each row -- approving "some
-- account" is not a decision anyone can make. But joining community_members
-- to users hits RLS on users and fails with "permission denied for table
-- users", confirmed in the browser.
--
-- Relaxing that policy is the wrong fix. RLS grants rows, not columns, so
-- any policy letting co-members read users would hand them the whole
-- record: aadhaar_last4, verification status, everything. A function can
-- name the columns it returns, so that is what this does.
--
-- Contact details are narrower still. An admin needs an email or phone to
-- check that a join request is genuine; an ordinary member does not need
-- the contact details of everyone in the building, and a directory that
-- leaks them is exactly what an owners' group should not be. Both are
-- returned as NULL unless the caller administers the society.

CREATE OR REPLACE FUNCTION public.get_community_members(p_community uuid)
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
  phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_admin boolean := is_community_admin(p_community) OR is_admin();
BEGIN
  IF NOT (is_community_member(p_community) OR v_admin) THEN
    RAISE EXCEPTION 'You are not a member of this society';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.community_id,
    m.user_id,
    m.unit_numbers,
    m.role,
    m.status,
    m.rejection_reason,
    m.approved_at,
    m.created_at,
    u.name,
    CASE WHEN v_admin THEN u.email END,
    u.avatar_url,
    CASE WHEN v_admin THEN u.phone END
  FROM community_members m
  JOIN users u ON u.id = m.user_id
  WHERE m.community_id = p_community
  ORDER BY m.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_community_members(uuid) IS
  'Member directory for one society. Members see names; only admins see email and phone.';

GRANT EXECUTE ON FUNCTION public.get_community_members(uuid) TO authenticated;

-- Return who confirmed a contribution and when.
--
-- get_collection_status had the amount and the reference but not the
-- confirmation, which is the one fact a receipt is actually attesting to.
-- A receipt saying "Rs 2,000 received" without saying who checked it
-- against the account, or when, is a number on letterhead.
--
-- community_members is not paginated in the app and keeps its 500-row
-- default: the pending-request count on the Members tab is computed from
-- the rows it returns, and paging that list would make an admin see "2
-- waiting" when there were thirty. Pending rows sort first regardless, so
-- the queue is complete in any society under the cap.

DROP FUNCTION IF EXISTS public.get_collection_status(uuid);

CREATE FUNCTION public.get_collection_status(p_collection uuid)
RETURNS TABLE (
  user_id uuid,
  name text,
  units text[],
  contribution_id uuid,
  amount_rupees integer,
  reference text,
  note text,
  status text,
  created_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by_name text
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_community uuid := collection_community(p_collection);
BEGIN
  IF v_community IS NULL THEN
    RAISE EXCEPTION 'No such collection';
  END IF;
  IF NOT (is_community_member(v_community) OR is_admin()) THEN
    RAISE EXCEPTION 'You are not a member of this society';
  END IF;

  RETURN QUERY
  SELECT m.user_id, u.name, m.unit_numbers,
         c.id, c.amount_rupees, c.reference, c.note,
         coalesce(c.status, 'none'), c.created_at,
         c.confirmed_at, cu.name
  FROM community_members m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN community_contributions c
    ON c.collection_id = p_collection AND c.user_id = m.user_id
  LEFT JOIN users cu ON cu.id = c.confirmed_by
  WHERE m.community_id = v_community
    AND m.status = 'approved'
  ORDER BY
    CASE coalesce(c.status, 'none')
      WHEN 'claimed' THEN 0    -- needs an admin to look at it
      WHEN 'none' THEN 1       -- has not paid
      WHEN 'rejected' THEN 2
      ELSE 3                   -- confirmed, done
    END,
    u.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_collection_status(uuid) TO authenticated;

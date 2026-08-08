-- "Would you use them again?" on a finished job.
--
-- One nullable boolean per job, not a rating out of five. A star rating
-- from a sample of one is noise, and nobody fills in a review form for
-- their plumber. "Would you call him again" is the only question whose
-- answer a building actually knows, and it is answerable in one tap.
--
-- Nothing surfaces this yet, deliberately. It only becomes useful at
-- density -- when enough societies in one locality have answered it, an
-- owner looking for a lift technician can be shown "4 societies near you
-- use Ramesh Lifts", which is a fact about real completed work rather
-- than a listing Bhavan is vouching for.
--
-- Capturing it now is the point. If this waits until the feature that
-- needs it, that feature launches with an empty table and is useless for
-- a year. Collecting early costs one column and one tap.
--
-- Answered by whoever ENGAGED the vendor -- the society admin, or the
-- landlord -- not the person who reported the fault. The tenant
-- experienced the work; the admin is the one deciding whether to call
-- them next time, and that judgement is what the question is for.

ALTER TABLE community_tickets
  ADD COLUMN IF NOT EXISTS vendor_would_use_again boolean;

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS vendor_would_use_again boolean;

COMMENT ON COLUMN community_tickets.vendor_would_use_again IS
  'Null until answered. Whoever assigned the vendor answers it; aggregate per vendor for neighbourhood recommendations later.';

-- Same protection as the other admin-only fields: a member editing their
-- own ticket must not be able to record a verdict on the committee's
-- contractor.
CREATE OR REPLACE FUNCTION public.guard_community_ticket_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() OR is_community_admin(NEW.community_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only a society admin can change a ticket''s status';
  END IF;
  IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
    RAISE EXCEPTION 'Only a society admin can add notes to a ticket';
  END IF;
  IF NEW.assigned_vendor_id IS DISTINCT FROM OLD.assigned_vendor_id THEN
    RAISE EXCEPTION 'Only a society admin can assign this to someone';
  END IF;
  IF NEW.vendor_would_use_again IS DISTINCT FROM OLD.vendor_would_use_again THEN
    RAISE EXCEPTION 'Only a society admin can rate the contractor';
  END IF;
  IF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN
    RAISE EXCEPTION 'Only a society admin can resolve a ticket';
  END IF;
  IF NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.raised_by IS DISTINCT FROM OLD.raised_by THEN
    RAISE EXCEPTION 'A ticket cannot be moved to another society or owner';
  END IF;

  RETURN NEW;
END;
$$;

-- Carry the answer into the ticket list so the question can be asked, and
-- not asked twice.
DROP FUNCTION IF EXISTS public.get_community_tickets(uuid, integer, integer);

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
  assigned_vendor_id uuid,
  assigned_vendor_name text,
  assigned_vendor_phone text,
  assigned_vendor_trade text,
  assigned_at timestamptz,
  vendor_would_use_again boolean,
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
BEGIN
  IF NOT (is_community_member(p_community) OR is_admin()) THEN
    RAISE EXCEPTION 'You are not a member of this society';
  END IF;

  RETURN QUERY
  SELECT t.id, t.community_id, t.raised_by, t.category, t.title, t.description,
         t.location, t.priority, t.status, t.images, t.admin_notes,
         t.resolved_at, t.created_at,
         u.name,
         coalesce(m.unit_numbers, '{}'),
         t.assigned_vendor_id, v.name, v.phone, v.trade, t.assigned_at,
         t.vendor_would_use_again,
         count(*) OVER () AS total_count
  FROM community_tickets t
  JOIN users u ON u.id = t.raised_by
  LEFT JOIN community_members m
    ON m.community_id = t.community_id AND m.user_id = t.raised_by
  LEFT JOIN service_vendors v ON v.id = t.assigned_vendor_id
  WHERE t.community_id = p_community
  ORDER BY
    CASE t.status WHEN 'resolved' THEN 1 ELSE 0 END,
    CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
    t.created_at DESC
  LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_tickets(uuid, integer, integer) TO authenticated;

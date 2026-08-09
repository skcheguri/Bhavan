-- 109: a review can be corrected for an hour, then it stands
--
-- A review is a public verdict on a named person. Someone who has just
-- written one should be able to fix a mis-tapped Yes or a sentence they
-- regret; someone who wrote one six months ago should not be able to
-- quietly turn a five-star review into a one-star one after a falling
-- out, under a date the reader trusts.
--
-- Three things were in the way.
--
-- 1. There was no UPDATE policy on reviews at all, so editing was not
--    "unrestricted" -- it was impossible. Any edit UI would have failed
--    silently, because a blocked UPDATE under RLS matches no rows and
--    returns success with a count of zero.
--
-- 2. DELETE was allowed to the reviewer forever. An edit window that a
--    delete-and-rewrite walks straight around is decoration, so the same
--    hour applies to both. (After the hour, a review the subject wants
--    removed is a moderation matter -- admins are exempt below.)
--
-- 3. RLS grants rows, not columns. Left to the policy alone, a reviewer
--    inside the window could rewrite subject_id, role or agreement_id
--    and move a real review onto a different person or a different
--    tenancy. So the identity of a review is pinned by a trigger and
--    only the verdict -- answers, rating, comment -- is editable.

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

COMMENT ON COLUMN public.reviews.edited_at IS
  'Set when the reviewer changed their verdict inside the edit window. Null means the review is as first written.';

CREATE OR REPLACE FUNCTION public.enforce_review_edit_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Backend/service-role work and admin moderation are not the reviewer
  -- changing their mind, and are not bound by the window.
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF OLD.created_at < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'A review can only be % within an hour of writing it.',
      CASE TG_OP WHEN 'DELETE' THEN 'deleted' ELSE 'edited' END
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- Who this review is about, which side it speaks from, which tenancy
  -- it belongs to and when it was written are all facts, not opinions.
  -- Only the verdict may change.
  NEW.id           := OLD.id;
  NEW.reviewer_id  := OLD.reviewer_id;
  NEW.subject_id   := OLD.subject_id;
  NEW.agreement_id := OLD.agreement_id;
  NEW.listing_id   := OLD.listing_id;
  NEW.role         := OLD.role;
  NEW.property_name  := OLD.property_name;
  NEW.location       := OLD.location;
  NEW.tenancy_period := OLD.tenancy_period;
  NEW.created_at   := OLD.created_at;

  -- A review that changed after people read it should say so, and the
  -- reviewer does not get to decide that.
  IF (NEW.overall_rating, NEW.answers, NEW.comment)
     IS DISTINCT FROM (OLD.overall_rating, OLD.answers, OLD.comment) THEN
    NEW.edited_at := now();
  ELSE
    NEW.edited_at := OLD.edited_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_review_edit_window_trigger ON public.reviews;
CREATE TRIGGER enforce_review_edit_window_trigger
  BEFORE UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_edit_window();

-- The policy is what makes editing possible at all; the trigger above is
-- what makes it safe. The window is repeated here so that a review past
-- its hour is simply not visible to UPDATE, rather than reaching the
-- trigger and erroring.
DROP POLICY IF EXISTS "Reviewers can edit own reviews" ON public.reviews;
CREATE POLICY "Reviewers can edit own reviews"
  ON public.reviews FOR UPDATE
  USING (reviewer_id = auth.uid() AND created_at > now() - interval '1 hour')
  WITH CHECK (reviewer_id = auth.uid());

DROP POLICY IF EXISTS "Reviewers can delete own reviews" ON public.reviews;
CREATE POLICY "Reviewers can delete own reviews"
  ON public.reviews FOR DELETE
  USING (reviewer_id = auth.uid() AND created_at > now() - interval '1 hour');

COMMENT ON POLICY "Reviewers can edit own reviews" ON public.reviews IS
  'A reviewer may correct their own review for one hour after writing it. Which person, side and tenancy it refers to is pinned by enforce_review_edit_window().';

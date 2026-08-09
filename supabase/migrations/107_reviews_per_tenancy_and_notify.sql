-- 107: one review per tenancy, and tell the person they got one
--
-- Two faults found by using the new picker against real data.
--
-- 1. A review knows who it is about but not which tenancy it is about.
--    The client marked a tenancy "already reviewed" by looking for any
--    review of that person -- and this tenant has four agreements with
--    the same owner, so reviewing one flat greyed out all four. The
--    reviewer was left with nothing selectable and no way to say so.
--
--    reviews.listing_id exists but is not the answer: several agreements
--    can share a listing over time, and a review is about a tenancy, not
--    about an advert.
--
-- 2. Nothing tells the subject a review exists. Every other event on
--    this platform notifies -- an assignment, a message, an approval --
--    but the one that affects how strangers judge you arrived silently.

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS agreement_id uuid REFERENCES public.rental_agreements(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.reviews.agreement_id IS
  'The tenancy this review is about. Null on reviews written before the tenancy picker existed.';

-- One review per person per tenancy. Legacy rows carry NULL and do not
-- collide, which is the behaviour we want: they are unattributed to a
-- specific tenancy and should not block a fresh, properly attributed one.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_tenancy
  ON public.reviews (reviewer_id, agreement_id)
  WHERE agreement_id IS NOT NULL;

-- When an agreement is named, it has to be the one that actually links
-- these two people -- otherwise a reviewer could attach a real review to
-- somebody else's tenancy and have it counted there.
DROP POLICY IF EXISTS "Reviews require a real tenancy" ON public.reviews;

CREATE POLICY "Reviews require a real tenancy"
  ON public.reviews FOR INSERT
  WITH CHECK (
    reviewer_id = auth.uid()
    AND subject_id IS DISTINCT FROM reviewer_id
    AND EXISTS (
      SELECT 1
      FROM rental_agreements ra
      WHERE
        (reviews.agreement_id IS NULL OR ra.id = reviews.agreement_id)
        AND (
          (ra.owner_id = reviews.reviewer_id
           AND ra.tenant_id = reviews.subject_id
           AND reviews.role = 'owner_on_renter')
          OR
          (ra.tenant_id = reviews.reviewer_id
           AND ra.owner_id = reviews.subject_id
           AND reviews.role = 'renter_on_owner')
        )
    )
  );

-- Deliberately not naming the reviewer's verdict. The notification says
-- a review exists and where to read it; the rating belongs on the page,
-- next to the questionnaire answers that explain it, not in a push
-- notification the subject reads out of context.
CREATE OR REPLACE FUNCTION public.notify_review_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from text;
BEGIN
  BEGIN
    SELECT name INTO v_from FROM users WHERE id = NEW.reviewer_id;

    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.subject_id,
      'platform',
      CASE WHEN NEW.role = 'owner_on_renter'
           THEN 'An owner reviewed you'
           ELSE 'A tenant reviewed you' END,
      coalesce(v_from, 'Someone') || ' left a review of your '
        || CASE WHEN NEW.role = 'owner_on_renter' THEN 'tenancy' ELSE 'property' END
        || coalesce(' at ' || nullif(NEW.property_name, ''), '') || '.',
      '/feedback'
    );
  EXCEPTION WHEN OTHERS THEN
    -- A review must not fail because its notification did.
    RAISE WARNING 'review notification failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_review_received_trigger ON public.reviews;
CREATE TRIGGER notify_review_received_trigger
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_review_received();

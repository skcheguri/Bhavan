-- 106: a review needs a tenancy, and the role has to match the side
--
-- The insert policy required an approved connection_request between the
-- two people. That is an enquiry someone accepted -- permission to make
-- contact, not evidence that anybody ever rented anything. So a person
-- who enquired, got approved and then walked away could still review the
-- owner, and the owner could review them.
--
-- It also never looked at `role`. A tenant could insert
-- role = 'owner_on_renter' and their review would render on the "Owner
-- on Tenant" side, reading as a landlord's verdict on a renter. The
-- client picked the role from a pair of buttons, so this was a click
-- away rather than a crafted request.
--
-- Both facts are already recorded on rental_agreements: who the owner
-- is, who the tenant is, and therefore which side each person is on.

DROP POLICY IF EXISTS "Authenticated can create own reviews" ON public.reviews;

CREATE POLICY "Reviews require a real tenancy"
  ON public.reviews FOR INSERT
  WITH CHECK (
    reviewer_id = auth.uid()
    AND subject_id IS DISTINCT FROM reviewer_id
    AND EXISTS (
      SELECT 1
      FROM rental_agreements ra
      WHERE
        -- The reviewer is the owner on this agreement, the subject is
        -- its tenant, and the review says so.
        (ra.owner_id = reviews.reviewer_id
         AND ra.tenant_id = reviews.subject_id
         AND reviews.role = 'owner_on_renter')
        OR
        -- Or the reverse, and the review says that instead.
        (ra.tenant_id = reviews.reviewer_id
         AND ra.owner_id = reviews.subject_id
         AND reviews.role = 'renter_on_owner')
    )
  );

COMMENT ON POLICY "Reviews require a real tenancy" ON public.reviews IS
  'A review may only be written about the other party on a rental agreement, and its role must match which side of that agreement the reviewer is on.';

-- 108: attach the reviews written before 107 to their tenancy
--
-- 107 added reviews.agreement_id and left existing rows NULL, so that
-- they would not block a properly attributed review. That is the right
-- default for a review whose tenancy is genuinely unknown, but it is not
-- true of the rows we actually have: every one of them was written
-- through the tenancy picker, which stamped property_name and
-- tenancy_period straight from a rental_agreements row. The tenancy is
-- known -- it just was not stored as a foreign key.
--
-- Left NULL, each of those reviews stops counting as "already reviewed",
-- so the picker offers the same tenancy again and the reviewer writes a
-- second review of a flat they have already rated.
--
-- The match is exact, not fuzzy: reviewer and subject must be the two
-- parties on the agreement, and both the address label and the period
-- label must reproduce byte for byte what the client rendered. Anything
-- ambiguous (zero matches, or more than one) is left alone rather than
-- guessed at -- a wrong agreement_id is worse than none, because the
-- unique index would then silently block the real review.

UPDATE public.reviews r
   SET agreement_id = m.id
  FROM (
    SELECT
      rv.id AS review_id,
      (array_agg(ra.id))[1] AS id,
      count(*) AS n
    FROM public.reviews rv
    JOIN public.rental_agreements ra
      ON (
           (ra.owner_id  = rv.reviewer_id AND ra.tenant_id = rv.subject_id
            AND rv.role = 'owner_on_renter')
        OR (ra.tenant_id = rv.reviewer_id AND ra.owner_id  = rv.subject_id
            AND rv.role = 'renter_on_owner')
         )
     AND (coalesce(nullif(btrim(ra.flat_number), '') || ', ', '')
          || btrim(ra.property_address)) = rv.property_name
     AND (to_char(ra.lease_start_date, 'Mon YYYY') || ' – '
          || to_char(ra.lease_end_date, 'Mon YYYY')) = rv.tenancy_period
    WHERE rv.agreement_id IS NULL
    GROUP BY rv.id
  ) m
 WHERE r.id = m.review_id
   AND m.n = 1
   -- Never create a collision with a review that already names this
   -- tenancy; the newer, explicitly attributed row wins.
   AND NOT EXISTS (
     SELECT 1 FROM public.reviews other
      WHERE other.reviewer_id = r.reviewer_id
        AND other.agreement_id = m.id
   );

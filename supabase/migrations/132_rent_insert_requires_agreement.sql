-- ============================================================
-- Stop tenants inserting arbitrary rent rows via the REST API.
--
-- The tenant INSERT policy was WITH CHECK (tenant_id = auth.uid() AND
-- status = 'pending') -- it pinned the tenant to themselves but left
-- owner_id, agreement_id, amount and month entirely free. So any signed-
-- in tenant could POST rent_payments rows naming ANY owner, in any
-- amount, for any month, polluting that owner's payment history and the
-- "collected"/outstanding figures derived from it.
--
-- The legitimate inserts -- create-rent-payment-order (Razorpay) and the
-- cash logger -- both derive owner_id and agreement_id from a real
-- rental_agreements row that names the tenant. So require exactly that:
-- the insert must reference an agreement the tenant is on, and its
-- owner_id must be that agreement's owner. A fabricated owner or a
-- missing agreement now fails the check. (Amount stays open on purpose --
-- partial cash payments are legitimate -- but it can no longer be
-- attributed to an owner the tenant has no agreement with.)
-- ============================================================

DROP POLICY IF EXISTS "Tenants can insert own rent payments" ON rent_payments;
CREATE POLICY "Tenants can insert own rent payments" ON rent_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = auth.uid()
    AND status = 'pending'
    AND agreement_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM rental_agreements ra
      WHERE ra.id = rent_payments.agreement_id
        AND ra.tenant_id = auth.uid()
        AND ra.owner_id = rent_payments.owner_id
    )
  );

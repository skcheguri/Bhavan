-- Found while building the rental_agreements RLS regression suite:
-- the "Owners can manage own agreements" ALL policy has no WITH CHECK
-- at all, and the separate "Owners can insert own agreements" policy
-- only checks owner_id. Neither stops an owner from directly setting
-- signed_by_tenant = true via a raw API call -- fraudulently asserting
-- the tenant's consent/signature on a legal document without the
-- tenant ever being involved.
--
-- No client code writes this column today (useRentalAgreements.ts only
-- ever writes shared_with_tenant/shared_at via markShared -- there is
-- no signing flow built yet), so this closes the hole before one
-- exists to exploit it.
--
-- signed_by_landlord is deliberately left alone: an owner asserting
-- their OWN signature is a self-attestation, not a claim about someone
-- else's consent, so it isn't the same class of problem.

ALTER POLICY "Owners can manage own agreements" ON rental_agreements
  WITH CHECK (owner_id = auth.uid() AND signed_by_tenant = false);

ALTER POLICY "Owners can insert own agreements" ON rental_agreements
  WITH CHECK (owner_id = auth.uid() AND signed_by_tenant = false);

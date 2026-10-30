-- ============================================================
-- Lock down upi_mandates: clients may READ their mandates, never WRITE them.
--
-- UPI AutoPay is not a real integration yet -- there is no Razorpay UPI
-- e-mandate behind this table. Until migration 154 the only thing standing
-- between a tenant and a forged "AutoPay active" row was RLS that checked
-- nothing but ownership:
--
--   "Tenants can insert own upi mandates"  WITH CHECK (tenant_id = auth.uid())
--   "Tenants can manage own mandates"      FOR ALL USING (tenant_id = auth.uid())
--
-- The FOR ALL policy's USING doubles as its INSERT check, so BOTH let any
-- authenticated tenant POST a row straight to /rest/v1/upi_mandates with
-- status defaulting to 'active' and any razorpay_token they invent -- a
-- fabricated mandate with no PSP mandate behind it, and no amount/token
-- validation. (The dead client createMandate() helper even did exactly this
-- with token_<timestamp>; it is removed in the same change.)
--
-- A real mandate, when it is built, is created and modified server-side only,
-- by an edge function using the service_role key (which bypasses RLS) after
-- Razorpay confirms a genuine e-mandate -- never by the client. So the client
-- roles lose every write path here: the two write policies are dropped, a
-- SELECT-only tenant policy replaces the FOR ALL one (owners keep their
-- existing read), and the table-level INSERT/UPDATE/DELETE grants are revoked
-- from anon and authenticated as defense in depth. Reads are unchanged, so the
-- "AutoPay status" UI keeps working.
--
-- Backed by supabase/tests/rls_upi_mandates.sql.
-- ============================================================

-- The two client write policies.
DROP POLICY IF EXISTS "Tenants can insert own upi mandates" ON upi_mandates;
DROP POLICY IF EXISTS "Tenants can manage own mandates" ON upi_mandates;

-- Tenants keep read access to their own mandates (the FOR ALL policy used to
-- provide this via its USING clause). Owners keep their existing read policy
-- ("Owners can read tenant mandates"), untouched.
DROP POLICY IF EXISTS "Tenants can read own mandates" ON upi_mandates;
CREATE POLICY "Tenants can read own mandates" ON upi_mandates
  FOR SELECT TO authenticated
  USING (tenant_id = auth.uid());

-- Defense in depth: the client roles never legitimately write this table.
-- Creation / pause / resume / cancel must all go through a service_role edge
-- function that talks to Razorpay. service_role and postgres keep their grants.
REVOKE INSERT, UPDATE, DELETE ON public.upi_mandates FROM anon, authenticated;

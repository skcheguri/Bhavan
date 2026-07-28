-- Found while building an RLS regression test suite: rent_payments'
-- INSERT and UPDATE policies let a tenant or owner set `status` to
-- ANY value (including 'paid') via a direct API call, since neither
-- policy's WITH CHECK constrains it -- only owner_id/tenant_id are
-- checked. Every client code path only ever inserts 'pending' and
-- only ever updates to 'reconciled' (see useRentPayment.ts), but RLS
-- is the actual trust boundary in this app, not the UI -- a user
-- calling the Supabase REST API directly (no UI involved) could
-- self-insert a rent_payments row already marked 'paid' with an
-- arbitrary amount, completely bypassing the verify-rent-payment
-- edge function's Razorpay signature check. 'paid' is meant to be
-- settable ONLY by that edge function, which uses the service role
-- and is therefore unaffected by this policy (RLS doesn't apply to
-- service-role connections).
--
-- Fix: constrain the row states these policies allow. Insert must
-- start 'pending'; the owner's general update policy may only reach
-- 'reconciled' (the one legitimate use, cash/bank reconciliation).
-- Any transition to 'paid', 'failed', or 'refunded' must go through
-- the service-role edge function.

ALTER POLICY "Owners can insert own received rent payments" ON rent_payments
  WITH CHECK (owner_id = auth.uid() AND status = 'pending');

ALTER POLICY "Tenants can insert own rent payments" ON rent_payments
  WITH CHECK (tenant_id = auth.uid() AND status = 'pending');

ALTER POLICY "Owners can update own received payments" ON rent_payments
  WITH CHECK (owner_id = auth.uid() AND status = 'reconciled');

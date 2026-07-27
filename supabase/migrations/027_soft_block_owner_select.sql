-- ============================================================
-- The real remaining piece of the soft-block upsert puzzle: Postgres's
-- INSERT ... ON CONFLICT DO UPDATE (what supabase-js .upsert() compiles
-- to) must also read the potential conflict target row under RLS to
-- decide whether to insert or update -- confirmed empirically by
-- granting fully-permissive INSERT and UPDATE policies and still
-- hitting "violates row-level security policy", which only cleared
-- once a permissive SELECT policy was added too (then it correctly
-- surfaced as a plain FK violation on the deliberately-bogus test
-- tenant id, proving RLS was no longer the blocker).
--
-- Only "Tenant can read own soft block" and "Admins can read all soft
-- blocks" existed -- the reporting owner had no SELECT policy at all,
-- so their own upsert could never succeed regardless of INSERT/UPDATE
-- policy correctness. Scoped the same way as the INSERT/UPDATE
-- policies: an owner may see a soft-block row only for a tenant they
-- have actually reported.
-- ============================================================

CREATE POLICY "Reporting owner can read soft block" ON soft_block_states
FOR SELECT USING (EXISTS (SELECT 1 FROM broker_reports br WHERE br.tenant_id = soft_block_states.tenant_id AND br.owner_id = auth.uid()));

-- ============================================================
-- Fix contact_attempts: missing INSERT policy.
--
-- record-contact only had a SELECT policy (admins only). It was
-- flagged as a theoretical gap earlier and dismissed as harmless
-- because record-contact/check-contact-limit weren't deployed at all
-- at the time -- now that they are (see migration history / deploy
-- log), the gap is real: every call to record-contact fails with
-- "new row violates row-level security policy," silently breaking
-- the owner-contact rate limiting feature.
--
-- Unlike soft_block_states, this can't be scoped by auth.uid(): the
-- Edge Function creates its Supabase client with only the anon key
-- and never forwards the caller's JWT (userId comes from the request
-- body, unverified) -- auth.uid() would be null regardless of who's
-- really calling. The table's real security boundary is, and remains,
-- "only admins can read it" (unchanged); this just allows the
-- best-effort write every caller (anon or authenticated) needs to make.
-- ============================================================

CREATE POLICY "Anyone can record a contact attempt" ON contact_attempts
FOR INSERT WITH CHECK (true);

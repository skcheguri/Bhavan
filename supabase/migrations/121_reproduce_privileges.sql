-- ============================================================
-- The baseline (001) was generated without any GRANT/REVOKE statements,
-- so privilege state applied by historical migrations (now in
-- migrations_archive/, which db push never runs) exists in production
-- but would NOT be reproduced by standing a fresh project up from this
-- migration set. A fresh push would quietly reopen holes production
-- already closed.
--
-- This migration re-states, idempotently, every privilege decision that
-- currently lives only in the archive:
--
--   * 056: qr_analytics must not be directly writable -- all mutations
--     go through the increment_qr_counter RPC (clamped in 119). The two
--     legacy open policies it dropped are re-dropped here for fresh
--     installs, where the baseline doesn't create them anyway.
--
-- Everything decided from migration 064 onward already lives in this
-- directory (e.g. 115 service-role-only verification RPCs, 116
-- users_public grants, 117 rate-limit RPC lockdown) and reproduces on
-- its own. When a future migration changes privileges, keep it in this
-- directory rather than archiving it, so this file never needs a
-- sibling.
-- ============================================================

-- From 056: qr_analytics writes only via the RPC.
DROP POLICY IF EXISTS "Anyone can record a QR scan" ON qr_analytics;
DROP POLICY IF EXISTS "Anyone can update a QR scan count" ON qr_analytics;
REVOKE INSERT, UPDATE ON qr_analytics FROM anon, authenticated;

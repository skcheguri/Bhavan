-- ============================================================
-- UI audit High #1: receipt / agreement numbers were UNIQUE across the
-- whole table (001_baseline.sql:630-631), so only ~9000 four-digit values
-- existed per year for the ENTIRE platform. By the birthday bound a
-- collision was likely within a few hundred documents, and it surfaced to
-- the owner as a raw Postgres duplicate-key string on a legal/tax document
-- with no retry.
--
-- Scope uniqueness per owner instead: each owner gets their own number
-- space, so a collision now requires one owner to re-roll the same value
-- among their own documents (rare), and the client retries on that (23505)
-- with a fresh number. Existing rows are globally unique, so the composite
-- constraint holds without any data change.
-- ============================================================

ALTER TABLE rent_receipts DROP CONSTRAINT IF EXISTS rent_receipts_receipt_number_key;
ALTER TABLE rent_receipts DROP CONSTRAINT IF EXISTS rent_receipts_owner_receipt_number_key;
ALTER TABLE rent_receipts
  ADD CONSTRAINT rent_receipts_owner_receipt_number_key UNIQUE (owner_id, receipt_number);

ALTER TABLE rental_agreements DROP CONSTRAINT IF EXISTS rental_agreements_agreement_number_key;
ALTER TABLE rental_agreements DROP CONSTRAINT IF EXISTS rental_agreements_owner_agreement_number_key;
ALTER TABLE rental_agreements
  ADD CONSTRAINT rental_agreements_owner_agreement_number_key UNIQUE (owner_id, agreement_number);

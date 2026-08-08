-- Declare join_code as optional on insert, in the schema itself.
--
-- The column is NOT NULL with no DEFAULT, filled by a BEFORE INSERT
-- trigger. That works at runtime, but a trigger is invisible to the type
-- generator, so the generated Insert type marks join_code as required and
-- every client insert fails to compile -- which is what broke CI: nobody
-- can create a society without inventing a code, and inventing one is
-- exactly what callers must not do.
--
-- generate_join_code() already loops until it finds an unused code, so a
-- DEFAULT calling it is no weaker than the trigger was; the UNIQUE
-- constraint remains the backstop against a race between two inserts.
--
-- The trigger stays. A DEFAULT only applies when the column is omitted,
-- so it does nothing for a caller that explicitly sends null or an empty
-- string -- the trigger is what covers those.

ALTER TABLE communities
  ALTER COLUMN join_code SET DEFAULT generate_join_code();

COMMENT ON COLUMN communities.join_code IS
  'Generated server-side. Never send one from a client; omit the column and the default (or the trigger, for an explicit null) fills it.';

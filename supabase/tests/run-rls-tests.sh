#!/usr/bin/env bash
# Runs every RLS regression suite in this directory against the database in
# $DATABASE_URL and exits non-zero if any probe reports ok = false.
#
# Each suite wraps itself in BEGIN/ROLLBACK, so it leaves no data behind.
# Intended for CI against the STAGING project (never production), and usable
# locally:  DATABASE_URL="postgres://..." bash supabase/tests/run-rls-tests.sh
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL to the staging database connection string}"

dir="$(dirname "$0")"
fail=0
for f in "$dir"/rls_*.sql; do
  echo "=== $(basename "$f") ==="
  # -At: unaligned, tuples-only -> probe_results rows print as test|ok|detail.
  out="$(psql "$DATABASE_URL" -At -q -f "$f")"
  echo "$out"
  if echo "$out" | awk -F'|' 'NF>=2 && $2=="f"{print "  FAILED: "$1" -- "$3; found=1} END{exit found?0:1}'; then
    echo "::error::RLS regression failure in $(basename "$f")"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "One or more RLS regression probes failed."
  exit 1
fi
echo "All RLS regression suites passed."

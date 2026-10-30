# Test-data cleanup

`purge-test-data.mjs` finds leftover **test / dummy content that is showing up as if it were real** — listings titled "test", profiles whose display name is a raw email or `asdf`, gibberish chat messages and visit notes — and renames or hides it so the live site stops presenting it as real.

It exists to satisfy the project's hard rule: **production data is never purged automatically.** A human reviews the dry-run list, exports a backup, and confirms.

## Safety model

- **Dry run by default.** With no flags it only reads and prints. It cannot change anything.
- **You must name the project.** `--apply` is refused unless `--target-ref <ref>` matches the `<ref>` in `SUPABASE_URL`. This is the guard against mutating the wrong database (note: the project naming is inverted in this org — trust the ref, not the name).
- **Backup first.** Before any write, every affected row (full contents) is exported to `backups/purge-backup-<ref>-<timestamp>.json`. Nothing is touched until that file is on disk.
- **Non-destructive by default.** Even on `--apply`:
  - a bad **display name** (raw email / obvious test string) is reset to `Name not provided` — the row is kept;
  - a **test listing** is set to `status='inactive'` so it leaves the live site — never deleted.
- **Deletion is opt-in.** Flagged **chat messages / visits / connection requests** are only deleted with `--delete-flagged` (still backed up first).
- **Conservative matching.** Only high-confidence matches (raw-email names, explicit `test`/`dummy`/`asdf`/`lorem ipsum`-style tokens, test email domains) are eligible for action. Possible-gibberish / very short values are listed as **review-only** and are **never** changed automatically — a human decides.

## Usage

```bash
export SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key-for-that-project>"

# 1. Dry run — see what would change (no writes):
node scripts/data-cleanup/purge-test-data.mjs

# 2. Apply the safe fixes (rename bad names, hide test listings):
node scripts/data-cleanup/purge-test-data.mjs --apply --target-ref <ref> --confirm

# 3. Also delete flagged test chats / visits / requests (opt-in):
node scripts/data-cleanup/purge-test-data.mjs --apply --target-ref <ref> --confirm --delete-flagged
```

Options: `--out <dir>` (backup directory, default `backups/`), `--limit <n>` (max rows scanned per table, default 10000).

## Recommended procedure for production

1. Run the **dry run** and read the full list. Confirm the high-confidence matches really are test data and that nothing real is caught.
2. Run with `--apply --target-ref <prod-ref> --confirm`. Keep the printed `backups/…json` path.
3. Check the live site: test listings are gone, no raw-email names remain.
4. If a match was wrong, restore it from the backup JSON (it contains the full original rows).

## Restoring from a backup

The backup JSON holds the full original rows under `rows.<table>`. To undo a rename/hide, re-apply those rows' original `name` / `status` values by their `id` (a short `supabase db` update, or a follow-up script). Deleted content rows can be re-inserted from the same file.

## Tuning the heuristics

Edit `TEST_TOKENS`, `TEST_EMAIL_DOMAIN`, and `maybeGibberish` in `purge-test-data.mjs`. Keep them conservative: it is far better to leave a borderline row for manual review than to hide or rename a real one. New patterns should usually start life in the **low-confidence (review-only)** bucket.

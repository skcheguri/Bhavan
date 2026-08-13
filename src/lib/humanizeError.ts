// Turn a raw Postgres/PostgREST error message into something a user should
// see. Constraint names, "violates row-level security policy", and column
// identifiers are internal and confusing (and mildly leaky); trigger RAISE
// messages ("Only Aadhaar-verified owners can create listings") are already
// written for humans and pass through.
export function humanizeDbError(raw: string | null | undefined): string {
  const msg = (raw ?? '').toLowerCase();
  if (!msg) return 'Something went wrong. Please try again.';
  if (msg.includes('row-level security') || msg.includes('permission denied')) {
    return "You don't have permission to do that.";
  }
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
    return 'That already exists.';
  }
  if (msg.includes('foreign key')) {
    return 'That refers to something that no longer exists.';
  }
  if (msg.includes('null value') || msg.includes('not-null')) {
    return 'Some required information is missing.';
  }
  if (msg.includes('check constraint')) {
    return "Some of the details aren't valid.";
  }
  // A short, non-technical message is almost always a deliberate trigger
  // RAISE meant for the user -- keep it. Anything with schema identifiers or
  // that's long is treated as internal.
  if (raw && raw.length < 140 && !/(constraint|pg_|_id\b|relation |column |violates|syntax)/i.test(raw)) {
    return raw;
  }
  return 'Something went wrong. Please try again.';
}

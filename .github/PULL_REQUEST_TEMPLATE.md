## What changed

## Why

## Testing
- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Verified in the browser (for UI changes) or via a rolled-back SQL transaction (for migrations)

## Database changes
- [ ] No migration in this PR
- [ ] Migration included — tested in a rolled-back transaction against staging before merge, per `supabase/tests/` convention

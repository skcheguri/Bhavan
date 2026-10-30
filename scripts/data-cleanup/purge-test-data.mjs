#!/usr/bin/env node
/**
 * Bhavan test-data cleanup — DRY-RUN BY DEFAULT.
 *
 * Finds leftover test / dummy content that is showing up as if it were real
 * (listings with "test" titles, profiles whose display name is a raw email or
 * "asdf", gibberish chat messages and visit notes) and either renames or hides
 * it so the live site stops presenting it as real. It NEVER deletes or changes
 * anything unless you explicitly ask, and even then it writes a full backup of
 * every affected row first. This exists to satisfy the project's hard rule:
 * production data is never purged automatically -- a human reviews the dry-run
 * list, exports a backup, and confirms.
 *
 * Usage:
 *   # 1. Dry run (default): scan and print what WOULD change. No writes.
 *   node scripts/data-cleanup/purge-test-data.mjs
 *
 *   # 2. Apply the safe, non-destructive fixes (rename bad names, hide test
 *   #    listings). Requires naming the exact project you are mutating.
 *   node scripts/data-cleanup/purge-test-data.mjs --apply --target-ref <ref> --confirm
 *
 *   # 3. Also DELETE flagged test chat messages / visits / requests (opt-in).
 *   node scripts/data-cleanup/purge-test-data.mjs --apply --target-ref <ref> --confirm --delete-flagged
 *
 * Env (point at whichever project holds the test data -- may be production,
 * which is exactly why the --target-ref gate and backup exist):
 *   SUPABASE_URL                target project URL (https://<ref>.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY   service-role key for that project
 *
 * What it does on --apply (high-confidence matches only):
 *   - users:    a display name that is a raw email or an obvious test string
 *               is reset to 'Name not provided' (the app's own fallback).
 *   - listings: a listing whose title/description is obvious test content is
 *               set to status='inactive' so it leaves the live site. Never
 *               deleted -- the row and its history are kept.
 *   - chats / visits / connection requests with obvious test content are only
 *               DELETED when --delete-flagged is passed (backed up first).
 *
 * Low-confidence guesses (possible gibberish, very short names) are listed for
 * human review only and are NEVER changed automatically.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------- CLI ----------------
const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const apply = has('apply');
const confirm = has('confirm');
const deleteFlagged = has('delete-flagged');
const targetRefArg = opt('target-ref');
const outDir = opt('out') ?? 'backups';
const scanLimit = Number(opt('limit') ?? 10000);

// ---------------- Env / client ----------------
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the target project.');
  process.exit(2);
}
const projectRef = (() => {
  try { return new URL(url).hostname.split('.')[0]; } catch { return 'unknown'; }
})();

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

// ---------------- Heuristics ----------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Word-boundary test tokens. Deliberately conservative to avoid flagging real
// Indian names/places. "test"/"dummy"/"asdf"/"lorem ipsum" etc. are not words
// that occur in a genuine listing title or a real person's name.
const TEST_TOKENS = /\b(test|testing|tester|dummy|sample|placeholder|lorem ipsum|foobar|asdf\w*|qwerty\w*|zxcv\w*|do not use|ignore this|delete me|xxx+|aaaa+)\b/i;
const TEST_EMAIL_DOMAIN = /@(test|example|demo|invalid|mailinator|sample)\b|@demo\.bhavan\.invalid|\.(test|invalid)$/i;

const isRawEmailName = (name) => !!name && EMAIL_RE.test(String(name).trim());
const looksTest = (s) => !!s && TEST_TOKENS.test(String(s));
// Low-confidence only: a long run of consonants, or a 1-character name.
const maybeGibberish = (s) => {
  if (!s) return false;
  const t = String(s).trim();
  if (t.length === 1) return true;
  return /[bcdfghjklmnpqrstvwxyz]{6,}/i.test(t.replace(/\s/g, ''));
};

const NAME_FALLBACK = 'Name not provided';
const HIDE_STATUS = 'inactive';

// ---------------- Scan helper (paged) ----------------
async function scan(table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < scanLimit; from += pageSize) {
    const to = Math.min(from + pageSize, scanLimit) - 1;
    const { data, error } = await sb.from(table).select(columns).range(from, to);
    if (error) throw new Error(`scan ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

// ---------------- Findings ----------------
/** @type {{high: any[], low: any[]}} */
const findings = { high: [], low: [] };
const add = (tier, table, id, field, value, action) =>
  findings[tier].push({ table, id, field, value: value == null ? '' : String(value).slice(0, 80), action });

async function detect() {
  // users
  for (const u of await scan('users', 'id,name,email,role,deleted_at')) {
    if (u.deleted_at) continue;
    if (isRawEmailName(u.name)) add('high', 'users', u.id, 'name', u.name, 'rename');
    else if (looksTest(u.name)) add('high', 'users', u.id, 'name', u.name, 'rename');
    else if (maybeGibberish(u.name)) add('low', 'users', u.id, 'name', u.name, 'review');
    // A test-domain account is reported for review only -- deleting a user
    // cascades across the whole schema, so a human decides.
    if (isTestEmailDomain(u.email)) add('low', 'users', u.id, 'email', u.email, 'review (test account)');
  }
  // listings
  for (const l of await scan('listings', 'id,title,description,status,owner_id')) {
    if (looksTest(l.title) || looksTest(l.description)) {
      if (l.status !== HIDE_STATUS) add('high', 'listings', l.id, 'title', l.title, 'hide');
      else add('low', 'listings', l.id, 'title', l.title, 'already hidden');
    } else if (maybeGibberish(l.title)) {
      add('low', 'listings', l.id, 'title', l.title, 'review');
    }
  }
  // connection_requests (initial inquiry message)
  for (const c of await scan('connection_requests', 'id,message')) {
    if (looksTest(c.message)) add('high', 'connection_requests', c.id, 'message', c.message, 'delete');
  }
  // chat_messages
  for (const m of await scan('chat_messages', 'id,text,request_id')) {
    if (looksTest(m.text)) add('high', 'chat_messages', m.id, 'text', m.text, 'delete');
  }
  // property_visits
  for (const v of await scan('property_visits', 'id,note,visitor_name,visitor_email')) {
    if (looksTest(v.note) || looksTest(v.visitor_name) || isRawEmailName(v.visitor_name)) {
      add('high', 'property_visits', v.id, 'note', v.note ?? v.visitor_name, 'delete');
    }
  }
}

function isTestEmailDomain(email) {
  return !!email && TEST_EMAIL_DOMAIN.test(String(email));
}

// ---------------- Report ----------------
function report() {
  const group = (rows) => rows.reduce((m, r) => ((m[r.table] ??= []).push(r), m), {});
  const hi = group(findings.high);
  const lo = group(findings.low);

  console.log(`\nTarget project: ${projectRef}  (${url})`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN (no changes)'}${deleteFlagged ? ' + delete flagged content' : ''}\n`);

  console.log('High-confidence test data (eligible for cleanup):');
  if (findings.high.length === 0) console.log('  (none found)');
  for (const [table, rows] of Object.entries(hi)) {
    console.log(`\n  ${table} — ${rows.length}`);
    for (const r of rows) console.log(`    [${r.action}] ${r.id}  ${r.field}="${r.value}"`);
  }

  console.log('\nLow-confidence — REVIEW ONLY, never changed automatically:');
  if (findings.low.length === 0) console.log('  (none)');
  for (const [table, rows] of Object.entries(lo)) {
    console.log(`\n  ${table} — ${rows.length}`);
    for (const r of rows) console.log(`    [${r.action}] ${r.id}  ${r.field}="${r.value}"`);
  }
  console.log('');
}

// ---------------- Backup ----------------
async function backup(targets) {
  const dump = {};
  for (const [table, ids] of Object.entries(targets)) {
    if (ids.length === 0) continue;
    const { data, error } = await sb.from(table).select('*').in('id', ids);
    if (error) throw new Error(`backup ${table}: ${error.message}`);
    dump[table] = data;
  }
  mkdirSync(outDir, { recursive: true });
  const file = resolve(outDir, `purge-backup-${projectRef}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ project: projectRef, url, takenAt: new Date().toISOString(), rows: dump }, null, 2));
  return file;
}

// ---------------- Apply ----------------
async function chunk(ids, n = 100) { const out = []; for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n)); return out; }

async function applyChanges() {
  const renameIds = findings.high.filter((f) => f.table === 'users' && f.action === 'rename').map((f) => f.id);
  const hideIds = findings.high.filter((f) => f.table === 'listings' && f.action === 'hide').map((f) => f.id);
  const delByTable = { connection_requests: [], chat_messages: [], property_visits: [] };
  for (const f of findings.high) if (f.action === 'delete') delByTable[f.table].push(f.id);

  // Backup every row any action will touch, before touching anything.
  const backupFile = await backup({
    users: renameIds,
    listings: hideIds,
    ...(deleteFlagged ? delByTable : {}),
  });
  console.log(`Backup written: ${backupFile}\n`);

  let renamed = 0, hidden = 0, deleted = 0;
  for (const ids of await chunk(renameIds)) {
    if (ids.length === 0) continue;
    const { error } = await sb.from('users').update({ name: NAME_FALLBACK }).in('id', ids);
    if (error) throw new Error(`rename users: ${error.message}`);
    renamed += ids.length;
  }
  for (const ids of await chunk(hideIds)) {
    if (ids.length === 0) continue;
    const { error } = await sb.from('listings').update({ status: HIDE_STATUS }).in('id', ids);
    if (error) throw new Error(`hide listings: ${error.message}`);
    hidden += ids.length;
  }
  if (deleteFlagged) {
    for (const [table, ids] of Object.entries(delByTable)) {
      for (const batch of await chunk(ids)) {
        if (batch.length === 0) continue;
        const { error } = await sb.from(table).delete().in('id', batch);
        if (error) throw new Error(`delete ${table}: ${error.message}`);
        deleted += batch.length;
      }
    }
  }
  console.log(`Done: renamed ${renamed} name(s), hid ${hidden} listing(s), deleted ${deleted} content row(s).`);
  if (!deleteFlagged && findings.high.some((f) => f.action === 'delete')) {
    console.log('Flagged chat/visit/request rows were NOT deleted (pass --delete-flagged to remove them).');
  }
}

// ---------------- Main ----------------
await detect();
report();

if (!apply) {
  console.log('Dry run only. Re-run with --apply --target-ref <ref> --confirm to make changes.');
  process.exit(0);
}

// Apply guards.
if (targetRefArg !== projectRef) {
  console.error(`REFUSING: --target-ref "${targetRefArg ?? '(missing)'}" does not match the connected project "${projectRef}".`);
  console.error('Name the exact project you intend to change. This is the guard against mutating the wrong database.');
  process.exit(1);
}
if (!confirm) {
  console.error('REFUSING: --apply needs --confirm. Review the list above first.');
  process.exit(1);
}
if (findings.high.length === 0) {
  console.log('Nothing to apply.');
  process.exit(0);
}
await applyChanges();

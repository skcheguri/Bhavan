#!/usr/bin/env node
/**
 * Bhavan demo-data seed — STAGING ONLY.
 *
 * Validates an owner-supplied demo JSON (see template.json) against the real
 * schema rules, then imports it into a STAGING Supabase project using the
 * service-role key. It refuses to run against production, labels everything
 * DEMO, and never touches production data.
 *
 *   node scripts/demo-seed/seed.mjs --file demo.json --validate-only
 *   node scripts/demo-seed/seed.mjs --file demo.json --confirm        # writes to staging
 *
 * Import env (staging values only — NEVER production):
 *   STAGING_SUPABASE_URL          staging project URL
 *   STAGING_SERVICE_ROLE_KEY      staging service-role key
 *   DEMO_USER_PASSWORD            password set on every demo account (so you can log in)
 *   PROD_SUPABASE_URL  (optional) if set, the import aborts when STAGING_SUPABASE_URL matches it
 *
 * City/locality/society are data: pass any `--city` filter; nothing is hardcoded.
 */
import { readFileSync } from 'node:fs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DEMO_EMAIL_DOMAIN = 'demo.bhavan.invalid';

// ---- CLI args ----
const args = process.argv.slice(2);
const getFlag = (name) => args.includes(`--${name}`);
const getOpt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const filePath = getOpt('file');
const validateOnly = getFlag('validate-only');
const confirm = getFlag('confirm');
const cityFilter = getOpt('city');

if (!filePath) {
  console.error('Usage: node scripts/demo-seed/seed.mjs --file <demo.json> [--validate-only] [--city <name>] [--confirm]');
  process.exit(2);
}

// ---- Load ----
let data;
try {
  data = JSON.parse(readFileSync(filePath, 'utf8'));
} catch (e) {
  console.error(`Could not read/parse ${filePath}: ${e.message}`);
  process.exit(2);
}

// ================= VALIDATION =================
function validate(d) {
  const errors = [];
  const warnings = [];
  const E = (where, msg) => errors.push(`[${where}] ${msg}`);

  const owners = d.owners ?? [];
  const tenants = d.tenants ?? [];
  const listings = d.listings ?? [];
  const societies = d.societies ?? [];

  const userKeys = new Map(); // key -> 'owner'|'tenant'
  const emails = new Set();

  const checkPerson = (p, kind, idx) => {
    const where = `${kind}[${idx}] ${p.key ?? '?'}`;
    if (!p.key) E(where, 'missing "key"');
    else if (userKeys.has(p.key)) E(where, `duplicate key "${p.key}"`);
    else userKeys.set(p.key, kind);
    if (!p.name || !String(p.name).trim()) E(where, 'missing name');
    else if (EMAIL_RE.test(String(p.name).trim())) E(where, `name is an email address ("${p.name}") — use a real name, never an email`);
    if (!p.email || !EMAIL_RE.test(String(p.email))) E(where, `invalid or missing email ("${p.email ?? ''}")`);
    else if (emails.has(p.email)) E(where, `duplicate email "${p.email}"`);
    else emails.add(p.email);
  };
  owners.forEach((p, i) => checkPerson(p, 'owner', i));
  tenants.forEach((p, i) => checkPerson(p, 'tenant', i));

  listings.forEach((l, i) => {
    const where = `listing[${i}] "${l.title ?? '?'}"`;
    if (!l.title || !String(l.title).trim()) E(where, 'missing title');
    if (!l.ownerKey || userKeys.get(l.ownerKey) !== 'owner') E(where, `ownerKey "${l.ownerKey}" is not a declared owner`);
    if (!l.city || !String(l.city).trim()) E(where, 'missing city');
    if (!l.locality || !String(l.locality).trim()) E(where, 'missing locality');
    // Exactly one billing unit, and it must match the category.
    if (l.billingUnit !== '/mo' && l.billingUnit !== '/night') {
      E(where, `billingUnit must be "/mo" or "/night" (got "${l.billingUnit ?? ''}")`);
    } else {
      const cat = l.category ?? 'residential';
      const expected = cat === 'vacation' ? '/night' : '/mo';
      if (l.billingUnit !== expected) E(where, `billingUnit "${l.billingUnit}" contradicts category "${cat}" (expected "${expected}")`);
    }
    if (!(Number(l.rent) > 0)) E(where, `rent must be a positive number (got "${l.rent}")`);
    if (!Array.isArray(l.photos) || l.photos.filter((p) => String(p || '').trim()).length === 0) {
      E(where, 'at least one photo is required');
    }
    // 0-bed BHK mismatch: a residential/commercial listing can't have 0 bedrooms.
    const cat = l.category ?? 'residential';
    if (cat !== 'vacation' && !(Number(l.bedrooms) >= 1)) {
      E(where, `bedrooms must be >= 1 for a ${cat} listing (got "${l.bedrooms}")`);
    }
    if (l.status && !['active', 'inactive', 'draft'].includes(l.status)) E(where, `invalid status "${l.status}"`);
  });

  const societyKeys = new Set();
  societies.forEach((s, i) => {
    const where = `society[${i}] "${s.name ?? '?'}"`;
    if (!s.name || !String(s.name).trim()) E(where, 'missing name');
    if (!s.city || !String(s.city).trim()) E(where, 'missing city');
    const dupKey = `${String(s.name).trim().toLowerCase()}|${String(s.city).trim().toLowerCase()}`;
    if (societyKeys.has(dupKey)) E(where, `duplicate society (same name + city) "${s.name}" / "${s.city}"`);
    else societyKeys.add(dupKey);
    if (!s.adminKey || userKeys.get(s.adminKey) !== 'owner') E(where, `adminKey "${s.adminKey}" is not a declared owner`);
    (s.members ?? []).forEach((m, j) => {
      if (!userKeys.has(m.userKey)) E(`${where} member[${j}]`, `userKey "${m.userKey}" is not a declared owner/tenant`);
    });
    (s.collections ?? []).forEach((c, j) => {
      const cw = `${where} collection[${j}] "${c.title ?? '?'}"`;
      if (c.mode && !['per_flat', 'open'].includes(c.mode)) E(cw, `mode must be "per_flat" or "open"`);
      (c.contributions ?? []).forEach((ct, k) => {
        if (!userKeys.has(ct.userKey)) E(`${cw} contribution[${k}]`, `userKey "${ct.userKey}" not declared`);
        if (!(Number(ct.amountRupees) > 0)) E(`${cw} contribution[${k}]`, `amountRupees must be > 0`);
      });
    });
    (s.tickets ?? []).forEach((t, j) => {
      if (!userKeys.has(t.raisedByKey)) E(`${where} ticket[${j}]`, `raisedByKey "${t.raisedByKey}" not declared`);
    });
    (s.announcements ?? []).forEach((a, j) => {
      if (!userKeys.has(a.authorKey)) E(`${where} announcement[${j}]`, `authorKey "${a.authorKey}" not declared`);
    });
  });

  // Placeholder photos → warn (owner still owes real images).
  listings.forEach((l, i) => {
    (l.photos ?? []).forEach((p) => {
      if (String(p).includes('PLACEHOLDER')) warnings.push(`listing[${i}] "${l.title}" still has a PLACEHOLDER photo — waiting on owner sample data`);
    });
  });

  return { errors, warnings };
}

const { errors, warnings } = validate(data);

warnings.forEach((w) => console.warn('WARN  ' + w));
if (errors.length) {
  console.error(`\n✗ ${errors.length} validation error(s) — nothing will be imported:`);
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log(`✓ Validation passed (${(data.owners ?? []).length} owners, ${(data.tenants ?? []).length} tenants, ${(data.listings ?? []).length} listings, ${(data.societies ?? []).length} societies)` + (warnings.length ? `, ${warnings.length} warning(s)` : ''));

if (validateOnly) process.exit(0);
if (!confirm) {
  console.log('\nValidation only (no --confirm given). Re-run with --confirm to import into staging.');
  process.exit(0);
}

// ================= IMPORT (staging only) =================
const url = process.env.STAGING_SUPABASE_URL;
const serviceKey = process.env.STAGING_SERVICE_ROLE_KEY;
const demoPassword = process.env.DEMO_USER_PASSWORD;
const prodUrl = process.env.PROD_SUPABASE_URL;

if (!url || !serviceKey) {
  console.error('Import needs STAGING_SUPABASE_URL and STAGING_SERVICE_ROLE_KEY (staging values only).');
  process.exit(2);
}
if (!demoPassword) {
  console.error('Import needs DEMO_USER_PASSWORD (set on every demo account so you can sign in).');
  process.exit(2);
}
if (prodUrl && url.trim() === prodUrl.trim()) {
  console.error('REFUSING: STAGING_SUPABASE_URL matches PROD_SUPABASE_URL. Demo data must never touch production.');
  process.exit(2);
}

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

const randomJoinCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

async function ensureUser(person, role) {
  // Deterministic demo email domain keeps demo accounts identifiable/purgeable.
  const email = person.email;
  const { data: created, error } = await sb.auth.admin.createUser({
    email,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { name: person.name, role },
  });
  if (!error && created?.user) return created.user.id;
  // Already exists (re-run) → look up the public.users row by email.
  const { data: existing } = await sb.from('users').select('id').eq('email', email).maybeSingle();
  if (existing?.id) return existing.id;
  throw new Error(`could not create or find user ${email}: ${error?.message ?? 'unknown'}`);
}

const idByKey = new Map();
let counts = { owners: 0, tenants: 0, listings: 0, societies: 0, members: 0, announcements: 0, tickets: 0, collections: 0, contributions: 0 };

try {
  for (const o of data.owners ?? []) {
    const id = await ensureUser(o, 'owner');
    idByKey.set(o.key, id);
    counts.owners++;
    if (o.verified) {
      // Service role bypasses the privileged-column guard. Best-effort.
      const { error } = await sb.from('users').update({ verified_aadhaar: true }).eq('id', id);
      if (error) console.warn(`WARN  could not mark ${o.email} verified: ${error.message}`);
    }
  }
  for (const t of data.tenants ?? []) {
    idByKey.set(t.key, await ensureUser(t, 'tenant'));
    counts.tenants++;
  }

  for (const l of data.listings ?? []) {
    if (cityFilter && String(l.city).toLowerCase() !== cityFilter.toLowerCase()) continue;
    const { error } = await sb.from('listings').insert({
      owner_id: idByKey.get(l.ownerKey),
      title: l.title,
      description: `[DEMO] ${l.description ?? ''}`.trim(),
      price: Math.round(Number(l.rent)),
      deposit: Math.round(Number(l.deposit ?? 0)),
      maintenance_charge: Math.round(Number(l.maintenanceCharge ?? 0)),
      location: l.locality,
      city: l.city,
      state: l.state ?? null,
      bedrooms: l.bedrooms ?? null,
      bathrooms: l.bathrooms ?? null,
      area_sqft: l.areaSqft ?? null,
      furnished: !!l.furnished,
      property_type: l.propertyType ?? null,
      images: Array.isArray(l.photos) ? l.photos.filter((p) => String(p || '').trim()) : [],
      amenities: Array.isArray(l.amenities) ? l.amenities : [],
      parking: l.parking ?? 'none',
      category: l.category ?? 'residential',
      status: l.status ?? 'active',
    });
    if (error) throw new Error(`listing "${l.title}": ${error.message}`);
    counts.listings++;
  }

  for (const s of data.societies ?? []) {
    if (cityFilter && String(s.city).toLowerCase() !== cityFilter.toLowerCase()) continue;
    const adminId = idByKey.get(s.adminKey);
    // status 'active' → migration 149's seed_first_community_admin makes the
    // creator a community admin on INSERT.
    let communityId = null;
    for (let attempt = 0; attempt < 5 && !communityId; attempt++) {
      const { data: c, error } = await sb.from('communities').insert({
        name: s.name,
        kind: s.kind ?? 'apartment',
        address: s.address ?? s.city,
        city: s.city,
        state: s.state ?? null,
        join_code: randomJoinCode(),
        created_by: adminId,
        status: 'active',
      }).select('id').single();
      if (!error) { communityId = c.id; break; }
      if (error.code !== '23505') throw new Error(`society "${s.name}": ${error.message}`); // retry only on join_code collision
    }
    counts.societies++;

    for (const m of s.members ?? []) {
      const { error } = await sb.from('community_members').insert({
        community_id: communityId,
        user_id: idByKey.get(m.userKey),
        unit_numbers: m.unitNumbers ?? [],
        role: 'member',
        status: 'approved',
        approved_by: adminId,
        approved_at: new Date().toISOString(),
      });
      if (!error) counts.members++;
      else console.warn(`WARN  member ${m.userKey} in "${s.name}": ${error.message}`);
    }
    for (const a of s.announcements ?? []) {
      const { error } = await sb.from('community_announcements').insert({
        community_id: communityId, author_id: idByKey.get(a.authorKey),
        title: a.title, body: a.body, pinned: !!a.pinned,
      });
      if (!error) counts.announcements++;
    }
    for (const t of s.tickets ?? []) {
      const { error } = await sb.from('community_tickets').insert({
        community_id: communityId, raised_by: idByKey.get(t.raisedByKey),
        category: t.category ?? 'other', title: t.title, description: t.description,
        location: t.location ?? null, priority: t.priority ?? 'medium', status: t.status ?? 'open',
      });
      if (!error) counts.tickets++;
    }
    for (const c of s.collections ?? []) {
      const { data: col, error } = await sb.from('community_collections').insert({
        community_id: communityId, created_by: idByKey.get(c.createdByKey ?? s.adminKey),
        title: c.title, purpose: c.purpose, mode: c.mode ?? 'per_flat',
        per_flat_rupees: c.perFlatRupees ?? null, target_rupees: c.targetRupees ?? null,
        upi_id: c.upiId ?? null, payee_name: c.payeeName ?? null, status: 'open',
      }).select('id').single();
      if (error) { console.warn(`WARN  collection "${c.title}": ${error.message}`); continue; }
      counts.collections++;
      for (const ct of c.contributions ?? []) {
        const { error: ce } = await sb.from('community_contributions').insert({
          collection_id: col.id, user_id: idByKey.get(ct.userKey),
          amount_rupees: Math.round(Number(ct.amountRupees)), reference: ct.reference ?? null,
          note: ct.note ?? null, status: ct.status ?? 'claimed',
        });
        if (!ce) counts.contributions++;
        else console.warn(`WARN  contribution: ${ce.message}`);
      }
    }
  }

  console.log('\n✓ Demo import complete:', JSON.stringify(counts));
  console.log('Note: rental agreements + receipts are NOT seeded by this script yet — see README "Not yet seeded".');
} catch (e) {
  console.error(`\n✗ Import failed: ${e.message}`);
  console.error('Partial data may have been written — reset staging (STAGING.md) and re-run on a clean DB.');
  process.exit(1);
}

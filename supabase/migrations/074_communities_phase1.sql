-- Communities: phase 1.
--
-- Bhavan today models a 1:1 landlord/tenant relationship. A community is
-- N owners sharing one building, which is a different shape -- hence new
-- tables rather than bending `properties`, which is owner-scoped
-- (owner_id NOT NULL) and models "a property I own", not "a building we
-- share".
--
-- Nothing in the existing tenant/owner flow is touched. This is additive.
--
-- TWO DECISIONS ENCODED HERE
--
-- 1. Joining is by CODE, not address matching. "Green Meadows Ph 2" and
--    "Green Meadows Phase-II" are the same building and no matcher will
--    reliably agree; splitting one complex into two communities is much
--    worse than asking someone to type six characters.
--
-- 2. Creating a community requires Bhavan review. The obvious design --
--    first owner auto-becomes admin, admins approve everyone after -- means
--    whoever signs up first controls the building. A broker or ex-tenant
--    could seize a 200-flat complex and gate the real owners out. So a
--    community starts 'pending' and only a platform admin makes it active.
--
-- THE ROLE TRAP
--
-- users.role = 'admin' means PLATFORM admin: every user, listing, report
-- and error log, behind TOTP. A community admin is a fourth thing and
-- lives ONLY in community_members.role. Conflating them would hand a
-- building's admin the whole platform.

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'apartment' CHECK (kind IN ('apartment', 'villa')),
  address text NOT NULL,
  city text,
  state text,
  -- Short, unambiguous, shared verbally and over WhatsApp. Ambiguous
  -- glyphs (0/O, 1/I) are excluded by the generator below.
  join_code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'suspended')),
  -- Reuses the review pattern already used for property verification.
  proof_doc_url text,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- An array, not a single value: owning three flats in one complex is
  -- common, and one person should be one member with three units rather
  -- than three memberships whose roles can disagree.
  unit_numbers text[] NOT NULL DEFAULT '{}',
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'removed')),
  proof_doc_url text,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One identity per person per community.
  UNIQUE (community_id, user_id)
);

-- Paid at the building level, all-inclusive: verified members get the
-- community features at no extra cost. Deliberately NOT owner_subscriptions,
-- which is per-user -- a building's software should not stop working
-- because one owner let a personal plan lapse.
CREATE TABLE IF NOT EXISTS community_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL UNIQUE REFERENCES communities(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'standard')),
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'past_due', 'cancelled')),
  -- Who paid, for receipts and support. Authority to renew is the admin
  -- ROLE, not this column, so a committee changeover does not lock a
  -- building out of software it has already paid for.
  purchased_by uuid REFERENCES users(id) ON DELETE SET NULL,
  unit_count integer,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_members_community ON community_members (community_id, status);
CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members (user_id, status);
CREATE INDEX IF NOT EXISTS idx_communities_status ON communities (status);

-- ---------------------------------------------------------------------
-- Join codes
-- ---------------------------------------------------------------------

-- Excludes 0/O and 1/I/L: this code gets read aloud and typed by people
-- who did not choose it.
CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet CONSTANT text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM communities WHERE join_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_join_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.join_code IS NULL OR NEW.join_code = '' THEN
    NEW.join_code := generate_join_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_join_code ON communities;
CREATE TRIGGER trg_set_join_code
  BEFORE INSERT ON communities
  FOR EACH ROW EXECUTE FUNCTION set_join_code();

-- ---------------------------------------------------------------------
-- Membership helpers
--
-- SECURITY DEFINER on purpose. A policy on community_members that queries
-- community_members recurses infinitely; these read past RLS and break
-- the cycle. They are the only place that is allowed to.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_community_member(p_community uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = p_community AND user_id = auth.uid() AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_community_admin(p_community uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = p_community AND user_id = auth.uid()
      AND status = 'approved' AND role = 'admin'
  );
$$;

-- Whether the building has paid. Phase 1 ships no paid feature, but the
-- function exists now so phase 2 policies reference it from their first
-- line instead of being retrofitted -- which would mean rewriting every
-- policy after money is already changing hands.
CREATE OR REPLACE FUNCTION public.community_is_paid(p_community uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_subscriptions
    WHERE community_id = p_community
      AND status = 'active'
      AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_community_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_is_paid(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Owner verification gate
--
-- You must clear Bhavan's EXISTING verification before a join code will
-- do anything. The code proves you know which building; verification
-- proves you own a flat in it. Without this, a code shared in a WhatsApp
-- group is an open door -- and the whole point of an owners' group is
-- that everyone in it is an owner.
--
-- It reuses the admin-reviewed property queue: an owner uploads a sale
-- deed or tax receipt, a Bhavan admin approves it, properties.verified
-- becomes true (and already cascades to their listings).
--
-- DELIBERATELY NOT CHECKING verified_aadhaar YET. Identity verification
-- belongs in this test, but the Aadhaar edge function still returns
-- "provider is not configured" -- no KYC contract exists. Requiring it
-- today would block every owner from joining any community, with the
-- cause buried in an RLS denial. Add the clause here the day the provider
-- goes live; this function is the single place that has to change:
--
--   AND EXISTS (SELECT 1 FROM users WHERE id = p_user AND verified_aadhaar)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_verified_owner(p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = p_user AND role = 'owner')
     AND EXISTS (SELECT 1 FROM properties WHERE owner_id = p_user AND verified = true);
$$;

GRANT EXECUTE ON FUNCTION public.is_verified_owner(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Joining by code
--
-- An RPC rather than a permissive SELECT policy on communities. To join
-- you must be able to look a community up, but opening the table to
-- everyone would let anyone enumerate every building on the platform.
-- This returns the minimum needed to confirm "yes, that is my building"
-- and nothing else.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.find_community_by_code(p_code text)
RETURNS TABLE (id uuid, name text, kind text, city text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT c.id, c.name, c.kind, c.city
  FROM communities c
  WHERE upper(trim(p_code)) = c.join_code
    AND c.status = 'active'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_community_by_code(text) TO authenticated;

-- ---------------------------------------------------------------------
-- Anti-escalation
--
-- RLS grants or denies a whole row; it cannot say "you may edit these
-- columns but not those". Without this, a pending member could UPDATE
-- their own row to role='admin', status='approved' and take over the
-- building. Same class of hole as the connection_requests field-tampering
-- fix in migration 049, and the same remedy.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_community_member_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Platform admins and community admins may change role/status.
  IF is_admin() OR is_community_admin(NEW.community_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Only a community admin can change a member''s role';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only a community admin can change a member''s status';
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Approval fields are set by the approver, not the member';
  END IF;
  IF NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'A membership cannot be moved to another community or user';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_community_member ON community_members;
CREATE TRIGGER trg_guard_community_member
  BEFORE UPDATE ON community_members
  FOR EACH ROW EXECUTE FUNCTION guard_community_member_changes();

-- A join request must start powerless regardless of what the client sent.
CREATE OR REPLACE FUNCTION public.force_pending_membership()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF is_admin() OR is_community_admin(NEW.community_id) THEN
    RETURN NEW;
  END IF;
  NEW.role := 'member';
  NEW.status := 'pending';
  NEW.approved_by := NULL;
  NEW.approved_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_pending_membership ON community_members;
CREATE TRIGGER trg_force_pending_membership
  BEFORE INSERT ON community_members
  FOR EACH ROW EXECUTE FUNCTION force_pending_membership();

-- A community must never be left with nobody who can administer it.
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin' AND OLD.status = 'approved'
     AND (NEW.role <> 'admin' OR NEW.status <> 'approved') THEN
    IF NOT EXISTS (
      SELECT 1 FROM community_members
      WHERE community_id = OLD.community_id AND id <> OLD.id
        AND role = 'admin' AND status = 'approved'
    ) THEN
      RAISE EXCEPTION 'This is the only admin. Appoint another admin first.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_admin_removal ON community_members;
CREATE TRIGGER trg_prevent_last_admin_removal
  BEFORE UPDATE ON community_members
  FOR EACH ROW EXECUTE FUNCTION prevent_last_admin_removal();

-- The creator becomes the first admin, but only once Bhavan makes the
-- community active. Before that there is nothing to administer.
CREATE OR REPLACE FUNCTION public.seed_first_community_admin()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status <> 'active' THEN
    INSERT INTO community_members (community_id, user_id, role, status, approved_by, approved_at)
    VALUES (NEW.id, NEW.created_by, 'admin', 'approved', NEW.reviewed_by, now())
    ON CONFLICT (community_id, user_id) DO UPDATE
      SET role = 'admin', status = 'approved', approved_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_first_community_admin ON communities;
CREATE TRIGGER trg_seed_first_community_admin
  AFTER UPDATE ON communities
  FOR EACH ROW EXECUTE FUNCTION seed_first_community_admin();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_subscriptions ENABLE ROW LEVEL SECURITY;

-- communities: members see theirs; a creator sees their own while it is
-- still pending review; platform admins see all. Nobody browses the list.
DROP POLICY IF EXISTS "Members read their community" ON communities;
CREATE POLICY "Members read their community" ON communities
  FOR SELECT TO authenticated
  USING (is_community_member(id) OR created_by = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Owners can propose a community" ON communities;
CREATE POLICY "Owners can propose a community" ON communities
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    -- Same bar as joining: prove you own a flat before you can claim a
    -- building exists and put yourself at the head of it.
    AND is_verified_owner(auth.uid())
    -- Proposals only. Activation is the platform admin's to grant.
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Community admins update their community" ON communities;
CREATE POLICY "Community admins update their community" ON communities
  FOR UPDATE TO authenticated
  USING (is_community_admin(id) OR is_admin())
  WITH CHECK (is_community_admin(id) OR is_admin());

-- community_members
DROP POLICY IF EXISTS "Members read the directory" ON community_members;
CREATE POLICY "Members read the directory" ON community_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_community_member(community_id) OR is_admin());

DROP POLICY IF EXISTS "Verified owners can request to join" ON community_members;
CREATE POLICY "Verified owners can request to join" ON community_members
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Requesting for yourself requires clearing Bhavan verification first.
    (user_id = auth.uid() AND is_verified_owner(auth.uid()))
    -- A community admin adding someone, or a platform admin, is already a
    -- reviewed action by a trusted party.
    OR is_community_admin(community_id)
    OR is_admin()
  );

DROP POLICY IF EXISTS "Members edit own details, admins edit anyone" ON community_members;
CREATE POLICY "Members edit own details, admins edit anyone" ON community_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_community_admin(community_id) OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_community_admin(community_id) OR is_admin());

-- community_subscriptions: readable by members so the UI can say what the
-- building is on. Writes are server-side only -- no policy grants INSERT
-- or UPDATE, so only the service role (a verified Razorpay callback) can
-- mark a building paid. A client cannot grant itself a subscription.
DROP POLICY IF EXISTS "Members read the community plan" ON community_subscriptions;
CREATE POLICY "Members read the community plan" ON community_subscriptions
  FOR SELECT TO authenticated
  USING (is_community_member(community_id) OR is_admin());

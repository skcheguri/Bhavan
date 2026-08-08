-- Fund collections for a society: festival funds, painting, a new pump.
--
-- READ THIS BEFORE CHANGING ANYTHING HERE.
--
-- Bhavan never touches this money. An admin publishes the SOCIETY's own
-- UPI id, owners pay it directly from their own UPI app, and this schema
-- records who says they paid and what the admin confirmed. There is no
-- Razorpay order, no settlement, no Bhavan account in the path.
--
-- That is a deliberate legal boundary, not an unfinished feature. Taking
-- the money into a Bhavan account and forwarding it to the society would
-- make Bhavan a payment aggregator under the RBI framework, which
-- requires authorisation. If in-app payment is wanted later, the route is
-- Razorpay Route with the society onboarded as a linked account so a
-- licensed aggregator settles directly to the society's bank -- NOT
-- collecting into the platform's own account.
--
-- What this actually solves is the question no WhatsApp group can answer:
-- who has paid and who has not. That is the whole product.
--
-- Amounts are whole RUPEES, not paise. These are figures an admin types
-- ("5000 per flat for Diwali") and owners read back, never anything
-- charged through a payment API. billing_history uses paise because
-- Razorpay demands paise; nothing here goes near Razorpay.

CREATE TABLE IF NOT EXISTS community_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  purpose text NOT NULL,
  target_rupees integer CHECK (target_rupees IS NULL OR target_rupees > 0),
  -- per_flat: everyone owes the same figure. open: give what you like.
  mode text NOT NULL DEFAULT 'per_flat' CHECK (mode IN ('per_flat', 'open')),
  per_flat_rupees integer CHECK (per_flat_rupees IS NULL OR per_flat_rupees > 0),
  -- Where the money actually goes. The society's, never an individual's.
  upi_id text,
  payee_name text,
  deadline date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_community
  ON community_collections (community_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS community_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES community_collections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_rupees integer NOT NULL CHECK (amount_rupees > 0),
  -- The UPI reference the owner read off their payment app. It is what
  -- lets a treasurer match this row to a line on the bank statement.
  reference text,
  note text,
  -- claimed: the owner says they paid. confirmed: an admin found it in the
  -- account. The distinction is the entire point -- a claim is not money.
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'confirmed', 'rejected')),
  confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One row per owner per collection. An owner paying in two instalments
  -- edits the amount rather than creating a second row, which keeps
  -- "who has paid" answerable with a single lookup.
  UNIQUE (collection_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_contributions_collection
  ON community_contributions (collection_id, status);

-- Which society a collection belongs to. Same reasoning as
-- ticket_community() in 084: a definer lookup rather than a subquery that
-- drags another table's RLS into every policy check here.
CREATE OR REPLACE FUNCTION public.collection_community(p_collection uuid)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT community_id FROM community_collections WHERE id = p_collection;
$$;

GRANT EXECUTE ON FUNCTION public.collection_community(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- The guard that matters
--
-- Without this, an owner could post their own contribution as already
-- confirmed and appear in the paid column having transferred nothing. RLS
-- grants rows and not columns, so the rule has to be a trigger. Same
-- shape as force_pending_membership in 074/076.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.force_claimed_contribution()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR is_admin()
     OR is_community_admin(collection_community(NEW.collection_id)) THEN
    RETURN NEW;
  END IF;

  NEW.status := 'claimed';
  NEW.confirmed_by := NULL;
  NEW.confirmed_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_claimed_contribution ON community_contributions;
CREATE TRIGGER trg_force_claimed_contribution
  BEFORE INSERT ON community_contributions
  FOR EACH ROW EXECUTE FUNCTION force_claimed_contribution();

CREATE OR REPLACE FUNCTION public.guard_contribution_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR is_admin()
     OR is_community_admin(collection_community(NEW.collection_id)) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only a society admin can confirm a payment';
  END IF;
  IF NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
     OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN
    RAISE EXCEPTION 'Confirmation is recorded by the admin who checked it';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.collection_id IS DISTINCT FROM OLD.collection_id THEN
    RAISE EXCEPTION 'A contribution cannot be moved to another owner or collection';
  END IF;

  -- Editing the amount after an admin has confirmed it would silently
  -- change a figure someone already reconciled against a bank statement.
  IF OLD.status = 'confirmed' AND NEW.amount_rupees IS DISTINCT FROM OLD.amount_rupees THEN
    RAISE EXCEPTION 'This payment has been confirmed. Ask your admin to change it.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_contribution_changes ON community_contributions;
CREATE TRIGGER trg_guard_contribution_changes
  BEFORE UPDATE ON community_contributions
  FOR EACH ROW EXECUTE FUNCTION guard_contribution_changes();

CREATE OR REPLACE FUNCTION public.stamp_contribution_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    NEW.confirmed_at := now();
  ELSIF NEW.status <> 'confirmed' THEN
    NEW.confirmed_at := NULL;
    NEW.confirmed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_contribution_confirmation ON community_contributions;
CREATE TRIGGER trg_stamp_contribution_confirmation
  BEFORE UPDATE ON community_contributions
  FOR EACH ROW EXECUTE FUNCTION stamp_contribution_confirmation();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

ALTER TABLE community_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read collections" ON community_collections;
CREATE POLICY "Members read collections" ON community_collections
  FOR SELECT TO authenticated
  USING (is_community_member(community_id) OR is_admin());

-- Starting a collection is a paid action, like raising an issue.
DROP POLICY IF EXISTS "Paid admins start collections" ON community_collections;
CREATE POLICY "Paid admins start collections" ON community_collections
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND is_community_admin(community_id)
    AND community_is_paid(community_id)
  );

DROP POLICY IF EXISTS "Admins manage collections" ON community_collections;
CREATE POLICY "Admins manage collections" ON community_collections
  FOR UPDATE TO authenticated
  USING (is_community_admin(community_id) OR is_admin())
  WITH CHECK (is_community_admin(community_id) OR is_admin());

DROP POLICY IF EXISTS "Admins delete collections" ON community_collections;
CREATE POLICY "Admins delete collections" ON community_collections
  FOR DELETE TO authenticated
  USING (is_community_admin(community_id) OR is_admin());

-- Every member sees every contribution in their own society. That is not
-- an oversight about privacy -- it is the feature. A collection where only
-- the treasurer knows who has paid is the WhatsApp spreadsheet again.
DROP POLICY IF EXISTS "Members read contributions" ON community_contributions;
CREATE POLICY "Members read contributions" ON community_contributions
  FOR SELECT TO authenticated
  USING (is_community_member(collection_community(collection_id)) OR is_admin());

DROP POLICY IF EXISTS "Members record their own payment" ON community_contributions;
CREATE POLICY "Members record their own payment" ON community_contributions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_community_member(collection_community(collection_id))
  );

DROP POLICY IF EXISTS "Owner edits own, admin confirms" ON community_contributions;
CREATE POLICY "Owner edits own, admin confirms" ON community_contributions
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR is_community_admin(collection_community(collection_id))
    OR is_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_community_admin(collection_community(collection_id))
    OR is_admin()
  );

DROP POLICY IF EXISTS "Owner or admin removes a contribution" ON community_contributions;
CREATE POLICY "Owner or admin removes a contribution" ON community_contributions
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR is_community_admin(collection_community(collection_id))
    OR is_admin()
  );

-- ---------------------------------------------------------------------
-- Notifications. Wrapped, per 080.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_new_collection()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    SELECT m.user_id, 'platform', NEW.title,
           CASE
             WHEN NEW.mode = 'per_flat' AND NEW.per_flat_rupees IS NOT NULL
               THEN 'Rs ' || NEW.per_flat_rupees || ' per flat. ' || left(NEW.purpose, 100)
             ELSE left(NEW.purpose, 140)
           END,
           '/society'
    FROM community_members m
    WHERE m.community_id = NEW.community_id
      AND m.status = 'approved'
      AND m.user_id <> NEW.created_by;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'collection notification failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_collection ON community_collections;
CREATE TRIGGER trg_notify_new_collection
  AFTER INSERT ON community_collections
  FOR EACH ROW EXECUTE FUNCTION notify_new_collection();

CREATE OR REPLACE FUNCTION public.notify_contribution_decision()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('confirmed', 'rejected') THEN
    BEGIN
      SELECT title INTO v_title FROM community_collections WHERE id = NEW.collection_id;
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (
        NEW.user_id, 'payment',
        CASE WHEN NEW.status = 'confirmed' THEN 'Payment confirmed' ELSE 'Payment not found' END,
        CASE
          WHEN NEW.status = 'confirmed'
            THEN 'Your Rs ' || NEW.amount_rupees || ' for "' || coalesce(v_title, 'the collection') || '" has been confirmed.'
          ELSE 'Your admin could not find your payment for "' || coalesce(v_title, 'the collection') || '". Check the reference and try again.'
        END,
        '/society'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'contribution decision notification failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_contribution_decision ON community_contributions;
CREATE TRIGGER trg_notify_contribution_decision
  AFTER UPDATE ON community_contributions
  FOR EACH ROW EXECUTE FUNCTION notify_contribution_decision();

-- ---------------------------------------------------------------------
-- Who has paid, and who has not.
--
-- Returns one row per APPROVED MEMBER, not per contribution -- the
-- absence of a payment is the information a treasurer is chasing, and a
-- list of contributions cannot express it. This is the whole reason the
-- feature exists.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_collection_status(p_collection uuid)
RETURNS TABLE (
  user_id uuid,
  name text,
  units text[],
  contribution_id uuid,
  amount_rupees integer,
  reference text,
  note text,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_community uuid := collection_community(p_collection);
BEGIN
  IF v_community IS NULL THEN
    RAISE EXCEPTION 'No such collection';
  END IF;
  IF NOT (is_community_member(v_community) OR is_admin()) THEN
    RAISE EXCEPTION 'You are not a member of this society';
  END IF;

  RETURN QUERY
  SELECT m.user_id, u.name, m.unit_numbers,
         c.id, c.amount_rupees, c.reference, c.note,
         coalesce(c.status, 'none'), c.created_at
  FROM community_members m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN community_contributions c
    ON c.collection_id = p_collection AND c.user_id = m.user_id
  WHERE m.community_id = v_community
    AND m.status = 'approved'
  ORDER BY
    CASE coalesce(c.status, 'none')
      WHEN 'claimed' THEN 0    -- needs an admin to look at it
      WHEN 'none' THEN 1       -- has not paid
      WHEN 'rejected' THEN 2
      ELSE 3                   -- confirmed, done
    END,
    u.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_collection_status(uuid) TO authenticated;

-- Narrow the DELETE added in 086: an admin removes a member, a member
-- cannot remove themselves.
--
-- 086 let a member leave on their own. That was wrong for one concrete
-- reason and one structural one.
--
-- Concrete: get_collection_status lists one row per APPROVED MEMBER, so
-- leaving takes you off the "who has not paid" list. An owner who owed
-- money for a collection could quietly drop out of the society and
-- disappear from the defaulter column -- turning the ledger, which is the
-- entire point of Funds, into something you can opt out of.
--
-- Structural: it does not match how a housing society works. Membership
-- follows ownership of the flat. Nobody resigns from their society while
-- owning a unit in it; they leave by selling, and the committee updates
-- the register. "An admin removes you" IS the real mechanism, not a
-- limitation of this app.
--
-- The two usual objections are already answered elsewhere:
--
--   Privacy / DPDP -- the exit is deleting the Bhavan account, which
--   exists and takes the membership with it. That is the right level for
--   an erasure right; a per-society opt-out is not.
--
--   An unresponsive society admin -- is_admin() stays in the policy, so a
--   Bhavan platform admin can remove someone when a society will not.
--
-- prevent_last_admin_delete() from 086 is unchanged and still applies.

DROP POLICY IF EXISTS "Leave, or be removed by an admin" ON community_members;

CREATE POLICY "Admins remove members" ON community_members
  FOR DELETE TO authenticated
  USING (is_community_admin(community_id) OR is_admin());

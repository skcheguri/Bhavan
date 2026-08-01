-- Admin MFA was only a render gate: RequireAdmin.tsx decided whether the
-- React admin UI mounted, but is_admin() -- which backs ~55 RLS policies
-- and every admin RPC -- checked nothing but `role = 'admin'`. An admin
-- whose password leaked could skip the browser entirely and use the
-- PostgREST API with an aal1 token for full admin read/write. The MFA
-- feature did not defend the thing it was built to defend.
--
-- Supabase puts the session's assurance level in the JWT `aal` claim and
-- raises it to aal2 only after a TOTP challenge is verified, so the check
-- belongs here, at the layer that actually enforces access.
--
-- The AAL requirement applies only when asking "is the CURRENT caller an
-- admin" (uid = auth.uid(), which is how all 55 call sites use it). A
-- lookup about some other user stays a pure role check, since that
-- question has nothing to do with the caller's session.
--
-- NOTE: service_role (edge functions) bypasses RLS entirely and never
-- consults this, so background jobs and admin edge functions are
-- unaffected.
CREATE OR REPLACE FUNCTION is_admin(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = uid AND role = 'admin')
     AND (
       uid IS DISTINCT FROM auth.uid()
       OR COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     );
$$;

-- Lets the admin UI explain "you have admin rights but this session
-- hasn't passed MFA" instead of rendering an empty panel: this is the
-- role check WITHOUT the assurance-level requirement.
CREATE OR REPLACE FUNCTION has_admin_role(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = uid AND role = 'admin');
$$;

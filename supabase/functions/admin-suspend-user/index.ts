import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 10 years -- Supabase's ban_duration has no "forever" literal, this is
// the conventional stand-in. Passing "none" lifts a ban immediately.
const SUSPEND_DURATION = "87600h";

interface SuspendRequest {
  targetUserId?: string;
  suspend?: boolean;
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    // Identify the caller via their own JWT first -- only once we know
    // who they are do we reach for the service role for the actual
    // privileged operation (Auth Admin API calls always need it,
    // regardless of RLS, since they aren't a database operation).
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData?.user) return json({ error: "Not authenticated" }, 401);

    const { data: profileRows } = await callerClient.rpc("get_my_profile");
    const callerProfile = profileRows?.[0];
    if (!callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Admins only" }, 403);
    }

    const body: SuspendRequest = await req.json().catch(() => ({}));
    const { targetUserId, suspend, reason } = body;

    if (!targetUserId || typeof suspend !== "boolean") {
      return json({ error: "targetUserId and suspend are required" }, 400);
    }

    if (targetUserId === callerData.user.id) {
      return json({ error: "You cannot suspend your own account." }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Guard against suspending another admin through this tool -- that
    // should require a deliberate role change first, not a click here.
    const { data: targetProfile } = await serviceClient
      .from("users")
      .select("role")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetProfile?.role === "admin") {
      return json({ error: "Cannot suspend an admin account from here." }, 400);
    }

    const { error: banError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: suspend ? SUSPEND_DURATION : "none",
    });
    if (banError) return json({ error: banError.message }, 500);

    const { error: updateError } = await serviceClient
      .from("users")
      .update({
        suspended: suspend,
        suspended_reason: suspend ? (reason ?? null) : null,
        suspended_at: suspend ? new Date().toISOString() : null,
      })
      .eq("id", targetUserId);

    if (updateError) return json({ error: updateError.message }, 500);

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

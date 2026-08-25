import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Kept in lockstep with check-contact-limit: this function re-runs the
// same caps server-side before inserting, so a client that ignores the
// advisory `canSend` from check-contact-limit still can't exceed them.
const MAX_DAILY = 5;
const MAX_WEEKLY = 20;
// IP caps sit well above the per-user caps because Indian mobile networks
// put many users behind shared CGNAT addresses -- these exist to stop one
// actor rotating identities, not to bound a single legitimate user.
const MAX_IP_DAILY = 15;
const MAX_IP_WEEKLY = 50;

function isValidUUID(str: string | undefined): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
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
    // Identity comes from the caller's JWT, never from the request body --
    // the previous version recorded a body-supplied userId, letting an
    // attacker either dodge their own counters (random id per call) or
    // burn a victim's quota by recording attempts against their id.
    // Recording a contact is now authenticated-only: without a valid user
    // there is nothing to attribute the attempt to and no cap to enforce.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { deviceFingerprint, listingId } = body;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") || "unknown";

    // Service-role insert: contact_attempts is admin-read-only by design,
    // and writes should not depend on a permissive anon INSERT policy now
    // that this function is the only legitimate writer.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Enforce the caps SERVER-SIDE before inserting -- the same daily/IP
    // counts check-contact-limit computes -- so a client that ignores its
    // advisory `canSend` can't push a user (or a network) past the limit.
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const countSince = async (column: string, value: string, since: string): Promise<number> => {
      const { count } = await serviceClient
        .from("contact_attempts")
        .select("id", { count: "exact", head: true })
        .eq(column, value)
        .gte("created_at", since);
      return count ?? 0;
    };

    const dailyCount = await countSince("user_id", userId, dayAgo);
    const weeklyCount = await countSince("user_id", userId, weekAgo);
    const identityLimited = dailyCount >= MAX_DAILY || weeklyCount >= MAX_WEEKLY;

    // IP check applies on top of the identity check -- it's what makes
    // omitting or rotating the fingerprint pointless.
    let ipLimited = false;
    if (ip && ip !== "unknown") {
      const ipDaily = await countSince("ip_address", ip, dayAgo);
      const ipWeekly = await countSince("ip_address", ip, weekAgo);
      ipLimited = ipDaily >= MAX_IP_DAILY || ipWeekly >= MAX_IP_WEEKLY;
    }

    if (identityLimited || ipLimited) {
      const limitReason = dailyCount >= MAX_DAILY
        ? `You have reached the limit of ${MAX_DAILY} landlord contacts per day. Please try again tomorrow.`
        : weeklyCount >= MAX_WEEKLY
          ? `You have reached the limit of ${MAX_WEEKLY} landlord contacts per week. Please try again next week.`
          : `Too many contact requests from your network. Please try again later.`;
      return json({ error: limitReason }, 429);
    }

    const { error } = await serviceClient.from("contact_attempts").insert({
      user_id: userId,
      device_fingerprint: typeof deviceFingerprint === "string" && deviceFingerprint ? deviceFingerprint : "unknown",
      ip_address: ip,
      listing_id: isValidUUID(listingId) ? listingId : null,
    });

    if (error) throw error;

    return json({ success: true }, 200);
  } catch (err) {
    console.error("record-contact error:", (err as Error).message);
    return json({ error: "Something went wrong." }, 500);
  }
});

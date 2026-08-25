import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContactLimitRequest {
  deviceFingerprint?: string;
}

interface ContactLimitResponse {
  canSend: boolean;
  dailyCount: number;
  weeklyCount: number;
  dailyRemaining: number;
  weeklyRemaining: number;
  limitReason: string | null;
}

const MAX_DAILY = 5;
const MAX_WEEKLY = 20;
const MAX_DEVICE_DAILY = 3;
const MAX_DEVICE_WEEKLY = 10;
// IP caps sit well above the per-user caps because Indian mobile networks
// put many users behind shared CGNAT addresses -- these exist to stop one
// actor rotating identities, not to bound a single legitimate user.
const MAX_IP_DAILY = 15;
const MAX_IP_WEEKLY = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Identity comes from the caller's JWT, never from the request body --
    // the previous version trusted a body-supplied userId, which let anyone
    // dodge the limits (send a random id) or spoof another user's counts.
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const callerClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data } = await callerClient.auth.getUser();
      userId = data?.user?.id ?? null;
    }

    // Service-role client for counting: contact_attempts deliberately has
    // an admin-only SELECT policy, so counting through the anon client
    // (what this function used to do) silently returned 0 for everyone
    // and the server-side limit never actually bound.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: ContactLimitRequest = await req.json().catch(() => ({}));
    const deviceFingerprint = typeof body.deviceFingerprint === "string" ? body.deviceFingerprint : null;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") || null;

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

    let dailyCount = 0;
    let weeklyCount = 0;
    let maxDaily = MAX_DEVICE_DAILY;
    let maxWeekly = MAX_DEVICE_WEEKLY;

    if (userId) {
      dailyCount = await countSince("user_id", userId, dayAgo);
      weeklyCount = await countSince("user_id", userId, weekAgo);
      maxDaily = MAX_DAILY;
      maxWeekly = MAX_WEEKLY;
    } else if (deviceFingerprint) {
      dailyCount = await countSince("device_fingerprint", deviceFingerprint, dayAgo);
      weeklyCount = await countSince("device_fingerprint", deviceFingerprint, weekAgo);
    }

    // IP check applies to everyone, on top of the identity check -- it's
    // what makes omitting or rotating the fingerprint pointless.
    let ipLimited = false;
    if (ip) {
      const ipDaily = await countSince("ip_address", ip, dayAgo);
      const ipWeekly = await countSince("ip_address", ip, weekAgo);
      ipLimited = ipDaily >= MAX_IP_DAILY || ipWeekly >= MAX_IP_WEEKLY;
    }

    const identityLimited = dailyCount >= maxDaily || weeklyCount >= maxWeekly;
    const canSend = !identityLimited && !ipLimited;

    let limitReason: string | null = null;
    if (dailyCount >= maxDaily) {
      limitReason = userId
        ? `You have reached the limit of ${maxDaily} landlord contacts per day. Please try again tomorrow.`
        : `This device has reached the daily contact limit. Please try again tomorrow.`;
    } else if (weeklyCount >= maxWeekly) {
      limitReason = userId
        ? `You have reached the limit of ${maxWeekly} landlord contacts per week. Please try again next week.`
        : `This device has reached the weekly contact limit. Please try again next week.`;
    } else if (ipLimited) {
      limitReason = `Too many contact requests from your network. Please try again later.`;
    }

    const response: ContactLimitResponse = {
      canSend,
      dailyCount,
      weeklyCount,
      dailyRemaining: Math.max(0, maxDaily - dailyCount),
      weeklyRemaining: Math.max(0, maxWeekly - weeklyCount),
      limitReason,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("check-contact-limit error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Something went wrong." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

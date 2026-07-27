import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContactLimitRequest {
  userId?: string;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const body: ContactLimitRequest = await req.json().catch(() => ({}));
    const { userId, deviceFingerprint } = body;

    // Get client IP
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";

    // Calculate time windows
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let dailyCount = 0;
    let weeklyCount = 0;
    let deviceDailyCount = 0;
    let deviceWeeklyCount = 0;

    // Check user-based limits
    if (userId) {
      const { count: userDaily } = await supabase
        .from("contact_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", dayAgo.toISOString());

      const { count: userWeekly } = await supabase
        .from("contact_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", weekAgo.toISOString());

      dailyCount = userDaily ?? 0;
      weeklyCount = userWeekly ?? 0;
    }

    // Check device-based limits
    if (deviceFingerprint) {
      const { count: devDaily } = await supabase
        .from("contact_attempts")
        .select("id", { count: "exact", head: true })
        .eq("device_fingerprint", deviceFingerprint)
        .gte("created_at", dayAgo.toISOString());
      
      const { count: devWeekly } = await supabase
        .from("contact_attempts")
        .select("id", { count: "exact", head: true })
        .eq("device_fingerprint", deviceFingerprint)
        .gte("created_at", weekAgo.toISOString());

      deviceDailyCount = devDaily ?? 0;
      deviceWeeklyCount = devWeekly ?? 0;
    }

    // Determine effective limits
    const effectiveDaily = userId ? dailyCount : deviceDailyCount;
    const effectiveWeekly = userId ? weeklyCount : deviceWeeklyCount;
    const maxDaily = userId ? MAX_DAILY : MAX_DEVICE_DAILY;
    const maxWeekly = userId ? MAX_WEEKLY : MAX_DEVICE_WEEKLY;

    const canSend = effectiveDaily < maxDaily && effectiveWeekly < maxWeekly;

    let limitReason: string | null = null;
    if (effectiveDaily >= maxDaily) {
      limitReason = userId
        ? `You have reached the limit of ${maxDaily} landlord contacts per day. Please try again tomorrow.`
        : `This device has reached the daily contact limit. Please try again tomorrow.`;
    } else if (effectiveWeekly >= maxWeekly) {
      limitReason = userId
        ? `You have reached the limit of ${maxWeekly} landlord contacts per week. Please try again next week.`
        : `This device has reached the weekly contact limit. Please try again next week.`;
    }

    const response: ContactLimitResponse = {
      canSend,
      dailyCount: effectiveDaily,
      weeklyCount: effectiveWeekly,
      dailyRemaining: Math.max(0, maxDaily - effectiveDaily),
      weeklyRemaining: Math.max(0, maxWeekly - effectiveWeekly),
      limitReason,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

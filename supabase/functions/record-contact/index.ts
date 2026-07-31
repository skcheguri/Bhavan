import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isValidUUID(str: string | undefined): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Identity comes from the caller's JWT, never from the request body --
    // the previous version recorded a body-supplied userId, letting an
    // attacker either dodge their own counters (random id per call) or
    // burn a victim's quota by recording attempts against their id.
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

    const { error } = await serviceClient.from("contact_attempts").insert({
      user_id: userId,
      device_fingerprint: typeof deviceFingerprint === "string" && deviceFingerprint ? deviceFingerprint : "unknown",
      ip_address: ip,
      listing_id: isValidUUID(listingId) ? listingId : null,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
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

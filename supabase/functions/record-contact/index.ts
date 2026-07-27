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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const body = await req.json().catch(() => ({}));
    const { userId, deviceFingerprint, listingId } = body;

    // Get client IP
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";

    // No .select() here -- contact_attempts intentionally has no SELECT
    // policy for anon/authenticated (only admins can read it, since it
    // holds IP addresses and device fingerprints). PostgREST's
    // insert-with-return re-reads the row under the SELECT policy, so
    // chaining .select() after this insert would fail RLS even though
    // the insert itself is allowed. The caller doesn't need the row back.
    const { error } = await supabase.from("contact_attempts").insert({
      user_id: userId || null,
      device_fingerprint: deviceFingerprint || "unknown",
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

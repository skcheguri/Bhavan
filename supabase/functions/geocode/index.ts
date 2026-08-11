import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GeocodeRequest {
  query?: string;
}

interface GeocodeResponse {
  configured: boolean;
  latitude: number | null;
  longitude: number | null;
}

function json401(): Response {
  return new Response(JSON.stringify({ error: "Not authenticated" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 401,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

    // Not configured yet is a normal state (until the key is added), not an
    // error -- callers fall back to a free geocoder in this case.
    if (!apiKey) {
      const response: GeocodeResponse = { configured: false, latitude: null, longitude: null };
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Signed-in callers only. This proxies a metered, billed API key --
    // with no caller check, anyone on the internet could burn the Google
    // Maps quota through this endpoint. The app's own logged-out flows
    // (the listings location search) already fall back to Nominatim when
    // this function declines, so anon visitors lose nothing.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json401();
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) return json401();

    const body: GeocodeRequest = await req.json().catch(() => ({}));
    const query = (body.query ?? "").trim();
    if (!query) {
      const response: GeocodeResponse = { configured: true, latitude: null, longitude: null };
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("region", "in");
    url.searchParams.set("components", "country:IN");
    url.searchParams.set("key", apiKey);

    const geoRes = await fetch(url.toString());
    const geoData = await geoRes.json();

    const location = geoData?.results?.[0]?.geometry?.location;
    const response: GeocodeResponse = {
      configured: true,
      latitude: typeof location?.lat === "number" ? location.lat : null,
      longitude: typeof location?.lng === "number" ? location.lng : null,
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

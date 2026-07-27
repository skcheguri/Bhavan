// ============================================================
// Real Aadhaar e-KYC verification.
//
// UIDAI does not let arbitrary apps call its e-KYC servers directly --
// that access is restricted to licensed AUA/KUA entities. This function
// instead proxies to a licensed third-party KYC API provider (Surepass,
// Cashfree Verification Suite, Digio, HyperVerge, IDfy, etc.), which is
// the standard way consumer apps get real Aadhaar OTP verification.
//
// Runs server-side so the provider's secret API key never reaches the
// browser. Requires two secrets to be set on this Supabase project
// (`supabase secrets set NAME=value`):
//   AADHAAR_PROVIDER_BASE_URL   e.g. https://kyc-api.surepass.io
//   AADHAAR_PROVIDER_API_KEY    bearer token from your provider dashboard
//
// The exact request/response shape differs by vendor -- see the
// "PROVIDER ADAPTER" block below. It's written against Surepass's
// documented Aadhaar-v2 OTP endpoints as a working default; if you sign
// up with a different provider, that block is the only thing to edit.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROVIDER_BASE_URL = Deno.env.get("AADHAAR_PROVIDER_BASE_URL") ?? "";
const PROVIDER_API_KEY = Deno.env.get("AADHAAR_PROVIDER_API_KEY") ?? "";

const MAX_ATTEMPTS_PER_WINDOW = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const OTP_VALIDITY_MS = 10 * 60 * 1000;

// ---- Verhoeff checksum -- same algorithm as src/lib/validation.ts.
// Duplicated (not imported) because Edge Functions are standalone Deno
// deployments with no access to the Vite app's src/ tree.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function isValidAadhaar(aadhaarRaw: string): boolean {
  const digits = aadhaarRaw.replace(/\s/g, "");
  if (!/^[2-9]\d{11}$/.test(digits)) return false;
  let c = 0;
  const reversed = digits.split("").reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
}

// ============================================================
// === PROVIDER ADAPTER -- replace this block for your chosen KYC vendor ===
// ============================================================
interface ProviderOtpResult {
  referenceId: string;
}
interface ProviderVerifyResult {
  success: boolean;
  name?: string;
  dob?: string;
  gender?: string;
  message?: string;
}

async function providerSendOtp(aadhaarNumber: string): Promise<ProviderOtpResult> {
  const res = await fetch(`${PROVIDER_BASE_URL}/api/v1/aadhaar-v2/generate-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PROVIDER_API_KEY}`,
    },
    body: JSON.stringify({ id_number: aadhaarNumber }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.data?.client_id) {
    throw new Error(json?.message || "The verification provider could not send an OTP for this Aadhaar number.");
  }
  return { referenceId: String(json.data.client_id) };
}

async function providerVerifyOtp(referenceId: string, otp: string): Promise<ProviderVerifyResult> {
  const res = await fetch(`${PROVIDER_BASE_URL}/api/v1/aadhaar-v2/submit-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PROVIDER_API_KEY}`,
    },
    body: JSON.stringify({ client_id: referenceId, otp }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    return { success: false, message: json?.message || "Incorrect OTP. Please try again." };
  }
  const kyc = json?.data ?? {};
  return {
    success: true,
    name: kyc.full_name ?? kyc.name,
    dob: kyc.dob,
    gender: kyc.gender,
  };
}
// ============================================================
// === END PROVIDER ADAPTER ===
// ============================================================

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
    if (!PROVIDER_BASE_URL || !PROVIDER_API_KEY) {
      return json(
        { error: "Aadhaar verification provider is not configured yet. Set AADHAAR_PROVIDER_BASE_URL and AADHAAR_PROVIDER_API_KEY as Supabase secrets." },
        501
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    // Use the caller's own JWT (not the service role) so RLS naturally
    // scopes every query/write to their own row -- auth.uid() resolves
    // correctly because the request carries their access token.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "send-otp") {
      const aadhaarNumber = String(body?.aadhaarNumber ?? "").replace(/\s/g, "");
      if (!isValidAadhaar(aadhaarNumber)) {
        return json({ error: "That doesn't look like a valid Aadhaar number." }, 400);
      }

      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
      const { count } = await supabase
        .from("aadhaar_verification_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("requested_at", windowStart);

      if ((count ?? 0) >= MAX_ATTEMPTS_PER_WINDOW) {
        return json({ error: "Too many verification attempts. Please try again in 15 minutes." }, 429);
      }

      const { referenceId } = await providerSendOtp(aadhaarNumber);
      const last4 = aadhaarNumber.slice(8, 12);

      const { error: insertError } = await supabase.from("aadhaar_verification_attempts").insert({
        user_id: userId,
        provider_reference: referenceId,
        aadhaar_last4: last4,
        status: "otp_sent",
      });
      if (insertError) throw insertError;

      await supabase.from("users").update({ aadhaar_verification_status: "pending" }).eq("id", userId);

      return json({ referenceId, maskedAadhaar: `XXXX XXXX ${last4}` });
    }

    if (action === "verify-otp") {
      const referenceId = String(body?.referenceId ?? "");
      const otp = String(body?.otp ?? "");
      if (!referenceId || !/^\d{4,8}$/.test(otp)) {
        return json({ error: "Enter the OTP you received." }, 400);
      }

      const { data: attempt, error: attemptError } = await supabase
        .from("aadhaar_verification_attempts")
        .select("*")
        .eq("user_id", userId)
        .eq("provider_reference", referenceId)
        .eq("status", "otp_sent")
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (attemptError || !attempt) {
        return json({ error: "This verification request is no longer valid. Please request a new OTP." }, 400);
      }

      const requestedAt = new Date(attempt.requested_at).getTime();
      if (Date.now() - requestedAt > OTP_VALIDITY_MS) {
        await supabase.from("aadhaar_verification_attempts").update({ status: "expired" }).eq("id", attempt.id);
        return json({ error: "This OTP has expired. Please request a new one." }, 400);
      }

      const result = await providerVerifyOtp(referenceId, otp);

      if (!result.success) {
        await supabase
          .from("aadhaar_verification_attempts")
          .update({ status: "failed", failure_reason: result.message ?? "Verification failed" })
          .eq("id", attempt.id);
        return json({ error: result.message ?? "Incorrect OTP. Please try again." }, 400);
      }

      const now = new Date().toISOString();
      await supabase
        .from("aadhaar_verification_attempts")
        .update({ status: "verified", verified_at: now })
        .eq("id", attempt.id);

      await supabase
        .from("users")
        .update({
          verified_aadhaar: true,
          aadhaar_last4: attempt.aadhaar_last4,
          aadhaar_verification_status: "verified",
          aadhaar_verified_at: now,
        })
        .eq("id", userId);

      return json({ success: true, name: result.name, dob: result.dob, gender: result.gender });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

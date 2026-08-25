// ============================================================
// Aadhaar verification, two modes behind one function.
//
//   MODE 'otp' -- real UIDAI e-KYC: OTP to the Aadhaar-linked mobile via
//   a licensed KYC provider (Surepass-shaped adapter below). This is the
//   production-grade check (proves the person controls the cardholder's
//   phone) but requires a commercial provider contract; it is NOT
//   available on IDfy's self-serve test account.
//
//   MODE 'ocr' -- IDfy Aadhaar OCR: the user photographs their Aadhaar
//   card, IDfy extracts the fields server-side, and we cross-check the
//   Verhoeff checksum and the name against the profile before granting
//   the badge. Weaker than OTP by design (it proves possession of a
//   plausible card image, not identity) -- it exists so verification
//   works TODAY on test credentials, and as a documented fallback.
//
// The active mode is decided by configuration, never by the caller:
//   AADHAAR_MODE=otp|ocr  explicit override, else
//   otp  if AADHAAR_PROVIDER_BASE_URL + AADHAAR_PROVIDER_API_KEY are set
//   ocr  if IDFY_ACCOUNT_ID + IDFY_API_KEY are set
// The frontend asks via {action:'config'} and renders the matching UI,
// so switching modes later is a secrets change, not a deploy.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROVIDER_BASE_URL = Deno.env.get("AADHAAR_PROVIDER_BASE_URL") ?? "";
const PROVIDER_API_KEY = Deno.env.get("AADHAAR_PROVIDER_API_KEY") ?? "";

const IDFY_BASE_URL = Deno.env.get("IDFY_BASE_URL") ?? "https://eve.idfy.com";
const IDFY_ACCOUNT_ID = Deno.env.get("IDFY_ACCOUNT_ID") ?? "";
const IDFY_API_KEY = Deno.env.get("IDFY_API_KEY") ?? "";

// TEST-ONLY OTP BYPASS. Real UIDAI OTP e-KYC needs a licensed provider
// contract that IDfy's self-serve test account does not include, so the
// OTP *flow* can't be exercised end to end in staging. When -- and ONLY
// when -- AADHAAR_OTP_TEST_CODE is set, the OTP path runs without a
// provider and accepts exactly that code (e.g. "123456"). It is gated on
// the secret existing: production simply never sets it, so this branch
// is dead code there. If a real provider IS configured, the test code is
// ignored entirely -- the real provider always wins.
const OTP_TEST_CODE = Deno.env.get("AADHAAR_OTP_TEST_CODE") ?? "";
const realOtpConfigured = Boolean(PROVIDER_BASE_URL && PROVIDER_API_KEY);
const otpMockEnabled = OTP_TEST_CODE.length > 0 && !realOtpConfigured;

type AadhaarMode = "otp" | "ocr" | "unconfigured";

function resolveMode(): AadhaarMode {
  const explicit = Deno.env.get("AADHAAR_MODE");
  if (explicit === "otp" || explicit === "ocr") return explicit;
  if (realOtpConfigured) return "otp";
  if (otpMockEnabled) return "otp"; // test-only mock OTP flow
  if (IDFY_ACCOUNT_ID && IDFY_API_KEY) return "ocr";
  return "unconfigured";
}

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

// ============================================================
// === IDFY OCR ADAPTER (mode 'ocr') ===
// IDfy's v3 task API: POST a sync extraction task with the document as
// base64; the extracted fields come back under result.extraction_output.
// Field names occasionally differ across IDfy API versions, so reads
// below try the documented aliases -- if extraction succeeds in the
// IDfy dashboard but this reports "could not read", log the raw result
// and adjust the aliases here.
// ============================================================
interface OcrExtraction {
  idNumber: string | null; // may be masked, e.g. XXXXXXXX1234
  name: string | null;
  taskId: string;
}

async function idfyExtractAadhaar(
  frontUrl: string,
  backUrl: string | null
): Promise<{ ok: true; data: OcrExtraction } | { ok: false; error: string }> {
  const taskId = crypto.randomUUID();
  // document1 = front image URL (required; carries name + Aadhaar
  // number), document2 = back URL (optional; address only, unused).
  // IDfy fetches these URLs, so they must be reachable for the call's
  // lifetime -- we pass short-lived signed Storage URLs. Verified against
  // the ind_aadhaar response shape: result.extraction_output.{id_number,
  // name_on_card,...} returned as a single-element array.
  const res = await fetch(`${IDFY_BASE_URL}/v3/tasks/sync/extract/ind_aadhaar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": IDFY_API_KEY,
      "account-id": IDFY_ACCOUNT_ID,
    },
    body: JSON.stringify({
      task_id: taskId,
      group_id: crypto.randomUUID(),
      data: {
        document1: frontUrl,
        ...(backUrl ? { document2: backUrl } : {}),
        // Mandatory per IDfy's ind_aadhaar schema -- omitting it is what
        // returns "Malformed request". The user gives this consent on the
        // form before we ever reach here.
        consent: "yes",
      },
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.message || json?.error || `IDfy returned ${res.status}`;
    return { ok: false, error: `Document check failed: ${message}` };
  }

  const task = Array.isArray(json) ? json[0] : json;
  const output = task?.result?.extraction_output ?? task?.result ?? {};
  const idNumber = output.id_number ?? output.aadhaar_number ?? output.uid ?? null;
  const name = output.name_on_card ?? output.name ?? null;

  if (!idNumber && !name) {
    return { ok: false, error: "We couldn't read an Aadhaar card in that photo. Use a clear, well-lit photo of the front of the card." };
  }
  return { ok: true, data: { idNumber: idNumber ? String(idNumber) : null, name: name ? String(name) : null, taskId } };
}

// "SAI KRISHNA REDDY" should match a profile named "Sai Krishna Reddy"
// but not "Ravi Verma". Token-based: every profile-name token must
// appear on the card (initials expand poorly, so single-letter profile
// tokens match any card token starting with that letter).
function namesMatch(profileName: string, cardName: string): boolean {
  const tokens = (s: string) =>
    s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  const profile = tokens(profileName);
  const card = tokens(cardName);
  if (profile.length === 0 || card.length === 0) return false;
  return profile.every((p) =>
    card.some((c) => (p.length === 1 ? c.startsWith(p) : c === p))
  );
}
// ============================================================
// === END IDFY OCR ADAPTER ===
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
    const mode = resolveMode();

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

    // Service-role client for the two verification-status RPCs ONLY.
    // Migration 115 revoked them from `authenticated` -- they used to be
    // callable by any logged-in browser session, which meant anyone could
    // self-grant the "Aadhaar Verified" badge from the console. Every
    // other query here stays on the caller-scoped client above.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // The page asks which flow to render. Mode is configuration, so the
    // UI can never pick the weaker path on its own. otpTestMode lets the
    // OTP screen show a "use the test code" hint -- true only when the
    // mock is active, which is never the case in production.
    if (action === "config") {
      return json({ mode, otpTestMode: otpMockEnabled });
    }

    if (mode === "unconfigured") {
      return json(
        { error: "Aadhaar verification is not configured yet. Set AADHAAR_PROVIDER_* (OTP e-KYC) or IDFY_* (document OCR) as Supabase secrets." },
        501
      );
    }

    if ((action === "send-otp" || action === "verify-otp") && mode !== "otp") {
      return json({ error: "OTP verification is not enabled on this environment." }, 409);
    }
    if (action === "verify-document" && mode !== "ocr") {
      return json({ error: "Document verification is not enabled on this environment." }, 409);
    }

    if (action === "verify-document") {
      // The client uploads the photos to the private aadhaar-temp bucket
      // (under its own user folder) and passes the object paths. We sign
      // them, hand IDfy the URLs, and delete the objects before
      // returning -- the images are never retained.
      const frontPath = String(body?.frontPath ?? "");
      const backPath = String(body?.backPath ?? "");
      const ownsPath = (p: string) => p.startsWith(`${userId}/`);
      if (!frontPath || !ownsPath(frontPath)) {
        return json({ error: "Upload the front of your Aadhaar card and try again." }, 400);
      }
      if (backPath && !ownsPath(backPath)) {
        return json({ error: "That back image could not be read. Remove it and try again." }, 400);
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

      // Delete the uploaded images no matter what happens next.
      const cleanup = async () => {
        const paths = [frontPath, ...(backPath ? [backPath] : [])];
        try {
          await admin.storage.from("aadhaar-temp").remove(paths);
        } catch (_) {
          // A daily job / the bucket's transience covers stragglers.
        }
      };

      const signUrl = async (p: string): Promise<string | null> => {
        const { data } = await admin.storage.from("aadhaar-temp").createSignedUrl(p, 300);
        return data?.signedUrl ?? null;
      };

      const frontUrl = await signUrl(frontPath);
      const backUrl = backPath ? await signUrl(backPath) : null;
      if (!frontUrl) {
        await cleanup();
        return json({ error: "We couldn't process that upload. Please try again." }, 400);
      }

      const extraction = await idfyExtractAadhaar(frontUrl, backUrl);
      await cleanup();

      const recordAttempt = async (status: string, last4: string | null, failureReason: string | null, reference: string) => {
        await supabase.from("aadhaar_verification_attempts").insert({
          user_id: userId,
          provider_reference: reference,
          aadhaar_last4: last4,
          status,
          failure_reason: failureReason,
          ...(status === "verified" ? { verified_at: new Date().toISOString() } : {}),
        });
      };

      if (!extraction.ok) {
        await recordAttempt("failed", null, extraction.error, "ocr-no-task");
        return json({ error: extraction.error }, 400);
      }

      const { idNumber, name: cardName, taskId } = extraction.data;

      // The number may come back full or masked. A full number must pass
      // the Verhoeff checksum (catches OCR misreads and fakes with
      // invented numbers); a masked one must still end in 4 digits.
      const digits = (idNumber ?? "").replace(/[^0-9Xx*]/g, "");
      const tail = digits.replace(/[^0-9]/g, "").slice(-4);
      const fullNumber = /^[0-9]{12}$/.test(digits) ? digits : null;
      if (fullNumber && !isValidAadhaar(fullNumber)) {
        const message = "The Aadhaar number on the card failed validation. Retake the photo so all 12 digits are sharp.";
        await recordAttempt("failed", null, message, taskId);
        return json({ error: message }, 400);
      }
      if (tail.length !== 4) {
        const message = "We couldn't read the Aadhaar number clearly. Retake the photo so all digits are visible.";
        await recordAttempt("failed", null, message, taskId);
        return json({ error: message }, 400);
      }

      // The badge asserts "this account belongs to this cardholder" --
      // the weakest link in OCR mode, so at minimum the profile name
      // must be the name on the card. Read the name from public.users
      // (service role) rather than trusting body.name / user_metadata,
      // which the client controls and could set to match any card.
      const { data: profileRow } = await admin
        .from("users")
        .select("name")
        .eq("id", userId)
        .maybeSingle();
      const profileName = String(profileRow?.name ?? "").trim();
      if (!cardName || !profileName || !namesMatch(profileName, cardName)) {
        const message = cardName
          ? `The name on the card (${cardName}) doesn't match your profile name. Update your profile name to match your Aadhaar, then retry.`
          : "We couldn't read the name on the card. Retake the photo so the name is sharp.";
        await recordAttempt("failed", tail, message, taskId);
        return json({ error: message }, 400);
      }

      await recordAttempt("verified", tail, null, taskId);

      const { error: verifyError } = await admin.rpc("mark_aadhaar_verified", { p_user_id: userId, p_last4: tail });
      if (verifyError) throw verifyError;

      return json({ success: true, name: cardName, maskedAadhaar: `XXXX XXXX ${tail}` });
    }

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

      // Mock path (test only): no provider call, a synthetic reference.
      // verify-otp will accept OTP_TEST_CODE against this reference.
      const { referenceId } = realOtpConfigured
        ? await providerSendOtp(aadhaarNumber)
        : { referenceId: `mock-${crypto.randomUUID()}` };
      const last4 = aadhaarNumber.slice(8, 12);

      const { error: insertError } = await supabase.from("aadhaar_verification_attempts").insert({
        user_id: userId,
        provider_reference: referenceId,
        aadhaar_last4: last4,
        status: "otp_sent",
      });
      if (insertError) throw insertError;

      // A dedicated RPC, not a raw table update -- see migrations 042 and
      // 115. protect_privileged_user_columns() pins verification columns
      // back to their old value for non-admin callers, and since 115 the
      // RPC itself is service_role-only, so it must go through `admin`.
      const { error: statusError } = await admin.rpc("set_aadhaar_verification_status", { p_user_id: userId, p_status: "pending" });
      if (statusError) throw statusError;

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

      // Mock path (test only): the configured test code stands in for a
      // real provider verification. Never reachable in production, where
      // AADHAAR_OTP_TEST_CODE is unset (otpMockEnabled is false).
      const result: ProviderVerifyResult = realOtpConfigured
        ? await providerVerifyOtp(referenceId, otp)
        : otpMockEnabled
          ? (otp === OTP_TEST_CODE
              ? { success: true }
              : { success: false, message: "Incorrect test OTP." })
          : { success: false, message: "OTP verification is not configured." };

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

      const { error: verifyError } = await admin.rpc("mark_aadhaar_verified", { p_user_id: userId, p_last4: attempt.aadhaar_last4 });
      if (verifyError) throw verifyError;

      return json({ success: true, name: result.name, dob: result.dob, gender: result.gender });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("aadhaar-verify error:", (err as Error).message);
    return json({ error: "Something went wrong." }, 500);
  }
});

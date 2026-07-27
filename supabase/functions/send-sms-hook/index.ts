// ============================================================
// Supabase "Send SMS" Auth Hook -- delivers phone-signup/login OTPs
// through MSG91 instead of a built-in provider (Twilio/MessageBird/
// Vonage are the only ones Supabase supports natively; MSG91 isn't one
// of them). Supabase itself still generates and verifies the OTP --
// this function's only job is to hand the code to MSG91 for delivery.
//
// Wiring (see supabase/functions/send-sms-hook/README.md for the full
// walkthrough):
//   1. Deploy: supabase functions deploy send-sms-hook --no-verify-jwt
//   2. Supabase Dashboard -> Authentication -> Hooks -> "Send SMS hook"
//      -> point it at this function. Supabase generates a signing
//      secret (format "v1,whsec_...") when you enable it.
//   3. supabase secrets set \
//        MSG91_AUTH_KEY=xxx \
//        MSG91_SENDER_ID=xxx \
//        MSG91_TEMPLATE_ID=xxx \
//        MSG91_OTP_VAR_NAME=OTP \
//        SEND_SMS_HOOK_SECRET="v1,whsec_..."
//
// MSG91_OTP_VAR_NAME must match the variable name your MSG91 DLT
// template uses for the OTP placeholder (check the template's detail
// page in the MSG91 dashboard -- commonly "OTP" or "var1").
// ============================================================

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const MSG91_AUTH_KEY = Deno.env.get("MSG91_AUTH_KEY") ?? "";
const MSG91_SENDER_ID = Deno.env.get("MSG91_SENDER_ID") ?? "";
const MSG91_TEMPLATE_ID = Deno.env.get("MSG91_TEMPLATE_ID") ?? "";
const MSG91_OTP_VAR_NAME = Deno.env.get("MSG91_OTP_VAR_NAME") ?? "OTP";
const HOOK_SECRET = Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "";

interface SendSmsHookPayload {
  user: { phone?: string };
  sms: { otp: string };
}

function errorResponse(message: string, httpCode = 500) {
  return new Response(
    JSON.stringify({ error: { http_code: httpCode, message } }),
    { status: httpCode, headers: { "Content-Type": "application/json" } }
  );
}

async function sendViaMsg91(phone: string, otp: string): Promise<void> {
  const mobile = phone.replace(/^\+/, "").replace(/\s/g, "");

  const res = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: MSG91_AUTH_KEY,
    },
    body: JSON.stringify({
      template_id: MSG91_TEMPLATE_ID,
      short_url: "0",
      sender: MSG91_SENDER_ID,
      recipients: [
        {
          mobiles: mobile,
          [MSG91_OTP_VAR_NAME]: otp,
        },
      ],
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.type === "error") {
    throw new Error(json?.message || "MSG91 could not send the OTP SMS.");
  }
}

Deno.serve(async (req) => {
  if (!MSG91_AUTH_KEY || !MSG91_TEMPLATE_ID) {
    return errorResponse(
      "MSG91 is not configured yet. Set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID as Supabase secrets.",
      501
    );
  }
  if (!HOOK_SECRET) {
    return errorResponse("SEND_SMS_HOOK_SECRET is not configured.", 501);
  }

  const rawBody = await req.text();

  try {
    // Supabase's dashboard shows the secret as "v1,whsec_..." but the
    // standardwebhooks library only understands the "whsec_..." part --
    // the "v1," is Supabase's own version prefix, not part of the key.
    const wh = new Webhook(HOOK_SECRET.replace(/^v1,/, ""));
    const verified = wh.verify(rawBody, {
      "webhook-id": req.headers.get("webhook-id") ?? "",
      "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": req.headers.get("webhook-signature") ?? "",
    }) as SendSmsHookPayload;

    const phone = verified.user?.phone;
    const otp = verified.sms?.otp;
    if (!phone || !otp) {
      return errorResponse("Malformed Send SMS hook payload.", 400);
    }

    await sendViaMsg91(phone, otp);

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Signature verification failures and MSG91 delivery failures both
    // land here -- both should surface as a hook error, not a 200.
    return errorResponse((err as Error).message, 500);
  }
});

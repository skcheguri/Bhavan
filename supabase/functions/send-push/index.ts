// Sends a real Firebase Cloud Messaging push for a notifications row.
//
// Invoked two ways:
//   1. The trg_dispatch_push DB trigger (migration 065) POSTs
//      { notificationId } with an x-push-trigger-secret header, right
//      after any notification row is inserted.
//   2. A signed-in user POSTs { test: true } with their own JWT to send
//      themselves a test push (used by the "Send test" button).
//
// Deployed with --no-verify-jwt because the DB trigger has no user JWT;
// auth is enforced explicitly below (shared secret OR real user token),
// so it is not open.
//
// Requires secrets:
//   FCM_SERVICE_ACCOUNT_B64  -- base64 of the Firebase service-account JSON
//   PUSH_TRIGGER_SECRET      -- shared with push_config.trigger_secret

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-trigger-secret",
};

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function loadServiceAccount(): ServiceAccount | null {
  const b64 = Deno.env.get("FCM_SERVICE_ACCOUNT_B64") ?? "";
  if (!b64) return null;
  try {
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    return JSON.parse(json) as ServiceAccount;
  } catch {
    return null;
  }
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Google OAuth2 access tokens last an hour; this function instance may
// handle several notifications in that window, so cache it.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );
  const unsigned = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))
  );
  const assertion = `${unsigned}.${base64UrlEncode(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || "Could not get an FCM access token.");
  }

  cachedToken = { value: body.access_token, expiresAt: now + (body.expires_in ?? 3600) };
  return cachedToken.value;
}

// notifications.type -> notification_preferences.category
const CATEGORY_FOR_TYPE: Record<string, string> = {
  maintenance: "maintenance",
  inquiry: "inquiries",
  // Chat rides the existing "Inquiries & Messages" toggle rather than
  // adding a category -- that switch already promises to cover messages.
  // An unmapped type would bypass the preference check entirely.
  message: "inquiries",
  payment: "payments",
  lease: "lease",
  platform: "platform",
};

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
    const sa = loadServiceAccount();
    if (!sa) return json({ error: "Push is not configured (FCM_SERVICE_ACCOUNT_B64 missing or invalid)." }, 501);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json().catch(() => ({}));
    const triggerSecret = Deno.env.get("PUSH_TRIGGER_SECRET") ?? "";
    const providedSecret = req.headers.get("x-push-trigger-secret") ?? "";
    const fromTrigger = triggerSecret.length > 0 && providedSecret === triggerSecret;

    let targetUserId: string;
    let title: string;
    let message: string;
    let actionUrl: string | null = null;
    let notificationId: string | null = null;
    let category: string | null = null;

    if (fromTrigger) {
      notificationId = String(body.notificationId ?? "");
      if (!notificationId) return json({ error: "notificationId is required" }, 400);

      const { data: row, error } = await serviceClient
        .from("notifications")
        .select("id, user_id, type, title, message, action_url")
        .eq("id", notificationId)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!row) return json({ error: "Notification not found" }, 404);

      targetUserId = row.user_id;
      title = row.title;
      message = row.message;
      actionUrl = row.action_url;
      category = CATEGORY_FOR_TYPE[row.type] ?? null;
    } else {
      // User-initiated test push -- identity comes from their own JWT.
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Not authenticated" }, 401);
      const callerClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData, error: userError } = await callerClient.auth.getUser();
      if (userError || !userData?.user) return json({ error: "Not authenticated" }, 401);

      targetUserId = userData.user.id;
      title = "Test notification";
      message = "Push notifications are working on this device.";
      actionUrl = "/notifications";
    }

    // Respect the user's per-category push preference (the Channel
    // Preferences screen). Absent row = default on, matching the table
    // default and how the in-app UI presents it.
    if (category) {
      const { data: pref } = await serviceClient
        .from("notification_preferences")
        .select("push_enabled")
        .eq("user_id", targetUserId)
        .eq("category", category)
        .maybeSingle();
      if (pref && pref.push_enabled === false) {
        return json({ skipped: "push disabled for this category" });
      }
    }

    const { data: tokenRows, error: tokenError } = await serviceClient
      .from("user_push_tokens")
      .select("id, fcm_token")
      .eq("user_id", targetUserId)
      .eq("active", true);
    if (tokenError) return json({ error: tokenError.message }, 500);
    if (!tokenRows || tokenRows.length === 0) return json({ sent: 0, skipped: "no registered devices" });

    const accessToken = await getAccessToken(sa);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    let sent = 0;
    let failed = 0;
    let firstError: string | null = null;
    const staleTokenIds: string[] = [];

    for (const row of tokenRows) {
      // Data-only on web: including a `notification` block makes the
      // browser auto-display it AND still wake the service worker, which
      // then calls showNotification() -- two notifications for one push.
      // The SW builds the notification from `data` instead, so it stays
      // the single place that decides how a web push looks.
      const payload = {
        message: {
          token: row.fcm_token,
          data: {
            title,
            body: message,
            ...(actionUrl ? { actionUrl } : {}),
            ...(notificationId ? { notificationId } : {}),
          },
          webpush: {
            ...(actionUrl ? { fcmOptions: { link: actionUrl } } : {}),
          },
          // Native platforms do need the notification block -- they have
          // no service worker to render it.
          android: { notification: { title, body: message } },
          apns: { payload: { aps: { alert: { title, body: message } } } },
        },
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        sent++;
        continue;
      }

      const err = await res.json().catch(() => ({}));
      const status = err?.error?.details?.[0]?.errorCode || err?.error?.status || "";
      failed++;
      // Surfaced to the caller and logged: a 401 from a bad service
      // account or a quota error used to vanish here, and the UI then
      // reported "no registered devices" -- the wrong diagnosis entirely.
      if (!firstError) {
        firstError = err?.error?.message || `FCM rejected the send (HTTP ${res.status}${status ? `, ${status}` : ""}).`;
      }
      console.error("FCM send failed", { httpStatus: res.status, errorCode: status, message: err?.error?.message });

      // The device uninstalled/cleared the app or the token rotated --
      // prune it so we stop paying for dead sends on every notification.
      if (status === "UNREGISTERED" || status === "INVALID_ARGUMENT" || res.status === 404) {
        staleTokenIds.push(row.id);
      }
    }

    if (staleTokenIds.length > 0) {
      await serviceClient.from("user_push_tokens").delete().in("id", staleTokenIds);
    }

    if (notificationId && sent > 0) {
      await serviceClient.from("notifications").update({ push_delivered: true }).eq("id", notificationId);
    }

    return json({ sent, failed, pruned: staleTokenIds.length, firstError });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

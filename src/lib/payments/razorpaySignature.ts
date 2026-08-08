// Pure Web Crypto helpers for verifying a Razorpay Checkout signature.
//
// Lives under src/ (not supabase/functions/) purely so it gets real
// Vitest coverage -- it has zero Deno-specific dependencies (only
// crypto.subtle + TextEncoder, both standard Web Crypto), so the
// verify-rent-payment edge function imports this exact file directly
// rather than keeping a second, untested copy of the same logic.

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time comparison -- a naive `a === b` would let an attacker
// recover the expected signature one character at a time by timing
// how long each guess takes to fail.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyRazorpaySignature(
  keySecret: string,
  orderId: string,
  paymentId: string,
  signature: string
): Promise<boolean> {
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  const expected = await hmacSha256Hex(keySecret, `${orderId}|${paymentId}`);
  return safeEqual(expected, signature);
}

/**
 * Verifies a Razorpay WEBHOOK signature (the x-razorpay-signature header).
 *
 * Different from the Checkout signature above in two ways that both
 * matter. The message is the entire raw request body rather than
 * `orderId|paymentId`, and the secret is the webhook secret configured in
 * the Razorpay dashboard -- NOT the API key secret. Using the key secret
 * here fails silently in the sense that every legitimate delivery is
 * rejected, which looks like "Razorpay never called us".
 *
 * The body must be the exact bytes received. Parsing to JSON and
 * re-serialising changes key order and whitespace, and the digest with it,
 * so callers have to hold on to the raw text.
 */
export async function verifyRazorpayWebhookSignature(
  webhookSecret: string,
  rawBody: string,
  signature: string
): Promise<boolean> {
  if (!webhookSecret || !rawBody || !signature) return false;
  const expected = await hmacSha256Hex(webhookSecret, rawBody);
  return safeEqual(expected, signature);
}

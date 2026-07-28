import { describe, it, expect } from "vitest";
import { hmacSha256Hex, safeEqual, verifyRazorpaySignature } from "./razorpaySignature";

const SECRET = "test_key_secret_do_not_use_in_prod";
const ORDER_ID = "order_ABC123";
const PAYMENT_ID = "pay_XYZ789";

async function signFor(orderId: string, paymentId: string, secret = SECRET) {
  return hmacSha256Hex(secret, `${orderId}|${paymentId}`);
}

describe("verifyRazorpaySignature", () => {
  it("accepts a signature actually produced with the matching secret", async () => {
    const signature = await signFor(ORDER_ID, PAYMENT_ID);
    expect(await verifyRazorpaySignature(SECRET, ORDER_ID, PAYMENT_ID, signature)).toBe(true);
  });

  it("rejects a tampered payment id even with an otherwise-valid signature", async () => {
    const signature = await signFor(ORDER_ID, PAYMENT_ID);
    expect(await verifyRazorpaySignature(SECRET, ORDER_ID, "pay_ATTACKER_SUBSTITUTED", signature)).toBe(false);
  });

  it("rejects a tampered order id even with an otherwise-valid signature", async () => {
    const signature = await signFor(ORDER_ID, PAYMENT_ID);
    expect(await verifyRazorpaySignature(SECRET, "order_ATTACKER_SUBSTITUTED", PAYMENT_ID, signature)).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", async () => {
    const signature = await signFor(ORDER_ID, PAYMENT_ID, "some_other_secret");
    expect(await verifyRazorpaySignature(SECRET, ORDER_ID, PAYMENT_ID, signature)).toBe(false);
  });

  it("rejects a garbage/random signature", async () => {
    expect(await verifyRazorpaySignature(SECRET, ORDER_ID, PAYMENT_ID, "0123456789abcdef")).toBe(false);
  });

  it("rejects when any field is missing, rather than throwing", async () => {
    expect(await verifyRazorpaySignature("", ORDER_ID, PAYMENT_ID, "sig")).toBe(false);
    expect(await verifyRazorpaySignature(SECRET, "", PAYMENT_ID, "sig")).toBe(false);
    expect(await verifyRazorpaySignature(SECRET, ORDER_ID, "", "sig")).toBe(false);
    expect(await verifyRazorpaySignature(SECRET, ORDER_ID, PAYMENT_ID, "")).toBe(false);
  });
});

describe("safeEqual", () => {
  it("returns true only for identical strings", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
    expect(safeEqual("abc123", "abc124")).toBe(false);
  });

  it("short-circuits on length mismatch instead of comparing char-by-char", () => {
    expect(safeEqual("short", "a-much-longer-string")).toBe(false);
  });

  it("treats empty strings as equal to each other but not to non-empty", () => {
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("", "a")).toBe(false);
  });
});

describe("hmacSha256Hex", () => {
  it("is deterministic for the same secret and message", async () => {
    const a = await hmacSha256Hex(SECRET, "order_1|pay_1");
    const b = await hmacSha256Hex(SECRET, "order_1|pay_1");
    expect(a).toBe(b);
  });

  it("produces a 64-character lowercase hex string (SHA-256 digest)", async () => {
    const digest = await hmacSha256Hex(SECRET, "order_1|pay_1");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes output when the message changes", async () => {
    const a = await hmacSha256Hex(SECRET, "order_1|pay_1");
    const b = await hmacSha256Hex(SECRET, "order_1|pay_2");
    expect(a).not.toBe(b);
  });
});

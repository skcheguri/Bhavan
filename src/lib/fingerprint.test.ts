import { describe, it, expect, beforeEach } from "vitest";
import { getDeviceFingerprint, getFingerprintShort } from "./fingerprint";

describe("getDeviceFingerprint", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("returns an 8-character lowercase hex string", () => {
    expect(getDeviceFingerprint()).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is stable across repeated calls in the same session", () => {
    const first = getDeviceFingerprint();
    const second = getDeviceFingerprint();
    expect(first).toBe(second);
  });

  it("caches the result in sessionStorage instead of recomputing", () => {
    const first = getDeviceFingerprint();
    expect(sessionStorage.getItem("bhavan_fingerprint")).toBe(first);
  });

  it("still returns a usable fingerprint if sessionStorage is unavailable", () => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(getDeviceFingerprint()).toMatch(/^[0-9a-f]{8}$/);
    } finally {
      Storage.prototype.getItem = originalGetItem;
      Storage.prototype.setItem = originalSetItem;
    }
  });
});

describe("getFingerprintShort", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("returns a non-empty prefix of the full fingerprint", () => {
    const full = getDeviceFingerprint();
    const short = getFingerprintShort();
    expect(short.length).toBeGreaterThan(0);
    expect(full.startsWith(short)).toBe(true);
  });
});

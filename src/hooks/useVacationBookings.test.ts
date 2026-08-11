import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useListingReservedDates, isRefundEligible } from "./useVacationBookings";

// Mocking the Supabase client module (not a real network/DB call) is the
// pattern for testing hooks in isolation -- see also
// src/test/msw/README.md for the alternative (network-level mocking via
// MSW) when a test needs higher fidelity than a hand-rolled mock allows.
vi.mock("@/lib/supabase", () => ({
  isSupabaseConnected: () => true,
  getSupabase: vi.fn(),
}));

import { getSupabase } from "@/lib/supabase";

function mockSelectChain(result: { data: unknown; error: unknown }) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(result),
      }),
      insert: vi.fn().mockResolvedValue(result),
    }),
  };
}

describe("useListingReservedDates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps confirmed bookings from vacation_bookings_public into { from, to } ranges", async () => {
    const supabaseMock = mockSelectChain({
      data: [{ check_in: "2026-08-10", check_out: "2026-08-12" }],
      error: null,
    });
    vi.mocked(getSupabase).mockReturnValue(supabaseMock as never);

    const { result } = renderHook(() => useListingReservedDates("listing-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(supabaseMock.from).toHaveBeenCalledWith("vacation_bookings_public");
    expect(result.current.reservedDates).toEqual([{ from: "2026-08-10", to: "2026-08-12" }]);
  });

  it("returns an empty array (not an error state) when the query fails", async () => {
    const supabaseMock = mockSelectChain({ data: null, error: { message: "network error" } });
    vi.mocked(getSupabase).mockReturnValue(supabaseMock as never);

    const { result } = renderHook(() => useListingReservedDates("listing-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reservedDates).toEqual([]);
  });

  it("skips fetching entirely when no listingId is given", async () => {
    const supabaseMock = mockSelectChain({ data: [], error: null });
    vi.mocked(getSupabase).mockReturnValue(supabaseMock as never);

    const { result } = renderHook(() => useListingReservedDates(undefined));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});

// The UI-side mirror of cancel-booking's refund policy. If these two
// ever disagree, the UI promises refunds the server refuses (or hides
// ones it would grant) -- so the boundary cases are pinned here.
describe("isRefundEligible", () => {
  beforeEach(() => {
    // 2026-08-10T12:00 IST, expressed as UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T06:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is always eligible while the paid request is still pending", () => {
    expect(isRefundEligible({ status: "pending", payment_status: "paid", check_in: "2026-08-10" })).toBe(true);
  });

  it("is eligible for a confirmed stay more than 24h before check-in", () => {
    // Check-in on the 12th at midnight IST is 36h away from the 10th noon.
    expect(isRefundEligible({ status: "confirmed", payment_status: "paid", check_in: "2026-08-12" })).toBe(true);
  });

  it("is NOT eligible inside the final 24 hours before check-in", () => {
    // Check-in on the 11th at midnight IST is only 12h away.
    expect(isRefundEligible({ status: "confirmed", payment_status: "paid", check_in: "2026-08-11" })).toBe(false);
  });

  it("is never eligible when nothing was paid or already refunded", () => {
    expect(isRefundEligible({ status: "pending", payment_status: "unpaid", check_in: "2026-08-20" })).toBe(false);
    expect(isRefundEligible({ status: "declined", payment_status: "refunded", check_in: "2026-08-20" })).toBe(false);
  });

  it("is not eligible for terminal statuses even when paid", () => {
    expect(isRefundEligible({ status: "no_show", payment_status: "paid", check_in: "2026-08-01" })).toBe(false);
    expect(isRefundEligible({ status: "cancelled", payment_status: "paid", check_in: "2026-08-20" })).toBe(false);
  });
});

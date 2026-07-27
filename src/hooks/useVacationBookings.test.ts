import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useListingReservedDates, useCreateVacationBooking } from "./useVacationBookings";

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

describe("useCreateVacationBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = {
    listingId: "listing-1",
    tenantId: "tenant-1",
    ownerId: "owner-1",
    checkIn: "2026-08-10",
    checkOut: "2026-08-12",
    guestCount: 2,
    totalPrice: 6300,
  };

  it("returns success on a clean insert", async () => {
    const supabaseMock = mockSelectChain({ data: null, error: null });
    vi.mocked(getSupabase).mockReturnValue(supabaseMock as never);

    const { result } = renderHook(() => useCreateVacationBooking());
    const response = await act(() => result.current.create(input));

    expect(response).toEqual({ success: true, error: null });
  });

  it("translates a 23P01 exclusion-constraint violation into a friendly message", async () => {
    // This is the real Postgres error code the EXCLUDE constraint on
    // vacation_bookings raises for an overlapping confirmed booking --
    // see migration 018_vacation_bookings.sql.
    const supabaseMock = mockSelectChain({
      data: null,
      error: { code: "23P01", message: "conflicting key value violates exclusion constraint" },
    });
    vi.mocked(getSupabase).mockReturnValue(supabaseMock as never);

    const { result } = renderHook(() => useCreateVacationBooking());
    const response = await act(() => result.current.create(input));

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/just booked by someone else/i);
  });

  it("passes through other database errors unmodified", async () => {
    const supabaseMock = mockSelectChain({ data: null, error: { code: "23503", message: "foreign key violation" } });
    vi.mocked(getSupabase).mockReturnValue(supabaseMock as never);

    const { result } = renderHook(() => useCreateVacationBooking());
    const response = await act(() => result.current.create(input));

    expect(response).toEqual({ success: false, error: "foreign key violation" });
  });
});

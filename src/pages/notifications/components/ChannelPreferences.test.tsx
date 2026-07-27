import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChannelPreferences from "./ChannelPreferences";

// Component tests mock the hooks a component calls, not the Supabase
// client directly -- that keeps the test about rendering/interaction
// logic, while the hook's own Supabase-calling behavior is covered
// separately (see useVacationBookings.test.ts for that pattern).
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const toggleMock = vi.fn();
vi.mock("@/hooks/useNotificationPreferences", () => ({
  useNotificationPreferences: () => ({
    preferences: [
      { category: "maintenance", label: "Maintenance Updates", push_enabled: true, sms_enabled: false, email_enabled: true, criticalOnly: true },
    ],
    loading: false,
    toggle: toggleMock,
  }),
}));

describe("ChannelPreferences", () => {
  it("renders a preference category with its active-channel count", () => {
    render(<ChannelPreferences />);
    expect(screen.getByText("Maintenance Updates")).toBeInTheDocument();
    // The count and the "SMS for critical only" suffix are separate JSX
    // expressions inside the same <p>, so they land in sibling text
    // nodes -- an exact getByText string won't match across them, but a
    // substring/textContent match will.
    expect(screen.getByText((_, el) => el?.textContent === "2 of 3 channels active · SMS for critical only")).toBeInTheDocument();
  });

  it("expands to show per-channel toggles when clicked", async () => {
    const user = userEvent.setup();
    render(<ChannelPreferences />);

    await user.click(screen.getByText("Maintenance Updates"));

    expect(screen.getByText("Push")).toBeInTheDocument();
    expect(screen.getByText("SMS")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("calls toggle(category, channel) when a channel switch is clicked", async () => {
    const user = userEvent.setup();
    render(<ChannelPreferences />);

    await user.click(screen.getByText("Maintenance Updates"));
    await user.click(screen.getByRole("button", { name: /enable sms for maintenance updates/i }));

    expect(toggleMock).toHaveBeenCalledWith("maintenance", "sms_enabled");
  });
});

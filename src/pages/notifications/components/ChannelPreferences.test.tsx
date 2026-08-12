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
  it("summarises push status and marks SMS/Email as coming soon", () => {
    render(<ChannelPreferences />);
    expect(screen.getByText("Maintenance Updates")).toBeInTheDocument();
    // Only push actually delivers; the summary reflects that honestly
    // rather than counting SMS/Email as "active channels".
    expect(screen.getByText((_, el) => el?.textContent === "Push on · SMS & Email coming soon")).toBeInTheDocument();
  });

  it("expands to show per-channel toggles when clicked", async () => {
    const user = userEvent.setup();
    render(<ChannelPreferences />);

    await user.click(screen.getByText("Maintenance Updates"));

    expect(screen.getByText("Push")).toBeInTheDocument();
    expect(screen.getByText("SMS")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("toggles the deliverable Push channel; SMS/Email are not switchable", async () => {
    const user = userEvent.setup();
    render(<ChannelPreferences />);

    await user.click(screen.getByText("Maintenance Updates"));

    // Push is on in the mock, so its switch is a Disable control.
    await user.click(screen.getByRole("button", { name: /disable push for maintenance updates/i }));
    expect(toggleMock).toHaveBeenCalledWith("maintenance", "push_enabled");

    // SMS has no toggle button at all -- it's coming soon.
    expect(screen.queryByRole("button", { name: /sms for maintenance updates/i })).toBeNull();
  });
});

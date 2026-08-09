import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AvatarPicker from "./AvatarPicker";

// Same convention as ChannelPreferences.test.tsx: mock the hooks and the
// libs this component calls, so the test is about what the user can do
// rather than about Supabase. The storage side is covered separately by
// the policies in migration 100.

const updateProfile = vi.fn(async () => ({ error: null as string | null }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, updateProfile }),
}));

const addToast = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ addToast }),
}));

const uploadAvatar = vi.fn(async () => ({ url: "https://cdn/new.jpg", error: null as string | null }));
const deleteAvatar = vi.fn(async () => {});
vi.mock("@/lib/avatarUpload", () => ({
  uploadAvatar: (...args: unknown[]) => uploadAvatar(...(args as [])),
  deleteAvatar: (...args: unknown[]) => deleteAvatar(...(args as [])),
}));

const hasNativeCamera = vi.fn(() => false);
vi.mock("@/lib/photoCapture", () => ({
  hasNativeCamera: () => hasNativeCamera(),
  capturePhoto: vi.fn(async () => ({ files: [] })),
  pickPhotos: vi.fn(async () => ({ files: [] })),
}));

const pngFile = () => new File(["x"], "me.png", { type: "image/png" });

describe("AvatarPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasNativeCamera.mockReturnValue(false);
    updateProfile.mockResolvedValue({ error: null });
    uploadAvatar.mockResolvedValue({ url: "https://cdn/new.jpg", error: null });
  });

  it("falls back to initials but still offers a way in", () => {
    render(<AvatarPicker name="Satish Kumar" avatar={null} tone="amber" />);
    expect(screen.getByText("SK")).toBeInTheDocument();
    // The bug being fixed: the initials were the whole feature, with
    // nothing clickable on them.
    expect(screen.getByRole("button", { name: /add a profile picture/i })).toBeInTheDocument();
  });

  it("shows the picture once there is one", () => {
    render(<AvatarPicker name="Satish Kumar" avatar="https://cdn/old.jpg" tone="brand" />);
    expect(screen.getByRole("img", { name: "Satish Kumar" })).toHaveAttribute("src", "https://cdn/old.jpg");
  });

  it("uploads the chosen file and points the profile at it", async () => {
    const user = userEvent.setup();
    const { container } = render(<AvatarPicker name="Satish Kumar" avatar={null} tone="amber" />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, pngFile());

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ avatar: "https://cdn/new.jpg" }));
    expect(uploadAvatar).toHaveBeenCalledWith("user-1", expect.any(File));
  });

  it("deletes the old file only after the new one is saved", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AvatarPicker name="Satish Kumar" avatar="https://cdn/old.jpg" tone="amber" />
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, pngFile());

    await waitFor(() => expect(deleteAvatar).toHaveBeenCalledWith("https://cdn/old.jpg"));
    expect(updateProfile).toHaveBeenCalledBefore(deleteAvatar);
  });

  it("removes the new file and keeps the old picture when saving fails", async () => {
    updateProfile.mockResolvedValue({ error: "Network unreachable" });
    const user = userEvent.setup();
    const { container } = render(
      <AvatarPicker name="Satish Kumar" avatar="https://cdn/old.jpg" tone="amber" />
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, pngFile());

    await waitFor(() => expect(addToast).toHaveBeenCalledWith("Network unreachable", "error"));
    // The orphan is cleaned up; the picture they still have is untouched.
    expect(deleteAvatar).toHaveBeenCalledWith("https://cdn/new.jpg");
    expect(deleteAvatar).not.toHaveBeenCalledWith("https://cdn/old.jpg");
  });

  it("surfaces an upload failure rather than silently doing nothing", async () => {
    uploadAvatar.mockResolvedValue({ url: null, error: "That image is over 2MB. Try a smaller one." });
    const user = userEvent.setup();
    const { container } = render(<AvatarPicker name="Satish Kumar" avatar={null} tone="amber" />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, pngFile());

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith("That image is over 2MB. Try a smaller one.", "error")
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("offers removal only once there is a picture to remove", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AvatarPicker name="Satish Kumar" avatar={null} tone="amber" />);

    // Nothing to remove and only one way to add: no menu, straight to the
    // file chooser.
    await user.click(screen.getByRole("button", { name: /add a profile picture/i }));
    expect(screen.queryByText("Remove photo")).not.toBeInTheDocument();

    rerender(<AvatarPicker name="Satish Kumar" avatar="https://cdn/old.jpg" tone="amber" />);
    await user.click(screen.getByRole("button", { name: /change profile picture/i }));
    expect(screen.getByText("Remove photo")).toBeInTheDocument();
    expect(screen.getByText("Choose photo")).toBeInTheDocument();
  });

  it("clears the picture and the stored file when removed", async () => {
    const user = userEvent.setup();
    render(<AvatarPicker name="Satish Kumar" avatar="https://cdn/old.jpg" tone="amber" />);

    await user.click(screen.getByRole("button", { name: /change profile picture/i }));
    await user.click(screen.getByText("Remove photo"));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ avatar: null }));
    expect(deleteAvatar).toHaveBeenCalledWith("https://cdn/old.jpg");
  });

  it("offers the camera on a phone", async () => {
    hasNativeCamera.mockReturnValue(true);
    const user = userEvent.setup();
    render(<AvatarPicker name="Satish Kumar" avatar={null} tone="amber" />);

    await user.click(screen.getByRole("button", { name: /add a profile picture/i }));
    expect(screen.getByText("Take photo")).toBeInTheDocument();
    expect(screen.getByText("Choose photo")).toBeInTheDocument();
  });
});

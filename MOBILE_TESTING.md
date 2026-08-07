# Mobile testing

What to check on a device, and why each item is here. Every scenario
marked **(found here)** is a bug that actually existed and was only
discovered by running the app — the web build passed all of them.

Run `scripts/android-smoke.sh` first. It builds, installs, launches and
fails loudly on a crash, so it catches the catastrophic case in ~2 minutes
and leaves the manual matrix for things a script cannot judge.

## Why this document exists

The web and native builds share one React codebase, which makes it very
easy to believe testing the web app tests the app. It does not. Five real
bugs were found in a single afternoon on an emulator, in code that worked
perfectly in a browser:

| Bug | Why the browser could not catch it |
|---|---|
| "Search near me" never returned | `enableHighAccuracy:false` restricts Android to a provider that has no fix; browsers use wifi/IP |
| Back button quit the app | Browsers own the back button; there is no equivalent |
| Foreground pushes silently dropped | Android hands the message to the app instead of showing it; the service worker does this on web |
| Notification taps went nowhere | The web path uses `fcmOptions.link`; native needs an explicit listener |
| Documents/QR share do nothing | `window.open` and `<a download>` are no-ops in a WebView |

The lesson generalises: **anything touching the device, the OS, or a
browser affordance needs testing on the device.**

## 1. Install and first run

| # | Scenario | Expected |
|---|---|---|
| 1.1 | Fresh install, launch | Brand-orange splash with the house mark, then the home screen |
| 1.2 | Launcher icon | Bhavan mark, correctly masked (circle on Pixel, squircle on Samsung) |
| 1.3 | App name under the icon | "Bhavan" |
| 1.4 | Launch with no network | Renders, shows a failure state rather than a blank screen or spinner forever |
| 1.5 | Cold start time | Under ~3s to interactive on a mid-range device |

## 2. Permissions — each is a separate OS dialog

| # | Scenario | Expected |
|---|---|---|
| 2.1 | Tap "search near me", allow | Results filter, "Showing results near your current location", distances shown **(found here)** |
| 2.2 | Same, but deny | Toast naming *device settings*, not "browser settings" |
| 2.3 | Deny, then retry | Re-prompts or explains; never fails silently |
| 2.4 | Enable push, allow | Banner flips to enabled; a row appears in `user_push_tokens` |
| 2.5 | Enable push, deny | Clear message; no phantom "enabled" state |
| 2.6 | Revoke location in Settings, return | Handled without crashing |
| 2.7 | Android 12 and below | Location works without `POST_NOTIFICATIONS`, which does not exist there |

## 3. Push notifications — test all three app states

This is the matrix most often shortened to "it works", and each state is a
different code path.

| # | App state | Expected |
|---|---|---|
| 3.1 | **Foreground** | Bell count updates; no duplicate OS notification **(found here)** |
| 3.2 | **Background** | OS notification appears with title and body |
| 3.3 | **Killed** | OS notification still appears |
| 3.4 | Tap from background | Opens the linked screen, not just the app **(found here)** |
| 3.5 | Tap from killed | Same — this is the case that breaks when listeners bind too late **(found here)** |
| 3.6 | Sign out, sign in as someone else | Old user stops receiving this device's pushes |
| 3.7 | Disable in Channel Preferences | Push stops for that category, bell still updates |

## 4. Navigation and input

| # | Scenario | Expected |
|---|---|---|
| 4.1 | Back from a nested screen | Goes up one screen **(found here)** |
| 4.2 | Back at home | Exits the app |
| 4.3 | Back with a modal open | Closes the modal first, does not navigate. Implemented via a dismissable-layer registry and adopted in 13 modals — **code-complete but NOT yet confirmed on a device**; confirm this one by hand |
| 4.4 | Keyboard over a form field | Field stays visible; page scrolls rather than being covered |
| 4.5 | Text fields | No zoom-on-focus (iOS); the 16px rule covers this |
| 4.6 | Rotate to landscape | No clipped or overlapping layout |
| 4.7 | Deep link from a notification | Correct screen — **needs App Links configured** |

## 5. Documents and sharing — all unverified on device

The agreement path is now verified on device; the rest share its code but
have not themselves been exercised.

| # | Scenario | Expected |
|---|---|---|
| 5.1 | View a rental agreement | Share sheet opens with the document — **verified**, filename identifies the agreement |
| 5.2 | View a rent receipt | Same — same code path, but not itself exercised |
| 5.3 | Save from the share sheet | File lands in Files/Downloads and opens |
| 5.4 | QR code "Download PNG" | Share sheet with the image **(never tested)** |
| 5.5 | QR code "Print" | Share sheet; printing available |
| 5.6 | Copy link | Clipboard actually contains the URL |

## 5b. Camera and photo upload (native)

Listing photos use @capacitor/camera on device rather than the web file
input, which opens a chooser instead of the camera and uploads full-size
sensor output -- often past the uploader's 5MB limit. Native resizes to
1600px / quality 80 first.

| # | Scenario | Expected |
|---|---|---|
| 5b.1 | "Take Photo" on a listing | Camera opens directly, not a file chooser **(not device-tested)** |
| 5b.2 | Back out of the camera | No error toast — cancelling is not a failure |
| 5b.3 | Deny camera permission | Message points at *device* settings |
| 5b.4 | "Add Photos" | Gallery multi-select, up to 8 |
| 5b.5 | Check the uploaded file size | Roughly 200-400KB, not multi-MB |
| 5b.6 | Android 12 or below | Gallery works via READ_EXTERNAL_STORAGE, capped at API 32 |

## 6. Payments — the highest-consequence path

**Confirm Razorpay is in test mode before anyone taps Pay.**

| # | Scenario | Expected |
|---|---|---|
| 6.1 | Open rent payment | Checkout opens inside the app |
| 6.2 | Complete with a test card | Returns to the app; payment recorded |
| 6.3 | Cancel mid-checkout | Returns cleanly; nothing marked paid |
| 6.4 | Kill the app mid-checkout | No phantom paid state — **the missing webhook makes this the risky one** |
| 6.5 | Lose network mid-checkout | Fails safe |

## 7. Sessions and data

| # | Scenario | Expected |
|---|---|---|
| 7.1 | Sign in, kill, reopen | Still signed in |
| 7.2 | Leave for a week, reopen | Token refresh works or a clean re-login is prompted |
| 7.3 | Sign out | Session gone; push token detached |
| 7.4 | Airplane mode mid-session | Errors are surfaced, not swallowed |

## 8. Release build specifically

R8 breakage appears only in release, and only at runtime.

| # | Scenario | Expected |
|---|---|---|
| 8.1 | Minified release runs | Verified |
| 8.2 | A plugin call in release | Verified — permission dialog fires |
| 8.3 | Push in release | **Not yet tested** |
| 8.4 | Documents in release | **Not yet tested** |

## Device coverage

Emulator testing is necessary, not sufficient. It has perfect network,
generous memory, no vendor skin, and Google's own Android build. Before
shipping, cover at least:

- One low-end Android (2–3GB RAM), which is a large share of the Indian market
- One Samsung device — One UI differs most from stock, especially keyboard and back gesture
- One Xiaomi/Redmi — MIUI aggressively kills background apps, which affects push
- Android 12 (adaptive icons, splash API) and the current release
- A slow 3G profile, not just wifi

## Running the smoke script

```bash
bash scripts/android-smoke.sh
```

Needs `ANDROID_SDK_ROOT` (or the default Windows SDK path) and a running
emulator or attached device.

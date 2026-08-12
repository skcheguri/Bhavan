# Android release & Play Store checklist

Everything needed to take the Capacitor Android build from "runs on a
device" to "live on Play". Code-side blockers are handled in the repo; the
rest is developer-account, signing, and store-listing work that can't live
in git. Cross-references [HANDOVER.md](HANDOVER.md) §4.2, §4.4, §4.6.

App id / package: **`com.bhavan.app`** · web bundle: `webDir: out` ·
`versionCode 1` / `versionName 1.0` (bump before each upload —
`android/app/build.gradle:10-11`).

---

## 1. Google sign-in on native — wired, needs one dashboard entry + a device test

**The problem.** Google blocks its OAuth consent page inside embedded
WebViews (`disallowed_useragent` / 403). Letting `signInWithOAuth` navigate
the Capacitor WebView therefore fails on the phone even though it works on
the web.

**What the code now does** (web path unchanged):
- `signInWithGoogle` branches on `Capacitor.isNativePlatform()`
  ([src/hooks/useAuth.ts](src/hooks/useAuth.ts)) and, on native, gets the
  provider URL with `skipBrowserRedirect: true` and opens it in the system
  browser (Custom Tabs) via `@capacitor/browser`.
- The redirect target is `com.bhavan.app://auth/callback`
  ([src/lib/nativeOAuth.ts](src/lib/nativeOAuth.ts)).
- `AndroidManifest.xml` registers that custom scheme on `MainActivity`
  (VIEW/BROWSABLE intent-filter), so the OS reopens the app on the
  redirect; `singleTask` delivers it to the running instance.
- `useNativeOAuthCallback` ([src/hooks/useNativeOAuthCallback.ts](src/hooks/useNativeOAuthCallback.ts)),
  mounted app-wide in `App.tsx`, catches the deep link, establishes the
  session (handles both PKCE `?code=` and implicit `#access_token=`), closes
  the browser tab, and hands off to the shared `/auth/callback` screen for
  the pending tenant/owner role reconciliation.

**What YOU must still do — it will not work until both are done:**
1. **Supabase → Authentication → URL Configuration → Redirect URLs:** add
   `com.bhavan.app://auth/callback`. (Also fix the still-`localhost` Site
   URL / web redirect allow-list — HANDOVER §4.4 — or the *web* Google
   sign-in bounces users to localhost.)
2. **Verify on a device/emulator.** None of the native OAuth path has run
   on hardware yet. Test: fresh install → "Continue with Google" → consent
   in Custom Tabs → lands back signed in → role is correct on a brand-new
   account.

No Google Cloud Console change is needed: Google redirects to Supabase's
`/auth/v1/callback`, and only Supabase redirects to the app scheme.

---

## 2. Permissions — declared, all justified

Every permission in `AndroidManifest.xml` maps to a real feature. Use this
table verbatim for the Play Console permissions declaration.

| Permission | Why it's needed | Feature |
|---|---|---|
| `INTERNET` | All app data is server-backed (Supabase). | Everything |
| `POST_NOTIFICATIONS` | Android 13+ gate for showing pushes. | New request / payment / chat alerts |
| `ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION` | "Search near me" needs a GPS fix. **FINE is required, not optional** — on Android, `enableHighAccuracy:false` (network provider) routinely returns no fix and times out; this is device-verified (see `src/lib/currentPosition.ts`). | Nearby-listings search |
| `CAMERA` | `@capacitor/camera` opens the camera to photograph a listing / Aadhaar card. | Listing photos, Aadhaar OCR |
| `READ_MEDIA_IMAGES` (13+) / `READ_EXTERNAL_STORAGE` `maxSdkVersion=32` | Pick existing photos from the gallery. | Listing photos, avatar |

Location is **precise** and prominent-disclosure applies: the in-app prompt
and the store listing must state it's used only to find nearby listings.
Location coordinates are used transiently for search and are **not stored**
server-side.

---

## 3. Play Data Safety form — answers that match the privacy policy

The in-app policy ([/privacy](src/pages/privacy/page.tsx), DPDP Act 2023)
is the source of truth. Google Play also needs a **publicly reachable
privacy-policy URL** — paste the deployed `https://<domain>/privacy`. The
table below is what the app actually collects; transcribe it into the Data
Safety questionnaire.

**Data collected**

| Play data type | Collected | Shared* | Purpose |
|---|---|---|---|
| Name | Yes | Yes (other party in a request) | Account, connecting owner↔tenant |
| Email address | Yes | No | Account, sign-in, notifications |
| Phone number | Yes | Yes (SMS provider, for OTP) | Sign-in, verification |
| Other personal info (DOB, occupation, emergency contact) | Yes | No | Profile, tenancy records |
| Government ID (Aadhaar last-4 + status; PAN/masked Aadhaar in generated docs) | Yes | Yes (KYC provider, to run the OTP e-KYC you start) | Identity verification, statutory tenancy docs |
| Purchase history (rent/subscription: amount, month, status) | Yes | Yes (Razorpay) | Process payments, shared payment record |
| Payment info (card/bank) | **No — collected by Razorpay directly, never by the app** | — | — |
| Approximate & precise location | Yes | No | Nearby-listings search (transient, not stored) |
| Photos (listing, avatar, Aadhaar card image) | Yes | No (Aadhaar image is deleted right after OCR) | Listings, profile, verification |
| Messages (in-app owner↔tenant chat) | Yes | Yes (the other party) | Coordinating a tenancy |
| App activity / diagnostics (crash & error logs) | Yes | No | Stability, abuse prevention |
| Device identifiers (rate-limit fingerprint) | Stored on-device only | No | Spam/fraud rate-limiting |

\* "Shared" in Play's sense. Supabase (database/auth/storage) is a
**processor**, so it's "collected/processed on our behalf," not "shared."
User-to-user visibility (owner↔tenant) is an in-app feature, but Play still
expects the parties above listed as recipients where they receive data.

**Security practices to declare:** data encrypted in transit (HTTPS);
users can request deletion (self-service — `delete_my_account`, Settings →
Delete account); users can request their data (DPDP rights, grievance
contact in the policy). Data is **not** sold; Aadhaar/PAN/payment data is
**not** used for advertising.

---

## 4. Store listing — draft copy + asset checklist

**App name:** Bhavan — Broker-Free Rentals

**Short description (≤80 chars):**
> Rent homes directly from verified owners. No brokers, no brokerage.

**Full description (draft):**
> Bhavan connects tenants and property owners directly — no brokers, no
> brokerage fees. Browse verified listings, message owners, schedule
> visits, and handle the whole tenancy in one place.
>
> • Verified owners — listings come from Aadhaar-verified, broker-free
>   owners.
> • Search near you — find homes within your city or a radius around you.
> • Rent online — pay rent securely through Razorpay and keep a shared,
>   receipted record with your landlord.
> • Agreements & receipts — generate rental agreements and rent receipts
>   from the details you enter.
> • Societies — apartment and villa communities get notices, polls,
>   maintenance requests, and shared funds.
> • Vacation stays — book short stays with upfront payment and clear
>   refund terms.
>
> Bhavan never acts as a broker and never charges brokerage. Payments are
> processed by Razorpay; Bhavan never holds your money.

**Assets still needed (not in repo — must be produced):**
- [ ] App icon + splash — currently **Capacitor defaults** (HANDOVER §4.2).
- [ ] Feature graphic (1024×500).
- [ ] Phone screenshots (min 2; recommend 4–6: listings, listing detail,
      chat, rent payment, society, booking).
- [ ] Short + full description finalized from the drafts above.
- [ ] Content rating questionnaire.
- [ ] Category (House & Home / Lifestyle) and contact email.

---

## 5. Release checklist

- [ ] `npm run cap:sync` — rebuilds `out/` and syncs native. Also purges
      stale local `*.js.map` files from an earlier source-maps build
      (`build.sourcemap` is now `false`; HANDOVER §4.6).
- [ ] Generate an upload **keystore**, store `keystore.properties`
      (gitignored — `android/app/build.gradle:19-40`), and **back the
      keystore up off-machine** — losing it means you can never update the
      app.
- [ ] Add `google-services.json` from Firebase (gitignored) for push, or
      the FCM registration silently no-ops.
- [ ] Bump `versionCode` / `versionName` (`android/app/build.gradle:10-11`).
- [ ] Build a signed AAB (`./gradlew bundleRelease` or Android Studio).
- [ ] Play Console: create the app, complete Data Safety (§3), permissions
      (§2), store listing (§4), content rating.
- [ ] Google now requires a **closed testing track** with testers before a
      new personal developer account can go to production (HANDOVER §9).

## 6. Still needs business / external input (not code)

- Google Play developer account (one-time ₹2,000 / ~$25).
- Signing keystore generation + safe backup.
- `google-services.json` (Firebase project) for push.
- Supabase Redirect URL allow-list entry (§1) + Site URL fix (HANDOVER §4.4).
- Store assets: icon, splash, feature graphic, screenshots (§4).
- Razorpay-in-WebView verified on a real device (payment sheet must open
  and complete inside the Capacitor shell).

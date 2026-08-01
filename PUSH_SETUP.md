# Push notifications — setup and status

Firebase project: **bhavan-f7b8e**

## How it works

1. A device registers and its FCM token is stored in `user_push_tokens`
   (unique on `fcm_token`, so signing in as someone else on the same
   device moves the row rather than duplicating it).
2. Anything that inserts into `notifications` — connection requests,
   payments, agreements, maintenance updates, all via the existing
   migration-036 triggers — fires `trg_dispatch_push` (migration 065).
3. That trigger calls the `send-push` edge function through `pg_net`,
   authenticating with a shared secret held in `push_config`.
4. `send-push` signs a JWT with the Firebase service account, exchanges
   it for a Google OAuth2 access token, and sends via the FCM HTTP v1
   API. It respects the user's per-category push preference, marks
   `notifications.push_delivered`, and prunes tokens FCM reports as dead.

Push is best-effort by design: a delivery failure never rolls back the
notification row, because the in-app bell is the source of truth.

## Status

| Platform | State |
|---|---|
| Web (Chrome/Edge/Firefox desktop + Android) | **Done** — end-to-end |
| iOS Safari 16.4+ (web, installed to Home Screen) | Works via the same web path; Apple requires the site be added to the Home Screen first |
| Android native app | Code complete — needs `google-services.json` (below) |
| iOS native app | Code complete — needs an APNs key + Xcode capability (below) |

## Secrets already configured

Set on the Supabase project (not in the repo):

- `FCM_SERVICE_ACCOUNT_B64` — base64 of the Firebase service-account JSON
- `PUSH_TRIGGER_SECRET` — shared with `push_config.trigger_secret`

`push_config` (function URL + secret) is populated directly in the
database, deliberately **not** seeded by a migration, so the secret never
lands in a committed file. A fresh environment must set both or the
trigger no-ops silently — same pattern as `error_alert_settings`.

## Remaining native setup

Neither step can be done or tested from a Windows machine without
Android Studio / Xcode, so both are for the mobile phase.

### Android

1. Firebase Console → Project settings → Your apps → **Add app → Android**
2. Package name must match `appId` in `capacitor.config.ts`
3. Download `google-services.json` → place at `android/app/google-services.json`
   (already gitignored as a credential — do not commit it)
4. `npm run cap:sync && npm run android:open`, then test on a real device
   (push does not work on most emulators without Play Services)

### iOS

1. Apple Developer account → Keys → create an **APNs Auth Key** (`.p8`)
2. Firebase Console → Project settings → Cloud Messaging → iOS app →
   upload the `.p8` with its Key ID and your Team ID
3. In Xcode: enable **Push Notifications** and **Background Modes →
   Remote notifications** capabilities
4. Test on a real device — the simulator cannot receive push

## Verifying it works

Signed in, go to **Notifications** → the banner → **Enable**, accept the
browser prompt, then **Send test**. A real OS notification should appear
within a second or two.

To confirm server-side afterwards:

```sql
SELECT device_name, active, created_at FROM user_push_tokens;
SELECT status_code, content FROM net._http_response ORDER BY created DESC LIMIT 5;
```

## Known limitation

A push sent while the site is **open and focused** does not raise an OS
notification — `firebase-messaging-sw.js` only handles background
messages. Foreground messages dispatch a `bhavan:push-received` window
event instead, which the in-app notification bell can listen for. That is
standard FCM behaviour, not a bug.

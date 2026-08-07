import { Capacitor } from '@capacitor/core';

/**
 * Fingerprint / face unlock for returning users.
 *
 * WHAT IS STORED, AND WHY THAT CHOICE
 *
 * Exactly one secret: the Supabase **refresh** token, in the OS keystore
 * (Android Keystore / iOS Keychain via capacitor-native-biometric), and it
 * is only handed back after the OS has verified the user's biometric.
 *
 * Not the password -- storing a reusable credential that works everywhere,
 * including the website, would be a far worse trade than a token scoped to
 * this app and revocable server-side.
 *
 * Not the access token -- it expires in an hour, so it would not remove
 * the friction this exists to remove.
 *
 * Never Preferences/localStorage. Those are plain text on a rooted device
 * and readable by anything with filesystem access; a refresh token there
 * is a permanent account compromise waiting for one lost phone.
 *
 * THE TRADE-OFF, STATED PLAINLY
 *
 * A refresh token on the device means someone who has both the unlocked
 * phone and a fingerprint enrolled on it can reach the account. That is
 * the accepted cost of skipping the password, and it is why the token is
 * purged aggressively: on sign-out, on account deletion, when the user
 * turns the feature off, and whenever the stored token is rejected by the
 * server (revoked, expired, or password changed elsewhere).
 *
 * The password path is never removed. Biometrics fail -- wet hands, a cut
 * finger, a sibling's face -- and an app that has no other way in is an
 * app that locks people out.
 */

/** Namespaces the keystore entry; must be stable across releases. */
const SERVER = 'app.bhavan.session';

export type BiometricKind = 'fingerprint' | 'face' | 'biometric';

export interface BiometricStatus {
  /** Hardware present AND at least one biometric enrolled. */
  available: boolean;
  /** A token is stored, so unlock can be offered on the sign-in screen. */
  enrolled: boolean;
  kind: BiometricKind;
}

async function plugin() {
  const mod = await import('capacitor-native-biometric');
  return mod.NativeBiometric;
}

function describeKind(biometryType: unknown): BiometricKind {
  // The plugin's enum differs per platform; the label is only used for
  // wording ("Unlock with Face ID" vs "...with fingerprint"), so an
  // unknown value degrades to the neutral term rather than guessing.
  const value = String(biometryType ?? '').toLowerCase();
  if (value.includes('face')) return 'face';
  if (value.includes('touch') || value.includes('finger')) return 'fingerprint';
  return 'biometric';
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  const unavailable: BiometricStatus = { available: false, enrolled: false, kind: 'biometric' };
  if (!Capacitor.isNativePlatform()) return unavailable;

  try {
    const NativeBiometric = await plugin();
    const result = await NativeBiometric.isAvailable();
    if (!result.isAvailable) return unavailable;

    const kind = describeKind(result.biometryType);

    // Whether a token exists is checked WITHOUT prompting: the sign-in
    // screen needs to know if the button belongs there, and prompting
    // unasked would be its own kind of rude.
    let enrolled = false;
    try {
      const stored = await NativeBiometric.getCredentials({ server: SERVER });
      enrolled = Boolean(stored?.password);
    } catch {
      enrolled = false;
    }

    return { available: true, enrolled, kind };
  } catch {
    return unavailable;
  }
}

/**
 * Stores the refresh token behind the biometric, after confirming the
 * person enabling it is the one holding the phone. Without that check,
 * anyone with a borrowed unlocked handset could bind their own face to
 * the session.
 */
export async function enableBiometricUnlock(
  email: string,
  refreshToken: string
): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return 'Biometric unlock is only available in the app.';

  try {
    const NativeBiometric = await plugin();
    await NativeBiometric.verifyIdentity({
      reason: 'Confirm it is you before enabling quick sign-in',
      title: 'Enable biometric sign-in',
      subtitle: email,
    });
    await NativeBiometric.setCredentials({ username: email, password: refreshToken, server: SERVER });
    return null;
  } catch (err) {
    return describeFailure(err);
  }
}

export interface UnlockResult {
  refreshToken?: string;
  email?: string;
  /** Absent when the user simply cancelled. */
  error?: string;
}

/** Prompts, then returns the stored refresh token on success. */
export async function unlockWithBiometric(): Promise<UnlockResult> {
  if (!Capacitor.isNativePlatform()) return { error: 'Biometric unlock is only available in the app.' };

  try {
    const NativeBiometric = await plugin();
    await NativeBiometric.verifyIdentity({
      reason: 'Sign in to Bhavan',
      title: 'Unlock Bhavan',
    });
    const stored = await NativeBiometric.getCredentials({ server: SERVER });
    if (!stored?.password) {
      // Enrolled but nothing to hand back: treat as not set up rather than
      // leaving a button that fails every time.
      await disableBiometricUnlock();
      return { error: 'Biometric sign-in is no longer set up on this device.' };
    }
    return { refreshToken: stored.password, email: stored.username };
  } catch (err) {
    const message = describeFailure(err);
    return message ? { error: message } : {};
  }
}

/**
 * Removes the stored token. Safe to call when nothing is stored, because
 * every caller is a path where leaving a token behind would be a bug --
 * sign-out, account deletion, a rejected refresh.
 */
export async function disableBiometricUnlock(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const NativeBiometric = await plugin();
    await NativeBiometric.deleteCredentials({ server: SERVER });
  } catch {
    // Nothing stored, or the keystore is unavailable. Either way there is
    // no token left to protect and no useful action for the caller.
  }
}

/**
 * Cancelling is not a failure -- it is the most common way a biometric
 * prompt ends, and showing an error for it would punish a normal choice.
 * Returns null for cancellation so callers can stay silent.
 */
export function describeFailure(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const lower = message.toLowerCase();

  if (!message || lower.includes('cancel') || lower.includes('user_cancel')) return null;
  if (lower.includes('lockout') || lower.includes('too many')) {
    return 'Too many failed attempts. Use your password, then try biometrics again later.';
  }
  if (lower.includes('not enrolled') || lower.includes('no biometric')) {
    return 'No fingerprint or face is set up on this device yet.';
  }
  if (lower.includes('not available') || lower.includes('unavailable')) {
    return 'This device does not support biometric sign-in.';
  }
  return 'Biometric sign-in did not work. Use your password instead.';
}

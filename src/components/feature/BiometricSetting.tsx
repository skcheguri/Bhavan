import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { getBiometricStatus, type BiometricStatus } from '@/lib/biometricAuth';

/**
 * The on/off switch for biometric sign-in.
 *
 * Rendered only in the app, and only where the hardware exists -- on the
 * website, or a phone with nothing enrolled, a dead toggle would just
 * raise a question it cannot answer.
 *
 * It also has to be here for a plainer reason: turning the feature on
 * puts a refresh token on the device, and anything a user can switch on
 * they must be able to switch off. Without this, the only way to clear
 * that token would be signing out.
 */
export default function BiometricSetting() {
  const { enableBiometrics, disableBiometrics } = useAuth();
  const { addToast } = useToast();
  const [status, setStatus] = useState<BiometricStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getBiometricStatus().then(setStatus);
  }, []);

  // Nothing to configure: not the app, no sensor, or nothing enrolled.
  if (!status?.available) return null;

  const label = status.kind === 'face' ? 'Face ID' : 'Fingerprint';

  const toggle = async () => {
    setBusy(true);
    if (status.enrolled) {
      await disableBiometrics();
      setStatus({ ...status, enrolled: false });
      addToast(`${label} sign-in turned off. This device has forgotten your session.`, 'success');
    } else {
      const { error } = await enableBiometrics();
      if (error) {
        addToast(error, 'error');
      } else {
        setStatus({ ...status, enrolled: true });
        addToast(`${label} sign-in is on for this device.`, 'success');
      }
    }
    setBusy(false);
  };

  return (
    <div className="flex items-start justify-between gap-4 py-3 border-t border-black/5 first:border-t-0">
      <div>
        <p className="text-sm font-semibold text-charcoal flex items-center gap-2">
          <i className={status.kind === 'face' ? 'ri-user-smile-line text-brand' : 'ri-fingerprint-line text-brand'} />
          Sign in with {label}
        </p>
        <p className="text-xs text-charcoal/50 mt-1 leading-relaxed">
          {status.enrolled
            ? `Turn this off to make this device forget your sign-in. Your password always works.`
            : `Skip typing your password on this device. Your sign-in is stored in ${label === 'Face ID' ? 'the Secure Enclave' : "Android's keystore"} and released only after ${label} confirms it is you.`}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={busy}
        role="switch"
        aria-checked={status.enrolled}
        aria-label={`Sign in with ${label}`}
        className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors cursor-pointer disabled:opacity-50 ${
          status.enrolled ? 'bg-brand' : 'bg-black/15'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            status.enrolled ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

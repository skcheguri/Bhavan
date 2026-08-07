import { describe, it, expect } from 'vitest';
import { interpretCaptureError } from './photoCapture';

// Capacitor signals "user cancelled" and "permission denied" the same way
// -- by throwing -- and they need opposite responses. Cancelling is the
// single most common outcome of opening a camera, so treating it as a
// failure would show an error toast to someone who simply changed their
// mind. Getting this backwards is invisible until a real person taps back.

describe('interpretCaptureError', () => {
  it('treats a cancelled camera as no photos, not an error', () => {
    for (const message of [
      'User cancelled photos app',
      'user canceled',
      'No image picked',
    ]) {
      const result = interpretCaptureError(new Error(message));
      expect(result.files).toEqual([]);
      expect(result.error).toBeUndefined();
    }
  });

  it('explains a denied permission, and points at device settings', () => {
    const result = interpretCaptureError(new Error('User denied access to camera'));
    expect(result.files).toEqual([]);
    expect(result.error).toMatch(/device settings/i);
    // "browser settings" is meaningless advice on a phone.
    expect(result.error).not.toMatch(/browser/i);
  });

  it('passes through an unexpected failure rather than swallowing it', () => {
    const result = interpretCaptureError(new Error('Camera hardware unavailable'));
    expect(result.error).toBe('Camera hardware unavailable');
  });

  it('never throws on a non-Error value', () => {
    expect(() => interpretCaptureError('something odd')).not.toThrow();
    expect(interpretCaptureError(undefined).files).toEqual([]);
  });
});

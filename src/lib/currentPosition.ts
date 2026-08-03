import { Capacitor } from '@capacitor/core';
import type { Coordinates } from '@/lib/geo';

// Resolving "where am I" differs by platform.
//
// Web: navigator.geolocation, which prompts the user itself.
//
// Native: navigator.geolocation exists inside a Capacitor WebView but only
// works once the OS-level permission has been granted, and nothing in the
// WebView can request that. Without the plugin the call just times out or
// fails with a permission error the user cannot act on, because the
// browser-settings advice the web path gives is meaningless on a phone.
//
// NOTE FOR THE MOBILE DEVELOPER: the native branch is written against the
// documented plugin API but has never run on a device. It also needs the
// platform permission declarations, which live outside this file:
//   Android  ACCESS_COARSE_LOCATION (and ACCESS_FINE_LOCATION if you want
//            precise results) in AndroidManifest.xml
//   iOS      NSLocationWhenInUseUsageDescription in Info.plist, with a
//            user-facing reason -- App Review rejects a missing or vague one

export type PositionFailure = 'denied' | 'unavailable' | 'unsupported';

export interface PositionResult {
  coords?: Coordinates;
  failure?: PositionFailure;
}

/** Human-readable, platform-appropriate guidance for a failure. */
export function describePositionFailure(failure: PositionFailure): string {
  const native = Capacitor.isNativePlatform();
  switch (failure) {
    case 'denied':
      return native
        ? 'Location access was denied — enable it for Bhavan in your device settings to search nearby'
        : 'Location access was denied — enable it in your browser settings to search nearby';
    case 'unsupported':
      return 'Location search is not available on this device';
    default:
      return 'Could not determine your location';
  }
}

async function nativePosition(): Promise<PositionResult> {
  const { Geolocation } = await import('@capacitor/geolocation');

  let status = await Geolocation.checkPermissions();
  if (status.location !== 'granted') {
    status = await Geolocation.requestPermissions({ permissions: ['location'] });
  }
  if (status.location !== 'granted') return { failure: 'denied' };

  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
  return { coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } };
}

function webPosition(): Promise<PositionResult> {
  if (!('geolocation' in navigator)) return Promise.resolve({ failure: 'unsupported' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }),
      (err) => resolve({ failure: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });
}

/** Never rejects — failures come back as a `failure` code to describe. */
export async function getCurrentPosition(): Promise<PositionResult> {
  try {
    return Capacitor.isNativePlatform() ? await nativePosition() : await webPosition();
  } catch {
    return { failure: 'unavailable' };
  }
}

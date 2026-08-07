import { Capacitor } from '@capacitor/core';

/**
 * Camera and gallery access that returns ordinary File objects, so it
 * feeds the existing uploader unchanged.
 *
 * On web this is a hidden <input type="file"> and always was. On a phone
 * that input works, but poorly: it opens a system chooser rather than the
 * camera, gives no control over image size, and uploads whatever the
 * sensor produced -- routinely 4-8MB per photo. For an owner adding eight
 * photos of a flat on Indian mobile data, that is the difference between
 * a listing that gets published and one that gets abandoned. The 5MB
 * per-file limit in the uploader would reject many of them outright.
 *
 * The native path therefore resizes and re-encodes before the file ever
 * exists: longest edge 1600px at quality 80, which is more than enough
 * for a listing photo and lands around 200-400KB.
 *
 * Cancellation is not an error. Capacitor throws when the user backs out
 * of the camera, which is the single most common outcome, so every entry
 * point returns an empty array rather than surfacing a failure.
 */

export interface CaptureResult {
  files: File[];
  /** Set only for real failures -- never for a user who changed their mind. */
  error?: string;
}

/** True when the device can offer a genuine camera/gallery experience. */
export function hasNativeCamera(): boolean {
  return Capacitor.isNativePlatform();
}

const MAX_EDGE = 1600;
const QUALITY = 80;

/** Turns a Capacitor photo URI into a File the uploader accepts. */
async function toFile(webPath: string | undefined, format: string, index = 0): Promise<File | null> {
  if (!webPath) return null;
  const response = await fetch(webPath);
  const blob = await response.blob();

  // The uploader whitelists jpeg/png/webp by MIME type and derives the
  // extension from the filename, so both have to be coherent.
  const ext = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg';
  const type = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return new File([blob], `photo-${Date.now()}-${index}.${ext}`, { type });
}

/** Opens the camera. Returns no files if the user backs out. */
export async function capturePhoto(): Promise<CaptureResult> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: QUALITY,
      width: MAX_EDGE,
      correctOrientation: true,
      // Skipping the built-in editor: it is an extra step before the photo
      // even reaches the form, and the crop people actually want is on the
      // listing, not the shot.
      allowEditing: false,
    });

    const file = await toFile(photo.webPath, photo.format);
    return { files: file ? [file] : [] };
  } catch (err) {
    return interpretCaptureError(err);
  }
}

/** Opens the gallery, multi-select. Returns no files if the user backs out. */
export async function pickPhotos(limit = 8): Promise<CaptureResult> {
  try {
    const { Camera } = await import('@capacitor/camera');

    const { photos } = await Camera.pickImages({
      quality: QUALITY,
      width: MAX_EDGE,
      limit,
    });

    const files = await Promise.all(photos.map((p, i) => toFile(p.webPath, p.format, i)));
    return { files: files.filter((f): f is File => f !== null) };
  } catch (err) {
    return interpretCaptureError(err);
  }
}

/**
 * Capacitor signals both "user cancelled" and "permission denied" by
 * throwing, and the two need opposite responses: silence for the first,
 * an explanation for the second. The message is all there is to go on.
 */
export function interpretCaptureError(err: unknown): CaptureResult {
  const message = err instanceof Error ? err.message : String(err);

  if (/cancel/i.test(message) || /No image picked/i.test(message)) {
    return { files: [] };
  }
  if (/denied|permission/i.test(message)) {
    return {
      files: [],
      error: 'Camera access is off for Bhavan. Turn it on in your device settings to add photos.',
    };
  }
  return { files: [], error: message || 'Could not open the camera.' };
}

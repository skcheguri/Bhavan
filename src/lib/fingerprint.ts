/**
 * Device fingerprinting for non-authenticated rate limiting.
 * Generates a stable device fingerprint from browser characteristics.
 * This is NOT a perfect anti-spoof measure but significantly raises the
 * barrier for casual abuse compared to localStorage-only tracking.
 */

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  // Make it unsigned and hex-padded
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    canvas.width = 200;
    canvas.height = 60;
    // Draw text with varied styles to produce device-specific noise
    ctx.textBaseline = 'top';
    ctx.font = '16px "Arial", sans-serif';
    ctx.fillStyle = '#f60';
    ctx.fillText('Bhavan', 5, 5);
    ctx.fillStyle = '#0af';
    ctx.fillText('Device', 85, 25);
    ctx.fillStyle = '#a0a';
    ctx.fillText('Fingerprint', 5, 40);
    return hashString(canvas.toDataURL());
  } catch {
    return 'canvas-error';
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return 'no-webgl';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown';
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
    return hashString(`${vendor}||${renderer}`);
  } catch {
    return 'webgl-error';
  }
}

/**
 * Gather raw device characteristics.
 */
function getRawComponents(): Record<string, string | number | boolean> {
  return {
    // Screen
    screenW: window.screen.width,
    screenH: window.screen.height,
    availW: window.screen.availWidth,
    availH: window.screen.availHeight,
    colorDepth: window.screen.colorDepth,
    pixelRatio: window.devicePixelRatio,
    // Timezone
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    // Language
    language: navigator.language,
    languages: (navigator.languages || []).join(','),
    // Platform
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    // Features
    cookieEnabled: navigator.cookieEnabled,
    pdfEnabled: !!(navigator as unknown as { pdfViewerEnabled?: boolean }).pdfViewerEnabled,
    doNotTrack: (navigator as unknown as { doNotTrack?: string }).doNotTrack || 'unspecified',
    // Plugins (length only to avoid leaking exact plugins)
    pluginsLen: navigator.plugins ? navigator.plugins.length : 0,
    // Canvas & WebGL
    canvas: getCanvasFingerprint(),
    webgl: getWebGLFingerprint(),
    // Math constants (help detect JS engine tampering)
    mathLN2: Math.LN2.toString(),
  };
}

/**
 * Compute a stable device fingerprint string.
 * Cached in sessionStorage to avoid repeated expensive canvas/WebGL calls.
 */
export function getDeviceFingerprint(): string {
  try {
    const cached = sessionStorage.getItem('bungalow_fingerprint');
    if (cached) return cached;
  } catch {
    // sessionStorage blocked (e.g. incognito with strict settings)
  }

  const raw = getRawComponents();
  const parts = Object.entries(raw)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`);
  const fingerprint = hashString(parts.join('||'));

  try {
    sessionStorage.setItem('bungalow_fingerprint', fingerprint);
  } catch {
    // ignore
  }

  return fingerprint;
}

/**
 * Return a short display ID derived from the fingerprint for UI/debug.
 */
export function getFingerprintShort(): string {
  return getDeviceFingerprint().slice(0, 8);
}
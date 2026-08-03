import { Capacitor } from '@capacitor/core';

// Opens a generated HTML document (rental agreement, rent receipt, etc.).
//
// Web: a Blob URL in a new tab, rather than window.open('', '_blank') +
// document.write(). That older pattern forces open a print dialog after a
// fixed delay, and since the print dialog is modal it blocks interaction
// with the original page until dismissed -- clicking "View" on a second
// document while the first one's print dialog is still open does nothing,
// which reads as "I can only view one at a time." A Blob URL is just a
// normal page the browser navigates to, so each click opens its own
// independent tab; printing is left to the user's own print action.
//
// Native: none of the above works. A Capacitor WebView has no tabs, and
// window.open() on a blob: URL either opens a blank view or is silently
// dropped on both Android and iOS -- which would break the *legal
// documents* path (agreements and receipts) while looking perfectly fine
// in every browser test. So on native the document is written to the
// cache directory and handed to the OS share sheet, which gives the user
// Save to Files / Print / Mail and matches what people expect a document
// to do on a phone.
//
// NOTE FOR THE MOBILE DEVELOPER: the native branch is written against the
// documented plugin APIs but has never run on a device -- there is no
// native project yet. Verify it first on both platforms. Android needs
// nothing extra; iOS needs the share sheet's popover anchor on iPad.

/** Filename the shared document lands under; keep it recognisable. */
function documentFileName(title?: string): string {
  const base = (title ?? 'bhavan-document')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'bhavan-document';
  return `${base}.html`;
}

async function viewDocumentNative(html: string, title?: string): Promise<void> {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);

  const path = documentFileName(title);
  await Filesystem.writeFile({
    path,
    data: html,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  await Share.share({ title: title ?? 'Document', url: uri });
}

function viewDocumentWeb(html: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // Give the new tab time to load the blob before revoking it.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * Returns an error message on failure rather than throwing, so callers can
 * surface it. Silently doing nothing is the worst outcome here: the user
 * taps "View" on their rental agreement and cannot tell whether it failed
 * or the app is just slow.
 */
export async function viewDocument(html: string, title?: string): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      await viewDocumentNative(html, title);
      return null;
    }
    viewDocumentWeb(html);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Could not open the document.';
  }
}

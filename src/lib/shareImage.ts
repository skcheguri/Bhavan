// Hands a canvas-generated image to the OS share sheet on native.
//
// The web equivalent -- creating an <a download> and clicking it -- does
// nothing inside a Capacitor WebView: there is no download manager for the
// anchor to hand the file to, and the click is simply swallowed. So the QR
// "Download" button would look like it worked and produce no file.
//
// NOTE FOR THE MOBILE DEVELOPER: written against the documented plugin
// APIs, never run on a device. On iPad the share sheet needs a popover
// anchor or it throws; pass one if you see that.

/** Returns an error message on failure, or null on success. */
export async function shareImage(
  dataUrl: string,
  fileName: string,
  title?: string
): Promise<string | null> {
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);

    // Filesystem wants raw base64, not the full `data:image/png;base64,...`.
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);

    await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    await Share.share({ title: title ?? 'Share', files: [uri] });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Could not share the image.';
  }
}

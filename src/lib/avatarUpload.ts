import { getSupabase } from '@/lib/supabase';

/**
 * Profile pictures.
 *
 * Deliberately not folded into useListingImages: that uploader takes a
 * FileList and returns many URLs, because a listing has a gallery. A
 * person has one face. Trying to share the code would mean an array of
 * one everywhere and a caller that has to remember which element matters.
 *
 * The old file is deleted after the new one is in place, so the bucket
 * does not accumulate a copy of every picture a user ever tried. That
 * order matters: if the delete were first, a failed upload would leave
 * them with no picture at all.
 *
 * Each upload gets a fresh filename rather than overwriting a fixed one.
 * A public bucket sits behind a CDN, and reusing the path means the
 * browser and the CDN both keep serving the previous picture -- the user
 * changes it, nothing visibly happens, and they try again.
 */

const BUCKET = 'avatars';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;

export interface AvatarUploadResult {
  url: string | null;
  error: string | null;
}

export async function uploadAvatar(userId: string, file: File): Promise<AvatarUploadResult> {
  const supabase = getSupabase();
  if (!supabase) return { url: null, error: 'Database connection unavailable' };

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { url: null, error: 'Pick a JPG, PNG or WebP image.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { url: null, error: 'That image is over 2MB. Try a smaller one.' };
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });

  if (error) return { url: null, error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

/**
 * Best effort, and silent by design. A leftover file is untidy; an error
 * toast after the picture has visibly changed is confusing, because from
 * where the user is standing the thing they asked for already worked.
 */
export async function deleteAvatar(publicUrl: string | null): Promise<void> {
  if (!publicUrl) return;
  const supabase = getSupabase();
  if (!supabase) return;

  const idx = publicUrl.indexOf(PUBLIC_MARKER);
  // Anything else is a placeholder or an OAuth provider's own URL, which
  // is not ours to remove.
  if (idx === -1) return;

  await supabase.storage.from(BUCKET).remove([publicUrl.slice(idx + PUBLIC_MARKER.length)]);
}

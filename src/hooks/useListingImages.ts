import { getSupabase } from '@/lib/supabase';

const BUCKET = 'listing-images';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface UploadResult {
  urls: string[];
  errors: string[];
}

export async function uploadListingImages(
  ownerId: string,
  listingId: string,
  files: FileList | File[]
): Promise<UploadResult> {
  const supabase = getSupabase();
  if (!supabase) return { urls: [], errors: ['Database connection unavailable'] };

  const urls: string[] = [];
  const errors: string[] = [];

  for (const file of Array.from(files)) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      errors.push(`${file.name}: unsupported file type`);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}: exceeds 5MB limit`);
      continue;
    }

    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${ownerId}/${listingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      errors.push(`${file.name}: ${error.message}`);
      continue;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return { urls, errors };
}

export async function deleteListingImage(publicUrl: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Database connection unavailable' };

  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) {
    // Not a storage-hosted file (e.g. a local placeholder) -- nothing to delete server-side.
    return { error: null };
  }
  const path = publicUrl.slice(idx + marker.length);

  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) return { error: error.message };
  return { error: null };
}

-- 100: profile pictures
--
-- The profile header has rendered `user.avatar` since the beginning and
-- falls back to initials when it is null. It was always null: nothing in
-- the app ever set it, and there was no bucket to set it to. So every
-- owner and tenant saw a letter and had no way to change it.
--
-- avatar_url on users already exists and updateProfile() already writes
-- it, so this is only the storage half.
--
-- Public bucket, like listing-images. A profile picture is shown to the
-- other side of a rental conversation -- an owner looking at an enquiry,
-- a tenant looking at who owns the flat -- and those readers are not
-- always authenticated when the listing page renders. Signed URLs would
-- buy nothing here: the image is deliberately shown to strangers. The
-- private bucket in this project (ownership-documents) holds identity
-- documents, which is the opposite case.
--
-- 2MB and three image types are enforced by the bucket itself rather
-- than only in the client, because the client check is advisory: anyone
-- with the anon key can call storage directly.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Write access is scoped by the first path segment being the caller's own
-- id, the same shape listing-images uses. Without this a signed-in user
-- could overwrite somebody else's face, which is a more effective
-- impersonation than it first sounds: the picture is the thing a tenant
-- recognises when deciding whether the person messaging them is the
-- owner they met.

DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can replace their own avatar" ON storage.objects;
CREATE POLICY "Users can replace their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

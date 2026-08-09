import { useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { useDismissableLayer } from '@/hooks/useDismissableLayer';
import { uploadAvatar, deleteAvatar } from '@/lib/avatarUpload';
import { hasNativeCamera, capturePhoto, pickPhotos } from '@/lib/photoCapture';

/**
 * The profile picture, and the only way to set one.
 *
 * Both profile headers drew this tile inline and rendered initials when
 * avatar_url was null, which it always was -- so the fallback was the
 * whole feature. They are the same tile in two accent colours, hence one
 * component with a tone rather than two that will drift.
 *
 * A camera badge sits on the corner permanently instead of appearing on
 * hover: half this app's use is on a phone, where there is no hover, and
 * an affordance nobody can discover is the bug being fixed here.
 *
 * The picture is saved the moment it is chosen rather than waiting for
 * the form's Save button. The tile is outside the form, above it, and
 * next to the name -- people do not read it as a field, and a picture
 * that silently reverted because they never scrolled down would be worse
 * than not offering it.
 */

type Tone = 'amber' | 'brand';

const TONES: Record<Tone, { bg: string; text: string }> = {
  amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
  brand: { bg: 'bg-brand/20', text: 'text-brand' },
};

interface AvatarPickerProps {
  name: string;
  avatar: string | null;
  tone: Tone;
}

export default function AvatarPicker({ name, avatar, tone }: AvatarPickerProps) {
  const { user, updateProfile } = useAuth();
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const colours = TONES[tone];
  const native = hasNativeCamera();

  /**
   * Upload, point the profile at it, then clean up the old file. If the
   * profile update fails the new file is removed instead, so a failure
   * leaves nothing behind and the picture on screen still matches the
   * one in the database.
   */
  const save = async (file: File) => {
    if (!user) return;
    setBusy(true);
    const previous = avatar;

    const { url, error } = await uploadAvatar(user.id, file);
    if (error || !url) {
      setBusy(false);
      addToast(error ?? 'Could not upload that picture.', 'error');
      return;
    }

    const { error: saveError } = await updateProfile({ avatar: url });
    if (saveError) {
      await deleteAvatar(url);
      setBusy(false);
      addToast(saveError, 'error');
      return;
    }

    await deleteAvatar(previous);
    setBusy(false);
    addToast('Profile picture updated.', 'success');
  };

  const remove = async () => {
    if (!user) return;
    setBusy(true);
    const previous = avatar;
    const { error } = await updateProfile({ avatar: null });
    if (error) {
      setBusy(false);
      addToast(error, 'error');
      return;
    }
    await deleteAvatar(previous);
    setBusy(false);
    addToast('Profile picture removed.', 'success');
  };

  const fromCamera = async () => {
    const { files, error } = await capturePhoto();
    if (error) addToast(error, 'error');
    else if (files[0]) await save(files[0]);
  };

  const fromGallery = async () => {
    const { files, error } = await pickPhotos(1);
    if (error) addToast(error, 'error');
    else if (files[0]) await save(files[0]);
  };

  // On the web with no picture yet there is exactly one thing to do, so
  // the menu is skipped and the file chooser opens straight away. It
  // appears once there is a second choice to make.
  const choices: Array<{ label: string; icon: string; run: () => void }> = [];
  // Looking at it comes first: once a picture is set, the tile is 80px
  // with the face cropped square, and wanting to see the whole thing is
  // the most likely reason to tap it -- changing it is the rarer act.
  if (avatar) {
    choices.push({ label: 'View photo', icon: 'ri-eye-line', run: () => setViewerOpen(true) });
  }
  if (native) {
    choices.push({ label: 'Take photo', icon: 'ri-camera-line', run: () => void fromCamera() });
    choices.push({ label: 'Choose photo', icon: 'ri-image-line', run: () => void fromGallery() });
  } else {
    choices.push({
      label: 'Choose photo',
      icon: 'ri-image-line',
      run: () => fileInputRef.current?.click(),
    });
  }
  if (avatar) {
    choices.push({ label: 'Remove photo', icon: 'ri-delete-bin-line', run: () => void remove() });
  }

  const activate = () => {
    if (busy) return;
    if (choices.length === 1) choices[0].run();
    else setMenuOpen(true);
  };

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={activate}
        disabled={busy}
        aria-label={avatar ? 'Change profile picture' : 'Add a profile picture'}
        className={`w-20 h-20 rounded-2xl ${colours.bg} border-4 border-white flex items-center justify-center overflow-hidden cursor-pointer disabled:cursor-wait`}
      >
        {busy ? (
          <i className={`ri-loader-4-line animate-spin text-xl ${colours.text}`} />
        ) : avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className={`text-2xl font-bold ${colours.text}`}>{initials}</span>
        )}
      </button>

      <span
        aria-hidden="true"
        className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-white border border-black/5 shadow-sm flex items-center justify-center pointer-events-none"
      >
        <i className="ri-camera-line text-sm text-charcoal/60" />
      </span>

      {menuOpen && (
        <AvatarMenu
          choices={choices}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {viewerOpen && avatar && (
        <AvatarViewer src={avatar} name={name} onClose={() => setViewerOpen(false)} />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset first: picking the same file twice in a row fires no
          // change event otherwise, which reads as the app ignoring you.
          e.target.value = '';
          if (file) void save(file);
        }}
      />
    </div>
  );
}

/**
 * The picture at full size.
 *
 * Same shape as the listing gallery's lightbox -- black backdrop, close
 * in the corner, tap anywhere to dismiss -- because this is the second
 * place in the app where you look at a photo, and having the two behave
 * differently is a worse cost than the duplicated markup.
 */
function AvatarViewer({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  useDismissableLayer(onClose);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
      >
        <i className="ri-close-line text-xl" />
      </button>
      <img
        src={src}
        alt={name}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full rounded-2xl object-contain"
      />
    </div>
  );
}

/** Small anchored menu. Separate so the back-button layer registers only while it is open. */
function AvatarMenu({
  choices,
  onClose,
}: {
  choices: Array<{ label: string; icon: string; run: () => void }>;
  onClose: () => void;
}) {
  useDismissableLayer(onClose);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-0 mt-2 z-50 w-44 bg-white rounded-xl shadow-lg border border-black/5 py-1">
        {choices.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => {
              onClose();
              c.run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-charcoal hover:bg-lightgray text-left"
          >
            <i className={`${c.icon} text-base text-charcoal/50`} />
            {c.label}
          </button>
        ))}
      </div>
    </>
  );
}

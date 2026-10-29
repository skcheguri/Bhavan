import { useState } from 'react';

interface SmartImageProps {
  /** Image URL. Null/empty, or any `/placeholders/*` path, is treated as
   *  "no real photo" and renders the designed empty state instead. */
  src: string | null | undefined;
  /** Required: used as the <img> alt and as the empty state's aria-label. */
  alt: string;
  /** Applied to the <img> and, so the box keeps its size, to the empty
   *  state wrapper (object-* utilities are harmless on the div). */
  className?: string;
  /** Remix icon class for the empty state. Defaults to a house. */
  icon?: string;
  /** Above-the-fold images (e.g. a gallery's first paint) can opt out of
   *  lazy loading. Everything below the fold stays lazy. */
  eager?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

// A listing photo that is missing or fails to load must never show the
// browser's broken-image glyph (C1). This renders a real <img> when there
// is a genuine URL, and a clean, intentional empty state otherwise -- on a
// null/placeholder src up front, or on a load error at runtime.
export default function SmartImage({ src, alt, className = '', icon = 'ri-home-4-line', eager = false, onClick }: SmartImageProps) {
  const [failed, setFailed] = useState(false);

  // A `/placeholders/*` asset is our own stand-in, not a real photo, so it
  // takes the empty state too rather than being shown as if it were one.
  const isRealPhoto = !!src && !src.includes('/placeholders/');
  const showImage = isRealPhoto && !failed;

  if (!showImage) {
    return (
      <div
        role="img"
        aria-label={alt}
        onClick={onClick}
        className={`flex items-center justify-center bg-gradient-to-br from-lightgray to-offwhite ${className}`}
      >
        <i className={`${icon} text-charcoal/20 text-4xl`} aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src as string}
      alt={alt}
      onClick={onClick}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

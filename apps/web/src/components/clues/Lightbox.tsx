import type { ClueImage } from '@metabook/core';
import { useEffect } from 'react';
import { ClueImg } from './ClueImg';

/** One image, whole, over everything; a tap anywhere or Esc closes it. */
export function Lightbox({
  image,
  alt,
  onClose,
}: {
  image: ClueImage;
  alt: string;
  onClose(): void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <ClueImg image={image} alt={alt} />
      <button type="button" className="chip lightbox-close" aria-label="Close" onClick={onClose}>
        <svg className="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}

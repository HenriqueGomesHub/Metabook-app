import type { ClueImage } from '@metabook/core';
import { useState } from 'react';
import { useClueImageUrl } from '../../data/clueImages';
import { CroppedImage } from '../CroppedImage';

/**
 * A clue image: its signed URL from the private bucket, or its original URL. `cropped` shows only
 * the crop (what drills show); shimmers while loading, says so when it fails.
 */
export function ClueImg({
  image,
  alt,
  fit = 'contain',
  cropped = false,
  className = '',
}: {
  image: ClueImage;
  alt: string;
  fit?: 'cover' | 'contain';
  cropped?: boolean;
  className?: string;
}) {
  const url = useClueImageUrl(image);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  if (status === 'failed') {
    return <span className={`clue-img clue-img-missing ${className}`}>Image unavailable</span>;
  }
  return (
    <span
      className={`clue-img photo ${url && status === 'loaded' ? 'loaded' : 'loading'} ${className}`}
    >
      {url && (
        <CroppedImage
          key={url}
          className="scene-media"
          src={url}
          crop={cropped ? (image.crop ?? null) : null}
          alt={alt}
          fit={fit}
          size={{ width: image.width ?? null, height: image.height ?? null }}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('failed')}
        />
      )}
    </span>
  );
}

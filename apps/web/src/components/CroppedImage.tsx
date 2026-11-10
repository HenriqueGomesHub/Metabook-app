import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Crop } from '../data/curation';

const supportsViewBox =
  typeof CSS !== 'undefined' && !!CSS.supports?.('object-view-box', 'inset(10% 10% 10% 10%)');

const pct = (v: number) => `${+(v * 100).toFixed(3)}%`;

/** The CSS object-view-box that shows only the crop. */
export const viewBox = ({ x, y, w, h }: Crop) =>
  `inset(${pct(y)} ${pct(1 - x - w)} ${pct(1 - y - h)} ${pct(x)})`;

/**
 * An image showing only its crop, by CSS: the file itself is never changed. Uses object-view-box
 * where the browser has it, else an SVG whose viewBox is the crop (it needs the pixel size, from
 * `size` or by loading the image). `fit` is the object-fit of the cropped area.
 */
export function CroppedImage({
  src,
  crop,
  alt,
  fit,
  size,
  className,
  loading,
  onLoad,
  onError,
}: {
  src: string;
  crop: Crop | null;
  alt: string;
  fit: 'cover' | 'contain';
  size?: { width: number | null; height: number | null };
  className?: string;
  loading?: 'lazy';
  onLoad?(): void;
  onError?(): void;
}) {
  const [loaded, setLoaded] = useState<{ width: number; height: number } | null>(null);
  const fallback = !!crop && !supportsViewBox;
  const known = !!(size?.width && size.height);
  const natural = known ? { width: size!.width!, height: size!.height! } : loaded;

  useEffect(() => {
    if (!fallback || known) return;
    const probe = new Image();
    probe.onload = () => setLoaded({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => onError?.();
    probe.src = src;
  }, [fallback, known, src, onError]);
  const events = { onLoad, onError };

  if (!crop || (fallback && !natural)) {
    return (
      <img
        className={className}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        {...events}
      />
    );
  }
  if (!fallback) {
    const style = { objectFit: fit, objectViewBox: viewBox(crop) } as CSSProperties;
    return (
      <img
        className={className}
        src={src}
        alt={alt}
        style={style}
        loading={loading}
        decoding="async"
        {...events}
      />
    );
  }
  const { width, height } = natural!;
  return (
    <svg
      className={`cropped-svg${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      viewBox={`${crop.x * width} ${crop.y * height} ${crop.w * width} ${crop.h * height}`}
      preserveAspectRatio={`xMidYMid ${fit === 'cover' ? 'slice' : 'meet'}`}
    >
      <image href={src} width={width} height={height} {...events} />
    </svg>
  );
}

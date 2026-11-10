import type { MetaSubject } from '@metabook/core';
import type { ReactNode } from 'react';

// One line-icon set on a 24px grid, drawn with currentColor at the .icon stroke width, so every
// drill tile, Today count and answer screen uses the same family of marks.

export type IconName =
  | MetaSubject
  | 'flag'
  | 'script'
  | 'lookalike'
  | 'region'
  | 'areacode'
  | 'where'
  | 'clue'
  | 'streetview'
  | 'spot'
  | 'which';

export const ICONS: Record<IconName, ReactNode> = {
  // a roadside post with a reflector band and its base
  bollard: (
    <>
      <path d="M9 21V6.5a3 3 0 0 1 6 0V21" />
      <path d="M9 9.5h6" />
      <rect x="10.5" y="11" width="3" height="3" rx="0.5" />
      <path d="M6.5 21h11" />
    </>
  ),
  // a utility pole: mast, cross arm and insulators, a sagging line
  pole: (
    <>
      <path d="M12 3v18" />
      <path d="M6 7h12" />
      <path d="M7 7v-1.5" />
      <path d="M17 7v-1.5" />
      <path d="M8.5 11h7" />
      <path d="M2.5 9.5c1.5 1 3 1.2 4.5-.5" />
    </>
  ),
  // a chevron sign on a post
  sign: (
    <>
      <rect x="4" y="3.5" width="16" height="10" rx="1.5" />
      <path d="m10 6 3 2.5-3 2.5" />
      <path d="M12 13.5V21" />
    </>
  ),
  // a road in perspective with a dashed centre line
  line: (
    <>
      <path d="M8 3 4 21" />
      <path d="m16 3 4 18" />
      <path d="M12 4v2.5" />
      <path d="M12 10v3" />
      <path d="M12 16.5V20" />
    </>
  ),
  // a W-beam barrier on two posts
  guardrail: (
    <>
      <path d="M3 9.5c3 0 3 2 6 2s3-2 6-2 3 2 6 2" />
      <path d="M3 13.5c3 0 3 2 6 2s3-2 6-2 3 2 6 2" />
      <path d="M6 12v8" />
      <path d="M18 12v8" />
    </>
  ),
  // a licence plate with a country strip
  plate: (
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="2" />
      <path d="M6 7v10" />
      <path d="M9.5 12h3" />
      <path d="M15 12h3" />
    </>
  ),
  // the Google car seen from the side, its camera mast on the roof
  car: (
    <>
      <path d="M3 16.5v-3l2-4h10l3 4h2.5v3" />
      <path d="M3 16.5h1.5" />
      <path d="M9.5 16.5h4" />
      <path d="M18.5 16.5H21" />
      <circle cx="7" cy="16.5" r="2" />
      <circle cx="16" cy="16.5" r="2" />
      <path d="M10 9.5V5.5" />
      <circle cx="10" cy="4.5" r="1.5" />
    </>
  ),
  // a camera: coverage generation and quality
  coverage: (
    <>
      <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  // "Aa": letters on signs
  language: (
    <>
      <path d="m3 18 4.5-12L12 18" />
      <path d="M4.8 13.5h5.4" />
      <circle cx="17" cy="15" r="3" />
      <path d="M20 12v6" />
    </>
  ),
  // a house with a pitched roof
  architecture: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  // two mountains and the sun
  landscape: (
    <>
      <path d="m2.5 19 6-9 4 5.5 2.5-3.5 6.5 7z" />
      <circle cx="17" cy="6" r="2" />
    </>
  ),
  // a tree
  vegetation: (
    <>
      <path d="M12 21v-6" />
      <path d="M12 15c-4 0-6.5-2.5-6.5-5.5S8.5 3 12 3s6.5 3.5 6.5 6.5S16 15 12 15z" />
      <path d="m12 12-2.5-2" />
    </>
  ),
  // a set of small things: everything else
  other: (
    <>
      <circle cx="7" cy="7" r="3" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <path d="m7 14 3.5 6h-7z" />
      <path d="M17 14v6" />
      <path d="M14 17h6" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4.5h12.5l-2.5 4 2.5 4H5" />
    </>
  ),
  // a script that is not Latin
  script: (
    <>
      <path d="M4 7h7" />
      <path d="M7.5 4v3c0 4-1.5 7-3.5 9" />
      <path d="M7.5 10c1 2.5 2.5 4 4 5" />
      <path d="M14 18c1-4 2.5-9 3.5-12 1 3 2.5 8 3.5 12" />
      <path d="M15.2 14h4.6" />
    </>
  ),
  lookalike: (
    <>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </>
  ),
  region: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </>
  ),
  areacode: (
    <path d="M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" />
  ),
  // a folded map with a pin
  where: (
    <>
      <path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20z" />
      <path d="M8.5 4v13.5" />
      <path d="M15.5 6.5V20" />
    </>
  ),
  // a speech bubble with a question mark
  clue: (
    <>
      <path d="M4 5h16v11h-9l-4.5 3.5V16H4z" />
      <path d="M10 9a2 2 0 1 1 2.5 2c-.4.2-.5.5-.5 1" />
      <path d="M12 13.8v.2" />
    </>
  ),
  // a globe: Google's Street View
  streetview: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z" />
    </>
  ),
  spot: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  which: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
};

/** One icon as an inline SVG; decorative unless given a `label`. */
export function Icon({
  name,
  size = 24,
  label,
  className = 'icon',
}: {
  name: IconName;
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {ICONS[name]}
    </svg>
  );
}

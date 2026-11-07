import type { Medal as MedalKind } from '@metabook/core';

const NAMES = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' } as const;

export function Medal({ medal, size = 18 }: { medal: Exclude<MedalKind, null>; size?: number }) {
  return (
    <svg
      className="medal"
      role="img"
      aria-label={`${NAMES[medal]} medal`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
    >
      <path className="medal-ribbon" d="M8 2.5 10.5 9M16 2.5 13.5 9" />
      <circle cx="12" cy="15" r="6.5" style={{ fill: `var(--${medal})` }} />
      <circle className="medal-ring" cx="12" cy="15" r="4" />
    </svg>
  );
}

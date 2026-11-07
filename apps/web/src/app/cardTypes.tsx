import type { CardType } from '@metabook/core';
import type { ReactNode } from 'react';

export const CARD_TYPES: Record<CardType, { label: string; blurb: string; icon: ReactNode }> = {
  meta: {
    label: 'Metas',
    blurb: 'Bollards, poles, plates, lines, cars',
    icon: (
      <>
        <rect x="9" y="3.5" width="6" height="17" rx="1.5" />
        <path d="M9 8h6" />
        <path d="M9 10.5h6" />
      </>
    ),
  },
  flag: {
    label: 'Flags',
    blurb: 'True proportions, lookalikes first',
    icon: (
      <>
        <path d="M5 21V4" />
        <path d="M5 4.5h12.5l-2.5 4 2.5 4H5" />
      </>
    ),
  },
  script: {
    label: 'Scripts',
    blurb: 'Alphabets and languages on signs',
    icon: (
      <>
        <path d="M3.5 19 8.5 5l5 14" />
        <path d="M5.6 13.5h5.8" />
        <circle cx="17.5" cy="15.5" r="3" />
        <path d="M20.5 12v7" />
      </>
    ),
  },
  lookalike: {
    label: 'Lookalikes',
    blurb: 'Pairs you must never confuse',
    icon: (
      <>
        <circle cx="9" cy="12" r="5.5" />
        <circle cx="15" cy="12" r="5.5" />
      </>
    ),
  },
  region: {
    label: 'Regions',
    blurb: 'Inside one country, by landscape',
    icon: (
      <>
        <path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" />
        <circle cx="12" cy="10.5" r="2.2" />
      </>
    ),
  },
  areacode: {
    label: 'Area codes',
    blurb: 'Phone codes mapped to states',
    icon: (
      <>
        <path d="M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" />
      </>
    ),
  },
  plate: {
    label: 'Plates',
    blurb: 'Licence plate formats and colours',
    icon: (
      <>
        <rect x="2.5" y="7" width="19" height="10" rx="2" />
        <path d="M6.5 12h3" />
        <path d="M12.5 12h5" />
      </>
    ),
  },
};

export const TYPE_ORDER = Object.keys(CARD_TYPES) as CardType[];

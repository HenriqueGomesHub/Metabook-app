import type { CardType } from '@metabook/core';
import type { ReactNode } from 'react';
import { ICONS } from '../components/icons';

export const CARD_TYPES: Record<CardType, { label: string; blurb: string; icon: ReactNode }> = {
  meta: {
    label: 'Metas',
    blurb: 'Bollards, poles, plates, lines, cars',
    icon: ICONS.clue,
  },
  flag: {
    label: 'Flags',
    blurb: 'True proportions, lookalikes first',
    icon: ICONS.flag,
  },
  script: {
    label: 'Scripts',
    blurb: 'Alphabets and languages on signs',
    icon: ICONS.script,
  },
  lookalike: {
    label: 'Lookalikes',
    blurb: 'Pairs you must never confuse',
    icon: ICONS.lookalike,
  },
  region: {
    label: 'Regions',
    blurb: 'Inside one country, by landscape',
    icon: ICONS.region,
  },
  areacode: {
    label: 'Area codes',
    blurb: 'Phone codes mapped to states',
    icon: ICONS.areacode,
  },
  plate: {
    label: 'Plates',
    blurb: 'Licence plate formats and colours',
    icon: ICONS.plate,
  },
  spot: {
    label: 'Spot it',
    blurb: 'A clue’s photo: which country?',
    icon: ICONS.spot,
  },
  which: {
    label: 'Which clue',
    blurb: 'Find the country’s bollard, pole or plate',
    icon: ICONS.which,
  },
  live: {
    label: 'Live view',
    blurb: 'The clue’s own Street View spot',
    icon: ICONS.streetview,
  },
};

export const TYPE_ORDER = Object.keys(CARD_TYPES) as CardType[];

/** Types made from the clue catalogue; drills group them by clue family instead of by type. */
export const CLUE_TYPES: readonly CardType[] = ['spot', 'which', 'live'];

import type { Card, CardType } from '@metabook/core';
import type { ComponentType } from 'react';
import { AreaCodeCard } from './AreaCodeCard';
import { FlagCard } from './FlagCard';
import { LookalikeCard } from './LookalikeCard';
import { MetaCard } from './MetaCard';
import { PhotoChoiceCard } from './PhotoChoiceCard';
import { RegionCard } from './RegionCard';
import { RegionMapCard } from './RegionMapCard';
import { ScriptCard } from './ScriptCard';
import type { CardProps } from './types';

export const CARD_VIEWS: Record<CardType, ComponentType<CardProps>> = {
  flag: FlagCard,
  script: ScriptCard,
  meta: MetaCard,
  plate: MetaCard,
  region: RegionCard,
  areacode: AreaCodeCard,
  lookalike: LookalikeCard,
  'photo-choice': PhotoChoiceCard,
};

/** The view for a card outside binary rounds: regions-map cards are answered on their map. */
export const viewFor = (card: Card): ComponentType<CardProps> =>
  card.map ? RegionMapCard : CARD_VIEWS[card.type];

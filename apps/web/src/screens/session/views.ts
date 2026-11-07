import type { CardType } from '@metabook/core';
import type { ComponentType } from 'react';
import { AreaCodeCard } from './AreaCodeCard';
import { FlagCard } from './FlagCard';
import { LookalikeCard } from './LookalikeCard';
import { MetaCard } from './MetaCard';
import { RegionCard } from './RegionCard';
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
};

import { parsePairKey } from '@metabook/core';
import type { BlockTarget } from '@metabook/core';
import type { Content } from '../../data/content';
import { countryName } from '../manage/countries';

export function targetLabel(target: BlockTarget, content: Content): string {
  switch (target.kind) {
    case 'country':
      return countryName(content.pool, target.key);
    case 'pair': {
      const { picked, truth } = parsePairKey(target.key);
      return `${countryName(content.pool, truth)} / ${countryName(content.pool, picked)}`;
    }
    case 'chapter':
      return content.chapters.find((c) => c.id === target.key)?.title ?? target.key;
  }
}

/** suggestMaps names countries by their code; swap in the pool's names. */
export function suggestionText(line: string, content: Content): string {
  return line.replace(/\b[A-Z]{2}\b/g, (code) => countryName(content.pool, code));
}

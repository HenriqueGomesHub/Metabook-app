import { patternHint } from '@metabook/core';
import type { Card } from '@metabook/core';
import { patternOf, placedCodes } from '../data/areaCodes';
import './pattern-map.css';

/** After an area-code answer: the group the code belongs to, e.g. "4x = Paraná & Santa Catarina". */
export function PatternHint({ card, cards }: { card: Card; cards: Card[] }) {
  if (card.type !== 'areacode') return null;
  const hint = patternHint(
    card.country,
    card.prompt.value,
    patternOf(card.country),
    placedCodes(cards, card.country),
  );
  if (!hint) return null;
  const [form, ...rest] = hint.split(' = ');
  return (
    <p className="pattern-hint">
      <b>{form}</b> = {rest.join(' = ')}
    </p>
  );
}

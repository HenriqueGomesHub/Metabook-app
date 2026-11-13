import { patternHint } from '@metabook/core';
import type { Card } from '@metabook/core';
import { label, scopeOf } from '../app/labels';
import { patternOf, placedCodes } from '../data/areaCodes';
import './pattern-map.css';

/** After an area-code answer: the group the code belongs to, e.g. "4x = Paraná & Santa Catarina". */
export function PatternHint({
  card,
  cards,
  labelled,
}: {
  card: Card;
  cards: Card[];
  /** as a reveal section: a "Pattern" label over the hint */
  labelled?: boolean;
}) {
  if (card.type !== 'areacode') return null;
  const hint = patternHint(
    card.country,
    card.prompt.value,
    patternOf(card.country),
    placedCodes(cards, card.country),
  );
  if (!hint) return null;
  const [form, ...rest] = hint.split(' = ');
  const line = (
    <p className="pattern-hint">
      <b>{form}</b> = {rest.join(' = ')}
    </p>
  );
  if (!labelled) return line;
  // the answer's own codes first ("98, 99 = Maranhão"), then the group they sit in
  const own = cards
    .filter((c) => c.type === 'areacode' && c.country === card.country && c.answer === card.answer)
    .map((c) => c.prompt.value)
    .sort();
  const name = label(card.answer, scopeOf(card));
  return (
    <section className="reveal-section" aria-label="Pattern">
      <p className="reveal-label">Pattern</p>
      {own.length > 0 && (
        <p className="pattern-hint">
          <b>{own.join(', ')}</b> = {name}
        </p>
      )}
      {line}
    </section>
  );
}

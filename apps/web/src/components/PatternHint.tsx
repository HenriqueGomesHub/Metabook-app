import { patternHint } from '@metabook/core';
import type { Card } from '@metabook/core';
import { label, scopeOf } from '../app/labels';
import { isZoneCard, patternOf, placedCodes } from '../data/areaCodes';
import './pattern-map.css';

/** "11, 12, 13, 14" → "11–14"; runs of three or more codes read as a range. */
function codeRuns(codes: string[]): string {
  const runs: string[][] = [];
  for (const code of codes) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    if (run && last && Number(code) === Number(last) + 1 && code.length === last.length)
      run.push(code);
    else runs.push([code]);
  }
  return runs.flatMap((run) => (run.length >= 3 ? [`${run[0]}–${run.at(-1)}`] : run)).join(', ');
}

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
  // an area card's verdict already names the area; the tip is what's left to add
  if (isZoneCard(card)) {
    const tip = patternOf(card.country)?.tip;
    return tip ? <p className="pattern-hint">{tip}</p> : null;
  }
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
          <b>{codeRuns(own)}</b> = {name}
        </p>
      )}
      {/* "1x = São Paulo" under "11, 12 … = São Paulo" says nothing new */}
      {(own.length === 0 || rest.join(' = ').trim() !== name) && line}
    </section>
  );
}

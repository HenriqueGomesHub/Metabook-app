// Content check on the shipped catalogue: a clue question never offers a country that shares the
// answer's tell. A learner who knows "the same design is in western Ukraine" must not be marked
// wrong for picking Ukraine, and the reveal must not teach a difference that is not there.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clueCards } from './clueCards';
import type { ClueCountry } from './clues';
import type { PoolCountry } from './types';

const dir = new URL('../../../content/clues/', import.meta.url);
const read = <T>(path: URL) => JSON.parse(readFileSync(path, 'utf8')) as T;
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
const shipped = files.sort().map((f) => read<ClueCountry>(new URL(f, dir)));
const pool = read<PoolCountry[]>(new URL('../pool.json', dir));

/** Summary sentences saying another country has the same thing. */
const SHARING = /\b(same|shares?|shared|identical)\b/i;

describe('shipped clue questions', () => {
  it('never offer a country the clue says shares its tell', () => {
    const clues = new Map(shipped.flatMap((c) => c.clues.map((clue) => [clue.id, clue] as const)));
    const byCode = new Map(pool.map((c) => [c.code.toUpperCase(), c.name]));
    const bad: string[] = [];
    let checked = 0;
    for (const card of clueCards({ clues: shipped, pool })) {
      if (card.type !== 'spot' && card.type !== 'live') continue;
      const clue = card.clue && clues.get(card.clue.id);
      if (!clue) continue;
      const offered = new Set([...(card.options ?? []), ...(card.clue?.distractors ?? [])]);
      offered.delete(card.answer);
      const twins = new Set(
        (clue.sameAs ?? []).map((code) => byCode.get(code.toUpperCase())).filter(Boolean),
      );
      const sharing = (clue.summary ?? '').split(/(?<=[.;!?])\s+/).filter((s) => SHARING.test(s));
      if (twins.size || sharing.length) checked++;
      for (const name of offered) {
        const named = sharing.some((s) => new RegExp(`\\b${name}\\b`).test(s));
        if (twins.has(name) || named) bad.push(`${card.id}: offers ${name}`);
      }
    }
    expect(bad).toEqual([]);
    // the check really ran: hundreds of clues name a country that shares them
    expect(checked).toBeGreaterThan(100);
    const poland = clueCards({ clues: shipped, pool }).find(
      (c) =>
        c.type === 'spot' &&
        c.answer === 'Poland' &&
        c.clue?.id &&
        clues.get(c.clue.id)?.sameAs?.includes('UA'),
    );
    expect(poland?.options).toHaveLength(4);
    expect(poland?.options).not.toContain('Ukraine');
  }, 30_000);
});

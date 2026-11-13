import type { Card } from '@metabook/core';
import { describe, expect, it } from 'vitest';
import { optionsFor } from './options';

const card = (over: Partial<Card>): Card =>
  ({
    id: 'c',
    type: 'script',
    answer: 'Kazakhstan',
    country: 'KZ',
    prompt: { kind: 'text', value: 'Қазақстан' },
    ...over,
  }) as Card;

/** How often, over many draws, the answer lands at each position. */
function positions(draw: () => string[], answer: string, runs = 400): number[] {
  const at: number[] = [];
  for (let i = 0; i < runs; i++) {
    const n = draw().indexOf(answer);
    at[n] = (at[n] ?? 0) + 1;
  }
  return at;
}

describe('optionsFor', () => {
  it('offers the flags people mix up against a flag', () => {
    const flag = (code: string, answer: string) =>
      card({ id: code, type: 'flag', country: code, answer });
    const deck = [
      flag('TD', 'Chad'),
      flag('RO', 'Romania'),
      flag('AD', 'Andorra'),
      flag('MD', 'Moldova'),
      ...['JP', 'BR', 'ZA', 'CA', 'IN', 'KE', 'AR'].map((c) => flag(c, c)),
    ];
    const chad = deck[0] as Card;
    const options = optionsFor({ cardId: 'TD', mode: 'mcq' }, chad, deck, Math.random);
    expect(new Set(options)).toEqual(new Set(['Chad', 'Romania', 'Andorra', 'Moldova']));
  });

  it('never leaves an authored answer in a fixed place', () => {
    const c = card({ options: ['Kazakhstan', 'Mongolia', 'Russia', 'Kyrgyzstan'] });
    const at = positions(
      () => optionsFor({ cardId: 'c', mode: 'mcq' }, c, [c], Math.random),
      'Kazakhstan',
    );
    expect(at.filter(Boolean)).toHaveLength(4);
  });

  it('swaps the sides of a binary card and of a contrast round', () => {
    const c = card({ type: 'lookalike', answer: 'Spain', options: ['Spain', 'Portugal'] });
    expect(
      positions(() => optionsFor({ cardId: 'c', mode: 'binary' }, c, [c], Math.random), 'Spain'),
    ).toHaveLength(2);
    const flag = card({ type: 'flag', answer: 'Chad', country: 'TD' });
    const romania = card({ id: 'r', type: 'flag', answer: 'Romania', country: 'RO' });
    const item = {
      cardId: 'c',
      mode: 'binary' as const,
      contrastPair: ['Romania', 'Chad'] as [string, string],
    };
    expect(
      positions(() => optionsFor(item, flag, [flag, romania], Math.random), 'Chad'),
    ).toHaveLength(2);
  });
});

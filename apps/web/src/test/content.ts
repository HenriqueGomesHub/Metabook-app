import type { Card, CardState, Tip } from '@metabook/core';
import type { Content } from '../data/content';

const flag = (code: string, answer: string, aliases?: string[]): Card => ({
  id: `flag:${code}`,
  type: 'flag',
  country: code.toUpperCase(),
  answer,
  ...(aliases && { aliases }),
  prompt: { kind: 'flag', value: code, ratio: '3:5' },
  tags: ['baltics'],
  source: 'https://example.com',
});

export const cards: Card[] = [
  flag('lt', 'Lithuania', ['Lietuva']),
  flag('lv', 'Latvia'),
  flag('ee', 'Estonia'),
];

export const tips: Tip[] = [
  {
    id: 'lt-1',
    answer: 'Lithuania',
    scope: 'flag',
    text: 'Yellow, green, red.',
    source: 'https://example.com',
  },
  {
    id: 'lt-2',
    answer: 'Lithuania',
    scope: 'any',
    text: 'Place names end in -ai.',
    source: 'https://example.com',
  },
];

export const content: Content = {
  pool: [],
  chapters: [],
  cards,
  tips,
  clues: [],
  clueOverrides: [],
};

/** A card in review, due an hour ago, past its multiple-choice reviews. */
export function dueState(cardId: string, now = new Date()): CardState {
  return {
    cardId,
    due: new Date(now.getTime() - 3_600_000).toISOString(),
    stability: 5,
    difficulty: 5,
    elapsedDays: 5,
    scheduledDays: 5,
    reps: 3,
    lapses: 0,
    state: 'review',
    lastReview: new Date(now.getTime() - 5 * 86_400_000).toISOString(),
  };
}

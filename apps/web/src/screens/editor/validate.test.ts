import { describe, expect, it } from 'vitest';
import { cardToForm, formToCard } from './validate';
import type { EditableCard } from './validate';

describe('card form round trip', () => {
  it('keeps image alt, credit and credit URL', () => {
    const card: EditableCard = {
      id: 'meta:1',
      type: 'meta',
      country: 'LT',
      answer: 'Lithuania',
      prompt: {
        kind: 'image',
        value: 'https://example.com/a.jpg',
        alt: 'A road',
        credit: 'Ana · CC BY',
        creditUrl: 'https://example.com/ana',
      },
      tags: [],
      source: 'https://example.com',
      verified: true,
    };
    expect(formToCard(cardToForm(card))).toEqual(card);
  });
});

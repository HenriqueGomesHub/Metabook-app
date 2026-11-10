import type { Card } from '@metabook/core';
import { DEFAULT_SETTINGS } from '@metabook/core';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../../test/MemoryRepository';
import { renderApp } from '../../test/render';

const clue: Card = {
  id: 'gen:br:note:sign-chevrons',
  type: 'meta',
  country: 'BR',
  answer: 'Brazil',
  options: ['Brazil', 'Argentina', 'Chile', 'Peru'],
  prompt: { kind: 'text', value: 'Chevrons are yellow on black.' },
  tags: ['americas', 'sign', 'generated', 'clue-text'],
  subject: 'sign',
  source: 'https://example.com',
};
const flag: Card = {
  id: 'flag:br',
  type: 'flag',
  country: 'BR',
  answer: 'Brazil',
  prompt: { kind: 'flag', value: 'br' },
  tags: [],
  source: 'https://example.com',
};

vi.mock('../../data/content', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadContent: async () => ({ pool: [], chapters: [], cards: [clue, flag], tips: [] }),
}));

const repo = () => {
  const r = new MemoryRepository();
  r.settings = { ...DEFAULT_SETTINGS, newPerDay: 5 };
  return r;
};

describe('Clue quiz', () => {
  it('asks "Which country has: <clue>?", not "Where is this?"', async () => {
    renderApp('/session?clue=1', repo());
    expect(
      await screen.findByText((_, el) =>
        el?.className === 'clue'
          ? el.textContent === 'Which country has: Chevrons are yellow on black?'
          : false,
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Where is this?')).toBeNull();
    expect(screen.getByRole('button', { name: /Argentina/ })).toBeTruthy();
  });

  it('keeps clue cards out of their subject’s practice', async () => {
    renderApp('/session?subject=sign', repo());
    expect(await screen.findByText('No cards here yet')).toBeTruthy();
  });

  it('keeps clue cards out of the daily session', async () => {
    renderApp('/session', repo());
    // the flag is the only card: one item, then the session is done
    expect(await screen.findByText('1 / 1')).toBeTruthy();
    expect(screen.queryByText(/Chevrons/)).toBeNull();
  });
});

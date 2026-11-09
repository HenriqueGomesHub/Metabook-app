import type { Card } from '@metabook/core';
import { DEFAULT_SETTINGS } from '@metabook/core';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../../test/MemoryRepository';
import { renderApp } from '../../test/render';
import { stateNameFrom } from './verdict';

const card: Card = {
  id: 'gen:pl:where:a',
  type: 'region',
  country: 'PL',
  answer: 'MZ',
  prompt: { kind: 'text', value: 'Concrete poles with holes.' },
  tags: ['generated', 'where'],
  subject: 'pole',
  explain: 'Concrete poles with holes. (Masovian Voivodeship)',
  map: 'pl',
  source: 'https://example.com',
};
const flag: Card = {
  id: 'flag:pl',
  type: 'flag',
  country: 'PL',
  answer: 'Poland',
  prompt: { kind: 'flag', value: 'pl' },
  tags: [],
  source: 'https://example.com',
};

// the map never loads (offline, chunk gone)
vi.mock('../../data/content', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadContent: async () => ({ pool: [], chapters: [], cards: [card, flag], tips: [] }),
  loadRegionMap: async () => {
    throw new Error('offline');
  },
  loadedRegionMap: () => undefined,
}));

const repo = () => {
  const r = new MemoryRepository();
  r.settings = { ...DEFAULT_SETTINGS, newPerDay: 5 };
  return r;
};

describe('RegionMapCard without its map', () => {
  it('shows the state from explain, grades nothing and brings the card back', async () => {
    const r = repo();
    renderApp('/session?map=1', r);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The map of Poland could not be loaded.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show the answer' }));
    expect(screen.getByText(/It’s Masovian Voivodeship\./)).toBeTruthy();
    expect(screen.queryByText(/\bMZ\b/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    // the only card in scope comes back, unanswered
    expect(await screen.findByRole('button', { name: 'Show the answer' })).toBeTruthy();
    expect(screen.getByText('0 answered')).toBeTruthy();
    expect(r.reviews).toEqual([]);
    expect(r.cardStates).toEqual([]);
    expect(r.confusions).toEqual([]);
  });

  it('requeues a skipped card at the back of today’s session', async () => {
    const r = repo();
    renderApp('/session', r);
    expect(await screen.findByText('1 / 2')).toBeTruthy();
    // the flag may come first; answer it to reach the map card
    if (!screen.queryByRole('alert')) {
      fireEvent.click(await screen.findByRole('button', { name: /Poland/ }));
      fireEvent.keyDown(window, { key: ' ' });
    }
    const before = r.reviews.length;
    fireEvent.click(await screen.findByRole('button', { name: 'Show the answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.getByText(/ \/ 3$/)).toBeTruthy();
    expect(r.reviews).toHaveLength(before);
  });

  it('reads the state name, nested parentheses and all, from explain', () => {
    expect(stateNameFrom('Pampas grass. (Buenos Aires (B))')).toBe('Buenos Aires (B)');
    expect(stateNameFrom('No state here.')).toBeUndefined();
    expect(stateNameFrom(undefined)).toBeUndefined();
  });
});

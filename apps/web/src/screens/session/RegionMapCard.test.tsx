import type { Card } from '@metabook/core';
import { DEFAULT_SETTINGS } from '@metabook/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { label } from '../../app/labels';
import { MemoryRepository } from '../../test/MemoryRepository';
import { renderApp } from '../../test/render';

// answered on Poland's real regions map, content/maps/pl-regions.json
const where = (id: string, answer: string, text: string): Card => ({
  id: `gen:pl:where:${id}`,
  type: 'region',
  country: 'PL',
  answer,
  prompt: { kind: 'text', value: text },
  tags: ['europe', 'pole', 'generated', 'where'],
  subject: 'pole',
  explain: `${text} (${answer})`,
  map: 'pl',
  source: 'https://example.com',
});

const card = where('a', 'MZ', 'Concrete poles with holes.');
const flag: Card = {
  id: 'flag:pl',
  type: 'flag',
  country: 'PL',
  answer: 'Poland',
  prompt: { kind: 'flag', value: 'pl' },
  tags: [],
  subject: 'pole',
  source: 'https://example.com',
};

vi.mock('../../data/content', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadContent: async () => ({ pool: [], chapters: [], cards: [card, flag], tips: [] }),
}));

const repo = () => {
  const r = new MemoryRepository();
  r.settings = { ...DEFAULT_SETTINGS, newPerDay: 5 };
  return r;
};

const MAP = 'Map of Poland with region borders';

describe('RegionMapCard', () => {
  it('loads the map, then marks the pick and the true state and names both', async () => {
    const r = repo();
    renderApp('/session?map=1', r);
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Loading the map…');
    const map = await screen.findByRole('group', { name: MAP });
    expect(screen.getByText('Where in Poland?')).toBeTruthy();
    expect(screen.getByText('Concrete poles with holes.')).toBeTruthy();

    fireEvent.click(within(map).getByRole('button', { name: 'Opole Voivodeship' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Not quite — it’s Masovian Voivodeship',
    });
    expect(within(dialog).getByText('You said Opole Voivodeship')).toBeTruthy();
    expect(within(dialog).getByText('Concrete poles with holes. (MZ)')).toBeTruthy();
    // the pick, the answer and the line between them; the map locks
    expect(map.querySelector('.ddd-state.pick')?.getAttribute('aria-label')).toBe(
      'Opole Voivodeship',
    );
    expect(map.querySelector('.ddd-state.ans')?.getAttribute('aria-label')).toBe(
      'Masovian Voivodeship',
    );
    expect(map.querySelector('.ddd-trail')).toBeTruthy();
    expect(
      within(map)
        .getByRole('button', { name: 'Masovian Voivodeship' })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    // confusions keep the state codes scoped to the map, and labels resolve them through it
    await waitFor(() => expect(r.confusions[0]).toMatchObject({ picked: 'pl:OP', truth: 'pl:MZ' }));
    expect(r.reviews[0]).toMatchObject({ cardId: card.id, correct: false, answerGiven: 'OP' });
    expect(label('OP', 'pl')).toBe('Opole Voivodeship');
    expect(label('pl:OP')).toBe('Opole Voivodeship');
  });

  it('answers from the keyboard', async () => {
    const r = repo();
    renderApp('/session?map=1', r);
    const map = await screen.findByRole('group', { name: MAP });
    const state = within(map).getByRole('button', { name: 'Masovian Voivodeship' });
    expect(state.getAttribute('tabindex')).toBe('0');
    state.focus();
    fireEvent.keyDown(state, { key: 'Enter' });
    expect(await screen.findByRole('dialog', { name: 'Got it' })).toBeTruthy();
    expect(screen.getByText('Masovian Voivodeship', { selector: '.reveal-head p' })).toBeTruthy();
    await waitFor(() => expect(r.reviews[0]).toMatchObject({ correct: true, answerGiven: 'MZ' }));
  });

  it('keeps map cards out of their subject’s practice', async () => {
    renderApp('/session?subject=pole', repo());
    expect(await screen.findByRole('heading', { name: 'Which country?' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: MAP })).toBeNull();
  });

  it('leaves map cards out of a country’s Basics practice (map=0)', async () => {
    renderApp('/session?country=PL&map=0', repo());
    expect(await screen.findByRole('heading', { name: 'Which country?' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: MAP })).toBeNull();
  });

  it('names map-scoped confusions with the map’s states on Today, loading the map', async () => {
    const r = repo();
    r.confusions = [
      {
        picked: 'pl:OP',
        truth: 'pl:MZ',
        count: 3,
        lastSeen: new Date().toISOString(),
        contrastStreak: 0,
      },
    ];
    renderApp('/', r);
    expect(await screen.findByText('Opole Voivodeship / Masovian Voivodeship')).toBeTruthy();
  });
});

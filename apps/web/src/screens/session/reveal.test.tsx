import type { Card, Tip } from '@metabook/core';
import { DEFAULT_SETTINGS } from '@metabook/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../../test/MemoryRepository';
import { renderApp } from '../../test/render';

const text = (
  id: string,
  type: Card['type'],
  country: string,
  answer: string,
  value: string,
): Card => ({
  id,
  type,
  country,
  answer,
  prompt: { kind: 'text', value },
  tags: [],
  source: 'https://example.com',
});
const tip = (id: string, answer: string, scope: string): Tip => ({
  id,
  answer,
  scope,
  text: `Tip ${id}`,
  source: 'https://example.com',
});

const cards = [
  text('ddd:br:11', 'areacode', 'BR', 'SP', '11'),
  text('ddd:br:31', 'areacode', 'BR', 'MG', '31'),
  text('ddd:br:71', 'areacode', 'BR', 'BA', '71'),
  text('ddd:br:21', 'areacode', 'BR', 'RJ', '21'),
  text('region:1', 'region', 'BR', 'north', 'a'),
  text('region:2', 'region', 'BR', 'northeast', 'b'),
  text('region:3', 'region', 'BR', 'south', 'c'),
];
const tips = [
  tip('p1', 'ddd:br:pattern', 'areacode'),
  tip('n1', 'northeast', 'region'),
  tip('r1', 'north', 'region'),
  tip('r2', 'north', 'region'),
];

vi.mock('../../data/content', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadContent: async () => ({ pool: [], chapters: [], cards, tips }),
}));

const repo = (newPerDay = 1) => {
  const r = new MemoryRepository();
  r.settings = { ...DEFAULT_SETTINGS, newPerDay };
  return r;
};

describe('Session reveal', () => {
  it('answers area codes on the map and falls back to the pattern tip', async () => {
    const r = repo();
    renderApp('/session?type=areacode', r);
    await screen.findByRole('group', { name: 'Map of Brazil with state borders' });
    const code = document.querySelector('.areacode')?.textContent;
    const answer = cards.find((c) => c.type === 'areacode' && c.prompt.value === code) as Card;
    const name = { SP: 'São Paulo', MG: 'Minas Gerais', BA: 'Bahia', RJ: 'Rio de Janeiro' }[
      answer.answer
    ] as string;
    fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByRole('dialog', { name: 'Got it' })).toBeTruthy();
    expect(screen.getByText('Tip p1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Another tip' })).toBeNull();
    // the map locks once answered
    expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe('true');
    await waitFor(() => expect(r.reviews[0]).toMatchObject({ cardId: answer.id, correct: true }));
  });

  it('names the right state when the map pick is wrong', async () => {
    const r = repo();
    renderApp('/session?type=areacode', r);
    await screen.findByRole('group', { name: 'Map of Brazil with state borders' });
    fireEvent.click(screen.getByRole('button', { name: 'Amazonas' }));
    const dialog = screen.getByRole('dialog', { name: /^Not quite — it’s / });
    expect(within(dialog).getByText('You said Amazonas')).toBeTruthy();
    await waitFor(() => expect(r.confusions[0]).toMatchObject({ picked: 'AM' }));
  });

  it('labels regions in options and verdicts, and offers another tip only for the main tip', async () => {
    renderApp('/session?type=region', repo(3));
    for (let i = 0; i < 3; i++) {
      const buttons = await screen.findAllByRole('button', { name: /^\d/ });
      expect(buttons.map((b) => b.textContent).join()).not.toMatch(/northeast|\bnorth\b/);
      fireEvent.click(buttons[0] as HTMLElement);
      // Only the answer's own tip box counts toward "Another tip"; aside tips rotate separately.
      const rotates = screen.queryByText('Tip 1 of 2') ?? screen.queryByText('Tip 2 of 2');
      expect(!!screen.queryByRole('button', { name: 'Another tip' })).toBe(!!rotates);
      fireEvent.keyDown(window, { key: ' ' });
    }
  });

  it('shows an all-caught-up state with links when nothing is due', async () => {
    renderApp('/session', repo(0));
    expect(await screen.findByRole('region', { name: 'All caught up' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Drills/ }).getAttribute('href')).toBe('/drills');
    expect(screen.getByRole('link', { name: 'Mini-games' }).getAttribute('href')).toBe('/games');
  });

  it('leaves contrast rounds out of a country-filtered session', async () => {
    const r = repo(4);
    r.confusions = [
      {
        picked: 'SP',
        truth: 'MG',
        count: 3,
        lastSeen: new Date().toISOString(),
        contrastStreak: 0,
      },
    ];
    renderApp('/session?country=BR&type=region', r);
    await screen.findByRole('heading', { name: 'Which region?' });
    expect(screen.queryByText('Contrast round')).toBeNull();
  });
});

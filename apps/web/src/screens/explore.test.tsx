import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Card, CardState, Tip } from '@metabook/core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppDataProvider } from '../app/AppData';
import type { Content } from '../data/content';
import { MemoryRepository } from '../test/MemoryRepository';
import { AreaCodeGame } from './AreaCodeGame';
import { Atlas } from './Atlas';
import { Country } from './Country';
import { Games } from './Games';
import { Stats } from './Stats';

const ddd = (code: string, answer: string): Card => ({
  id: `ddd:br:${code}`,
  type: 'areacode',
  country: 'BR',
  answer,
  prompt: { kind: 'text', value: code },
  tags: ['brazil'],
  chapter: 'br:areacodes',
  source: 'https://example.com',
});

const cards: Card[] = [ddd('11', 'SP'), ddd('21', 'RJ'), ddd('31', 'MG')];
const tips: Tip[] = [
  {
    id: 'tip-1',
    answer: 'ddd:br:pattern',
    scope: 'areacode',
    text: 'The first digit groups the states.',
    source: 'https://example.com',
  },
];
const content: Content = {
  pool: [
    { code: 'BR', name: 'Brazil', continent: 'americas', in_pool: true },
    { code: 'AR', name: 'Argentina', continent: 'americas', in_pool: true },
    { code: 'LT', name: 'Lithuania', continent: 'europe', in_pool: true },
  ],
  chapters: [
    { id: 'br:areacodes', country: 'BR', order: 1, title: 'Area codes', subtitle: 'DDD codes' },
  ],
  cards,
  tips,
};

vi.mock('../data/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/content')>()),
  loadContent: async () => content,
}));

const strong = (cardId: string): CardState => ({
  cardId,
  due: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  stability: 200,
  difficulty: 5,
  elapsedDays: 0,
  scheduledDays: 30,
  reps: 6,
  lapses: 0,
  state: 'review',
  lastReview: new Date().toISOString(),
});

function mount(path: string, repo = new MemoryRepository()) {
  const auth = {
    getSession: async () => ({ id: 'local', name: 'Tom Reyes' }),
    signInWithEmail: async () => undefined,
    signOut: async () => undefined,
    onAuthChange: () => () => undefined,
  };
  render(
    <AppDataProvider repo={repo} auth={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/atlas" element={<Atlas />} />
          <Route path="/atlas/:country" element={<Country />} />
          <Route path="/games" element={<Games />} />
          <Route path="/games/areacode/br" element={<AreaCodeGame />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </MemoryRouter>
    </AppDataProvider>,
  );
  return repo;
}

describe('Atlas', () => {
  it('shows a gold medal and the tally for a country at 80% or more', async () => {
    mount('/atlas', new MemoryRepository({ cardStates: cards.map((c) => strong(c.id)) }));
    const tile = await screen.findByRole('link', { name: /Brazil/ });
    expect(within(tile).getByRole('img', { name: 'Gold medal' })).toBeTruthy();
    expect(tile.getAttribute('href')).toBe('/atlas/BR');
    expect(screen.getByText(/1 gold · 80%\+/)).toBeTruthy();
  });

  it('shows a dash for countries without cards', async () => {
    mount('/atlas');
    const tile = await screen.findByRole('link', { name: /Argentina/ });
    expect(within(tile).getByText('—')).toBeTruthy();
    expect(within(tile).queryByRole('img')).toBeNull();
  });
});

describe('Country', () => {
  it('lists chapters and links the area-code chapter to its game', async () => {
    mount('/atlas/BR');
    expect(await screen.findByRole('heading', { name: 'Brazil' })).toBeTruthy();
    const link = screen.getByRole('link', { name: /Area codes/ });
    expect(link.getAttribute('href')).toBe('/games/areacode/br');
    expect(screen.getByRole('link', { name: /Study Brazil/ }).getAttribute('href')).toBe(
      '/session?country=BR',
    );
    const toggle = screen.getByRole('button', { name: 'Add to focus' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Games', () => {
  it('only links the playable Brazil area-code game', async () => {
    mount('/games');
    expect((await screen.findByRole('link', { name: /Brazil/ })).getAttribute('href')).toBe(
      '/games/areacode/br',
    );
    expect(screen.queryByRole('link', { name: /Japan/ })).toBeNull();
  });
});

describe('AreaCodeGame', () => {
  it('scores 5000 for the right state and shows the pattern tip', async () => {
    const repo = mount('/games/areacode/br');
    const code = (await screen.findByText(/^(11|21|31)$/)).textContent as string;
    const card = cards.find((c) => c.prompt.value === code) as Card;
    const stateName = { SP: 'São Paulo', RJ: 'Rio de Janeiro', MG: 'Minas Gerais' }[card.answer];

    fireEvent.click(screen.getByRole('button', { name: stateName }));

    expect(await screen.findByText('Exactly right')).toBeTruthy();
    expect(screen.getAllByText('5,000')).toHaveLength(1);
    expect(screen.getByText('5,000 pts')).toBeTruthy();
    expect(screen.getByText('The first digit groups the states.')).toBeTruthy();
    await waitFor(() => expect(repo.reviews[0]).toMatchObject({ cardId: card.id, correct: true }));
    expect(repo.tipViews.map((v) => v.tipId)).toEqual(['tip-1']);
  });

  it('records a miss with a distance penalty', async () => {
    const repo = mount('/games/areacode/br');
    const code = (await screen.findByText(/^(11|21|31)$/)).textContent as string;
    const card = cards.find((c) => c.prompt.value === code) as Card;
    fireEvent.click(screen.getByRole('button', { name: 'Amazonas' }));

    expect(await screen.findByText('You picked Amazonas')).toBeTruthy();
    await waitFor(() =>
      expect(repo.confusions).toMatchObject([{ picked: 'AM', truth: card.answer }]),
    );
  });
});

describe('Stats', () => {
  it('renders KPIs with empty data', async () => {
    mount('/stats');
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeTruthy();
    expect(screen.getByText('Retention', { selector: '.kpi-label' })).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getByText('Cards learned').previousElementSibling?.textContent).toBe('0');
    expect(screen.getByText('No confusions yet.')).toBeTruthy();
  });
});

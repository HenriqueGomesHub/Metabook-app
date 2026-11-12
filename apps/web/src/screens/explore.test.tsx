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
import { Drills } from './Drills';
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

const meta = (id: string, subject: Card['subject']): Card => ({
  id,
  type: 'meta',
  country: 'CL',
  answer: 'Chile',
  prompt: { kind: 'text', value: id },
  tags: ['generated'],
  subject,
  source: 'https://example.com',
});

/** a clue answered on Colombia's real regions map (content/maps/co-regions.json) */
const where = (id: string, answer: string): Card => ({
  id: `gen:co:where:${id}`,
  type: 'region',
  country: 'CO',
  answer,
  prompt: { kind: 'text', value: id },
  tags: ['generated', 'where'],
  subject: 'pole',
  map: 'co',
  source: 'https://example.com',
});

const cards: Card[] = [
  where('a', 'ANT'),
  where('b', 'BOY'),
  ddd('11', 'SP'),
  ddd('21', 'RJ'),
  ddd('31', 'MG'),
  meta('gen:cl:sign', 'sign'),
  meta('gen:cl:bollard', 'bollard'),
  meta('gen:cl:bollard:2', 'bollard'),
  meta('gen:cl:bollard:3', 'bollard'),
  meta('gen:cl:drive', 'other'),
  // a text-only fact: Learn list and Clue quiz only, never a subject tile or chapter
  { ...meta('gen:cl:note:guardrail', 'guardrail'), tags: ['generated', 'clue-text'] },
];
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
    { code: 'CL', name: 'Chile', continent: 'americas', in_pool: true },
    { code: 'LT', name: 'Lithuania', continent: 'europe', in_pool: true },
    { code: 'CO', name: 'Colombia', continent: 'americas', in_pool: true },
  ],
  chapters: [
    { id: 'br:areacodes', country: 'BR', order: 1, title: 'Area codes', subtitle: 'DDD codes' },
    { id: 'br:poles', country: 'BR', order: 2, title: 'Poles', subtitle: 'Utility poles' },
  ],
  cards,
  tips,
  clues: [],
  clueOverrides: [],
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
    verifyEmailCode: async () => undefined,
    signOut: async () => undefined,
    onAuthChange: () => () => undefined,
  };
  render(
    <AppDataProvider repo={repo} auth={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/atlas" element={<Atlas />} />
          <Route path="/atlas/:country" element={<Country />} />
          <Route path="/drills" element={<Drills />} />
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
    const brazil = cards.filter((c) => c.country === 'BR');
    mount('/atlas', new MemoryRepository({ cardStates: brazil.map((c) => strong(c.id)) }));
    const tile = await screen.findByRole('link', { name: /Brazil/ });
    expect(within(tile).getByRole('img', { name: 'Gold medal' })).toBeTruthy();
    expect(tile.getAttribute('href')).toBe('/atlas/BR');
    expect(screen.getByText(/1 gold/)).toBeTruthy();
  });

  it('shows a dash for countries without cards', async () => {
    mount('/atlas');
    const tile = await screen.findByRole('link', { name: /Argentina/ });
    expect(within(tile).getByText('—')).toBeTruthy();
    expect(within(tile).queryByRole('img')).toBeNull();
  });
});

describe('Subjects', () => {
  it('gives a country without written chapters a chapter per subject with 3+ cards, then Basics', async () => {
    mount('/atlas/CL');
    const nav = await screen.findByRole('navigation', { name: 'Chile chapters' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.querySelector('.chapter-title')?.textContent)).toEqual([
      'Bollards',
      'Basics',
    ]);
    expect(links[0]?.getAttribute('href')).toBe('/session?country=CL&subject=bollard');
    // Basics practises every non-map card of the country
    expect(links[1]?.getAttribute('href')).toBe('/session?country=CL&map=0');
  });

  it('gives regions-map cards their own drill tile', async () => {
    mount('/drills');
    expect(
      (await screen.findByText('Where in the country')).closest('a')?.getAttribute('href'),
    ).toBe('/session?map=1');
    // family tiles come from the clue catalogue only
    expect(screen.queryByText('Bollards')).toBeNull();
    expect(screen.queryByText('Poles')).toBeNull();
  });

  it('keeps clue-text cards out of subject tiles and gives them a Clue quiz tile', async () => {
    mount('/drills');
    expect((await screen.findByText('Clue quiz')).closest('a')?.getAttribute('href')).toBe(
      '/session?clue=1',
    );
    expect(screen.queryByText('Guardrails')).toBeNull();
  });
});

describe('Country', () => {
  it('lists chapters and links the area-code chapter to its pattern page', async () => {
    mount('/atlas/BR');
    expect(await screen.findByRole('heading', { name: 'Brazil' })).toBeTruthy();
    const link = screen.getByRole('link', { name: /Area codes/ });
    expect(link.getAttribute('href')).toBe('/areacodes/br');
    expect(screen.getByRole('link', { name: /Study Brazil/ }).getAttribute('href')).toBe(
      '/session?country=BR',
    );
    expect(screen.queryByRole('link', { name: /Poles/ })).toBeNull();
    expect(screen.getByText('No cards yet')).toBeTruthy();
  });

  it('gives regions-map cards a chapter and names their misses from the map', async () => {
    const confusion = {
      picked: 'co:BOY',
      truth: 'co:ANT',
      count: 2,
      lastSeen: new Date().toISOString(),
      contrastStreak: 0,
    };
    mount('/atlas/CO', new MemoryRepository({ confusions: [confusion] }));
    const nav = await screen.findByRole('navigation', { name: 'Colombia chapters' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.querySelector('.chapter-title')?.textContent)).toEqual([
      'Where in Colombia',
    ]);
    expect(links[0]?.getAttribute('href')).toBe('/session?country=CO&map=1');
    // misses have their own tab
    fireEvent.click(screen.getByRole('tab', { name: /Misses · 1/ }));
    expect(await screen.findByText('Boyacá / Antioquia')).toBeTruthy();
  });

  it('persists the focus toggle in settings', async () => {
    const repo = mount('/atlas/BR');
    fireEvent.click(await screen.findByRole('button', { name: 'Add to focus' }));
    const toggle = await screen.findByRole('button', { name: 'In this week’s focus' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect((await repo.getSettings()).focusCountries).toEqual(['BR']);
  });
});

describe('Games', () => {
  it('only links the playable Brazil area codes, through their pattern page', async () => {
    mount('/games');
    expect((await screen.findByRole('link', { name: /Brazil/ })).getAttribute('href')).toBe(
      '/areacodes/br',
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

  it('says "No medal yet" in sentence case before any review', async () => {
    mount('/games/areacode/br');
    const pill = await screen.findByTitle('Area-code mastery');
    expect(pill.textContent).toMatch(/^No medal yet · 0%$/);
    expect(pill.querySelector('.cap')).toBeNull();
  });

  it('lets a callout label pick its state', async () => {
    mount('/games/areacode/br');
    await screen.findByText(/^(11|21|31)$/);
    const hit = document.querySelectorAll('.ddd-hit');
    const df = [...hit].find((el) => el.getAttribute('x') === String(410 - 4)) as Element;
    fireEvent.click(df);
    expect(await screen.findByText('You picked Distrito Federal')).toBeTruthy();
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
  it('shows one empty state before any answers', async () => {
    mount('/stats');
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'No stats yet' })).toBeTruthy();
    expect(screen.queryByText('Recall in a week')).toBeNull();
  });
});

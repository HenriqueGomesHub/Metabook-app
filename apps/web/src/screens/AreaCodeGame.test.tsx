import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppDataProvider } from '../app/AppData';
import { AuthGate } from '../app/AuthGate';
import { MemoryRepository } from '../test/MemoryRepository';
import { fakeAuth } from '../test/renderScreens';
import { AreaCodeGame } from './AreaCodeGame';
import { Drills } from './Drills';
import { Session } from './Session';

// France's codes from a test file in the content/areacodes format, answered on the real
// département map (content/maps/fr-regions.json); one Brazilian card keeps Brazil's own path.
vi.mock('../data/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/content')>();
  const { areaCodeCards } = await import('../data/areaCodes');
  const pool = [
    { code: 'FR', name: 'France', continent: 'europe' as const, in_pool: true },
    { code: 'BR', name: 'Brazil', continent: 'americas' as const, in_pool: true },
  ];
  const cards = areaCodeCards(
    [
      {
        country: 'FR',
        label: 'Indicatifs',
        prefix: '0',
        sources: ['https://example.org/fr'],
        codes: [{ code: '1', region: '75', spans: ['92', '93', '94'] }],
      },
      {
        country: 'BR',
        label: 'DDD',
        sources: ['https://example.org/br'],
        codes: [{ code: '11', region: 'SP' }],
      },
    ],
    pool,
  );
  return {
    ...actual,
    loadContent: async () => ({
      pool,
      chapters: [],
      cards,
      tips: [],
      clues: [],
      clueOverrides: [],
    }),
  };
});

function mount(path: string, repo = new MemoryRepository()) {
  render(
    <AppDataProvider repo={repo} auth={fakeAuth()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/games/areacode/:country" element={<AreaCodeGame />} />
            <Route path="/drills" element={<Drills />} />
            <Route path="/session" element={<Session />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppDataProvider>,
  );
  return repo;
}

describe('Area codes outside Brazil', () => {
  it('plays on the country’s regions map, with country chips', async () => {
    mount('/games/areacode/fr');
    expect(await screen.findByText('France · Area codes')).toBeTruthy();
    const chips = screen.getByRole('navigation', { name: 'Country' });
    expect(within(chips).getByRole('link', { name: 'Brazil' }).getAttribute('href')).toBe(
      '/games/areacode/br',
    );
    expect(within(chips).getByRole('link', { name: 'France' }).getAttribute('aria-current')).toBe(
      'page',
    );
    // a region the code also covers counts as right, and the main one is named
    fireEvent.click(await screen.findByRole('button', { name: 'Hauts-de-Seine' }));
    expect(await screen.findByText('Right: it also covers Hauts-de-Seine')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Paris' })).toBeTruthy();
  });

  it('drills area codes per country through practice, a span counting as right', async () => {
    const repo = mount('/session?type=areacode&country=FR');
    fireEvent.click(await screen.findByRole('button', { name: 'Seine-Saint-Denis' }));
    expect(await screen.findByText(/Mainly Paris; it also covers Seine-Saint-Denis/)).toBeTruthy();
    await waitFor(() =>
      expect(repo.reviews[0]).toMatchObject({ cardId: 'ddd:fr:1', correct: true }),
    );
  });

  it('records a miss on the country’s map scope, never as a bare code', async () => {
    const repo = mount('/session?type=areacode&country=FR');
    fireEvent.click(await screen.findByRole('button', { name: 'Ille-et-Vilaine' }));
    await waitFor(() => expect(repo.confusions).toHaveLength(1));
    expect(repo.confusions[0]).toMatchObject({ picked: 'fr:35', truth: 'fr:75' });
  });

  it('offers the drill per country from the Drills tile', async () => {
    mount('/drills');
    const chips = await screen.findByRole('navigation', { name: 'Area codes by country' });
    expect(within(chips).getByRole('link', { name: 'France' }).getAttribute('href')).toBe(
      '/session?type=areacode&country=FR',
    );
  });
});

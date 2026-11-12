import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  it('plays on the country’s regions map, with a country switcher', async () => {
    mount('/games/areacode/fr');
    expect(await screen.findByText('Area codes')).toBeTruthy();
    // the other countries are one pick away
    const country = screen.getByRole('combobox', { name: 'Country' }) as HTMLSelectElement;
    expect(country.value).toBe('FR');
    expect([...country.options].map((o) => o.textContent)).toEqual(['Brazil', 'France']);
    // the code covers an area: it is asked and answered as one, picked anywhere inside it
    expect(screen.getByText('Which area uses')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Hauts-de-Seine' }));
    expect(await screen.findByText('Exactly right')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Paris and 3 more' })).toBeTruthy();
    // the answer names the code's group from content/areacodes/patterns.json
    expect(screen.getByText(/= Île-de-France/).textContent).toBe('1 = Île-de-France');
  });

  it('drills area codes per country through practice, the whole area counting as right', async () => {
    const repo = mount('/session?type=areacode&country=FR');
    expect(await screen.findByText(/which area uses/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Seine-Saint-Denis' }));
    expect(await screen.findByText('Paris and 3 more')).toBeTruthy();
    expect(screen.getByText(/= Île-de-France/)).toBeTruthy();
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

  it('opens the area-codes page from the Drills tile, which picks the country', async () => {
    mount('/drills');
    await screen.findByText('Area codes');
    expect(document.querySelector('a.tile[href="/areacodes?via=drill"]')).toBeTruthy();
    // no per-country chips on Drills: the countries are chosen on the area-codes page
    expect(screen.queryByRole('navigation', { name: 'Area codes by country' })).toBeNull();
  });
});

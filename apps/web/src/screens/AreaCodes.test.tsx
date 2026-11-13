import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppDataProvider } from '../app/AppData';
import { AuthGate } from '../app/AuthGate';
import { GROUP_COLOURS } from '../components/PatternMap';
import { MemoryRepository } from '../test/MemoryRepository';
import { fakeAuth } from '../test/renderScreens';
import { AreaCodeIntro, AreaCodes } from './AreaCodes';

// Codes for a pattern country with a span (France), Brazil, and one without a pattern (the US),
// on the real maps and the shipped content/areacodes/patterns.json.
vi.mock('../data/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/content')>();
  const { areaCodeCards } = await import('../data/areaCodes');
  const pool = [
    { code: 'FR', name: 'France', continent: 'europe' as const, in_pool: true },
    { code: 'BR', name: 'Brazil', continent: 'americas' as const, in_pool: true },
    { code: 'US', name: 'United States', continent: 'americas' as const, in_pool: true },
  ];
  const file = (country: string, codes: { code: string; region: string; spans?: string[] }[]) => ({
    country,
    label: 'Area codes',
    sources: ['https://example.org'],
    codes,
  });
  const cards = areaCodeCards(
    [
      file('FR', [
        { code: '01', region: '75', spans: ['92'] },
        { code: '02', region: '44' },
      ]),
      file('BR', [
        { code: '11', region: 'SP' },
        { code: '41', region: 'PR' },
      ]),
      file('US', [
        { code: '212', region: 'NY' },
        { code: '213', region: 'CA' },
      ]),
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

function mount(path: string) {
  render(
    <AppDataProvider repo={new MemoryRepository()} auth={fakeAuth()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/areacodes" element={<AreaCodes />} />
            <Route path="/areacodes/:country" element={<AreaCodeIntro />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppDataProvider>,
  );
}

const countries = async () =>
  (await screen.findByRole('region', { name: 'Countries' })) as HTMLElement;

describe('Area codes page', () => {
  it('keeps countries with a pattern apart from those to memorise, on two tabs', async () => {
    mount('/areacodes');
    const list = await countries();
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/areacodes/br', '/areacodes/fr']);
    expect(within(list).getByText(/1 São Paulo down to 9 the Amazon/)).toBeTruthy();
    // each country leads with its flag
    expect(links[0]?.querySelector('.row-flag img')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /To memorise/ }));
    expect(within(list).getByRole('link', { name: /United States/ })).toBeTruthy();
  });

  it('carries the drill route through from Drills', async () => {
    mount('/areacodes?via=drill');
    const list = await countries();
    expect(within(list).getAllByRole('link')[0]?.getAttribute('href')).toBe(
      '/areacodes/br?via=drill',
    );
  });
});

describe('A country’s pattern intro', () => {
  it('explains the pattern with a coloured map and its key', async () => {
    mount('/areacodes/fr');
    expect(await screen.findByRole('heading', { name: 'France area codes' })).toBeTruthy();
    // the key says it all; the summary sentence would repeat it
    expect(screen.queryByText(/01 Paris and Île-de-France, 02 the north-west/)).toBeNull();
    const key = screen.getByRole('list', { name: 'Pattern key' });
    const rows = within(key).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows[0]?.textContent).toBe('01Île-de-France');
    expect(rows[1]?.textContent).toBe('02the North-West');

    const map = await screen.findByRole('img', { name: /coloured by the first digits/ });
    const fill = (region: string) =>
      map.querySelector(`[data-region="${region}"]`)?.getAttribute('fill');
    expect(fill('75')).toBe(GROUP_COLOURS[0]);
    expect(fill('92')).toBe(GROUP_COLOURS[0]); // reached by 01's span
    expect(fill('44')).toBe(GROUP_COLOURS[1]);
    expect(fill('13')).toBeNull(); // no code in the fixture
    expect([...map.querySelectorAll('text')].map((t) => t.textContent)).toEqual(
      expect.arrayContaining(['01', '02']),
    );

    expect(screen.getByRole('link', { name: /^Practise/ }).getAttribute('href')).toBe(
      '/games/areacode/fr',
    );
    // the X leaves; no second way back
    expect(screen.queryByRole('link', { name: 'Back' })).toBeNull();
  });

  it('pages from the map to the key on a phone', async () => {
    mount('/areacodes/fr');
    const main = await screen.findByRole('main');
    expect(main.className).toContain('on-map');
    fireEvent.click(screen.getByRole('tab', { name: 'Key' }));
    expect(main.className).toContain('on-key');
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }));
    expect(main.className).toContain('on-map');
  });

  it('practises in the drill when opened from Drills', async () => {
    mount('/areacodes/fr?via=drill');
    const practise = await screen.findByRole('link', { name: /^Practise/ });
    expect(practise.getAttribute('href')).toBe('/session?type=areacode&country=FR');
  });

  it('shows example codes for a country without a pattern', async () => {
    mount('/areacodes/us');
    expect(await screen.findByRole('heading', { name: 'United States area codes' })).toBeTruthy();
    expect(screen.getByText('Codes to memorise')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Pattern key' })).toBeNull();
    const examples = await screen.findByRole('heading', { name: 'Some codes' });
    expect(examples.nextElementSibling?.textContent).toContain('212');
  });
});

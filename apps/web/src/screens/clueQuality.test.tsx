import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppDataProvider } from '../app/AppData';
import { AuthGate } from '../app/AuthGate';
import { MemoryRepository } from '../test/MemoryRepository';
import { fakeAuth } from '../test/renderScreens';
import { Country } from './Country';
import { Session } from './Session';

// A catalogue with the review's fields: Albania's bollard looks the same as Italy's, Greece's
// can be told apart, one picture is a comparison with a caption and one is a duplicate.
vi.mock('../data/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/content')>();
  const { QUALITY_COUNTRIES, QUALITY_POOL } = await import('./__fixtures__/quality');
  const content = actual.withClueCards(
    {
      pool: QUALITY_POOL,
      chapters: [],
      cards: [],
      tips: [],
      clues: QUALITY_COUNTRIES,
      clueOverrides: [],
    },
    [],
  );
  return { ...actual, loadContent: async () => content };
});

function mount(path: string) {
  render(
    <AppDataProvider repo={new MemoryRepository()} auth={fakeAuth()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/atlas/:country" element={<Country />} />
            <Route path="/session" element={<Session />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppDataProvider>,
  );
}

describe('Learn: summaries first, lookalike notes, captions, viewer', () => {
  it('shows the summary, the same-look note and the full text behind More detail', async () => {
    mount('/atlas/AL');
    const learn = await screen.findByRole('region', { name: 'Learn' });
    expect(within(learn).getByText('Red and white bollards with a red reflector.')).toBeTruthy();
    expect(
      within(learn)
        .getByText(/Looks the same in/)
        .closest('li')?.textContent,
    ).toMatch(/Italy.*Same look/);
    expect(
      within(learn)
        .getByText(/Similar/)
        .closest('li')?.textContent,
    ).toBe('Similar Greece — Greek ones have a yellow strip');
    const more = within(learn).getByText('More detail').closest('details')!;
    expect(more.open).toBe(false);
    expect(within(more).getByText(/longer Plonk It text/)).toBeTruthy();
    // no empty link left behind
    expect(more.querySelectorAll('a').length).toBe(0);
  });

  it('shows each picture once, captions under them', async () => {
    mount('/atlas/AL');
    const learn = await screen.findByRole('region', { name: 'Learn' });
    const thumbs = within(learn).getAllByRole('button', { name: /Enlarge image/ });
    // three images, one of them a duplicate
    expect(thumbs).toHaveLength(2);
    expect(within(learn).getByText('Albania and Italy side by side')).toBeTruthy();
  });

  it('opens a full-screen viewer with captions, arrows and Esc', async () => {
    mount('/atlas/AL');
    fireEvent.click(await screen.findByRole('button', { name: /Enlarge image 1 of/ }));
    const viewer = screen.getByRole('dialog', { name: 'Bollard: red and white' });
    // no caption: the clue's summary stands in
    expect(within(viewer).getByText('Red and white bollards with a red reflector.')).toBeTruthy();
    expect(within(viewer).getByText('1 / 2')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(within(viewer).getByText('Albania and Italy side by side')).toBeTruthy();
    expect(within(viewer).getByText('2 / 2')).toBeTruthy();
    fireEvent.click(within(viewer).getByRole('button', { name: 'Next image' }));
    expect(within(viewer).getByText('1 / 2')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Bollard: red and white' })).toBeNull();
  });
});

describe('Spot it with lookalikes', () => {
  it('never offers the country that looks the same, and names it on the answer', async () => {
    mount('/session?country=AL&type=spot');
    await screen.findByText('Which country?');
    const options = document.querySelectorAll('.options .opt');
    expect(options).toHaveLength(4);
    expect([...options].map((o) => o.textContent).join()).not.toMatch(/Italy/);
    fireEvent.click(screen.getByRole('button', { name: /Albania/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Got it' });
    expect(
      within(dialog)
        .getByText(/Looks the same in/)
        .closest('li')?.textContent,
    ).toMatch(/Italy/);
    await waitFor(() => expect(within(dialog).getByText('Bollards')).toBeTruthy());
  });
});

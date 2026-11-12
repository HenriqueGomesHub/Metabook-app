import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { clueCardIds, primaryCardId } from '@metabook/core';
import { clueCards } from '@metabook/core';
import { CLUE_COUNTRIES, CLUE_POOL, PL_BOLLARD } from '@metabook/core/src/__fixtures__/clues';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppDataProvider } from '../app/AppData';
import { AuthGate } from '../app/AuthGate';
import { MemoryRepository } from '../test/MemoryRepository';
import { fakeAuth } from '../test/renderScreens';
import type { Mode } from '../data';
import { Country } from './Country';
import { Drills } from './Drills';
import { Login } from './Login';
import { Round } from './Round';
import { Session } from './Session';

// The app's content with the test catalogue: Poland, Czechia, Slovakia, Germany, Ukraine, Brazil.
vi.mock('../data/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/content')>();
  const { CLUE_COUNTRIES, CLUE_POOL } = await import('@metabook/core/src/__fixtures__/clues');
  const content = actual.withClueCards(
    {
      pool: CLUE_POOL,
      chapters: [],
      cards: [],
      tips: [],
      clues: CLUE_COUNTRIES,
      clueOverrides: [],
    },
    [],
  );
  return { ...actual, loadContent: async () => content };
});

function mount(path: string, repo = new MemoryRepository(), signedIn = true, mode?: Mode) {
  render(
    <AppDataProvider repo={repo} auth={fakeAuth(signedIn ? undefined : null)} mode={mode}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/login" element={<Login />} />
            <Route path="/atlas/:country" element={<Country />} />
            <Route path="/drills" element={<Drills />} />
            <Route path="/round" element={<Round />} />
            <Route path="/session" element={<Session />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppDataProvider>,
  );
  return repo;
}

/** The country page's Learn tab. */
async function openLearn() {
  fireEvent.click(await screen.findByRole('tab', { name: 'Learn' }));
  return screen.getByRole('region', { name: 'Learn' });
}

describe('Learn section', () => {
  it('pages the country’s clues by Plonk It’s steps, each opening in full', async () => {
    mount('/atlas/PL');
    const learn = await openLearn();
    const steps = within(learn).getAllByRole('option');
    expect(steps.map((o) => o.textContent)).toEqual([
      'Identifying Poland · 2',
      'Regional clues · 2',
    ]);
    const titles = () => [...learn.querySelectorAll('.learn-card-title')].map((t) => t.textContent);
    expect(titles()).toEqual(['Bollard: red strip', 'Pole: holey poles']);
    expect(
      within(learn)
        .getByRole('link', { name: /Study these clues/ })
        .getAttribute('href'),
    ).toBe('/session?country=PL&src=clues');

    // a clue opens whole: markdown (bold, links that open in a new tab), pictures, credit
    fireEvent.click(within(learn).getByRole('button', { name: /Bollard: red strip/ }));
    const sheet = screen.getByRole('dialog', { name: 'Bollard: red strip' });
    expect(within(sheet).getByText('red strip').tagName).toBe('STRONG');
    const link = within(sheet).getByRole('link', { name: 'Zakarpattia Oblast' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(within(sheet).getByText(/CC BY-NC-SA 4\.0/)).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: /Enlarge image 1 of Bollard/ })).toBeTruthy();
    // right goes on through the step
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Pole: holey poles' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.change(within(learn).getByRole('combobox'), { target: { value: '1' } });
    expect(titles()).toEqual(['Language: Polish letters', 'Language: bilingual signs']);
    expect(within(learn).getByText('Pomeranian Voivodeship')).toBeTruthy();
  });

  it('enlarges an image on tap', async () => {
    mount('/atlas/PL');
    const learn = await openLearn();
    fireEvent.click(within(learn).getByRole('button', { name: /Bollard: red strip/ }));
    fireEvent.click(screen.getByRole('button', { name: /Enlarge image 1 of Bollard/ }));
    expect(document.querySelector('.lightbox')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('.lightbox')).toBeNull();
    // the clue's sheet is still open behind the viewer
    expect(screen.getByRole('dialog', { name: 'Bollard: red strip' })).toBeTruthy();
  });
});

describe('Drills', () => {
  it('has a tile per clue family with cards, counted in clues and countries', async () => {
    mount('/drills');
    const bollards = (await screen.findByText('Bollards')).closest('a')!;
    expect(bollards.getAttribute('href')).toBe('/session?subject=bollard');
    // one bollard clue in each of five countries (10 cards made from them)
    expect(within(bollards).getByText(/5 bollards · 5 countries/)).toBeTruthy();
    const poles = screen.getByText('Poles').closest('a')!;
    expect(within(poles).getByText(/2 poles · 2 countries/)).toBeTruthy();
    // Live view cards have their own tile, with a note on road labels
    const streetView = screen.getByText('Street View').closest('a')!;
    expect(streetView.getAttribute('href')).toBe('/session?type=live');
    expect(within(streetView).getByText(/2 spots · 2 countries/)).toBeTruthy();
    expect(within(streetView).getByText(/Road labels can show names/)).toBeTruthy();
    // language clues have no image: Clue quiz only
    expect(screen.queryByText('Language')).toBeNull();
    expect(screen.getByText('Clue quiz').closest('a')?.getAttribute('href')).toBe(
      '/session?clue=1',
    );
  });
});

describe('Clue cards in practice', () => {
  it('answers a Live view card and then lets the view be explored, with the clue shown', async () => {
    mount(`/session?subject=bollard&type=live`);
    expect(await screen.findByTitle('Street View')).toBeTruthy();
    expect(screen.getByTestId('live-shield')).toBeTruthy();
    expect(screen.getByText('Location hidden')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Poland/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Got it' });
    expect(screen.queryByTestId('live-shield')).toBeNull();
    expect(within(dialog).getByRole('heading', { name: 'Bollard: red strip' })).toBeTruthy();
    expect(within(dialog).getByText('Lookalikes')).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Plonk It' }).getAttribute('href')).toBe(
      'https://www.plonkit.net/poland',
    );
  });

  it('names the picked country on a wrong Which clue answer', async () => {
    const which = clueCards({ clues: CLUE_COUNTRIES, pool: CLUE_POOL }).find(
      (c) => c.id === clueCardIds.which('PL-vySo'),
    )!;
    const repo = mount('/session?type=which&country=PL');
    expect(await screen.findByText('Which is the Poland bollard?')).toBeTruthy();
    // each showing draws its own images and order: find a shown image that is not Poland's
    const images = await waitFor(() => {
      const found = screen
        .getAllByRole('button', { name: /^Image \d$/ })
        .map((button) => ({ button, src: button.querySelector('img')?.getAttribute('src') }));
      expect(found.every((f) => f.src)).toBe(true);
      return found;
    });
    const all = [which.clue!.choices!, which.clue!.alternates!].flat();
    const wrong = images.find((f) => f.src !== which.clue!.image!.src)!;
    const picked = all.find((c) => c.image.src === wrong.src)!.country;
    fireEvent.click(wrong.button);
    const dialog = await screen.findByRole('dialog', { name: 'Not quite — it’s the marked image' });
    const names: Record<string, string> = {
      CZ: 'Czechia',
      SK: 'Slovakia',
      DE: 'Germany',
      UA: 'Ukraine',
    };
    expect(within(dialog).getByText(`You picked ${names[picked]}’s bollard`)).toBeTruthy();
    await waitFor(() =>
      expect(repo.reviews[0]).toMatchObject({ cardId: which.id, correct: false }),
    );
    // image ids are not answers: no confusion is recorded
    expect(repo.confusions).toHaveLength(0);
  });
});

describe('Round', () => {
  const url = '/round?truth=PL&guess=CZ&region=Pomeranian&lat=48.6&lng=22.3';

  it('shows where you were and orders clues by region, then distance', async () => {
    const repo = mount(url);
    expect(await screen.findByRole('heading', { name: 'You were in Poland' })).toBeTruthy();
    expect(screen.getByText(/You guessed Czechia/)).toBeTruthy();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual([
      'Language: bilingual signs',
      'Bollard: red strip',
      'Pole: holey poles',
      'Language: Polish letters',
    ]);
    // opening it records nothing
    expect(repo.reviews).toHaveLength(0);
    expect(repo.spots).toHaveLength(0);
  });

  it('grades a clue’s primary card: Saw it is Good, Missed it is Again', async () => {
    const repo = mount(url);
    const bollard = (await screen.findByRole('heading', { name: 'Bollard: red strip' })).closest(
      'article',
    )!;
    fireEvent.click(within(bollard).getByRole('button', { name: 'Saw it' }));
    expect(within(bollard).getByRole('status').textContent).toMatch(/seen/);
    const kash = screen
      .getByRole('heading', { name: 'Language: bilingual signs' })
      .closest('article')!;
    fireEvent.click(within(kash).getByRole('button', { name: 'Missed it' }));
    await waitFor(() => expect(repo.reviews).toHaveLength(2));
    expect(repo.reviews[0]).toMatchObject({ cardId: primaryCardId(PL_BOLLARD), grade: 'good' });
    expect(repo.reviews[1]).toMatchObject({
      cardId: clueCardIds.text('PL-kash'),
      grade: 'again',
      correct: false,
    });
  });

  it('saves the spot when it has a location', async () => {
    const repo = mount(url);
    fireEvent.click(await screen.findByRole('button', { name: 'Save this spot' }));
    expect(await screen.findByText('Spot saved')).toBeTruthy();
    expect(repo.spots).toEqual([
      expect.objectContaining({ country: 'PL', lat: 48.6, lng: 22.3, note: 'Pomeranian' }),
    ]);
  });

  it('offers no spot to save without a location', async () => {
    mount('/round?truth=BR');
    expect(await screen.findByRole('heading', { name: 'You were in Brazil' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save this spot' })).toBeNull();
  });

  it('asks a signed-out learner to sign in, without leaving the page', async () => {
    mount(url, new MemoryRepository(), false, 'cloud');
    expect(await screen.findByText('Sign in to see clues')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('target')).toBe('_blank');
  });
});

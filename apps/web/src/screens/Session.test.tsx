import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@metabook/core';
import { describe, expect, it, vi } from 'vitest';
import { dueState } from '../test/content';
import { MemoryRepository } from '../test/MemoryRepository';
import { renderApp } from '../test/render';

vi.mock('../data/content', async (importOriginal) => {
  const { content } = await import('../test/content');
  return { ...(await importOriginal<object>()), loadContent: async () => content };
});

function repoWith(newPerDay: number, seed: ConstructorParameters<typeof MemoryRepository>[0] = {}) {
  const repo = new MemoryRepository(seed);
  repo.settings = { ...DEFAULT_SETTINGS, newPerDay };
  return repo;
}

async function typeAnswer(text: string) {
  fireEvent.change(await screen.findByLabelText('Which country?'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
}

describe('Session', () => {
  it.each(['Lietuva', 'Lithuana'])('accepts %s for Lithuania in typed recall', async (text) => {
    const repo = repoWith(0, { cardStates: [dueState('flag:lt')] });
    renderApp('/session', repo);
    await typeAnswer(text);
    const dialog = await screen.findByRole('dialog', { name: 'Got it' });
    expect(within(dialog).getByText('Lithuania')).toBeTruthy();
    await waitFor(() => expect(repo.reviews[0]?.correct).toBe(true));
  });

  it('records a typed miss of another answer as a confusion', async () => {
    const repo = repoWith(0, { cardStates: [dueState('flag:lt')] });
    renderApp('/session', repo);
    await typeAnswer('Latvia');
    const dialog = await screen.findByRole('dialog', { name: 'Not quite — it’s Lithuania' });
    expect(within(dialog).getByText('You said Latvia')).toBeTruthy();
    await waitFor(() =>
      expect(repo.confusions).toMatchObject([{ picked: 'Latvia', truth: 'Lithuania', count: 1 }]),
    );
  });

  it('answers a new card by choice and rotates its tips', async () => {
    const repo = repoWith(1);
    renderApp('/session', repo);
    fireEvent.click(await screen.findByRole('button', { name: /Lithuania/ }));

    expect(screen.getByRole('dialog', { name: 'Got it' })).toBeTruthy();
    expect(screen.getByText('Yellow, green, red.')).toBeTruthy();
    expect(screen.getByText('Tip 1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Another tip' }));
    expect(screen.getByText('Place names end in -ai.')).toBeTruthy();

    await waitFor(() => expect(repo.reviews).toHaveLength(1));
    expect(repo.cardStates.map((s) => s.cardId)).toEqual(['flag:lt']);
    expect(repo.tipViews.map((v) => v.tipId).sort()).toEqual(['lt-1', 'lt-2']);
  });

  it('advances with Space and ends with a summary', async () => {
    renderApp('/session', repoWith(2));
    expect(await screen.findByText('1 / 2')).toBeTruthy();

    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByText('2 / 2')).toBeTruthy();

    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByText('Session done')).toBeTruthy();
    expect(screen.getByText('2 cards')).toBeTruthy();
  });

  it('opens the reveal as a non-modal dialog, announces the verdict and focuses Continue', async () => {
    renderApp('/session', repoWith(2));
    fireEvent.click((await screen.findAllByRole('button', { name: /^\d/ }))[0] as HTMLElement);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    const verdict = dialog.getAttribute('aria-labelledby') as string;
    expect(document.getElementById(verdict)?.textContent).toMatch(
      /^(Got it|Not quite — it’s \w+)$/,
    );
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
      document.getElementById(verdict)?.textContent,
    );
    const next = within(dialog).getByRole('button', { name: /Continue/ });
    expect(document.activeElement).toBe(next);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBe(dialog);
    fireEvent.click(next);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('2 / 2')).toBeTruthy();
  });

  it('names the answer when a choice is wrong', async () => {
    renderApp('/session', repoWith(1));
    fireEvent.click(
      (await screen.findAllByRole('button', { name: /Latvia|Estonia/ }))[0] as HTMLElement,
    );
    expect(screen.getByRole('dialog', { name: 'Not quite — it’s Lithuania' })).toBeTruthy();
  });
});

describe('Practice', () => {
  it('never runs out: answers 30 items from a three-card pool and keeps a running score', async () => {
    const repo = repoWith(0);
    renderApp('/session?type=flag', repo);
    for (let i = 0; i < 30; i++) {
      const dialog = screen.queryByRole('dialog');
      expect(dialog).toBeNull();
      const typed = screen.queryByLabelText('Which country?');
      if (typed) {
        fireEvent.click(screen.getByRole('button', { name: 'I don’t know' }));
      } else {
        fireEvent.click((await screen.findAllByRole('button', { name: /^\d/ }))[0] as HTMLElement);
      }
      expect(await screen.findByText(new RegExp(`^${i + 1} answered`))).toBeTruthy();
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Continue/ }));
    }
    expect(screen.queryByText('Practice done')).toBeNull();
    await waitFor(() => expect(repo.reviews).toHaveLength(30));
  });

  it('ends with a summary from the close button', async () => {
    renderApp('/session?type=flag', repoWith(0));
    fireEvent.click((await screen.findAllByRole('button', { name: /^\d/ }))[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'End practice' }));
    expect(screen.getByText('Practice done')).toBeTruthy();
    expect(screen.getByText('1 card')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Done' }).getAttribute('href')).toBe('/drills');
  });

  it('does not re-serve an answered card after ending and keeping going', async () => {
    const repo = repoWith(0);
    renderApp('/session?type=flag', repo);
    fireEvent.click((await screen.findAllByRole('button', { name: /^\d/ }))[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'End practice' }));
    fireEvent.click(screen.getByRole('button', { name: /Keep going/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await screen.findAllByRole('button', { name: /^\d/ })).length).toBeGreaterThan(0);
    await waitFor(() => expect(repo.reviews).toHaveLength(1));
  });

  it('shows the summary after each answer when the scope has one card', async () => {
    const repo = repoWith(0);
    renderApp('/session?country=LT', repo);
    fireEvent.click(await screen.findByRole('button', { name: /Lithuania/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Continue/ }));
    expect(screen.getByText('Practice done')).toBeTruthy();
    expect(screen.getByText('1 card')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Keep going/ }));
    expect(await screen.findByRole('button', { name: /Lithuania/ })).toBeTruthy();
    await waitFor(() => expect(repo.reviews).toHaveLength(1));
  });

  it('shows an empty state for a scope without cards', async () => {
    renderApp('/session?country=ZZ', repoWith(0));
    expect(await screen.findByRole('region', { name: 'No cards here yet' })).toBeTruthy();
  });
});

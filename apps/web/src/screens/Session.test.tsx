import { fireEvent, screen, waitFor } from '@testing-library/react';
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
    expect(await screen.findByText('Right')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Lithuania' })).toBeTruthy();
    await waitFor(() => expect(repo.reviews[0]?.correct).toBe(true));
  });

  it('records a typed miss of another answer as a confusion', async () => {
    const repo = repoWith(0, { cardStates: [dueState('flag:lt')] });
    renderApp('/session', repo);
    await typeAnswer('Latvia');
    expect(await screen.findByText('You said Latvia')).toBeTruthy();
    await waitFor(() =>
      expect(repo.confusions).toMatchObject([{ picked: 'Latvia', truth: 'Lithuania', count: 1 }]),
    );
  });

  it('answers a new card by choice and rotates its tips', async () => {
    const repo = repoWith(1);
    renderApp('/session', repo);
    fireEvent.click(await screen.findByRole('button', { name: /Lithuania/ }));

    expect(screen.getByText('Right. Here’s why')).toBeTruthy();
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
});

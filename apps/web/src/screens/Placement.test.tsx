import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../test/MemoryRepository';
import { renderScreens } from '../test/renderScreens';

vi.mock('../data/content', async (importOriginal) => {
  const { content } = await import('../test/content');
  // flags are left out of a placement test: a sign in Lithuanian is asked instead
  const sign = {
    id: 'script:lt',
    type: 'script' as const,
    country: 'LT',
    answer: 'Lithuania',
    options: ['Lithuania', 'Latvia', 'Estonia', 'Poland'],
    prompt: { kind: 'text' as const, value: 'Šiauliai' },
    tags: [],
    source: 'https://example.com',
  };
  const placed = { ...content, cards: [...content.cards, sign] };
  return { ...(await importOriginal<object>()), loadContent: async () => placed };
});

describe('Placement', () => {
  it('marks correctly answered cards as known and reports the result', async () => {
    const repo = new MemoryRepository();
    renderScreens('/placement/LT', repo);
    fireEvent.click(await screen.findByRole('button', { name: /Lithuania/ }));
    expect(await screen.findByRole('dialog', { name: 'Got it' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /See result/ }));
    expect(await screen.findByText('Marked 1 of 1 as known')).toBeTruthy();
    await waitFor(() => expect(repo.cardStates.map((s) => s.cardId)).toEqual(['script:lt']));
    expect(repo.cardStates[0]?.state).toBe('review');
  });

  it('leaves a missed card new', async () => {
    const repo = new MemoryRepository();
    renderScreens('/placement/LT', repo);
    await screen.findByRole('button', { name: /Lithuania/ });
    const wrong = screen
      .getAllByRole('button')
      .find((b) => b.classList.contains('opt') && !/Lithuania/.test(b.textContent ?? ''));
    fireEvent.click(wrong!);
    expect(await screen.findByRole('dialog', { name: /Not quite — it’s Lithuania/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /See result/ }));
    expect(await screen.findByText('Marked 0 of 1 as known')).toBeTruthy();
    expect(screen.getByText(/To learn: the script/)).toBeTruthy();
    expect(repo.cardStates).toHaveLength(0);
  });

  it('names an unknown country instead of an empty test', async () => {
    renderScreens('/placement/ZZ', new MemoryRepository());
    expect(await screen.findByText('Unknown country')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Back to Atlas/ }).getAttribute('href')).toBe('/atlas');
  });
});

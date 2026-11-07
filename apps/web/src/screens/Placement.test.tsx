import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../test/MemoryRepository';
import { renderScreens } from '../test/renderScreens';

vi.mock('../data/content', async () => {
  const { content } = await import('../test/content');
  return { loadContent: async () => content };
});

describe('Placement', () => {
  it('marks correctly answered cards as known and reports the result', async () => {
    const repo = new MemoryRepository();
    renderScreens('/placement/LT', repo);
    fireEvent.change(await screen.findByLabelText(/Which country/), {
      target: { value: 'Lithuania' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(await screen.findByText('Marked 1 of 1 as known')).toBeTruthy();
    await waitFor(() => expect(repo.cardStates.map((s) => s.cardId)).toEqual(['flag:lt']));
    expect(repo.cardStates[0]?.state).toBe('review');
  });

  it('leaves a missed card new', async () => {
    const repo = new MemoryRepository();
    renderScreens('/placement/LT', repo);
    fireEvent.click(await screen.findByRole('button', { name: 'I don’t know' }));
    expect(await screen.findByText('Marked 0 of 1 as known')).toBeTruthy();
    expect(repo.cardStates).toHaveLength(0);
  });
});

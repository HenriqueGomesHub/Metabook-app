import { fireEvent, screen, waitFor } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../test/MemoryRepository';
import { renderScreens } from '../test/renderScreens';

vi.mock('../data/content', async (importOriginal) => {
  const { content } = await import('../test/content');
  return { ...(await importOriginal<object>()), loadContent: async () => content };
});

describe('Blocks', () => {
  it('starting a block persists it and Today shows the progress line', async () => {
    const repo = new MemoryRepository();
    renderScreens('/blocks', repo);

    fireEvent.click(await screen.findByRole('button', { name: /Start block/ }));
    await waitFor(() => expect(repo.blocks).toHaveLength(1));
    expect(repo.blocks[0]).toMatchObject({ status: 'active', minutesPerDay: 20 });
    expect(await screen.findByRole('region', { name: 'Active block' })).toBeTruthy();

    cleanup();
    renderScreens('/', repo);
    const line = await screen.findByRole('link', { name: /Training block/ });
    expect(line.textContent).toBe('Training block · day 1 of 14 · 0 of 20 min today');
    expect(line.getAttribute('href')).toBe('/blocks');
  });

  it('ending a block early stores its final snapshot', async () => {
    const repo = new MemoryRepository();
    renderScreens('/blocks', repo);
    fireEvent.click(await screen.findByRole('button', { name: /Start block/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'End early' }));
    expect(repo.blocks[0]?.status).toBe('active');
    fireEvent.click(await screen.findByRole('button', { name: 'End block' }));
    await waitFor(() => expect(repo.blocks[0]?.status).toBe('ended-early'));
    expect(repo.blocks[0]?.final).toBeTruthy();
    expect(await screen.findByRole('region', { name: 'Finished blocks' })).toBeTruthy();
  });
});

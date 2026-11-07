import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { dueState } from '../test/content';
import { MemoryRepository } from '../test/MemoryRepository';
import { renderApp } from '../test/render';

vi.mock('../data/content', async () => {
  const { content } = await import('../test/content');
  return { loadContent: async () => content };
});

describe('Today', () => {
  it('shows due reviews plus new cards as the due count', async () => {
    renderApp(
      '/',
      new MemoryRepository({ cardStates: [dueState('flag:lt'), dueState('flag:lv')] }),
    );
    expect((await screen.findByText('Due today')).nextElementSibling?.textContent).toBe('3');
    expect(screen.getByText('2 review · 1 new')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Start session/ }).getAttribute('href')).toBe(
      '/session',
    );
  });
});

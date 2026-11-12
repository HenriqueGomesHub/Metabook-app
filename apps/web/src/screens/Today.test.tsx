import { screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@metabook/core';
import { describe, expect, it, vi } from 'vitest';
import { dueState } from '../test/content';
import { MemoryRepository } from '../test/MemoryRepository';
import { renderApp } from '../test/render';

vi.mock('../data/content', async (importOriginal) => {
  const { content } = await import('../test/content');
  return { ...(await importOriginal<object>()), loadContent: async () => content };
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

  it('pluralises the time estimate and leaves out facts it has nothing for', async () => {
    renderApp('/', new MemoryRepository());
    expect(await screen.findByText(/about 1 minute$/)).toBeTruthy();
    expect(screen.queryByText(/streak/)).toBeNull();
    expect(screen.queryByText('Weakest')).toBeNull();
  });

  it('offers Learn more once today’s new cards are used up', async () => {
    const repo = new MemoryRepository({ cardStates: [dueState('flag:lt')] });
    repo.settings = { ...DEFAULT_SETTINGS, newPerDay: 0 };
    renderApp('/', repo);
    const more = await screen.findByRole('link', { name: 'Learn 2 more' });
    expect(more.getAttribute('href')).toBe('/session?more=new');
    // something is due: no review-ahead yet
    expect(screen.queryByRole('link', { name: 'Practise more' })).toBeNull();
  });

  it('offers Practise more when nothing is due', async () => {
    const later = { ...dueState('flag:lt'), due: new Date(Date.now() + 86_400_000).toISOString() };
    const repo = new MemoryRepository({ cardStates: [later] });
    repo.settings = { ...DEFAULT_SETTINGS, newPerDay: 0 };
    renderApp('/', repo);
    const more = await screen.findByRole('link', { name: 'Practise more' });
    expect(more.getAttribute('href')).toBe('/session?more=ahead');
  });
});

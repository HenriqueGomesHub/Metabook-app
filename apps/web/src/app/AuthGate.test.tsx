import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../test/MemoryRepository';
import { fakeAuth, renderScreens } from '../test/renderScreens';

vi.mock('../data/content', async (importOriginal) => {
  const { content } = await import('../test/content');
  return { ...(await importOriginal<object>()), loadContent: async () => content };
});

describe('AuthGate', () => {
  it('sends a signed-out cloud visitor to the login screen', async () => {
    renderScreens('/settings', new MemoryRepository(), { mode: 'cloud', auth: fakeAuth(null) });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });

  it('shows the magic-link sent state', async () => {
    const auth = { ...fakeAuth(null), signInWithEmail: vi.fn(async () => undefined) };
    renderScreens('/login', new MemoryRepository(), { mode: 'cloud', auth });
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'tom@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send magic link' }));
    expect(await screen.findByText(/sent a sign-in link to tom@example.com/)).toBeTruthy();
    expect(auth.signInWithEmail).toHaveBeenCalledWith('tom@example.com');
  });

  it('lets a signed-in cloud visitor in and bounces them off /login', async () => {
    renderScreens('/login', new MemoryRepository(), { mode: 'cloud', auth: fakeAuth() });
    expect(await screen.findByText('Due today')).toBeTruthy();
  });

  it('never shows /login in local mode', async () => {
    renderScreens('/login', new MemoryRepository());
    expect(await screen.findByText('Due today')).toBeTruthy();
  });
});

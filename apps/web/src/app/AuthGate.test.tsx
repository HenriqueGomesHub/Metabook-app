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

  it('signs in with the emailed code, in this window', async () => {
    const auth = {
      ...fakeAuth(null),
      signInWithEmail: vi.fn(async () => undefined),
      verifyEmailCode: vi.fn(async () => undefined),
    };
    renderScreens('/login', new MemoryRepository(), { mode: 'cloud', auth });
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'tom@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(await screen.findByText(/sent a code to tom@example.com/)).toBeTruthy();
    expect(auth.signInWithEmail).toHaveBeenCalledWith('tom@example.com');
    // a new email waits a minute
    expect(screen.getByRole('button', { name: /Send a new code in/ })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123 456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await vi.waitFor(() =>
      expect(auth.verifyEmailCode).toHaveBeenCalledWith('tom@example.com', '123456'),
    );
  });

  it('says so when the code is wrong', async () => {
    const auth = {
      ...fakeAuth(null),
      verifyEmailCode: vi.fn(async () => {
        throw new Error('Token has expired or is invalid');
      }),
    };
    renderScreens('/login', new MemoryRepository(), { mode: 'cloud', auth });
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'tom@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('That code is wrong or has expired.')).toBeTruthy();
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

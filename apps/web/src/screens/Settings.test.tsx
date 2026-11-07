import { DEFAULT_SETTINGS } from '@metabook/core';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../test/MemoryRepository';
import { renderScreens } from '../test/renderScreens';

describe('Settings', () => {
  it('saves changed values and a reload reads them back', async () => {
    const repo = new MemoryRepository();
    const first = renderScreens('/settings', repo);

    fireEvent.change(await screen.findByLabelText('Reviews per day'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'NMPZ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(repo.settings).toEqual({
      ...DEFAULT_SETTINGS,
      maxReviewsPerDay: 120,
      formats: ['move', 'nm'],
    });

    first.unmount();
    renderScreens('/settings', repo);
    await waitFor(() =>
      expect((screen.getByLabelText('Reviews per day') as HTMLInputElement).value).toBe('120'),
    );
    expect(screen.getByRole('button', { name: 'NMPZ' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('explains local mode and that pairing needs cloud mode', async () => {
    renderScreens('/settings', new MemoryRepository());
    expect(await screen.findByText('Local mode — data stays in this browser.')).toBeTruthy();
    expect(screen.getByText(/needs cloud mode/)).toBeTruthy();
  });
});

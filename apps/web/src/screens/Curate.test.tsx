import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ClueImageOverride } from '@metabook/core';
import { describe, expect, it, vi } from 'vitest';
import type { CurationApi } from '../data/curation';
import { MemoryRepository } from '../test/MemoryRepository';
import { renderScreens } from '../test/renderScreens';

vi.mock('../data/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/content')>();
  const { CLUE_COUNTRIES, CLUE_POOL } = await import('@metabook/core/src/__fixtures__/clues');
  return {
    ...actual,
    loadContent: async () =>
      actual.withClueCards(
        {
          pool: CLUE_POOL,
          chapters: [],
          cards: [],
          tips: [],
          clues: CLUE_COUNTRIES,
          clueOverrides: [],
        },
        [],
      ),
  };
});

function api(admin = true) {
  const saved: ClueImageOverride[] = [];
  const curation: CurationApi = {
    isAdmin: async () => admin,
    saveImageOverride: async (override) => {
      saved.push(override);
    },
  };
  return { curation, saved };
}

describe('Curate', () => {
  it('turns non-admins away', async () => {
    renderScreens('/curate', new MemoryRepository(), {
      mode: 'cloud',
      curation: api(false).curation,
    });
    expect(await screen.findByText('Admins only')).toBeTruthy();
  });

  it('lists a family’s clue images by country and hides one', async () => {
    const { curation, saved } = api();
    renderScreens('/curate', new MemoryRepository(), { mode: 'cloud', curation });
    expect(await screen.findByRole('heading', { name: 'Curate clue images' })).toBeTruthy();
    // bollards first: one image per country
    expect(screen.getByText('5 images')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'pole' } });
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'PL' } });
    expect(screen.getByText('3 images')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Giveaways only'));
    expect(screen.getByText('2 images')).toBeTruthy();

    const items = screen.getAllByRole('listitem');
    fireEvent.click(within(items[0]!).getByRole('button', { name: 'Hide' }));
    await waitFor(() =>
      expect(saved).toEqual([{ imageId: 'aa0001', clueId: 'PL-doge', crop: null, hidden: true }]),
    );
    expect(await within(items[0]!).findByRole('button', { name: 'Show in drills' })).toBeTruthy();
  });

  it('opens the crop box for an image', async () => {
    const { curation } = api();
    renderScreens('/curate', new MemoryRepository(), { mode: 'cloud', curation });
    const crop = await screen.findAllByRole('button', { name: 'Crop' });
    fireEvent.click(crop[0]!);
    expect(await screen.findByRole('dialog', { name: 'Crop image' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save crop/ })).toBeTruthy();
  });
});

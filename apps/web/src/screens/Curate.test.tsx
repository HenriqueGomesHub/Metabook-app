import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Candidate, CurationApi } from '../data/curation';
import { MemoryRepository } from '../test/MemoryRepository';
import { renderScreens } from '../test/renderScreens';

const candidate = (id: string, country: string, subject: Candidate['subject']): Candidate => ({
  id,
  country,
  subject,
  source: 'commons',
  sourceUrl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  storagePath: `candidates/${country}/${id}.webp`,
  preview: null,
  credit: `Ana Ruiz · Wikimedia Commons · CC BY-SA 4.0 (${id})`,
  licence: 'CC BY-SA 4.0',
  title: null,
  caption: 'Roadside post',
  giveaways: [],
});

function fakeApi(
  admin = true,
  rows = [candidate('a', 'pl', 'bollard'), candidate('b', 'lt', 'pole')],
) {
  return {
    isAdmin: vi.fn(async () => admin),
    listPending: vi.fn(async () => rows),
    decide: vi.fn(async () => undefined),
  } satisfies CurationApi;
}

/** the country of the candidate on screen (the filter lists countries too) */
const current = (country: string) => screen.findByText(country, { selector: '.curate-country' });

const open = (api: CurationApi | null, path = '/curate') =>
  renderScreens(path, new MemoryRepository(), { mode: 'cloud', curation: api });

describe('Curate', () => {
  it('is for admins only', async () => {
    open(fakeApi(false));
    expect(await screen.findByRole('region', { name: 'Admins only' })).toBeTruthy();
  });

  it('is linked from Settings for admins only', async () => {
    open(fakeApi(), '/settings');
    expect(await screen.findByRole('link', { name: /Curate photos/ })).toBeTruthy();
  });

  it('has no Settings entry in local mode', async () => {
    renderScreens('/settings', new MemoryRepository());
    await screen.findByText('Local mode — data stays in this browser.');
    expect(screen.queryByRole('link', { name: /Curate photos/ })).toBeNull();
  });

  it('keeps with an edited subject and caption, then shows the next one', async () => {
    const api = fakeApi();
    open(api);
    expect(await current('Poland')).toBeTruthy();
    expect(screen.getByText('2 pending')).toBeTruthy();

    fireEvent.keyDown(window, { key: '3' });
    expect(screen.getByRole('button', { name: /Plates/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.change(screen.getByLabelText(/Caption/), { target: { value: 'Long white plate' } });
    // typing in the caption never fires shortcuts
    fireEvent.keyDown(screen.getByLabelText(/Caption/), { key: 'k' });
    expect(api.decide).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'k' });
    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith('a', {
        status: 'approved',
        subject: 'plate',
        giveaways: [],
        caption: 'Long white plate',
      }),
    );
    expect(await current('Lithuania')).toBeTruthy();
    expect(screen.getByText('1 pending · 1 decided')).toBeTruthy();
  });

  it('rejects with the giveaway flag, and undo puts the photo back as it was', async () => {
    const api = fakeApi();
    open(api);
    await current('Poland');
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }));
    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith('a', {
        status: 'rejected',
        subject: 'bollard',
        giveaways: ['bollard'],
        caption: 'Roadside post',
      }),
    );
    await current('Lithuania');

    fireEvent.keyDown(window, { key: 'u' });
    await waitFor(() =>
      expect(api.decide).toHaveBeenLastCalledWith('a', {
        status: 'pending',
        subject: 'bollard',
        giveaways: [],
        caption: 'Roadside post',
      }),
    );
    expect(await current('Poland')).toBeTruthy();
  });

  it('filters by country and subject', async () => {
    open(fakeApi());
    await current('Poland');
    fireEvent.change(screen.getByLabelText('Filter by subject'), { target: { value: 'pole' } });
    expect(await current('Lithuania')).toBeTruthy();
    expect(screen.getByText('1 pending')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter by country'), { target: { value: 'pl' } });
    expect(await screen.findByRole('region', { name: 'Nothing to curate' })).toBeTruthy();
  });
});

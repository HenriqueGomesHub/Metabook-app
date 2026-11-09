import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlreadyCollected } from '../data/curation';
import type { Candidate, CurationApi } from '../data/curation';
import { MemoryRepository } from '../test/MemoryRepository';
import { renderScreens } from '../test/renderScreens';

const candidate = (id: string, country: string, subject: Candidate['subject']): Candidate => ({
  id,
  country,
  subject,
  source: 'commons',
  sourceUrl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  storagePath: `candidates/${id}.webp`,
  preview: null,
  credit: `Ana Ruiz · Wikimedia Commons · CC BY-SA 4.0 (${id})`,
  licence: 'CC BY-SA 4.0',
  title: null,
  description: `Roadside post in ${country}`,
  caption: null,
  giveaways: [],
});

function fakeApi(
  admin = true,
  rows = [candidate('a', 'pl', 'bollard'), candidate('b', 'lt', 'pole')],
) {
  return {
    isAdmin: vi.fn(async () => admin),
    listPending: vi.fn(async () => rows),
    decide: vi.fn<CurationApi['decide']>(async () => undefined),
    decideMany: vi.fn<CurationApi['decideMany']>(async (ids) => ids),
  } satisfies CurationApi;
}

/** the country of the candidate on screen (the filter lists countries too) */
const current = (country: string) => screen.findByText(country, { selector: '.curate-country' });

const open = (api: CurationApi | null, path = '/curate') =>
  renderScreens(path, new MemoryRepository(), { mode: 'cloud', curation: api });

describe('Curate', () => {
  beforeEach(() => localStorage.setItem('metabook.curate.view', 'single'));

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

  it('shows the description as read-only context and starts the caption empty', async () => {
    open(fakeApi());
    expect(await screen.findByText(/Roadside post in pl/)).toBeTruthy();
    expect((screen.getByLabelText(/Caption/) as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByDisplayValue(/Roadside post in pl/)).toBeNull();
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
        caption: null,
      }),
    );
    await current('Lithuania');

    fireEvent.keyDown(window, { key: 'u' });
    await waitFor(() =>
      expect(api.decide).toHaveBeenLastCalledWith('a', {
        status: 'pending',
        subject: 'bollard',
        giveaways: [],
        caption: null,
      }),
    );
    expect(await current('Poland')).toBeTruthy();
  });

  it('refuses to undo a photo already collected into the cards', async () => {
    const api = fakeApi();
    open(api);
    await current('Poland');
    fireEvent.click(screen.getByRole('button', { name: /Keep/ }));
    await current('Lithuania');
    api.decide.mockRejectedValueOnce(new AlreadyCollected());
    fireEvent.keyDown(window, { key: 'u' });
    expect((await screen.findByRole('alert')).textContent).toBe(
      'That photo is already in the cards, so it can’t be undone here.',
    );
    // it stays decided and off the queue; nothing left to undo
    expect(await current('Lithuania')).toBeTruthy();
    expect(screen.getByText('1 pending')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Undo last/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
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

const many = (n: number) =>
  Array.from({ length: n }, (_, i) => candidate(`p${i + 1}`, i % 2 ? 'lt' : 'pl', 'bollard'));
const ids = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `p${from + i}`);

describe('Curate grid', () => {
  beforeEach(() => localStorage.clear());

  it('is the default view, shows 12 tiles, and remembers the toggle', async () => {
    const api = fakeApi(true, many(15));
    open(api);
    expect(await screen.findByRole('region', { name: 'Photo grid' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Photo \d+,/ })).toHaveLength(12);
    expect(screen.getByText('15 pending')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'One by one' }));
    expect(await screen.findByRole('region', { name: 'Candidate photo' })).toBeTruthy();
    expect(localStorage.getItem('metabook.curate.view')).toBe('single');
  });

  it('marks tiles by tap and by key, and unmarks on a second tap', async () => {
    open(fakeApi(true, many(12)));
    const tile = (n: number) => screen.getByRole('button', { name: new RegExp(`^Photo ${n},`) });
    await screen.findByRole('region', { name: 'Photo grid' });

    fireEvent.click(tile(2));
    expect(tile(2).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(tile(2));
    expect(tile(2).getAttribute('aria-pressed')).toBe('false');

    fireEvent.keyDown(window, { key: '0' });
    fireEvent.keyDown(window, { key: '=' });
    expect(tile(10).getAttribute('aria-pressed')).toBe('true');
    expect(tile(12).getAttribute('aria-pressed')).toBe('true');
  });

  it('opens a photo large on right-click, with description and credit', async () => {
    open(fakeApi(true, many(12)));
    await screen.findByRole('region', { name: 'Photo grid' });
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Photo 1,/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Photo' });
    expect(dialog.textContent).toContain('Roadside post in pl');
    expect(dialog.textContent).toContain('Ana Ruiz');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the rest: approves unmarked, rejects marked, loads the next page', async () => {
    const api = fakeApi(true, many(15));
    open(api);
    await screen.findByRole('region', { name: 'Photo grid' });
    fireEvent.click(screen.getByRole('button', { name: /^Photo 1,/ }));
    fireEvent.keyDown(window, { key: '3' });
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => expect(api.decideMany).toHaveBeenCalledTimes(2));
    expect(api.decideMany).toHaveBeenNthCalledWith(
      1,
      ids(2, 12).filter((id) => id !== 'p3'),
      'approved',
    );
    expect(api.decideMany).toHaveBeenNthCalledWith(2, ['p1', 'p3'], 'rejected');
    expect(api.decide).not.toHaveBeenCalled();
    // only 3 left, and the marks are gone
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Photo \d+,/ })).toHaveLength(3),
    );
    expect(screen.getByText('3 pending · 12 decided')).toBeTruthy();
    expect(
      screen
        .getAllByRole('button', { name: /^Photo \d+,/ })
        .every((b) => b.getAttribute('aria-pressed') === 'false'),
    ).toBe(true);
  });

  it('undoes the last page back to pending', async () => {
    const api = fakeApi(true, many(15));
    open(api);
    await screen.findByRole('region', { name: 'Photo grid' });
    expect((screen.getByRole('button', { name: 'Undo page' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: /Keep the rest/ }));
    await waitFor(() => expect(screen.getByText('3 pending · 12 decided')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Undo page' }));
    await waitFor(() => expect(api.decideMany).toHaveBeenLastCalledWith(ids(1, 12), 'pending'));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Photo \d+,/ })).toHaveLength(12),
    );
    expect(screen.getByText('15 pending')).toBeTruthy();
  });

  it('undoes only the rows of a page not collected yet, and says so', async () => {
    const api = fakeApi(true, many(15));
    api.decideMany.mockImplementation(async (list, status) =>
      status === 'pending' ? list.slice(2) : list,
    );
    open(api);
    await screen.findByRole('region', { name: 'Photo grid' });
    fireEvent.click(screen.getByRole('button', { name: /Keep the rest/ }));
    await waitFor(() => expect(screen.getByText('3 pending · 12 decided')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Undo page' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      '2 photos are already in the cards and can’t be undone here.',
    );
    expect(screen.getByText('13 pending')).toBeTruthy();
  });

  it('pages within the current filter', async () => {
    open(fakeApi(true, many(30)));
    await screen.findByRole('region', { name: 'Photo grid' });
    fireEvent.change(screen.getByLabelText('Filter by country'), { target: { value: 'lt' } });
    expect(await screen.findByText('15 pending')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Photo \d+,/ })).toHaveLength(12);
  });
});

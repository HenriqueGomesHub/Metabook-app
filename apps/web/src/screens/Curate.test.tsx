import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlreadyCollected, CropUnavailable, UsesUnavailable } from '../data/curation';
import type { Candidate, CurationApi, Use } from '../data/curation';
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
  width: 1024,
  height: 768,
  crop: null,
});

// jsdom has no PointerEvent; without it fireEvent drops clientX/clientY
if (!('PointerEvent' in window)) {
  class PointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  Object.assign(window, { PointerEvent });
}

/** Drags across the crop area, laid out as a 100×100 box, from one point to another. */
function dragCrop(from: [number, number], to: [number, number]) {
  const stage = screen.getByLabelText(/Crop area/);
  stage.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }) as DOMRect;
  const at = ([clientX, clientY]: [number, number]) => ({ clientX, clientY, pointerId: 1 });
  fireEvent.pointerDown(stage, at(from));
  fireEvent.pointerMove(stage, at(to));
  fireEvent.pointerUp(stage, at(to));
}

const drawn = { x: 0.1, y: 0.1, w: 0.5, h: 0.4 };

function fakeApi(
  admin = true,
  rows = [candidate('a', 'pl', 'bollard'), candidate('b', 'lt', 'pole')],
  uses: Use[] = [],
) {
  return {
    countUses: vi.fn<CurationApi['countUses']>(async () => {
      const counts: Record<string, number> = {};
      for (const u of uses) counts[u.subject] = (counts[u.subject] ?? 0) + 1;
      return counts;
    }),
    listUses: vi.fn<CurationApi['listUses']>(async (subject) =>
      uses.filter((u) => u.subject === subject),
    ),
    decideUses: vi.fn<CurationApi['decideUses']>(async (ids) => ids),
    updateUse: vi.fn<CurationApi['updateUse']>(async () => undefined),
    isAdmin: vi.fn(async () => admin),
    listPending: vi.fn(async () => rows),
    decide: vi.fn<CurationApi['decide']>(async () => undefined),
    decideMany: vi.fn<CurationApi['decideMany']>(async (ids) => ids),
    setCrop: vi.fn<CurationApi['setCrop']>(async () => undefined),
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

  it('crops and keeps: C opens the crop, Enter saves the crop with approved', async () => {
    const api = fakeApi();
    open(api);
    await current('Poland');
    fireEvent.keyDown(window, { key: 'c' });
    dragCrop([10, 10], [60, 50]);
    expect(screen.getByText('Keeping 50% × 40% of the photo')).toBeTruthy();
    // the review keys are off while cropping
    fireEvent.keyDown(window, { key: 'k' });
    expect(api.decide).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith('a', {
        status: 'approved',
        subject: 'bollard',
        giveaways: [],
        caption: null,
        crop: drawn,
      }),
    );
    expect(await current('Lithuania')).toBeTruthy();

    // undo brings it back uncropped
    fireEvent.keyDown(window, { key: 'u' });
    await waitFor(() =>
      expect(api.decide).toHaveBeenLastCalledWith('a', expect.objectContaining({ crop: null })),
    );
  });

  it('cancels a crop with Esc, and moves the box with the arrow keys', async () => {
    const api = fakeApi();
    open(api);
    await current('Poland');
    fireEvent.click(screen.getByRole('button', { name: /^C\s*Crop$/ }));
    dragCrop([10, 10], [60, 50]);
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: /Crop and keep/ }));
    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith(
        'a',
        expect.objectContaining({ status: 'approved', crop: { ...drawn, x: 0.15 } }),
      ),
    );
    await current('Lithuania');
    fireEvent.keyDown(window, { key: 'c' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByLabelText(/Crop area/)).toBeNull();
    expect(api.decide).toHaveBeenCalledTimes(1);
  });

  it('says to run the migration when the crop column is missing', async () => {
    const api = fakeApi();
    api.decide.mockRejectedValueOnce(new CropUnavailable());
    open(api);
    await current('Poland');
    fireEvent.keyDown(window, { key: 'c' });
    dragCrop([10, 10], [60, 50]);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Run supabase/migrations/0004_crop.sql to enable cropping',
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

  it('crops from the large view: saves the crop now, badges the tile and keeps it', async () => {
    const api = fakeApi(true, many(15));
    open(api);
    const tile = (n: number) => screen.getByRole('button', { name: new RegExp(`^Photo ${n},`) });
    await screen.findByRole('region', { name: 'Photo grid' });
    fireEvent.click(tile(1));
    expect(tile(1).getAttribute('aria-pressed')).toBe('true');

    fireEvent.contextMenu(tile(1));
    await screen.findByRole('dialog', { name: 'Photo' });
    fireEvent.keyDown(window, { key: 'c' });
    dragCrop([10, 10], [60, 50]);
    fireEvent.click(screen.getByRole('button', { name: /Crop and keep/ }));

    await waitFor(() => expect(api.setCrop).toHaveBeenCalledWith('p1', drawn));
    expect(api.decide).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getAllByTestId('crop-badge')).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tile(1).getAttribute('aria-label')).toBe('Photo 1, Bollards, cropped');
    expect(tile(1).getAttribute('aria-pressed')).toBe('false');

    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(api.decideMany).toHaveBeenCalledWith(ids(1, 12), 'approved'));
    await waitFor(() => expect(screen.getByText('3 pending · 12 decided')).toBeTruthy());

    // undo clears the crop (decideMany to pending does it on the server)
    fireEvent.click(screen.getByRole('button', { name: 'Undo page' }));
    await waitFor(() => expect(screen.getByText('15 pending')).toBeTruthy());
    expect(screen.queryByTestId('crop-badge')).toBeNull();
  });

  it('shows why a grid crop failed and leaves the tile as it was', async () => {
    const api = fakeApi(true, many(12));
    api.setCrop.mockRejectedValueOnce(new CropUnavailable());
    open(api);
    await screen.findByRole('region', { name: 'Photo grid' });
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Photo 2,/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^C\s*Crop$/ }));
    dragCrop([10, 10], [60, 50]);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Run supabase/migrations/0004_crop.sql to enable cropping',
    );
    expect(screen.queryByTestId('crop-badge')).toBeNull();
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

const use = (n: number, subject: Use['subject'] = 'sign', country = n % 2 ? 'lt' : 'pl'): Use => ({
  id: `u${n}`,
  candidateId: `c${n}`,
  subject,
  crop: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
  note: `Note ${n}`,
  country,
  storagePath: `candidates/c${n}.webp`,
  width: 1024,
  height: 768,
  preview: null,
  credit: `Ana Ruiz (${n})`,
  sourceUrl: `https://commons.wikimedia.org/wiki/File:c${n}.jpg`,
  title: null,
  description: `Sign near town ${n}`,
});
const signs = (n: number) => Array.from({ length: n }, (_, i) => use(i + 1));
const useIds = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `u${from + i}`);
const useTile = (n: number) => screen.getByRole('button', { name: new RegExp(`^Use ${n},`) });

describe('Curate by topic', () => {
  beforeEach(() => localStorage.setItem('metabook.curate.view', 'topic'));

  async function openSigns(api: ReturnType<typeof fakeApi>) {
    open(api);
    fireEvent.click(await screen.findByRole('button', { name: /^Signs\s*\d+$/ }));
    return screen.findByRole('region', { name: 'Suggestion grid' });
  }

  it('lists subjects with suggestion counts, and is a third view toggle', async () => {
    localStorage.setItem('metabook.curate.view', 'grid');
    open(fakeApi(true, many(3), [...signs(3), use(9, 'guardrail')]));
    await screen.findByRole('region', { name: 'Photo grid' });
    fireEvent.click(screen.getByRole('button', { name: 'By topic' }));
    expect(await screen.findByRole('button', { name: /^Signs\s*3$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Guardrails?\s*1$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Bollards/ })).toBeNull();
    expect(localStorage.getItem('metabook.curate.view')).toBe('topic');
  });

  it('shows 12 cropped uses at a time with their country; tap marks, Enter approves the rest', async () => {
    const api = fakeApi(true, [], signs(15));
    await openSigns(api);
    expect(api.listUses).toHaveBeenCalledWith('sign');
    expect(screen.getAllByRole('button', { name: /^Use \d+,/ })).toHaveLength(12);
    expect(useTile(1).getAttribute('aria-label')).toBe('Use 1, Lithuania');
    expect(useTile(1).textContent).toContain('Lithuania');

    fireEvent.click(useTile(2));
    expect(useTile(2).getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(window, { key: '5' });
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => expect(api.decideUses).toHaveBeenCalledTimes(2));
    expect(api.decideUses).toHaveBeenNthCalledWith(
      1,
      useIds(1, 12).filter((id) => id !== 'u2' && id !== 'u5'),
      'approved',
    );
    expect(api.decideUses).toHaveBeenNthCalledWith(2, ['u2', 'u5'], 'rejected');
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Use \d+,/ })).toHaveLength(3),
    );
    expect(screen.getByText('Signs · 3 suggested')).toBeTruthy();
  });

  it('undoes a page back to suggested', async () => {
    const api = fakeApi(true, [], signs(13));
    await openSigns(api);
    fireEvent.click(screen.getByRole('button', { name: /Approve the rest/ }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Use \d+,/ })).toHaveLength(1),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo page' }));
    await waitFor(() =>
      expect(api.decideUses).toHaveBeenLastCalledWith(useIds(1, 12), 'suggested'),
    );
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Use \d+,/ })).toHaveLength(12),
    );
    expect(screen.getByText('Signs · 13 suggested')).toBeTruthy();
  });

  it('adjusts a crop from the large view, prefilled with the use’s crop', async () => {
    const api = fakeApi(true, [], signs(3));
    await openSigns(api);
    fireEvent.click(useTile(1));
    fireEvent.contextMenu(useTile(1));
    const dialog = await screen.findByRole('dialog', { name: 'Suggestion' });
    expect(dialog.textContent).toContain('Note 1');
    expect(dialog.textContent).toContain('Sign near town 1');
    fireEvent.keyDown(window, { key: 'c' });
    expect(screen.getByText('Keeping 50% × 50% of the photo')).toBeTruthy();
    dragCrop([10, 10], [60, 50]);
    fireEvent.click(screen.getByRole('button', { name: /Save crop/ }));
    await waitFor(() => expect(api.updateUse).toHaveBeenCalledWith('u1', { crop: drawn }));
    // back to the large view; the adjusted use is a keep
    expect(await screen.findByRole('dialog', { name: 'Suggestion' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useTile(1).getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(api.decideUses).toHaveBeenCalledWith(useIds(1, 3), 'approved'));
  });

  it('moves a use to another subject and keeps the other marks', async () => {
    const api = fakeApi(true, [], signs(3));
    await openSigns(api);
    fireEvent.click(useTile(3));
    fireEvent.contextMenu(useTile(1));
    await screen.findByRole('dialog', { name: 'Suggestion' });
    fireEvent.change(screen.getByLabelText('Change subject'), { target: { value: 'guardrail' } });
    await waitFor(() => expect(api.updateUse).toHaveBeenCalledWith('u1', { subject: 'guardrail' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getAllByRole('button', { name: /^Use \d+,/ })).toHaveLength(2);
    expect(screen.getByText('Signs · 2 suggested')).toBeTruthy();
    // u3 (now tile 2) is still marked
    expect(useTile(2).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'All subjects' }));
    expect(await screen.findByRole('button', { name: /^Guardrails?\s*1$/ })).toBeTruthy();
  });

  it('shows why an update failed and leaves the use as it was', async () => {
    const api = fakeApi(true, [], signs(2));
    api.updateUse.mockRejectedValueOnce(
      new Error('That photo already has a use with this subject and crop.'),
    );
    await openSigns(api);
    fireEvent.contextMenu(useTile(1));
    await screen.findByRole('dialog', { name: 'Suggestion' });
    fireEvent.change(screen.getByLabelText('Change subject'), { target: { value: 'plate' } });
    expect((await screen.findByRole('alert')).textContent).toBe(
      'That photo already has a use with this subject and crop.',
    );
    expect(screen.getAllByRole('button', { name: /^Use \d+,/ })).toHaveLength(2);
  });

  it('says to run 0005 when the table is missing', async () => {
    const api = fakeApi();
    api.countUses.mockRejectedValueOnce(new UsesUnavailable());
    open(api);
    const region = await screen.findByRole('region', { name: 'Suggestions not set up' });
    expect(region.textContent).toContain('supabase/migrations/0005_media_uses.sql');
  });

  it('says how to load suggestions when there are none', async () => {
    open(fakeApi());
    expect(await screen.findByRole('region', { name: 'No suggestions' })).toBeTruthy();
  });
});

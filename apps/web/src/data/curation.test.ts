import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  AlreadyCollected,
  CropUnavailable,
  DuplicateUse,
  isMissingCrop,
  isMissingUses,
  supabaseCuration,
  UsesUnavailable,
} from './curation';
import type { Decision } from './curation';

/** PostgREST's answer to a write naming a column the table doesn't have. */
const NO_CROP = {
  code: 'PGRST204',
  message: "Could not find the 'crop' column of 'media_candidates' in the schema cache",
};

/**
 * A chainable stand-in for a PostgREST update; `select` resolves with the matched rows. With
 * `withoutCrop`, any update that writes crop fails as it does before 0004_crop.sql.
 */
function fakeClient(matched: (filters: unknown[][]) => { id: string }[], withoutCrop = false) {
  const filters: unknown[][] = [];
  let payload: object = {};
  const query = {
    eq: vi.fn((...args: unknown[]) => (filters.push(['eq', ...args]), query)),
    in: vi.fn((...args: unknown[]) => (filters.push(['in', ...args]), query)),
    is: vi.fn((...args: unknown[]) => (filters.push(['is', ...args]), query)),
    select: vi.fn(async () =>
      withoutCrop && 'crop' in payload
        ? { data: null, error: NO_CROP }
        : { data: matched(filters), error: null },
    ),
  };
  const update = vi.fn((values: object) => {
    filters.length = 0;
    payload = values;
    return query;
  });
  const client = { from: () => ({ update }) } as unknown as SupabaseClient;
  return { client, update, query, filters };
}

const uncollected = (filters: unknown[][]) =>
  filters.some(([op, column]) => op === 'is' && column === 'collected_at');

describe('supabaseCuration', () => {
  it('updates only the columns 0003_media.sql grants UPDATE on', async () => {
    const { client, update } = fakeClient(() => [{ id: 'a' }]);
    await supabaseCuration(client).decide('a', {
      status: 'approved',
      subject: 'pole',
      giveaways: ['pole'],
      caption: 'Roadside post',
    });
    const granted = [
      'status',
      'subject',
      'giveaways',
      'caption',
      'region',
      'note_id',
      'decided_at',
      'crop',
    ];
    const columns = Object.keys((update.mock.calls[0] as unknown[])[0] as object);
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.filter((c) => !granted.includes(c))).toEqual([]);
  });

  it('decideMany sends one filtered update with only status and decided_at', async () => {
    const { client, update, query } = fakeClient(() => [{ id: 'a' }, { id: 'b' }]);
    const api = supabaseCuration(client);

    expect(await api.decideMany(['a', 'b'], 'rejected')).toEqual(['a', 'b']);
    expect(query.in).toHaveBeenCalledWith('id', ['a', 'b']);
    expect(query.is).not.toHaveBeenCalled();
    expect(Object.keys((update.mock.calls[0] as unknown[])[0] as object).sort()).toEqual([
      'decided_at',
      'status',
    ]);

    expect(await api.decideMany([], 'approved')).toEqual([]);
    expect(update).toHaveBeenCalledTimes(1);

    await api.decideMany(['a'], 'pending');
    expect((update.mock.calls[1] as unknown[])[0]).toMatchObject({
      status: 'pending',
      decided_at: null,
    });
  });

  it('never undoes a collected row: undo filters on collected_at and reports what it reset', async () => {
    // b was collected: the filtered update only matches a
    const { client, filters } = fakeClient((f) =>
      uncollected(f) ? [{ id: 'a' }] : [{ id: 'a' }, { id: 'b' }],
    );
    const api = supabaseCuration(client);
    expect(await api.decideMany(['a', 'b'], 'pending')).toEqual(['a']);
    expect(filters).toContainEqual(['is', 'collected_at', null]);
  });

  it('throws AlreadyCollected when a single undo matches no uncollected row', async () => {
    const { client } = fakeClient((f) => (uncollected(f) ? [] : [{ id: 'a' }]));
    const api = supabaseCuration(client);
    const pending: Decision = { status: 'pending', subject: 'pole', giveaways: [], caption: null };
    await expect(api.decide('a', pending)).rejects.toBeInstanceOf(AlreadyCollected);
    await expect(api.decide('a', { ...pending, status: 'approved' })).resolves.toBeUndefined();
  });
});

describe('cropping', () => {
  const crop = { x: 0.1, y: 0.2, w: 0.5, h: 0.4 };

  it('decide writes the crop only when the decision has one', async () => {
    const { client, update } = fakeClient(() => [{ id: 'a' }]);
    const api = supabaseCuration(client);
    const base = { subject: 'pole', giveaways: [], caption: null } satisfies Partial<Decision>;
    await api.decide('a', { ...base, status: 'approved', crop });
    expect((update.mock.calls[0] as unknown[])[0]).toMatchObject({ status: 'approved', crop });
    await api.decide('a', { ...base, status: 'rejected' });
    expect((update.mock.calls[1] as unknown[])[0]).not.toHaveProperty('crop');
  });

  it('setCrop updates only crop, on an uncollected row', async () => {
    const { client, update, filters } = fakeClient(() => [{ id: 'a' }]);
    await supabaseCuration(client).setCrop('a', crop);
    expect((update.mock.calls[0] as unknown[])[0]).toEqual({ crop });
    expect(filters).toContainEqual(['eq', 'id', 'a']);
    expect(filters).toContainEqual(['is', 'collected_at', null]);
  });

  it('undoing a page clears the crop of the rows it resets', async () => {
    const { client, update } = fakeClient(() => [{ id: 'a' }]);
    await supabaseCuration(client).decideMany(['a'], 'pending');
    expect((update.mock.calls[0] as unknown[])[0]).toMatchObject({ status: 'pending', crop: null });
  });

  it('without the crop column: saving a crop says which migration to run', async () => {
    const { client } = fakeClient(() => [{ id: 'a' }], true);
    const api = supabaseCuration(client);
    await expect(api.setCrop('a', crop)).rejects.toBeInstanceOf(CropUnavailable);
    await expect(
      api.decide('a', { status: 'approved', subject: 'pole', giveaways: [], caption: null, crop }),
    ).rejects.toThrow('Run supabase/migrations/0004_crop.sql to enable cropping');
  });

  it('without the crop column: undo still works, retrying without crop', async () => {
    const { client, update } = fakeClient(() => [{ id: 'a' }], true);
    const api = supabaseCuration(client);
    expect(await api.decideMany(['a'], 'pending')).toEqual(['a']);
    expect(update).toHaveBeenCalledTimes(2);
    expect((update.mock.calls[1] as unknown[])[0]).not.toHaveProperty('crop');
    // it remembers: the next undo goes straight without crop
    await api.decide('a', {
      status: 'pending',
      subject: 'pole',
      giveaways: [],
      caption: null,
      crop: null,
    });
    expect(update).toHaveBeenCalledTimes(3);
    expect((update.mock.calls[2] as unknown[])[0]).not.toHaveProperty('crop');
  });

  it('recognises PostgREST missing-column errors for crop only', () => {
    expect(isMissingCrop(NO_CROP)).toBe(true);
    expect(
      isMissingCrop({ code: '42703', message: 'column media_candidates.crop does not exist' }),
    ).toBe(true);
    expect(
      isMissingCrop({ code: '42703', message: 'column media_candidates.foo does not exist' }),
    ).toBe(false);
    expect(isMissingCrop(null)).toBe(false);
  });
});

describe('listPending', () => {
  it('reads crop, and falls back to the old columns before 0004_crop.sql', async () => {
    const selects: string[] = [];
    const query = {
      select: (columns: string) => (selects.push(columns), query),
      eq: () => query,
      order: () => query,
      range: async () =>
        selects.at(-1)!.includes('crop')
          ? {
              data: null,
              error: { code: '42703', message: 'column media_candidates.crop does not exist' },
            }
          : { data: [{ id: 'a', giveaways: null }], error: null },
    };
    const client = { from: () => query } as unknown as SupabaseClient;
    const rows = await supabaseCuration(client).listPending();
    expect(rows).toMatchObject([{ id: 'a', crop: null, width: null, height: null }]);
    expect(selects).toHaveLength(2);
  });

  it('pages past the 1000-row PostgREST limit', async () => {
    const total = 2345;
    const ranges: [number, number][] = [];
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      range: async (from: number, to: number) => {
        ranges.push([from, to]);
        const n = Math.max(0, Math.min(to, total - 1) - from + 1);
        return {
          data: Array.from({ length: n }, (_, i) => ({ id: `r${from + i}`, giveaways: null })),
          error: null,
        };
      },
    };
    const client = { from: () => query } as unknown as SupabaseClient;
    const rows = await supabaseCuration(client).listPending();
    expect(rows).toHaveLength(total);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
});

const NO_USES = {
  code: 'PGRST205',
  message: "Could not find the table 'public.media_uses' in the schema cache",
};

describe('media uses', () => {
  /** A read query whose `range` answers with `page(from, to)`; records the table and filters. */
  function readClient(page: (from: number, to: number) => { data: unknown; error: unknown }) {
    const calls: unknown[][] = [];
    const query = {
      select: (...args: unknown[]) => (calls.push(['select', ...args]), query),
      eq: (...args: unknown[]) => (calls.push(['eq', ...args]), query),
      order: () => query,
      range: async (from: number, to: number) => page(from, to),
    };
    const tables: string[] = [];
    const client = {
      from: (table: string) => (tables.push(table), query),
    } as unknown as SupabaseClient;
    return { client, calls, tables };
  }

  it('countUses counts suggested uses by subject, past the 1000-row limit', async () => {
    const { client, calls, tables } = readClient((from) => ({
      data: Array.from({ length: from ? 5 : 1000 }, (_, i) => ({
        subject: i % 2 ? 'sign' : 'guardrail',
      })),
      error: null,
    }));
    expect(await supabaseCuration(client).countUses()).toEqual({ guardrail: 503, sign: 502 });
    expect(tables).toEqual(['media_uses', 'media_uses']);
    expect(calls).toContainEqual(['eq', 'status', 'suggested']);
  });

  it('listUses reads one subject with its candidate and maps it', async () => {
    const { client, calls } = readClient(() => ({
      data: [
        {
          id: 'u1',
          candidate_id: 'c1',
          subject: 'sign',
          crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
          note: 'Yellow sign',
          candidate: {
            country: 'pl',
            storage_path: 'candidates/abc.webp',
            width: 1024,
            height: 768,
            preview: null,
            credit: 'Ana',
            source_url: 'https://x',
            title: null,
            description: 'Near a town',
          },
        },
      ],
      error: null,
    }));
    const rows = await supabaseCuration(client).listUses('sign');
    expect(rows).toEqual([
      {
        id: 'u1',
        candidateId: 'c1',
        subject: 'sign',
        crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
        note: 'Yellow sign',
        country: 'pl',
        storagePath: 'candidates/abc.webp',
        width: 1024,
        height: 768,
        preview: null,
        credit: 'Ana',
        sourceUrl: 'https://x',
        title: null,
        description: 'Near a town',
      },
    ]);
    expect(calls).toContainEqual(['eq', 'subject', 'sign']);
    expect(calls).toContainEqual(['eq', 'status', 'suggested']);
    expect(String(calls.find((c) => c[0] === 'select')?.[1])).toContain(
      'candidate:media_candidates(',
    );
  });

  it('says to run 0005 when media_uses is missing', async () => {
    const { client } = readClient(() => ({ data: null, error: NO_USES }));
    const api = supabaseCuration(client);
    await expect(api.countUses()).rejects.toBeInstanceOf(UsesUnavailable);
    await expect(api.listUses('sign')).rejects.toThrow('0005_media_uses.sql');
    expect(isMissingUses(NO_USES)).toBe(true);
    expect(isMissingUses({ code: 'PGRST205', message: 'media_candidates' })).toBe(false);
  });

  it('decideUses writes only status and decided_at; undo skips collected uses', async () => {
    const { client, update, query, filters } = fakeClient((f) =>
      uncollected(f) ? [{ id: 'a' }] : [{ id: 'a' }, { id: 'b' }],
    );
    const api = supabaseCuration(client);
    expect(await api.decideUses(['a', 'b'], 'approved')).toEqual(['a', 'b']);
    expect(query.in).toHaveBeenCalledWith('id', ['a', 'b']);
    expect(Object.keys((update.mock.calls[0] as unknown[])[0] as object).sort()).toEqual([
      'decided_at',
      'status',
    ]);
    expect(await api.decideUses(['a', 'b'], 'suggested')).toEqual(['a']);
    expect(filters).toContainEqual(['is', 'collected_at', null]);
    expect((update.mock.calls[1] as unknown[])[0]).toEqual({
      status: 'suggested',
      decided_at: null,
    });
    expect(await api.decideUses([], 'rejected')).toEqual([]);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('updateUse writes only crop and/or subject of an uncollected use', async () => {
    const { client, update, filters } = fakeClient(() => [{ id: 'a' }]);
    const api = supabaseCuration(client);
    const crop = { x: 0, y: 0, w: 0.5, h: 0.5 };
    await api.updateUse('a', { crop });
    expect((update.mock.calls[0] as unknown[])[0]).toEqual({ crop });
    await api.updateUse('a', { subject: 'guardrail' });
    expect((update.mock.calls[1] as unknown[])[0]).toEqual({ subject: 'guardrail' });
    expect(filters).toContainEqual(['eq', 'id', 'a']);
    expect(filters).toContainEqual(['is', 'collected_at', null]);
  });

  it('updateUse reports a clash with another use of the same photo', async () => {
    const query = {
      eq: () => query,
      is: () => query,
      select: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }),
    };
    const client = { from: () => ({ update: () => query }) } as unknown as SupabaseClient;
    await expect(
      supabaseCuration(client).updateUse('a', { subject: 'sign' }),
    ).rejects.toBeInstanceOf(DuplicateUse);
  });
});

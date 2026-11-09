import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AlreadyCollected, supabaseCuration } from './curation';
import type { Decision } from './curation';

/** A chainable stand-in for a PostgREST update; `select` resolves with the matched rows. */
function fakeClient(matched: (filters: unknown[][]) => { id: string }[]) {
  const filters: unknown[][] = [];
  const query = {
    eq: vi.fn((...args: unknown[]) => (filters.push(['eq', ...args]), query)),
    in: vi.fn((...args: unknown[]) => (filters.push(['in', ...args]), query)),
    is: vi.fn((...args: unknown[]) => (filters.push(['is', ...args]), query)),
    select: vi.fn(async () => ({ data: matched(filters), error: null })),
  };
  const update = vi.fn(() => {
    filters.length = 0;
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

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { supabaseCuration } from './curation';

describe('supabaseCuration', () => {
  it('updates only the columns 0003_media.sql grants UPDATE on', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const client = { from: () => ({ update }) } as unknown as SupabaseClient;
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
    const inFilter = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ in: inFilter }));
    const client = { from: () => ({ update }) } as unknown as SupabaseClient;
    const api = supabaseCuration(client);

    await api.decideMany(['a', 'b'], 'rejected');
    expect(inFilter).toHaveBeenCalledWith('id', ['a', 'b']);
    expect(Object.keys((update.mock.calls[0] as unknown[])[0] as object).sort()).toEqual([
      'decided_at',
      'status',
    ]);

    await api.decideMany([], 'approved');
    expect(update).toHaveBeenCalledTimes(1);

    await api.decideMany(['a'], 'pending');
    expect((update.mock.calls[1] as unknown[])[0]).toMatchObject({
      status: 'pending',
      decided_at: null,
    });
  });
});

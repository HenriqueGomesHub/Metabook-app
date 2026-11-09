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
    const granted = ['status', 'subject', 'giveaways', 'caption', 'region', 'note_id', 'decided_at'];
    const columns = Object.keys((update.mock.calls[0] as unknown[])[0] as object);
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.filter((c) => !granted.includes(c))).toEqual([]);
  });
});

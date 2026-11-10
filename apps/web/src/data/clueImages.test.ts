import { applyClueOverrides, clueCardIds } from '@metabook/core';
import type { ClueImage } from '@metabook/core';
import { CLUE_COUNTRIES, CLUE_POOL } from '@metabook/core/src/__fixtures__/clues';
import { describe, expect, it, vi } from 'vitest';
import { ClueImageUrls, SIGNED_TTL_MS } from './clueImages';
import { visibleClues, withClueCards } from './content';
import type { Content } from './content';

const hotlinked: ClueImage = { id: 'a', src: 'https://www.plonkit.net/images/poland/a.png' };
const stored: ClueImage = {
  id: 'b',
  src: 'https://www.plonkit.net/images/poland/b.png',
  path: 'pl/b.webp',
};
const other: ClueImage = {
  id: 'c',
  src: 'https://www.plonkit.net/images/poland/c.png',
  path: 'pl/c.webp',
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ClueImageUrls', () => {
  it('uses the original URL for an image without a bucket path, without signing', async () => {
    const sign = vi.fn(async () => ({}));
    const urls = new ClueImageUrls(sign);
    expect(urls.peek(hotlinked)).toBe(hotlinked.src);
    expect(await urls.url(hotlinked)).toBe(hotlinked.src);
    expect(sign).not.toHaveBeenCalled();
  });

  it('signs bucket paths in one batch and caches them for 50 minutes', async () => {
    let now = 1_000;
    const sign = vi.fn(async (paths: string[]) =>
      Object.fromEntries(paths.map((p) => [p, `https://signed.example/${p}?t=${now}`])),
    );
    const urls = new ClueImageUrls(sign, () => now);
    expect(urls.peek(stored)).toBeUndefined();
    const [b, c] = await Promise.all([urls.url(stored), urls.url(other)]);
    expect(b).toBe('https://signed.example/pl/b.webp?t=1000');
    expect(c).toBe('https://signed.example/pl/c.webp?t=1000');
    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledWith(['pl/b.webp', 'pl/c.webp']);

    now += SIGNED_TTL_MS - 1;
    expect(urls.peek(stored)).toBe(b);
    now += 1;
    expect(urls.peek(stored)).toBeUndefined();
    expect(await urls.url(stored)).toBe(`https://signed.example/pl/b.webp?t=${now}`);
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it('falls back to the original URL when a path cannot be signed', async () => {
    const urls = new ClueImageUrls(async () => {
      throw new Error('bucket missing');
    });
    expect(await urls.url(stored)).toBe(stored.src);
    // the failure is cached too: no request storm
    expect(urls.peek(stored)).toBe(stored.src);
    const partial = new ClueImageUrls(async () => ({ 'pl/c.webp': 'https://signed.example/c' }));
    const [b, c] = await Promise.all([partial.url(stored), partial.url(other)]);
    expect(b).toBe(stored.src);
    expect(c).toBe('https://signed.example/c');
    await tick();
  });
});

describe('clue image overrides', () => {
  const base: Content = {
    pool: CLUE_POOL,
    chapters: [],
    cards: [],
    tips: [],
    clues: CLUE_COUNTRIES,
    clueOverrides: [],
  };

  it('drop hidden images from cards and Learn, and make cropped giveaways drillable', () => {
    const overrides = [
      { imageId: 'a1b2c3', clueId: 'PL-vySo', crop: null, hidden: true },
      { imageId: 'aa0001', clueId: 'PL-doge', crop: { x: 0, y: 0, w: 0.4, h: 0.4 }, hidden: false },
    ];
    const ids = withClueCards(base, overrides).cards.map((c) => c.id);
    expect(ids).not.toContain(clueCardIds.spot('PL-vySo', 'a1b2c3'));
    expect(ids).toContain(clueCardIds.spot('PL-doge', 'aa0001'));
    // the bollard now has no image: it becomes a Clue quiz text card, unless it names Poland
    expect(ids).not.toContain(clueCardIds.text('PL-vySo'));

    const visible = visibleClues({ clues: CLUE_COUNTRIES, clueOverrides: overrides });
    const bollard = visible[0]!.clues.find((c) => c.id === 'PL-vySo')!;
    expect(bollard.images).toEqual([]);
    expect(visible).toEqual(applyClueOverrides(CLUE_COUNTRIES, overrides));
  });

  it('builds cards from no catalogue at all', () => {
    expect(withClueCards({ ...base, clues: [] }, []).cards).toEqual([]);
  });
});

describe('SupabaseRepository before migration 0006', () => {
  it('treats a missing overrides table and a missing bucket as empty', async () => {
    const { SupabaseRepository } = await import('./supabase');
    const missing = {
      data: null,
      error: { message: 'relation "clue_image_overrides" does not exist' },
    };
    const query = {
      select: () => query,
      order: () => query,
      range: async () => missing,
    };
    const client = {
      from: () => query,
      storage: {
        from: () => ({ createSignedUrls: async () => ({ data: null, error: missing.error }) }),
      },
    };
    const repo = new SupabaseRepository(client as never);
    expect(await repo.listClueImageOverrides()).toEqual([]);
    expect(await repo.signClueImages(['pl/b.webp'])).toEqual({});
  });
});

import { describe, expect, it } from 'vitest';
import { cardContext, pickTip, rankTips } from './tips';
import type { Tip, TipView } from './types';

const tip = (id: string, scope = 'any', answer = 'Brazil'): Tip => ({
  id,
  answer,
  scope,
  text: id,
  source: 'https://example.org',
});

const tips = [tip('b'), tip('a', 'flag'), tip('c', 'script'), tip('d', 'any', 'Peru')];
const view = (tipId: string, lastShown: string): TipView => ({ tipId, lastShown });

describe('pickTip', () => {
  it('filters by answer and scope (or any), never-seen first, ties by id', () => {
    expect(pickTip(tips, 'Brazil', 'flag', [])).toEqual({ tip: tips[1], index: 0, total: 2 });
  });

  it('puts preferred tips first, then keeps the rotation', () => {
    const views = [view('c', '2026-03-01T00:00:00Z')];
    const prefer = (t: Tip) => t.id === 'c';
    expect(pickTip(tips, 'Brazil', 'script', views, 0, prefer)).toEqual({
      tip: tips[2],
      index: 1,
      total: 2,
    });
    expect(pickTip(tips, 'Brazil', 'script', views, 1, prefer)?.tip.id).toBe('b');
  });

  it('picks the least recently seen tip', () => {
    const views = [view('a', '2026-03-02T00:00:00Z'), view('b', '2026-03-01T00:00:00Z')];
    expect(pickTip(tips, 'Brazil', 'flag', views)?.tip.id).toBe('b');
  });

  it('rotates as views are recorded', () => {
    const views: TipView[] = [];
    const seen = ['2026-03-01', '2026-03-02', '2026-03-03'].map((day) => {
      const picked = pickTip(tips, 'Brazil', 'flag', views);
      views.push(view(picked?.tip.id ?? '', `${day}T00:00:00Z`));
      return picked?.tip.id;
    });
    expect(seen).toEqual(['a', 'b', 'a']);
  });

  it('visits A, B, C in order when a view is recorded on show and "Another tip" calls pickTip with skip=0', () => {
    const rotation = [tip('a'), tip('b'), tip('c')];
    const views: TipView[] = [];
    const visited = ['01', '02', '03'].map((day) => {
      const picked = pickTip(rotation, 'Brazil', 'flag', views, 0);
      views.push(view(picked?.tip.id ?? '', `2026-03-${day}T00:00:00Z`));
      return picked?.tip.id;
    });
    expect(visited).toEqual(['a', 'b', 'c']);
  });

  it('reports a stable index by id order as views advance', () => {
    const rotation = [tip('c'), tip('a'), tip('b')];
    const views: TipView[] = [];
    const indexes = ['01', '02', '03'].map((day) => {
      const picked = pickTip(rotation, 'Brazil', 'flag', views);
      views.push(view(picked?.tip.id ?? '', `2026-03-${day}T00:00:00Z`));
      return picked?.index;
    });
    expect(indexes).toEqual([0, 1, 2]);
  });

  it('steps through with skip for "Another tip" and wraps', () => {
    expect([0, 1, 2].map((skip) => pickTip(tips, 'Brazil', 'flag', [], skip)?.tip.id)).toEqual([
      'a',
      'b',
      'a',
    ]);
    expect(pickTip(tips, 'Brazil', 'flag', [], 3)?.index).toBe(1);
  });

  it('returns null when no tip matches', () => {
    expect(pickTip(tips, 'Chile', 'flag', [])).toBeNull();
  });
});

describe('rankTips', () => {
  const ua = (id: string, text: string): Tip => ({ ...tip(id, 'lookalike', 'Ukraine'), text });
  const all = [
    ua('a', 'Ukrainian uses і, ї, є and ґ, which Russian lacks.'),
    ua('b', 'If you see "вул." for street, it is Ukraine.'),
    ua('c', 'Yellow and blue flags on poles.'),
  ];

  it('puts the tip about what the card shows first', () => {
    const context = 'Street sign: вул. Шевченка';
    expect(rankTips(all, 'Ukraine', 'lookalike', [], context).map((t) => t.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('ranks by shared special letters too', () => {
    const context = 'Їжак і пес';
    expect(rankTips(all, 'Ukraine', 'lookalike', [], context)[0]?.id).toBe('a');
  });

  it('falls back to least recently seen without context', () => {
    const views = [view('a', '2026-03-01T00:00:00Z')];
    expect(rankTips(all, 'Ukraine', 'lookalike', views).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('reads a card as its text, image description and reason', () => {
    const card = {
      prompt: { kind: 'image', value: 'x.webp', alt: 'yellow bollard' },
      explain: 'only here',
    } as Parameters<typeof cardContext>[0];
    expect(cardContext(card)).toBe('yellow bollard only here');
  });
});

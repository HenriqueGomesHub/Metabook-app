import { describe, expect, it } from 'vitest';
import { mulberry32, shuffle } from './random';

describe('mulberry32', () => {
  it('repeats for a seed and stays in [0, 1)', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const values = Array.from({ length: 1000 }, () => a());
    expect(values.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe('shuffle', () => {
  it('permutes without mutating the input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, mulberry32(5));
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(input);
    expect(out).not.toEqual(input);
  });
});

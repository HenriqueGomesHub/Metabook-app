import { describe, expect, it } from 'vitest';
import { formatDayRange } from './dates';

describe('formatDayRange', () => {
  it.each([
    ['2026-11-07', '2026-11-16', '7–16 Nov 2026'],
    ['2026-10-28', '2026-11-03', '28 Oct – 3 Nov 2026'],
    ['2026-12-28', '2027-01-03', '28 Dec 2026 – 3 Jan 2027'],
    ['2026-11-07', '2026-11-07', '7 Nov 2026'],
  ])('%s to %s', (from, to, expected) => {
    expect(formatDayRange(from, to)).toBe(expected);
  });
});

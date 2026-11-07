import { describe, expect, it } from 'vitest';
import type { AppSnapshot } from './AppData';
import { blockStudyChange, localDay } from './dataActions';

const now = new Date(2026, 10, 7, 12);

function withActiveBlock(): AppSnapshot {
  return {
    blocks: [
      {
        id: 'b1',
        startsOn: localDay(now),
        endsOn: localDay(new Date(2026, 10, 20)),
        minutesPerDay: 20,
        targets: [],
        baseline: {} as AppSnapshot['blocks'][number]['baseline'],
        status: 'active',
      },
    ],
    blockDays: [],
  } as unknown as AppSnapshot;
}

describe('blockStudyChange', () => {
  it('keeps exact minutes so quick answers add up', () => {
    let data = withActiveBlock();
    for (let i = 0; i < 4; i++) data = blockStudyChange(data, 2000, now)!.data;
    expect(data.blockDays).toHaveLength(1);
    expect(data.blockDays[0]).toMatchObject({ cardsDone: 4 });
    expect(data.blockDays[0]?.minutesDone).toBeCloseTo(8000 / 60000);
  });

  it('does nothing without an active block', () => {
    expect(blockStudyChange({ ...withActiveBlock(), blocks: [] }, 2000, now)).toBeNull();
  });
});

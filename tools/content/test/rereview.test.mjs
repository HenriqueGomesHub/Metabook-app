import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { applyRereviews } from '../review.mjs';

function fakeQueue(statuses) {
  const calls = { deleted: [], inserted: [], settled: [] };
  return {
    calls,
    async statuses(ids) {
      return new Map(ids.filter((id) => statuses[id]).map((id) => [id, statuses[id]]));
    },
    async deleteSuggestedUses(ids) {
      calls.deleted.push(...ids);
    },
    async insertUses(rows) {
      calls.inserted.push(...rows);
    },
    async settleReviewed(ids, status) {
      calls.settled.push(...ids.map((id) => [id, status]));
      return ids;
    },
  };
}

describe('applyRereviews', () => {
  it('replaces suggested uses, rejects dropped photos and skips anything not agent-reviewed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rereview-'));
    const a = '11111111-1111-1111-1111-111111111111';
    const b = '22222222-2222-2222-2222-222222222222';
    const c = '33333333-3333-3333-3333-333333333333';
    writeFileSync(join(dir, 'x.json'), JSON.stringify([
      { id: a, uses: [{ subject: 'bollard', crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }, note: 'post by the road' }] },
      { id: b, reject: 'windshield glare' },
      { id: c, uses: [{ subject: 'pole', crop: { x: 0, y: 0, w: 1, h: 1 } }] },
    ]));
    const queue = fakeQueue({ [a]: 'reviewed', [b]: 'reviewed', [c]: 'approved' });
    const { all } = await applyRereviews({ queue, dir });
    assert.deepEqual(queue.calls.deleted, [a, b]);
    assert.equal(queue.calls.inserted.length, 1);
    assert.equal(queue.calls.inserted[0].candidate_id ?? queue.calls.inserted[0].candidateId, a);
    assert.deepEqual(queue.calls.settled, [[b, 'rejected']]);
    assert.deepEqual(all.counts, { entries: 3, rejected: 1, replaced: 1, uses: 1, skipped: 1, invalid: 0 });
  });
});

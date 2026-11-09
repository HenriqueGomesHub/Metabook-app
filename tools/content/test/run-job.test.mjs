import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCountries } from '../lib/common.mjs';
import { parseJob } from '../run-job.mjs';

describe('jobs', () => {
  it('reads a job with defaults', () => {
    const job = parseJob('{"name":"pl-test","countries":["pl"],"steps":["facts","generate"]}');
    assert.deepEqual(job.subjects, ['bollard', 'pole', 'plate', 'sign']);
    assert.equal(job.perSubject, 40);
  });

  it('rejects unknown steps and bad names', () => {
    assert.throws(() => parseJob('{"name":"x","countries":"all","steps":["fetch"]}'), /steps/);
    assert.throws(() => parseJob('{"name":"../x","countries":"all","steps":["facts"]}'), /name/);
  });

  it('resolves "all" to the in-pool countries, lower case', () => {
    const pool = [
      { code: 'PL', name: 'Poland', continent: 'europe', in_pool: true },
      { code: 'BY', name: 'Belarus', continent: 'europe', in_pool: false },
    ];
    assert.deepEqual(resolveCountries('all', pool), ['pl']);
    assert.deepEqual(resolveCountries(['PL'], pool), ['pl']);
    assert.throws(() => resolveCountries(['zz'], pool), /not in content\/pool.json/);
  });
});

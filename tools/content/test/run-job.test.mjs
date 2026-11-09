import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { resolveCountries } from '../lib/common.mjs';
import { jobName, parseJob, runJob, runJobFile } from '../run-job.mjs';

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

describe('result files', () => {
  const setup = (file, text) => {
    const dir = mkdtempSync(join(tmpdir(), 'run-job-'));
    writeFileSync(join(dir, file), text);
    return dir;
  };
  const result = (dir, name) => JSON.parse(readFileSync(join(dir, `${name}.result.json`), 'utf8'));
  const quiet = async (fn) => {
    const error = console.error;
    console.error = () => {};
    try {
      return await fn();
    } finally {
      console.error = error;
    }
  };

  it('writes a fatal result for an unreadable job file, named after the file', async () => {
    const dir = setup('bad job.json', '{ nope');
    await quiet(() => runJobFile(join(dir, 'bad job.json'), dir));
    const written = result(dir, 'bad_job');
    assert.equal(written.name, 'bad_job');
    assert.match(written.fatal, /JSON/);
    assert.deepEqual(written.steps, []);
  });

  it('writes a fatal result for a bad job or an unknown country, named after the job', async () => {
    const dir = setup('a.json', '{"name":"a","countries":["zz"],"steps":["facts"]}');
    await quiet(() => runJobFile(join(dir, 'a.json'), dir));
    assert.match(result(dir, 'a').fatal, /zz is not in content\/pool.json/);
    writeFileSync(join(dir, 'b.json'), '{"name":"b","countries":["pl"],"steps":["nope"]}');
    await quiet(() => runJobFile(join(dir, 'b.json'), dir));
    assert.match(result(dir, 'b').fatal, /steps/);
  });

  it('rewrites the result after every step and finishes with validation', async () => {
    const job = parseJob('{"name":"c","countries":[],"steps":["regions","regions"]}');
    const seen = [];
    const steps = [];
    await runJob(job, { steps, onStep: () => seen.push(steps.length) });
    assert.deepEqual(seen, [1, 2]);

    const dir = setup('c.json', JSON.stringify(job));
    await runJobFile(join(dir, 'c.json'), dir);
    const done = result(dir, 'c');
    assert.equal(done.steps.length, 2);
    assert.ok(done.finishedAt && done.validation);
    assert.equal(done.fatal, undefined);
  });

  it('names a job from its file when the name is unusable', () => {
    assert.equal(jobName('content/jobs/x-y.json'), 'x-y');
    assert.equal(jobName('/no/such/some job.json'), 'some_job');
  });

  it('accepts only a positive budgetMinutes', () => {
    const base = { name: 'x', countries: 'all', steps: ['facts'] };
    assert.equal(parseJob(JSON.stringify({ ...base, budgetMinutes: 3 })).budgetMinutes, 3);
    assert.throws(() => parseJob(JSON.stringify({ ...base, budgetMinutes: 0 })), /budgetMinutes/);
  });
});

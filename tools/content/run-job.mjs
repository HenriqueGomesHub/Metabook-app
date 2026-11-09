// Runs a job file and writes content/jobs/<name>.result.json. Every step and country is isolated:
// a failure is recorded with its message and the run carries on. Only an unreadable job file
// makes it exit non-zero.
// CLI: node tools/content/run-job.mjs content/jobs/pl-test.json
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT, ROOT, loadPool, resolveCountries, writeJson } from './lib/common.mjs';

export const STEPS = ['facts', 'commons', 'mapillary', 'regions', 'collect', 'generate'];
const DEFAULT_SUBJECTS = ['bollard', 'pole', 'plate', 'sign'];

export function parseJob(text) {
  const job = JSON.parse(text);
  if (!job.name || !/^[\w-]+$/.test(job.name)) throw new Error('job.name must be letters, digits, - or _');
  if (!job.countries) throw new Error('job.countries is required (array of codes or "all")');
  const steps = job.steps ?? [];
  const unknown = steps.filter((s) => !STEPS.includes(s));
  if (steps.length === 0 || unknown.length) throw new Error(`job.steps must be some of ${STEPS.join(', ')}`);
  return { subjects: DEFAULT_SUBJECTS, perSubject: 40, ...job, steps };
}

const timed = async (fn) => {
  const start = Date.now();
  try {
    const value = await fn();
    return { ok: true, ms: Date.now() - start, ...value };
  } catch (error) {
    return { ok: false, ms: Date.now() - start, errors: [error.message] };
  }
};

/** Runs `fn(country)` for each country, never letting one failure stop the others. */
async function eachCountry(countries, fn) {
  const out = {};
  for (const code of countries) out[code] = await timed(() => fn(code));
  return out;
}

/** Runs `fn(subject)` for each subject; a country result with per-subject counts and errors. */
async function eachSubject(subjects, fn) {
  const counts = {};
  const errors = [];
  for (const subject of subjects) {
    try {
      const result = await fn(subject);
      counts[subject] = { ...result.counts, ...(result.dropped && { dropped: result.dropped }) };
      errors.push(...(result.errors ?? []).map((e) => `${subject}: ${e}`));
    } catch (error) {
      errors.push(`${subject}: ${error.message}`);
    }
  }
  // a queue error repeats for every subject; once is enough
  return { counts, errors: [...new Set(errors)] };
}

/** Lazily created clients so a job without photo steps needs no secrets. */
function clients() {
  let made;
  return async () => {
    if (!made) {
      const { createStorage } = await import('./storage.mjs');
      const { createQueue } = await import('./queue.mjs');
      made = { storage: createStorage(), queue: createQueue() };
      await made.storage.ensureBucket();
    }
    return made;
  };
}

export async function runJob(job) {
  const countries = resolveCountries(job.countries, loadPool());
  const getClients = clients();
  const steps = [];
  for (const step of job.steps) {
    const start = Date.now();
    let result;
    if (step === 'facts') {
      const { updateFacts } = await import('./wikidata.mjs');
      const all = await timed(async () => ({ countries: await updateFacts(countries) }));
      result = all.ok
        ? Object.fromEntries(Object.entries(all.countries).map(([c, r]) => [c, { ok: !r.missing, counts: { added: r.added }, ...(r.missing && { errors: ['not found on Wikidata'] }) }]))
        : Object.fromEntries(countries.map((c) => [c, all]));
    } else if (step === 'commons') {
      const { runCommons } = await import('./commons.mjs');
      result = await eachCountry(countries, async (code) => {
        const { storage, queue } = await getClients();
        return eachSubject(job.subjects, (subject) => runCommons(code, subject, { storage, queue, cap: job.perSubject }));
      });
    } else if (step === 'mapillary') {
      const { runMapillary } = await import('./mapillary.mjs');
      // Mapillary only tells poles apart; every other subject is the same roadside-scene search
      const subjects = [...new Set(job.subjects.map((s) => (s === 'pole' ? 'pole' : 'bollard')))];
      result = await eachCountry(countries, async (code) => {
        const { storage, queue } = await getClients();
        return eachSubject(subjects, (subject) => runMapillary(code, subject, { storage, queue, cap: job.perSubject }));
      });
    } else if (step === 'regions') {
      const { buildRegions } = await import('./regions.mjs');
      result = await eachCountry(countries, async (code) => ({ counts: await buildRegions(code) }));
    } else if (step === 'collect') {
      const { collect } = await import('./collect.mjs');
      const all = await timed(async () => ({ report: await collect({ ...(await getClients()), countries }) }));
      result = all.ok ? all.report : { all };
    } else if (step === 'generate') {
      const { loadInput, writeGenerated } = await import('./generate.mjs');
      const input = loadInput();
      result = await eachCountry(countries, async (code) => ({ counts: writeGenerated(code, input) }));
    }
    steps.push({ step, ms: Date.now() - start, countries: result });
  }
  return { countries, steps };
}

function validateContent() {
  const run = spawnSync(process.execPath, [join(CONTENT, 'validate.mjs')], { encoding: 'utf8' });
  return { ok: run.status === 0, output: `${run.stdout}${run.stderr}`.trim().split('\n').slice(0, 50) };
}

async function main(path) {
  const job = parseJob(readFileSync(path, 'utf8'));
  const startedAt = new Date().toISOString();
  const { countries, steps } = await runJob(job);
  const result = {
    name: job.name,
    job,
    startedAt,
    finishedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA,
    countries,
    errorCount: steps.reduce((n, s) => n + Object.values(s.countries).reduce((m, c) => m + (c.errors?.length ?? 0), 0), 0),
    steps,
    validation: validateContent(),
  };
  const out = join(ROOT, 'content', 'jobs', `${job.name}.result.json`);
  writeJson(out, result);
  console.log(`${job.name}: ${result.errorCount} errors, validation ${result.validation.ok ? 'ok' : 'FAILED'} → ${out}`);
}

if (process.argv[1]?.endsWith('run-job.mjs')) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: node tools/content/run-job.mjs content/jobs/<name>.json');
    process.exit(1);
  }
  await main(path);
}

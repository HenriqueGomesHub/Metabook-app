// Runs a job file and writes content/jobs/<name>.result.json. Every step and country is isolated:
// a failure is recorded with its message and the run carries on. The result file is rewritten after
// every step, and any crash (bad job file, imports, ...) is written as { name, fatal, steps } and
// exits 0, so the workflow's commit step still has something to commit. Only a missing argument
// exits non-zero.
// CLI: node tools/content/run-job.mjs content/jobs/clues-fetch.json
//      node tools/content/run-job.mjs --name content/jobs/clues-fetch.json   (prints the job's name)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CONTENT, ROOT, loadPool, resolveCountries, writeJson } from './lib/common.mjs';

export const STEPS = [
  'plonkit',
  'learnablemeta',
  'links',
  'clues',
  'clueimages',
  'wipemedia',
  'facts',
  'regions',
  'generate',
  // photo pipeline before the clue catalogue, no longer used
  'commons',
  'mapillary',
  'collect',
  'pack',
  'review',
  'rereview',
  'rename',
];
const DEFAULT_SUBJECTS = ['bollard', 'pole', 'plate', 'sign'];
/** The clue steps share one budget per job, so a run ends in time to commit what it has. */
const DEFAULT_JOB_BUDGET_MINUTES = 80;

const NAME = /^[\w-]+$/;

/** The job's name for its result file; the file name when the job cannot be read or has no valid name. */
export function jobName(path) {
  try {
    const { name } = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof name === 'string' && NAME.test(name)) return name;
  } catch {
    // unreadable job: fall through to the file name
  }
  return basename(path).replace(/\.json$/, '').replace(/[^\w-]/g, '_');
}

export function parseJob(text) {
  const job = JSON.parse(text);
  if (!job.name || !NAME.test(job.name)) throw new Error('job.name must be letters, digits, - or _');
  if (job.budgetMinutes != null && !(job.budgetMinutes > 0)) throw new Error('job.budgetMinutes must be a positive number');
  if (job.refreshDays != null && !(job.refreshDays > 0)) throw new Error('job.refreshDays must be a positive number');
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
  let budgetHit = false;
  for (const subject of subjects) {
    try {
      const result = await fn(subject);
      budgetHit ||= Boolean(result.budgetHit);
      counts[subject] = { ...result.counts, ...(result.dropped && { dropped: result.dropped }) };
      errors.push(...(result.errors ?? []).map((e) => `${subject}: ${e}`));
    } catch (error) {
      errors.push(`${subject}: ${error.message}`);
    }
  }
  // a queue error repeats for every subject; once is enough
  return { counts, errors: [...new Set(errors)], ...(budgetHit && { budgetHit }) };
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

/** Runs the steps, pushing each result onto `steps`; `onStep(countries)` follows every step. */
export async function runJob(job, { steps = [], onStep } = {}) {
  const countries = resolveCountries(job.countries, loadPool());
  const getClients = clients();
  const deadline = Date.now() + (job.budgetMinutes ?? DEFAULT_JOB_BUDGET_MINUTES) * 60_000;
  const only = job.countries === 'all' ? undefined : countries;
  for (const step of job.steps) {
    const start = Date.now();
    let result;
    if (step === 'plonkit') {
      const { runPlonkit } = await import('./plonkit.mjs');
      result = { all: await timed(() => runPlonkit({ deadline, refreshDays: job.refreshDays })) };
    } else if (step === 'learnablemeta') {
      const { runLearnableMeta } = await import('./learnablemeta.mjs');
      result = { all: await timed(() => runLearnableMeta({ deadline, refreshDays: job.refreshDays })) };
    } else if (step === 'links') {
      const { runLinks } = await import('./links.mjs');
      result = { all: await timed(() => runLinks({ deadline })) };
    } else if (step === 'clues') {
      const { writeClues } = await import('./clues.mjs');
      result = { all: await timed(async () => writeClues({ only: only?.map((c) => c.toUpperCase()) })) };
    } else if (step === 'clueimages') {
      const { createStorage } = await import('./storage.mjs');
      const { runClueImages } = await import('./clueimages.mjs');
      result = {
        all: await timed(async () => {
          const storage = createStorage({ bucket: 'clues', isPublic: false });
          await storage.ensureBucket();
          return runClueImages({ storage, deadline, only });
        }),
      };
    } else if (step === 'wipemedia') {
      const { createStorage } = await import('./storage.mjs');
      const { wipeMedia } = await import('./wipemedia.mjs');
      result = { all: await timed(() => wipeMedia({ storage: createStorage() })) };
    } else if (step === 'facts') {
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
      const { DEFAULT_BUDGET_MINUTES, runMapillary } = await import('./mapillary.mjs');
      const budgetMs = (job.budgetMinutes ?? DEFAULT_BUDGET_MINUTES) * 60_000;
      // Mapillary only tells poles apart; every other subject is the same roadside-scene search
      const subjects = [...new Set(job.subjects.map((s) => (s === 'pole' ? 'pole' : 'bollard')))];
      result = await eachCountry(countries, async (code) => {
        const { storage, queue } = await getClients();
        // one budget per country and step, shared by its subjects
        const deadline = Date.now() + budgetMs;
        return eachSubject(subjects, (subject) => runMapillary(code, subject, { storage, queue, cap: job.perSubject, deadline }));
      });
    } else if (step === 'regions') {
      const { buildRegions } = await import('./regions.mjs');
      result = await eachCountry(countries, async (code) => ({ counts: await buildRegions(code) }));
    } else if (step === 'collect') {
      const { collect } = await import('./collect.mjs');
      const all = await timed(async () => ({ report: await collect({ ...(await getClients()), countries }) }));
      result = all.ok ? all.report : { all };
    } else if (step === 'pack') {
      const { pack } = await import('./pack.mjs');
      const all = await timed(async () => ({ report: await pack({ ...(await getClients()), countries, ...(job.packWidth && { maxWidth: job.packWidth }) }) }));
      result = all.ok ? all.report : { all };
    } else if (step === 'review') {
      // review files name candidates by id, so every country's entries apply
      const { createQueue } = await import('./queue.mjs');
      const { applyReviews } = await import('./review.mjs');
      const all = await timed(async () => ({ report: await applyReviews({ queue: createQueue() }) }));
      result = all.ok ? all.report : { all };
    } else if (step === 'rereview') {
      const { createQueue } = await import('./queue.mjs');
      const { applyRereviews } = await import('./review.mjs');
      const all = await timed(async () => ({ report: await applyRereviews({ queue: createQueue(), ...(job.reviewDir && { dir: join(CONTENT, job.reviewDir) }) }) }));
      result = all.ok ? all.report : { all };
    } else if (step === 'rename') {
      // job.rename = { from: 'ax', to: 'fi' }: a territory now counted as part of its country
      const { createQueue } = await import('./queue.mjs');
      const all = await timed(async () => ({ counts: { moved: await createQueue().renameCountry(job.rename.from, job.rename.to) } }));
      result = { all };
    } else if (step === 'generate') {
      const { loadInput, writeGenerated } = await import('./generate.mjs');
      const input = loadInput();
      result = await eachCountry(countries, async (code) => ({ counts: writeGenerated(code, input) }));
    }
    steps.push({ step, ms: Date.now() - start, countries: result });
    onStep?.(countries);
  }
  return { countries, steps };
}

function validateContent() {
  const run = spawnSync(process.execPath, [join(CONTENT, 'validate.mjs')], { encoding: 'utf8' });
  return { ok: run.status === 0, output: `${run.stdout}${run.stderr}`.trim().split('\n').slice(0, 50) };
}

const errorCount = (steps) =>
  steps.reduce((n, s) => n + Object.values(s.countries).reduce((m, c) => m + (c.errors?.length ?? 0), 0), 0);

/** Runs one job file and writes its result (or fatal stub) into `outDir`. Never throws. */
export async function runJobFile(path, outDir = join(ROOT, 'content', 'jobs')) {
  const startedAt = new Date().toISOString();
  const steps = [];
  let name = jobName(path);
  const out = () => join(outDir, `${name}.result.json`);
  try {
    const job = parseJob(readFileSync(path, 'utf8'));
    name = job.name;
    const snapshot = (countries) => ({
      name,
      job,
      startedAt,
      finishedAt: null,
      commit: process.env.GITHUB_SHA,
      countries,
      errorCount: errorCount(steps),
      steps,
    });
    const { countries } = await runJob(job, { steps, onStep: (done) => writeJson(out(), snapshot(done)) });
    const result = { ...snapshot(countries), finishedAt: new Date().toISOString(), validation: validateContent() };
    writeJson(out(), result);
    console.log(`${name}: ${result.errorCount} errors, validation ${result.validation.ok ? 'ok' : 'FAILED'} → ${out()}`);
  } catch (error) {
    console.error(`${name}: fatal`, error);
    writeJson(out(), { name, fatal: error.message, steps });
    console.log(`${name}: fatal, see ${out()}`);
  }
}

if (process.argv[1]?.endsWith('run-job.mjs')) {
  const [first, second] = process.argv.slice(2);
  if (first === '--name' && second) console.log(jobName(second));
  else if (!first) {
    console.error('usage: node tools/content/run-job.mjs content/jobs/<name>.json');
    process.exit(1);
  } else await runJobFile(first);
}

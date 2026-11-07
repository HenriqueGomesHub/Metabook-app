import { haversineKm } from '@metabook/core';
import type { GeoPoint, Round } from '@metabook/core';

export interface AnalyzerImport {
  rounds: Round[];
  /** entries without a country code on both sides */
  skipped: number;
}

type Bag = Record<string, unknown>;

const isBag = (value: unknown): value is Bag =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Lower-cases a key and drops separators so lat_lng, latLng and LatLng compare equal. */
const norm = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

function normalized(bag: Bag): Map<string, unknown> {
  return new Map(Object.entries(bag).map(([key, value]) => [norm(key), value]));
}

function find(bag: Map<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const value = bag.get(name);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function num(value: unknown): number | undefined {
  if (isBag(value)) return num(value.amount);
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function code(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z]{2}$/.test(value.trim())
    ? value.trim().toUpperCase()
    : undefined;
}

const SIDES = {
  truth: ['actual', 'truth', 'correct', 'answer', 'location', 'target'],
  guess: ['guess', 'guessed', 'player', 'playerguess', 'yourguess'],
};

/**
 * A side is either a nested object (`actual: {lat, lng, countryCode}`) or flat fields prefixed
 * with the side's name (`actualLat`, `guess_country_code`).
 */
function readSide(round: Map<string, unknown>, aliases: string[]): GeoPoint | undefined {
  const nested = aliases.map((alias) => round.get(alias)).find(isBag);
  const fields = nested ? normalized(nested) : round;
  const prefixes = nested ? [''] : aliases;
  const get = (names: string[]) =>
    find(
      fields,
      prefixes.flatMap((prefix) => names.map((name) => prefix + name)),
    );

  const country = code(get(['countrycode', 'cc', 'country', 'code']));
  if (!country) return undefined;
  const lat = num(get(['lat', 'latitude']));
  const lon = num(get(['lng', 'lon', 'long', 'longitude']));
  return { country, ...(lat !== undefined && lon !== undefined && { lat, lon }) };
}

function readTime(round: Map<string, unknown>): string | undefined {
  const raw = find(round, ['timestamp', 'date', 'playedat', 'time', 'createdat', 'startedat']);
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  // Unix seconds are far below the millisecond range of any real date.
  const ms =
    typeof value === 'number' ? (value < 1e11 ? value * 1000 : value) : Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function readMode(round: Map<string, unknown>): Round['mode'] {
  const flag = (name: string) => find(round, [name]) === true;
  if (flag('forbidmoving')) return flag('forbidzooming') && flag('forbidrotating') ? 'nmpz' : 'nm';
  const raw = find(round, ['mode', 'movement', 'gamemode', 'gametype']);
  const text = typeof raw === 'string' ? norm(raw) : '';
  if (text.includes('nmpz')) return 'nmpz';
  if (text.includes('nomove') || text === 'nm') return text.includes('pan') ? 'nmpz' : 'nm';
  if (text.includes('mov') || text === 'default') return 'move';
  return undefined;
}

/** Kilometres from `distanceKm`, or `distance` as a plain number (metres) or `{meters: {amount, unit}}`. */
function readDistance(round: Map<string, unknown>): number | undefined {
  const km = num(find(round, ['distancekm', 'distkm']));
  if (km !== undefined) return km;
  const raw = find(round, ['distance', 'dist']);
  if (isBag(raw)) {
    const meters = normalized(raw).get('meters');
    const unit = isBag(meters) ? meters.unit : undefined;
    const amount = num(meters);
    return amount === undefined ? undefined : unit === 'km' ? amount : amount / 1000;
  }
  const metres = num(raw);
  return metres === undefined ? undefined : metres / 1000;
}

function toRound(raw: unknown, now: Date): Round | undefined {
  if (!isBag(raw)) return undefined;
  const round = normalized(raw);
  const truth = readSide(round, SIDES.truth);
  const guess = readSide(round, SIDES.guess);
  if (!truth || !guess) return undefined;

  const time = readTime(round);
  const playedAt = time ?? now.toISOString();
  const mapName = find(round, ['map', 'mapname']);
  const map = isBag(mapName) ? mapName.name : mapName;
  const mode = readMode(round);
  const score = num(find(round, ['score', 'points']));
  const distanceKm =
    truth.lat !== undefined && guess.lat !== undefined
      ? haversineKm(
          { lat: truth.lat, lon: truth.lon as number },
          { lat: guess.lat, lon: guess.lon as number },
        )
      : readDistance(round);
  const where = (p: GeoPoint) => `${p.country}${p.lat ?? ''},${p.lon ?? ''}`;
  return {
    id: `import:${time ?? 'undated'}:${where(truth)}:${where(guess)}`,
    source: 'import',
    playedAt,
    ...(typeof map === 'string' && map && { map }),
    ...(mode && { mode }),
    truth,
    guess,
    ...(distanceKm !== undefined && { distanceKm: Math.round(distanceKm * 10) / 10 }),
    ...(score !== undefined && { score }),
  };
}

/**
 * Maps a GeoGuessr Round Analyzer export (an array, or `{rounds: [...]}`) to rounds. Rounds
 * without a two-letter country code on both sides are skipped, never guessed. Throws when the
 * file is not a list of rounds at all. Rounds without a timestamp are dated `now`.
 */
export function mapAnalyzerRounds(input: unknown, now = new Date()): AnalyzerImport {
  const list = Array.isArray(input) ? input : isBag(input) ? input.rounds : undefined;
  if (!Array.isArray(list)) {
    throw new Error('This file is not a Round Analyzer export: expected a list of rounds.');
  }
  const rounds = new Map<string, Round>();
  let skipped = 0;
  for (const item of list) {
    const round = toRound(item, now);
    if (round) rounds.set(round.id, round);
    else skipped++;
  }
  return { rounds: [...rounds.values()], skipped };
}

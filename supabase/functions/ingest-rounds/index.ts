import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_ROUNDS = 50;
const MIN_INTERVAL_MS = 5000;
const MODES = ['move', 'nm', 'nmpz'];

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnly(obj: Obj, allowed: string[]): boolean {
  return Object.keys(obj).every((key) => allowed.includes(key));
}

function optional(value: unknown, check: (v: unknown) => boolean): boolean {
  return value === undefined || check(value);
}

function isString(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isNumber(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isPoint(value: unknown): boolean {
  return (
    isObj(value) &&
    hasOnly(value, ['lat', 'lon', 'country', 'region']) &&
    typeof value.country === 'string' &&
    /^[A-Z]{2}$/.test(value.country) &&
    optional(value.lat, (v) => isNumber(v, -90, 90)) &&
    optional(value.lon, (v) => isNumber(v, -180, 180)) &&
    optional(value.region, (v) => isString(v, 64))
  );
}

function isRound(value: unknown): value is Obj {
  return (
    isObj(value) &&
    hasOnly(value, [
      'id',
      'source',
      'playedAt',
      'map',
      'mode',
      'truth',
      'guess',
      'distanceKm',
      'score',
    ]) &&
    isString(value.id, 64) &&
    value.source === 'extension' &&
    typeof value.playedAt === 'string' &&
    !Number.isNaN(Date.parse(value.playedAt)) &&
    optional(value.map, (v) => isString(v, 100)) &&
    optional(value.mode, (v) => typeof v === 'string' && MODES.includes(v)) &&
    isPoint(value.truth) &&
    isPoint(value.guess) &&
    optional(value.distanceKm, (v) => isNumber(v, 0, 25000)) &&
    optional(value.score, (v) => isNumber(v, 0, 5000) && Number.isInteger(v))
  );
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function respond(status: number, body: Obj, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  if (!origin.startsWith('chrome-extension://')) {
    return new Response('Forbidden', { status: 403 });
  }
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type, x-metabook-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return respond(405, { error: 'method not allowed' }, cors);

  const token = req.headers.get('x-metabook-token');
  if (!token) return respond(401, { error: 'missing token' }, cors);
  const tokenHash = await sha256Hex(token);

  const { data: row, error: lookupError } = await admin
    .from('extension_tokens')
    .select('user_id')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (lookupError) return respond(500, { error: 'lookup failed' }, cors);
  if (!row) return respond(401, { error: 'invalid token' }, cors);

  const now = new Date();
  const { data: claimed, error: claimError } = await admin
    .from('extension_tokens')
    .update({ last_used_at: now.toISOString() })
    .eq('token_hash', tokenHash)
    .or(
      `last_used_at.is.null,last_used_at.lt.${new Date(now.getTime() - MIN_INTERVAL_MS).toISOString()}`,
    )
    .select('token_hash');
  if (claimError) return respond(500, { error: 'rate limit check failed' }, cors);
  if (claimed.length === 0) return respond(429, { error: 'too many requests' }, cors);

  const { data: flags, error: flagError } = await admin
    .from('app_flags')
    .select('capture_enabled')
    .maybeSingle();
  if (flagError) return respond(500, { error: 'flag lookup failed' }, cors);
  if (!flags?.capture_enabled) return respond(403, { error: 'capture disabled' }, cors);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return respond(400, { error: 'invalid json' }, cors);
  }
  if (!Array.isArray(body) || body.length === 0 || body.length > MAX_ROUNDS) {
    return respond(400, { error: `expected 1-${MAX_ROUNDS} rounds` }, cors);
  }
  if (!body.every(isRound)) return respond(400, { error: 'invalid round' }, cors);

  const rows = body.map((r) => ({
    user_id: row.user_id,
    id: r.id,
    source: r.source,
    played_at: r.playedAt,
    map: r.map ?? null,
    mode: r.mode ?? null,
    truth: r.truth,
    guess: r.guess,
    distance_km: r.distanceKm ?? null,
    score: r.score ?? null,
  }));
  const { data: inserted, error: insertError } = await admin
    .from('rounds')
    .upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true })
    .select('id');
  if (insertError) return respond(500, { error: 'insert failed' }, cors);

  return respond(200, { inserted: inserted.length }, cors);
});

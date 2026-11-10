// Learnable Meta: https://learnablemeta.com/api/maps/ lists the public maps, and each map's metas come
// from its SvelteKit data endpoint /maps/<geoguessrId>/__data.json (devalue-flattened). Cached in
// content/sources/learnablemeta/maps.json and <geoguessrId>.json (only map name, authors and metas),
// one request every 2 s; maps already cached are skipped unless older than `refreshDays`.
import { join } from 'node:path';
import { unflatten } from 'devalue';
import { BROWSER_USER_AGENT, CONTENT, pacer, readJson, request, sleep, writeJson } from './lib/common.mjs';
import { isFresh } from './plonkit.mjs';

export const LEARNABLE_META = 'https://learnablemeta.com';
export const LEARNABLE_META_DIR = join(CONTENT, 'sources', 'learnablemeta');
const ID = /^[\w-]+$/;

/** The maps list (an array, or wrapped in `maps`/`data`) → [{ geoguessrId, name, regions? }], sorted. */
export function mapsOf(list) {
  const rows = [list, list?.maps, list?.data].find(Array.isArray) ?? [];
  const byId = new Map();
  for (const r of rows) {
    const geoguessrId = r?.geoguessrId ?? r?.geoguessr_id;
    if (typeof geoguessrId !== 'string' || !ID.test(geoguessrId) || byId.has(geoguessrId)) continue;
    byId.set(geoguessrId, { geoguessrId, name: String(r.name ?? ''), ...(Array.isArray(r.regions) && { regions: r.regions }) });
  }
  return [...byId.values()].sort((a, b) => a.geoguessrId.localeCompare(b.geoguessrId));
}

const nameOf = (a) => (typeof a === 'string' ? a : (a?.name ?? a?.username ?? a?.displayName));

/** Author names from any `*author*` field of the page data. */
function authorsOf(root) {
  const values = Object.entries(root).filter(([k]) => /author/i.test(k)).flatMap(([, v]) => (Array.isArray(v) ? v : [v]));
  return [...new Set(values.map(nameOf).filter((n) => typeof n === 'string' && n.trim()))];
}

function metaOf(m) {
  const count = Number(m?.locationsCount);
  return {
    id: m?.id,
    name: typeof m?.name === 'string' ? m.name.trim() : '',
    note: typeof m?.note === 'string' ? m.note : '',
    images: Array.isArray(m?.images) ? m.images.filter((src) => typeof src === 'string' && /^https?:\/\//.test(src)) : [],
    locationsCount: Number.isFinite(count) ? count : null,
    footer: typeof m?.footer === 'string' ? m.footer : '',
  };
}

/** A map's __data.json → { mapName, authors, metas } from the node whose data has `metaList`. */
export function parseMapData(json) {
  for (const node of json?.nodes ?? []) {
    if (node?.type !== 'data' || !Array.isArray(node.data)) continue;
    const root = unflatten(node.data);
    if (!Array.isArray(root?.metaList)) continue;
    return {
      mapName: typeof root.mapName === 'string' ? root.mapName : '',
      authors: authorsOf(root),
      metas: root.metaList.map(metaOf).filter((m) => (typeof m.id === 'number' || typeof m.id === 'string') && m.name),
    };
  }
  throw new Error('no data node with a metaList');
}

/** The `learnablemeta` step. */
export async function runLearnableMeta({ dir = LEARNABLE_META_DIR, deadline = Infinity, refreshDays, pause = sleep } = {}) {
  const wait = pacer(2000, pause);
  const get = async (path) => {
    await wait();
    return (await request(`${LEARNABLE_META}${path}`, { headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/json' } })).json();
  };
  const listPath = join(dir, 'maps.json');
  const errors = [];
  let maps;
  try {
    maps = mapsOf(await get('/api/maps/'));
    if (maps.length === 0) throw new Error('the maps list is empty (has its shape changed?)');
    writeJson(listPath, maps);
  } catch (error) {
    maps = readJson(listPath);
    if (!maps) throw error;
    errors.push(`maps list: ${error.message}; using the cached list`);
  }

  const counts = { maps: maps.length, fetched: 0, cached: 0, failed: 0 };
  let budgetHit = false;
  for (const { geoguessrId } of maps) {
    const path = join(dir, `${geoguessrId}.json`);
    if (isFresh(readJson(path), refreshDays)) {
      counts.cached++;
      continue;
    }
    if (Date.now() >= deadline) {
      budgetHit = true;
      break;
    }
    try {
      const data = parseMapData(await get(`/maps/${geoguessrId}/__data.json`));
      writeJson(path, { geoguessrId, fetchedAt: new Date().toISOString(), ...data });
      counts.fetched++;
    } catch (error) {
      counts.failed++;
      errors.push(`${geoguessrId}: ${error.message}`);
    }
  }
  return { counts, errors, ...(budgetHit && { budgetHit }) };
}

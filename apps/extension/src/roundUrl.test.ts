import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildRoundUrl } from './roundUrl';
import { getLastRound, setLastRound } from './storage';

const BASE = 'https://metabook-app.vercel.app';

describe('buildRoundUrl', () => {
  it('encodes all params', () => {
    const url = buildRoundUrl(BASE, {
      truth: 'BR', guess: 'AR', region: 'São Paulo & Minas', lat: -23.5, lng: -46.6, at: 'x',
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(`${BASE}/round`);
    expect(u.searchParams.get('region')).toBe('São Paulo & Minas');
    expect(url).toContain('region=S%C3%A3o+Paulo+%26+Minas');
    expect(u.searchParams.get('lat')).toBe('-23.5');
    expect(u.searchParams.get('lng')).toBe('-46.6');
  });

  it('omits missing params', () => {
    expect(buildRoundUrl(BASE, { truth: 'BR', guess: 'AR', at: 'x' })).toBe(`${BASE}/round?truth=BR&guess=AR`);
    expect(buildRoundUrl(BASE, { truth: 'BR', guess: 'AR', region: '  ', lat: Number.NaN, at: 'x' })).toBe(
      `${BASE}/round?truth=BR&guess=AR`,
    );
  });
});

describe('lastRound storage', () => {
  beforeEach(() => {
    const data: Record<string, unknown> = {};
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
          set: async (items: Record<string, unknown>) => void Object.assign(data, items),
        },
      },
    };
  });

  it('round-trips and replaces', async () => {
    expect(await getLastRound()).toBeUndefined();
    await setLastRound({ truth: 'BR', guess: 'AR', at: '1' });
    await setLastRound({ truth: 'JP', guess: 'KR', region: 'Kansai', at: '2' });
    expect(await getLastRound()).toEqual({ truth: 'JP', guess: 'KR', region: 'Kansai', at: '2' });
  });
});

describe('manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.base.json', import.meta.url), 'utf8'));

  it('content script matches only single-player classic game URLs', () => {
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0].matches).toEqual(['https://www.geoguessr.com/game/*']);
  });

  it('permissions are exactly storage + sidePanel, no host permissions in base, no CSP override', () => {
    expect(manifest.permissions).toEqual(['storage', 'sidePanel']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_security_policy).toBeUndefined();
  });
});

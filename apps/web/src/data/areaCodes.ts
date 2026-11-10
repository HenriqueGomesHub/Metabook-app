import type { Card, PoolCountry } from '@metabook/core';

/**
 * content/areacodes/<code>.json: a country's telephone area codes, each on a region of its
 * regions map (content/maps/<code>-regions.json `states[].code`).
 */
export interface AreaCodeFile {
  /** pool code, upper or lower case */
  country: string;
  /** what the country calls them, e.g. "Indicatifs régionaux" or "Area codes" */
  label: string;
  /** what is dialled before the code inside the country, e.g. "0" */
  prefix?: string;
  /** how a number is written, e.g. "0X XX XX XX XX" */
  format?: string;
  sources: string[];
  codes: {
    code: string;
    /** the main region: a state code of the country's regions map */
    region: string;
    /** other regions the code also covers */
    spans?: string[];
  }[];
}

/** The id of an area-code card; Brazil's shipped cards use the same form ("ddd:br:11"). */
export const areaCodeId = (country: string, code: string) => `ddd:${country.toLowerCase()}:${code}`;

/**
 * Area-code cards from the content/areacodes files: one per code, answered on the country's
 * regions map. Codes whose id is already taken (Brazil's hand-written cards) are left out, as are
 * files for countries not in the pool.
 */
export function areaCodeCards(
  files: AreaCodeFile[],
  pool: PoolCountry[],
  existing: Iterable<string> = [],
): Card[] {
  const taken = new Set(existing);
  const cards: Card[] = [];
  for (const file of files) {
    const code = String(file.country ?? '').toUpperCase();
    const country = pool.find((c) => c.code === code);
    if (!country || !Array.isArray(file.codes)) continue;
    const source = file.sources?.[0] ?? '';
    for (const entry of file.codes) {
      const id = areaCodeId(code, entry.code);
      if (taken.has(id) || !entry.region) continue;
      taken.add(id);
      const spans = (entry.spans ?? []).filter((s) => s && s !== entry.region);
      cards.push({
        id,
        type: 'areacode',
        country: code,
        answer: entry.region,
        ...(spans.length > 0 && { spans }),
        prompt: { kind: 'text', value: entry.code },
        tags: [country.continent, 'areacode'],
        chapter: `${code.toLowerCase()}:areacodes`,
        source,
      });
    }
  }
  return cards;
}

/** Countries with area-code cards, Brazil first, then by name. */
export function areaCodeCountries(cards: Card[], pool: PoolCountry[]): string[] {
  const codes = [...new Set(cards.filter((c) => c.type === 'areacode').map((c) => c.country))];
  const name = (code: string) => pool.find((c) => c.code === code)?.name ?? code;
  return codes.sort(
    (a, b) => Number(b === 'BR') - Number(a === 'BR') || name(a).localeCompare(name(b)),
  );
}

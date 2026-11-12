import type {
  AreaCodePattern,
  AreaCodePatterns,
  Card,
  PlacedCode,
  PoolCountry,
} from '@metabook/core';

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

// content/areacodes/patterns.json: which countries' codes follow a regional pattern (small, bundled)
const patternFile = import.meta.glob<AreaCodePatterns>(
  '../../../../content/areacodes/patterns.json',
  {
    eager: true,
    import: 'default',
  },
);

/** Each country's area-code pattern, by upper-case pool code. */
export const AREA_CODE_PATTERNS: AreaCodePatterns = Object.values(patternFile)[0] ?? {};

/**
 * An area code of a country whose codes follow no pattern (the US, Canada): pure memorising, so
 * it is left out of daily sessions and the all-countries drill, and only practised in that
 * country's own drill.
 */
export const isMemoriseAreaCode = (card: Pick<Card, 'type' | 'country'>): boolean =>
  card.type === 'areacode' && patternOf(card.country)?.kind === 'memorise';

export const patternOf = (country: string): AreaCodePattern | undefined =>
  AREA_CODE_PATTERNS[country.toUpperCase()];

/** A country's codes on their regions, from its area-code cards. */
export function placedCodes(cards: Card[], country: string): (PlacedCode & { spans?: string[] })[] {
  return cards
    .filter((card) => card.type === 'areacode' && card.country === country)
    .map((card) => ({
      code: card.prompt.value,
      region: card.answer,
      ...(card.spans && { spans: card.spans }),
    }));
}

/** Rough GeoGuessr weight: how often a country comes up, most first. */
const IMPORTANCE = ['BR', 'RU', 'US', 'ID', 'AU', 'CA', 'MX', 'FR', 'ZA', 'ES', 'IT', 'TR', 'PH'];

/**
 * Countries with area-code cards in two lists: those whose codes follow a regional pattern and
 * those to learn one by one (no pattern, or none written yet), each by GeoGuessr weight then name.
 */
export function areaCodeSections(
  cards: Card[],
  pool: PoolCountry[],
  patterns: AreaCodePatterns = AREA_CODE_PATTERNS,
): { pattern: string[]; memorise: string[] } {
  const name = (code: string) => pool.find((c) => c.code === code)?.name ?? code;
  const rank = (code: string) => {
    const i = IMPORTANCE.indexOf(code);
    return i < 0 ? IMPORTANCE.length : i;
  };
  const codes = areaCodeCountries(cards, pool).sort(
    (a, b) => rank(a) - rank(b) || name(a).localeCompare(name(b)),
  );
  return {
    pattern: codes.filter((code) => patterns[code]?.kind === 'pattern'),
    memorise: codes.filter((code) => patterns[code]?.kind !== 'pattern'),
  };
}

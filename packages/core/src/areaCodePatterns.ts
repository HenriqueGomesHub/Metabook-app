/**
 * Area-code patterns: whether the leading digit(s) of a country's area codes tell you the part of
 * the country (content/areacodes/patterns.json). Kept free of imports so the content scripts can
 * load it straight from node.
 */

export interface AreaCodePatternGroup {
  /** the significant leading digit(s), e.g. "4" for Brazil's 41–49 */
  key: string;
  /** the regions the group covers, named as on the country's map */
  label: string;
}

export interface AreaCodePattern {
  /** "pattern": the leading digits map to parts of the country; "memorise": they don't */
  kind: 'pattern' | 'memorise';
  /** how many significant digits make a group */
  digits: number;
  /** one short line for the country's card on the area-codes page */
  hook: string;
  summary: string;
  groups: AreaCodePatternGroup[];
  /** one extra memory hook */
  tip?: string;
  /** names the group labels use for sets of map regions, e.g. "the Centre-West" */
  areas?: Record<string, string[]>;
}

export type AreaCodePatterns = Record<string, AreaCodePattern>;

/** One code on its main region, as in content/areacodes files and area-code cards. */
export interface PlacedCode {
  code: string;
  region: string;
}

/**
 * Leading digits that are the same for every code of a country and so carry no geography:
 * Colombia's codes are all 60X, Spain's start with 9 (or 8, the newer copies of the 9 codes).
 */
const SKIP: Record<string, number> = { CO: 2, ES: 1 };

/** How many leading characters of `code` carry no geography: a trunk 0, then the SKIP digits. */
function lead(country: string, code: string): number {
  return (code.startsWith('0') ? 1 : 0) + (SKIP[country.toUpperCase()] ?? 0);
}

/** The digits of a code that carry geography: "06" → "6", "601" (Colombia) → "1", "921" (Spain) → "21". */
export function significantDigits(country: string, code: string): string {
  return code.slice(lead(country, code));
}

/** The group a code falls in: its first `digits` significant digits. */
export function patternKey(country: string, code: string, digits = 1): string {
  return significantDigits(country, code).slice(0, digits);
}

export interface ComputedGroup {
  key: string;
  /** regions with at least one code in the group, sorted */
  regions: string[];
  /** share of the country's codes in the group, 0..1 */
  share: number;
  /** how the codes are written, e.g. "4x", "06x", "601", "91x · 81x" */
  form: string;
}

/** The country's codes grouped by their leading significant digit(s), by key. */
export function patternGroups(country: string, codes: PlacedCode[], digits = 1): ComputedGroup[] {
  const byKey = new Map<string, PlacedCode[]>();
  for (const entry of codes) {
    const key = patternKey(country, entry.code, digits);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }
  return [...byKey]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({
      key,
      regions: [...new Set(group.map((c) => c.region))].sort(),
      share: codes.length > 0 ? group.length / codes.length : 0,
      form: groupForm(country, group, digits),
    }));
}

function groupForm(country: string, group: PlacedCode[], digits: number): string {
  const forms = new Set<string>();
  let longer = false;
  for (const { code } of group) {
    const end = lead(country, code) + digits;
    forms.add(code.slice(0, end));
    if (code.length > end) longer = true;
  }
  return [...forms]
    .sort((a, b) => b.localeCompare(a))
    .map((f) => (longer ? `${f}x` : f))
    .join(' · ');
}

/** Each region's group keys (a region whose codes fall in two groups has both). */
export function regionKeys(
  country: string,
  codes: PlacedCode[],
  digits = 1,
): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const entry of codes) {
    const key = patternKey(country, entry.code, digits);
    if (!key) continue;
    map.set(entry.region, (map.get(entry.region) ?? new Set()).add(key));
  }
  return new Map([...map].map(([region, keys]) => [region, [...keys].sort()]));
}

/**
 * The main group of each region: the key most of its codes fall in (ties to the lower key), so a
 * region gets one colour on the pattern map.
 */
export function regionMainKey(
  country: string,
  codes: PlacedCode[],
  digits = 1,
): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const entry of codes) {
    const key = patternKey(country, entry.code, digits);
    if (!key) continue;
    const mine = counts.get(entry.region) ?? new Map<string, number>();
    mine.set(key, (mine.get(key) ?? 0) + 1);
    counts.set(entry.region, mine);
  }
  return new Map(
    [...counts].map(([region, keys]) => [
      region,
      [...keys].sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b))[0]?.[0] ?? '',
    ]),
  );
}

/** The answer-feedback hint for a code, e.g. "4x = Paraná & Santa Catarina"; none without a pattern. */
/**
 * For a country whose codes follow no pattern (the US, Canada): the other codes of the same
 * region, so a code is learnt as one of a small family ("201, 551, 862: New Jersey") rather than
 * as a lone number. Undefined when the region has no other code.
 */
function neighboursHint(code: string, codes: PlacedCode[]): string | undefined {
  const region = codes.find((c) => c.code === code)?.region;
  if (!region) return undefined;
  const others = codes
    .filter((c) => c.region === region && c.code !== code)
    .map((c) => c.code)
    .sort();
  if (others.length === 0) return undefined;
  const shown = others.slice(0, NEIGHBOURS_SHOWN);
  const more = others.length > shown.length ? ` and ${others.length - shown.length} more` : '';
  return `Same region = ${shown.join(', ')}${more}`;
}
const NEIGHBOURS_SHOWN = 6;

export function patternHint(
  country: string,
  code: string,
  pattern: AreaCodePattern | undefined,
  codes: PlacedCode[],
): string | undefined {
  if (!pattern || pattern.kind !== 'pattern') return neighboursHint(code, codes);
  const key = patternKey(country, code, pattern.digits);
  const group = pattern.groups.find((g) => g.key === key);
  if (!group) return undefined;
  const form =
    patternGroups(
      country,
      codes.filter((c) => patternKey(country, c.code, pattern.digits) === key),
      pattern.digits,
    )[0]?.form ?? `${key}x`;
  return `${form} = ${group.label}`;
}

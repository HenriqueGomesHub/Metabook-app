import { countryCodeFromName } from './countries';

/*
 * ALL GeoGuessr-specific knowledge lives in this file.
 *
 * UNVERIFIED: every selector and text pattern below is a plausible guess. They
 * were written without access to geoguessr.com and MUST be checked against the
 * live site (single-player only) and adjusted before the extension is useful.
 * parseResult is pure and read-only: it never mutates the DOM.
 */

/** Present only while the round result screen is shown. Absence => not a result screen (parseResult returns null). */
export const SEL_RESULT_ROOT = '[data-qa="result-view-bottom"]';
/** Text like "Round 3 / 5" or "Round 3 of 5". */
export const SEL_ROUND_NUMBER = '[data-qa="round-number"]';
/** Text like "Your guess was 1,234 km from the correct location". */
export const SEL_DISTANCE = '[data-qa="distance"]';
/** Text like "4,521 points". */
export const SEL_SCORE = '[data-qa="round-score"]';
/** Visible country name of the correct location, only when the result screen shows it. */
export const SEL_TRUTH_COUNTRY = '[data-qa="correct-country"]';
/** Visible country name of the player's guess, only when the result screen shows it. */
export const SEL_GUESS_COUNTRY = '[data-qa="guess-country"]';

export const RE_ROUND_NUMBER = /(\d+)\s*(?:\/|of)\s*(\d+)/i;
export const RE_DISTANCE = /([\d.,]+)\s*(km|m|mi)\b/i;
export const RE_SCORE = /([\d.,]+)\s*(?:points?|pts)?/i;

export interface ParsedRound {
  roundNumber?: number;
  distanceKm?: number;
  score?: number;
  /** ISO alpha-2, only if the name was visible AND recognised */
  truthCountry?: string;
  guessCountry?: string;
}

function text(root: ParentNode, selector: string): string | undefined {
  const value = root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  return value ? value : undefined;
}

function toNumber(raw: string): number | undefined {
  const n = Number(raw.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function parseDistanceKm(raw: string | undefined): number | undefined {
  const m = raw ? RE_DISTANCE.exec(raw) : null;
  if (!m?.[1] || !m[2]) return undefined;
  const value = toNumber(m[1]);
  if (value === undefined) return undefined;
  const unit = m[2].toLowerCase();
  const km = unit === 'km' ? value : unit === 'm' ? value / 1000 : value * 1.609344;
  return km >= 0 && km <= 25000 ? Math.round(km * 1000) / 1000 : undefined;
}

export function parseScore(raw: string | undefined): number | undefined {
  const m = raw ? RE_SCORE.exec(raw) : null;
  const value = m?.[1] ? toNumber(m[1]) : undefined;
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= 5000 ? value : undefined;
}

/** Returns null when the result screen is not shown. */
export function parseResult(root: ParentNode): ParsedRound | null {
  const result = root.querySelector(SEL_RESULT_ROOT);
  if (!result) return null;

  const parsed: ParsedRound = {};
  const round = RE_ROUND_NUMBER.exec(text(root, SEL_ROUND_NUMBER) ?? '');
  if (round?.[1]) parsed.roundNumber = Number(round[1]);

  const distanceKm = parseDistanceKm(text(result, SEL_DISTANCE));
  if (distanceKm !== undefined) parsed.distanceKm = distanceKm;
  const score = parseScore(text(result, SEL_SCORE));
  if (score !== undefined) parsed.score = score;

  const truth = countryCodeFromName(text(result, SEL_TRUTH_COUNTRY));
  if (truth) parsed.truthCountry = truth;
  const guess = countryCodeFromName(text(result, SEL_GUESS_COUNTRY));
  if (guess) parsed.guessCountry = guess;
  return parsed;
}

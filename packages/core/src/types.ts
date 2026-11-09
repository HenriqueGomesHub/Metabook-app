export type CardType =
  | 'flag'
  | 'script'
  | 'meta'
  | 'lookalike'
  | 'region'
  | 'areacode'
  | 'plate'
  /** reverse card: a text prompt ("Poland's bollard?"); `options` and `answer` are media ids */
  | 'photo-choice';

/** What a meta is about; drill tiles and auto chapters group cards by it. */
export type MetaSubject =
  | 'bollard'
  | 'pole'
  | 'plate'
  | 'sign'
  | 'line'
  | 'guardrail'
  | 'language'
  | 'car'
  | 'landscape'
  | 'architecture'
  | 'other';

export type PromptKind = 'flag' | 'text' | 'image' | 'embed' | 'svg';

export interface CardPrompt {
  kind: PromptKind;
  value: string;
  ratio?: string;
  lang?: string;
  /** image prompts: description used as alt text, and as a text fallback if the image fails */
  alt?: string;
  /** image prompts: attribution shown over the image, e.g. "Author · Licence" */
  credit?: string;
  creditUrl?: string;
}

export interface Card {
  id: string;
  type: CardType;
  country: string;
  answer: string;
  aliases?: string[];
  options?: string[];
  prompt: CardPrompt;
  tags: string[];
  chapter?: string;
  /** the card's own reason, shown first in the reveal ("sugarcane: by far most common in São Paulo") */
  explain?: string;
  source: string;
  subject?: MetaSubject;
  /** ids of the MediaItems the card shows */
  media?: string[];
  region?: string;
}

/** One fact about a country, written once and reused by generated cards. */
export interface FactNote {
  id: string;
  subject: MetaSubject;
  text: string;
  region?: string;
  distinctive?: boolean;
  /** ISO codes (or names) of pool countries this is confused with */
  lookalikes?: string[];
  source: string;
  /** YYYY-MM-DD the source was last checked */
  checked: string;
  verified: boolean;
}

/** content/facts/<code>.json; the codes are upper case like pool.json, the file name lower case. */
export interface CountryFacts {
  code: string;
  name: string;
  /** Wikidata item id, e.g. "Q36", for sourcing the fields below */
  wikidata?: string;
  drivingSide?: 'left' | 'right';
  tld?: string[];
  callingCode?: string[];
  languages?: string[];
  scripts?: string[];
  /** capital city; captions and notes naming it are dropped as giveaways */
  capital?: string;
  /** adjectives and nouns for its people ("Polish", "Poles"); same use as `capital` */
  demonym?: string[];
  notes: FactNote[];
}

/** One approved photo, content/media/<code>.json. */
export interface MediaItem {
  id: string;
  country: string;
  subject: MetaSubject;
  region?: string;
  noteId?: string;
  /** path inside the `media` storage bucket ("approved/<id>.webp"), or an absolute URL */
  url: string;
  width: number;
  height: number;
  /** tiny data URI shown while the photo loads */
  preview?: string;
  credit: string;
  licence: string;
  licenceUrl?: string;
  sourceUrl: string;
  /** subjects this photo is a clear giveaway for */
  giveaways?: string[];
  /** curator-written alt text; generation drops it when it names the country */
  caption?: string;
}

export interface Tip {
  id: string;
  answer: string;
  scope: string;
  text: string;
  source: string;
}

export interface PoolCountry {
  code: string;
  name: string;
  continent: 'europe' | 'asia' | 'africa' | 'americas' | 'oceania';
  in_pool: boolean;
}

/** FSRS memory state for one card, as stored. Dates are ISO strings. */
export interface CardState {
  cardId: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  /** reviews graded hard/good/easy; absent on older data, where it is derived as reps - lapses */
  successes?: number;
  /** position in the FSRS (re)learning steps */
  learningSteps?: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
  lastReview?: string;
}

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface Review {
  id: string;
  cardId: string;
  grade: Grade;
  answerGiven: string;
  correct: boolean;
  usedHint: boolean;
  msTaken: number;
  reviewedAt: string;
}

export interface Confusion {
  picked: string;
  truth: string;
  count: number;
  lastSeen: string;
  /** consecutive correct answers in contrast rounds; pair is resolved at 5 */
  contrastStreak: number;
}

export interface TipView {
  tipId: string;
  lastShown: string;
}

export interface GeoPoint {
  lat?: number;
  lon?: number;
  country: string;
  region?: string;
}

export interface Round {
  id: string;
  source: 'extension' | 'import' | 'manual';
  playedAt: string;
  map?: string;
  mode?: 'move' | 'nm' | 'nmpz';
  truth: GeoPoint;
  guess: GeoPoint;
  distanceKm?: number;
  score?: number;
}

export interface BlockTarget {
  kind: 'country' | 'pair' | 'chapter';
  key: string;
}

export interface Snapshot {
  takenAt: string;
  /** `rounds` counts data points: game rounds, or drill reviews for countries without rounds */
  perCountry: Record<string, { accuracy: number; avgDistanceKm?: number; rounds: number }>;
  avgDistanceKm?: number;
  topConfusions: { picked: string; truth: string; count: number }[];
}

export interface TrainingBlock {
  id: string;
  startsOn: string;
  endsOn: string;
  minutesPerDay: number;
  targets: BlockTarget[];
  baseline: Snapshot;
  final?: Snapshot;
  status: 'active' | 'finished' | 'ended-early';
}

export interface BlockDay {
  blockId: string;
  day: string;
  minutesDone: number;
  cardsDone: number;
}

export interface Settings {
  maxReviewsPerDay: number;
  newPerDay: number;
  desiredRetention: number;
  blockDays: number;
  blockMinutes: number;
  formats: ('move' | 'nm' | 'nmpz')[];
  /** country ids the learner picked to focus on */
  focusCountries?: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  maxReviewsPerDay: 200,
  newPerDay: 15,
  desiredRetention: 0.9,
  blockDays: 14,
  blockMinutes: 20,
  formats: ['move', 'nm', 'nmpz'],
  focusCountries: [],
};

export type Medal = 'gold' | 'silver' | 'bronze' | null;

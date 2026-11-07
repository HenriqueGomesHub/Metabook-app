export type CardType = 'flag' | 'script' | 'meta' | 'lookalike' | 'region' | 'areacode' | 'plate';

export type PromptKind = 'flag' | 'text' | 'image' | 'embed' | 'svg';

export interface CardPrompt {
  kind: PromptKind;
  value: string;
  ratio?: string;
  lang?: string;
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
  source: string;
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
  perCountry: Record<string, { accuracy: number; avgDistanceKm?: number; rounds: number }>;
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
}

export const DEFAULT_SETTINGS: Settings = {
  maxReviewsPerDay: 200,
  newPerDay: 15,
  desiredRetention: 0.9,
  blockDays: 14,
  blockMinutes: 20,
  formats: ['move', 'nm', 'nmpz'],
};

export type Medal = 'gold' | 'silver' | 'bronze' | null;

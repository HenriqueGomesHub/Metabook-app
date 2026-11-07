import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade as FsrsGrade,
} from 'ts-fsrs';
import type { CardState, Grade } from './types';

const FAST_MS = 3000;
const FAST_SHARE = 0.4;

const RATINGS: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const STATE_NAMES: Record<State, CardState['state']> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const STATES: Record<CardState['state'], State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

function toFsrs(state: CardState): FsrsCard {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps ?? 0,
    reps: state.reps,
    lapses: state.lapses,
    state: STATES[state.state],
    last_review: state.lastReview ? new Date(state.lastReview) : undefined,
  };
}

function fromFsrs(cardId: string, card: FsrsCard): CardState {
  return {
    cardId,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_NAMES[card.state],
    ...(card.last_review && { lastReview: card.last_review.toISOString() }),
  };
}

export function newCardState(cardId: string, now: Date): CardState {
  return fromFsrs(cardId, createEmptyCard(now));
}

export function applyReview(
  state: CardState,
  grade: Grade,
  now: Date,
  desiredRetention: number,
): CardState {
  const scheduler = fsrs({ request_retention: desiredRetention });
  return fromFsrs(state.cardId, scheduler.next(toFsrs(state), now, RATINGS[grade]).card);
}

/** A card the learner already knows: one Good review that skips the learning steps. */
export function knownCardState(cardId: string, now: Date, desiredRetention: number): CardState {
  const scheduler = fsrs({ request_retention: desiredRetention, enable_short_term: false });
  return fromFsrs(cardId, scheduler.next(createEmptyCard(now), now, Rating.Good).card);
}

export function gradeAnswer(answer: {
  correct: boolean;
  usedHint: boolean;
  msTaken: number;
  medianMs: number;
}): Grade {
  if (!answer.correct) return 'again';
  if (answer.usedHint) return 'hard';
  if (answer.msTaken < FAST_MS || answer.msTaken < answer.medianMs * FAST_SHARE) return 'easy';
  return 'good';
}

export function retrievability(state: CardState, now: Date): number {
  if (state.state === 'new') return 0;
  return fsrs().get_retrievability(toFsrs(state), now, false);
}

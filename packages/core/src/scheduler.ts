import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade as FsrsGrade,
} from 'ts-fsrs';
import type { CardState, Grade } from './types';

/** A right answer slower than this is "hard". */
const SLOW_MS = 6000;

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
  const next = fromFsrs(state.cardId, scheduler.next(toFsrs(state), now, RATINGS[grade]).card);
  return { ...next, successes: successCount(state) + (grade === 'again' ? 0 : 1) };
}

/** Reviews answered right so far; older data without the field derives it from reps and lapses. */
export function successCount(state: CardState): number {
  return state.successes ?? Math.max(0, state.reps - state.lapses);
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
  /** the options shown (0 or absent for a typed answer) */
  choices?: number;
  /** asked again in the same session, minutes after its answer was shown */
  retry?: boolean;
}): Grade {
  if (!answer.correct) return 'again';
  if (answer.usedHint) return 'hard';
  // a card re-asked minutes after its answer is short-term memory, and a pick out of two is as
  // likely a guess: neither is judged by its speed
  if ((answer.choices && answer.choices <= 2) || answer.retry) return 'good';
  // a right answer is never "easy"; a slow one is "hard"
  if (answer.msTaken > SLOW_MS) return 'hard';
  return 'good';
}

export function retrievability(state: CardState, now: Date): number {
  if (state.state === 'new') return 0;
  return fsrs().get_retrievability(toFsrs(state), now, false);
}

/**
 * Whether the card already had its review today. Only the first answer of a calendar day goes to
 * FSRS: answers later that day are short-term memory and must not stack up stability.
 */
export function reviewedToday(state: CardState, now: Date): boolean {
  if (!state.lastReview) return false;
  const last = new Date(state.lastReview);
  return (
    last.getFullYear() === now.getFullYear() &&
    last.getMonth() === now.getMonth() &&
    last.getDate() === now.getDate()
  );
}

/**
 * The card's state after an answer: the first answer of the day is an FSRS review; a later one
 * that day leaves the memory model alone and only holds the card back until tomorrow, so it
 * does not stay due all day.
 */
export function answerReview(
  state: CardState,
  grade: Grade,
  now: Date,
  desiredRetention: number,
): CardState {
  if (!reviewedToday(state, now)) return applyReview(state, grade, now, desiredRetention);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const due = Math.max(Date.parse(state.due), tomorrow.getTime());
  return { ...state, due: new Date(due).toISOString() };
}

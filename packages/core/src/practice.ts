import { activePairs, isMapKey } from './confusions';
import { shuffle, type Rng } from './random';
import { retrievability } from './scheduler';
import { modeFor, teachFirst, type SessionItem } from './session';
import type { Card, CardState, Confusion } from './types';

/**
 * A drill: endless practice over every card in its scope, like Anki's learning steps inside one
 * sitting, in passes:
 *
 * - A pass serves every card of the pool, in a random order (never pool order). A wrong card comes
 *   back after 3-5 other cards; a right one after RIGHT_GAP (at least the spacing rule below); two
 *   rights in a row learn it for the pass. A card already well known is learnt with one right; a
 *   card in a confusion pair needs three. At most LEARNING_SET cards are shaky (missed, or not
 *   answered yet) before new ones wait, and while new cards remain INTROS_PER_RETURN are
 *   introduced per returning card.
 * - A learnt card rests until the pass ends. Once every card is learnt the next pass starts with
 *   the whole pool reshuffled, so a drill can go on for as long as the learner likes.
 * - A Spot it card coming back shows the image of its clue seen longest ago (often another of the
 *   clue's images), so a repeat is not the same photo again; it is still graded as itself.
 * - Hard rule: a card never comes back within min(10, pool / 2) cards of its last showing, except
 *   a wrong card's return (at least 3). Consecutive cards never have neighbouring numeric prompts
 *   (area codes 11 then 12, or 11 then 17) when anything else can be served.
 */

/** Cards that may be shaky (missed, or not answered yet) before new cards wait. */
export const LEARNING_SET = 5;
/**
 * A wrong card comes back after 6 to 8 other cards: due after 6 or 7, leaving one card of slack for
 * another missed card or a neighbouring number, and forced back after 8. Sooner, the answer is
 * still in working memory and the return tests nothing.
 */
const WRONG_GAP: [number, number] = [6, 8];
const WRONG_DUE: [number, number] = [6, 7];
/** Other cards before a learning card answered right once comes back (or the spacing, if more). */
const RIGHT_GAP = 8;
/** Up to this many extra cards are added to a right gap, so returns do not line up. */
const RIGHT_JITTER = 4;
const GRADUATE_STREAK = 2;
/** A card in an active confusion pair needs one more right in a row to be learnt for the pass. */
const CONFUSED_STREAK = 3;
/** A card already studied counts as well known from this retrievability up. */
const KNOWN_RECALL = 0.8;
/** While new cards remain, this many are introduced for each card coming back after a right. */
const INTROS_PER_RETURN = 2;
/** ...unless that card has waited this many cards past its due step. */
const MAX_OVERDUE = 60;
/** Never repeat within min(MAX_GAP, pool / 2) cards; a wrong card's return within WRONG_MIN_GAP. */
const MAX_GAP = 10;
const WRONG_MIN_GAP = 6;
const WEAKNESS_FLOOR = 0.15;
/**
 * Cards between a lesson and its question in a drill: two at least. A drill of new clues then runs
 * lesson, lesson, lesson, question, lesson, question…, the gap growing to four
 */
const PRACTICE_LEARN_GAP = 2;
const CONFUSION_BOOST = 2;

interface Learning {
  cardId: string;
  /** step from which the card may be served again */
  due: number;
  /** consecutive right answers in this practice */
  streak: number;
  /** the last answer was wrong: it may return sooner than the usual gap */
  wrong: boolean;
  /** shown as a lesson and not asked yet: its question comes one or two cards later */
  taught?: boolean;
}

export interface PracticeState {
  cards: Card[];
  /** ids of cards in an active confusion pair */
  confused: string[];
  /** items served so far */
  step: number;
  /** step at which each card was last served */
  lastShown: Record<string, number>;
  /** cards not introduced yet, in the random order they will come */
  fresh: string[];
  learning: Learning[];
  /** cards learnt this pass: only served once nothing else can be */
  resting: string[];
  /** cards well known (seen, likely recalled) when the drill started: learnt with one right */
  known?: string[];
  /** 1 for the first time through the pool */
  pass?: number;
  /** new cards introduced since a card last came back after a right answer */
  introsSinceReturn: number;
  /** step at which each clue image was last shown, by image id */
  imageShown?: Record<string, number>;
  /** step of the last lesson (a new clue's first look) */
  lastLesson?: number;
  rng: Rng;
}

export function createPractice(input: {
  cards: Card[];
  states: Record<string, CardState>;
  confusions: Confusion[];
  now: Date;
  rng: Rng;
}): PracticeState {
  const { cards, states, confusions, now, rng } = input;
  // map-scoped keys ("ca:NL") are states, not the countries or answers cards are matched on
  const sides = new Set(
    activePairs(confusions, now)
      .flatMap((c) => [c.picked, c.truth])
      .filter((key) => !isMapKey(key)),
  );
  const confused = cards
    .filter((card) => sides.has(card.answer) || sides.has(card.country))
    .map((card) => card.id);
  // country-wide clues are introduced before those for one part of the country
  const local = (card: Card) => Boolean(card.region) || card.tags.includes('local');
  const shuffled = shuffle(cards, rng);
  const fresh = [...shuffled.filter((c) => !local(c)), ...shuffled.filter(local)].map((c) => c.id);
  return {
    cards,
    confused,
    step: 0,
    lastShown: {},
    fresh,
    learning: [],
    resting: [],
    // well known, and not in a confusion pair: one right is enough this pass
    known: cards
      .filter((card) => {
        const state = states[card.id];
        return (
          state !== undefined &&
          state.state !== 'new' &&
          retrievability(state as CardState, now) >= KNOWN_RECALL &&
          !confused.includes(card.id)
        );
      })
      .map((card) => card.id),
    pass: 1,
    introsSinceReturn: 0,
    imageShown: {},
    rng,
  };
}

/** The Spot it cards of the same clue in a pool, the card itself included, in pool order. */
function spotSiblings(cards: Card[], card: Card): Card[] {
  const clueId = card.clue?.id;
  if (card.type !== 'spot' || !clueId) return [card];
  return cards.filter((c) => c.type === 'spot' && c.clue?.id === clueId && c.clue.image);
}

/**
 * The image a Spot it card shows when it comes back: of its clue's images in the pool, the one
 * shown longest ago (never shown first, pool order breaking ties). Undefined when that is the
 * card's own image.
 */
function rotatedImage(practice: PracticeState, card: Card): string | undefined {
  const shown = practice.imageShown ?? {};
  // a first showing keeps its own photo, unless a sibling card already showed that photo
  const own = card.clue?.image?.id;
  if (practice.lastShown[card.id] === undefined && (!own || shown[own] === undefined))
    return undefined;
  const images = spotSiblings(practice.cards, card).map((c) => c.clue?.image?.id as string);
  if (images.length < 2) return undefined;
  const pick = images.reduce((best, id) => ((shown[id] ?? -1) < (shown[best] ?? -1) ? id : best));
  return pick === card.clue?.image?.id ? undefined : pick;
}

/**
 * The card as an item shows it: with `imageId` set, a Spot it card with that sibling image of its
 * clue in place of its own (answer, options and grading stay the card's).
 */
export function cardForItem(item: SessionItem, cards: Card[]): Card | undefined {
  const card = cards.find((c) => c.id === item.cardId);
  if (!card || !item.imageId || !card.clue) return card;
  const sibling = spotSiblings(cards, card).find((c) => c.clue?.image?.id === item.imageId);
  if (!sibling?.clue?.image) return card;
  return {
    ...card,
    prompt: { ...card.prompt, value: sibling.prompt.value },
    clue: { ...card.clue, image: sibling.clue.image },
  };
}

/** Never repeat within this many cards; small pools only avoid the last card or two. */
function minGap(size: number): number {
  if (size <= 1) return 0;
  return Math.max(1, Math.min(MAX_GAP, Math.floor(size / 2)));
}

/** The number a card is about (area code "11", calling code "+48"), for spacing neighbours. */
function numberOf(card: Card): number | undefined {
  const text = card.prompt.kind === 'text' ? card.prompt.value : card.answer;
  const match = /^\+?(\d{1,4})$/.exec(text.trim());
  return match ? Number(match[1]) : undefined;
}

/**
 * Neighbouring numbers (11 and 12, 11 and 13), two-digit codes sharing a first digit (11, 17), or
 * two area codes of the same region (São Paulo's 11 then its 16): back to back they feel like a
 * repeat.
 */
function adjacent(a: Card | undefined, b: Card): boolean {
  if (a && a.type === 'areacode' && b.type === 'areacode') {
    if (a.country === b.country && a.answer === b.answer) return true;
  }
  const x = a && numberOf(a);
  const y = numberOf(b);
  if (x === undefined || y === undefined) return false;
  if (Math.abs(x - y) <= 2) return true;
  return x >= 10 && x < 100 && y >= 10 && y < 100 && Math.floor(x / 10) === Math.floor(y / 10);
}

function weight(practice: PracticeState, card: Card, states: Record<string, CardState>, now: Date) {
  const state = states[card.id];
  const recall = state ? retrievability(state, now) : 0;
  const base = 1 - recall + WEAKNESS_FLOOR;
  return practice.confused.includes(card.id) ? base * CONFUSION_BOOST : base;
}

function sample(cards: Card[], weights: number[], rng: Rng): Card {
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = rng() * total;
  const index = weights.findIndex((w) => (pick -= w) < 0);
  return cards[index < 0 ? cards.length - 1 : index] as Card;
}

function choose(practice: PracticeState, states: Record<string, CardState>, now: Date): Card {
  const { cards, step, lastShown, learning, resting, rng } = practice;
  const byId = new Map(cards.map((card) => [card.id, card]));
  const gap = minGap(cards.length);
  const previous = Object.entries(lastShown).find(([, at]) => at === step - 1)?.[0];
  const last = previous ? byId.get(previous) : undefined;
  const entry = new Map(learning.map((l) => [l.cardId, l]));
  /** the hard spacing rule */
  const spaced = (id: string) => {
    const at = lastShown[id];
    if (at === undefined) return true;
    const learn = entry.get(id);
    const need = learn?.taught ? 1 : learn?.wrong ? Math.min(WRONG_MIN_GAP, gap) : gap;
    return step - at > need;
  };
  const ok = (id: string) => byId.has(id) && spaced(id) && !adjacent(last, byId.get(id) as Card);
  const ofIds = (ids: string[]) => ids.map((id) => byId.get(id) as Card);

  // lessons and questions take turns: right after a question, a waiting lesson goes first
  const lessonTurn =
    practice.lastLesson !== step - 1 &&
    practice.fresh.length > 0 &&
    learning.filter((l) => l.streak === 0 || l.wrong).length < LEARNING_SET;
  const due = learning
    .filter((l) => l.due <= step && ok(l.cardId) && !(l.taught && lessonTurn))
    .sort((a, b) => a.due - b.due);
  // 1. a missed (or just taught) card coming back; at its deadline even right after a neighbouring
  // number
  const missed = due.find((l) => l.wrong);
  if (missed) return byId.get(missed.cardId) as Card;
  const late = learning
    .filter(
      (l) => l.wrong && step - (lastShown[l.cardId] ?? step) > WRONG_GAP[1] && spaced(l.cardId),
    )
    .sort((a, b) => a.due - b.due)[0];
  if (late && late.cardId !== previous) return byId.get(late.cardId) as Card;

  const fresh = practice.fresh.filter(ok);
  const shaky = learning.filter((l) => l.streak === 0 || l.wrong).length;
  // 2. a card answered right once: the first pass through new cards goes INTROS_PER_RETURN new
  // cards per return, so a big pool is seen once early on, unless the return is long overdue
  const firstPass = fresh.length > 0 && shaky < LEARNING_SET;
  const returning = due[0];
  if (
    returning &&
    (!firstPass ||
      practice.introsSinceReturn >= INTROS_PER_RETURN ||
      step - returning.due >= MAX_OVERDUE)
  ) {
    return byId.get(returning.cardId) as Card;
  }
  // 3. a new card while the learning set has room
  if (fresh[0] && shaky < LEARNING_SET) return byId.get(fresh[0]) as Card;
  if (returning) return byId.get(returning.cardId) as Card;
  // 4. a new card past the learning-set size, rather than breaking the gaps
  if (fresh[0]) return byId.get(fresh[0]) as Card;
  // 5. a learning card a little early, the one closest to due
  const early = learning.filter((l) => ok(l.cardId)).sort((a, b) => a.due - b.due)[0];
  if (early) return byId.get(early.cardId) as Card;
  // 6. nothing else is spaced enough: resting cards, weakest (lowest FSRS retrievability) first
  const restingCards = ofIds(resting.filter(ok));
  const others = restingCards.length > 0 ? restingCards : cards.filter((card) => ok(card.id));
  if (others.length > 0) {
    return sample(
      others,
      others.map((card) => weight(practice, card, states, now)),
      rng,
    );
  }
  // 7. nothing is spaced enough (tiny pools): the card shown longest ago that is not the last one
  const oldest = [...cards].sort((a, b) => (lastShown[a.id] ?? -1) - (lastShown[b.id] ?? -1));
  return oldest.find((card) => card.id !== previous) ?? (oldest[0] as Card);
}

/**
 * Once every card of the pool is learnt, the next pass: the whole pool again, reshuffled, with
 * the cards shown last put at the back so the pass does not open on them.
 */
function nextPass(practice: PracticeState): PracticeState {
  if (practice.fresh.length > 0 || practice.learning.length > 0) return practice;
  const recent = new Set(
    Object.entries(practice.lastShown)
      .filter(([, at]) => practice.step - at <= minGap(practice.cards.length))
      .map(([id]) => id),
  );
  const order = shuffle(
    practice.cards.map((card) => card.id),
    practice.rng,
  );
  return {
    ...practice,
    fresh: [...order.filter((id) => !recent.has(id)), ...order.filter((id) => recent.has(id))],
    resting: [],
    introsSinceReturn: 0,
    pass: (practice.pass ?? 1) + 1,
  };
}

/** How far the drill is: its pass and the cards learnt in it, out of the pool. */
export function practiceProgress(practice: PracticeState): {
  pass: number;
  learnt: number;
  total: number;
} {
  return {
    pass: practice.pass ?? 1,
    learnt: practice.resting.length,
    total: practice.cards.length,
  };
}

/** The next card to drill. Never runs out for a non-empty pool. */
export function nextPracticeItem(
  current: PracticeState,
  states: Record<string, CardState>,
  now: Date,
): { item: SessionItem; practice: PracticeState } {
  if (current.cards.length === 0) throw new Error('practice pool is empty');
  const practice = nextPass(current);
  const card = choose(practice, states, now);
  const { step } = practice;
  const isFresh = practice.fresh.includes(card.id);
  const wasReturn = practice.learning.some((l) => l.cardId === card.id && !l.wrong && l.streak > 0);
  const imageId = rotatedImage(practice, card);
  const shownImage = imageId ?? card.clue?.image?.id;
  // a brand-new clue is first shown with its answer; its question comes one or two cards later
  // ...once per clue: another photo of a clue already taught is a question straight away
  const taughtClue = spotSiblings(practice.cards, card).some(
    (c) => c.id !== card.id && practice.lastShown[c.id] !== undefined,
  );
  const look =
    isFresh &&
    !taughtClue &&
    !practice.known?.includes(card.id) &&
    teachFirst(card, states[card.id]);
  const mode = look ? 'learn' : modeFor(card, states[card.id]);
  return {
    item: { cardId: card.id, mode, ...(imageId && { imageId }) },
    practice: {
      ...practice,
      step: step + 1,
      lastShown: { ...practice.lastShown, [card.id]: step },
      imageShown: shownImage
        ? { ...practice.imageShown, [shownImage]: step }
        : (practice.imageShown ?? {}),
      introsSinceReturn: isFresh
        ? practice.introsSinceReturn + 1
        : wasReturn
          ? 0
          : practice.introsSinceReturn,
      fresh: isFresh ? practice.fresh.filter((id) => id !== card.id) : practice.fresh,
      ...(look ? { lastLesson: step } : {}),
      // a new card joins the learning set; until it is answered it waits like a first right
      learning: isFresh
        ? [
            ...practice.learning,
            {
              cardId: card.id,
              due: step + 1 + (look ? PRACTICE_LEARN_GAP : RIGHT_GAP),
              streak: practice.known?.includes(card.id) ? GRADUATE_STREAK - 1 : 0,
              // a taught clue comes back like a missed one: soon, ahead of more new cards
              wrong: look,
              ...(look && { taught: true }),
            },
          ]
        : practice.learning,
    },
  };
}

const between = (rng: Rng, [min, max]: [number, number]) =>
  min + Math.floor(rng() * (max - min + 1));

/**
 * A wrong answer brings the card back after 3-5 other cards. A right one on a learning card brings
 * it back after about RIGHT_GAP (never inside the spacing rule), and two rights in a row graduate
 * it: it then only comes back when nothing else can be served. A known card answered right rests
 * the same way.
 */
export function recordPracticeAnswer(
  practice: PracticeState,
  cardId: string,
  correct: boolean,
): PracticeState {
  const { rng } = practice;
  const shownAt = practice.lastShown[cardId] ?? practice.step - 1;
  const gap = minGap(practice.cards.length);
  const existing = practice.learning.find((l) => l.cardId === cardId);
  const others = practice.learning.filter((l) => l.cardId !== cardId);
  const resting = practice.resting.filter((id) => id !== cardId);
  if (!correct) {
    const due = shownAt + 1 + between(rng, WRONG_DUE);
    return {
      ...practice,
      learning: [...others, { cardId, due, streak: 0, wrong: true }],
      resting,
    };
  }
  const streak = (existing?.streak ?? GRADUATE_STREAK - 1) + 1;
  const needed = practice.confused.includes(cardId) ? CONFUSED_STREAK : GRADUATE_STREAK;
  if (streak >= needed) {
    return { ...practice, learning: others, resting: [...resting, cardId] };
  }
  const wait = Math.max(RIGHT_GAP, gap) + Math.floor(rng() * (RIGHT_JITTER + 1));
  return {
    ...practice,
    learning: [...others, { cardId, due: shownAt + 1 + wait, streak, wrong: false }],
    resting,
  };
}

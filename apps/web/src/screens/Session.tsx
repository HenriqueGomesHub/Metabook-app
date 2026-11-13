import {
  answerKey,
  cardForItem,
  cardForShowing,
  createPractice,
  isClueCard,
  matchesAnswer,
  modeFor,
  nextPracticeItem,
  normalizeAnswer,
  cardContext,
  isGalleryClue,
  isCountryWide,
  pickTip,
  rankTips,
  sameTip,
  practiceProgress,
  recordPracticeAnswer,
  requeueMissed,
  showingSeed,
} from '@metabook/core';
import type {
  Card,
  CardState,
  Clue,
  CardType,
  MetaSubject,
  Tip,
  PracticeState,
  SessionItem,
} from '@metabook/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { CARD_TYPES } from '../app/cardTypes';
import { label, scopeOf, SUBJECTS } from '../app/labels';
import type { Scope as LabelScope } from '../app/labels';
import { learnMore, practiseMore, todaySession } from '../app/stats';
import { ArrowIcon, Button, LinkButton } from '../components/Button';
import { PatternHint } from '../components/PatternHint';
import { Chip, CloseButton } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { ProgressBar } from '../components/ProgressBar';
import { Status } from '../components/Status';
import { clueIndex } from '../data/clueIndex';
import { optionsFor } from './session/options';
import { isMemoriseAreaCode } from '../data/areaCodes';
import { preloadClueImages } from '../data/clueImages';
import type { Repository } from '../data/repository';
import { clueHeading } from '../components/clues/ClueDetails';
import { ClueAnswer, ClueMore } from './session/ClueAnswer';
import { preloadPrompt } from './session/Prompt';
import { Reveal, VerdictAnnouncer } from './session/Reveal';
import type { RevealProps } from './session/Reveal';
import type { Outcome } from './session/types';
import { useKeys } from './session/useKeys';
import { possessive, verdictFor, whyFor } from './session/verdict';
import { viewFor } from './session/views';
import { LookalikeCard } from './session/LookalikeCard';
import { ScanCard } from './session/ScanCard';
import { Summary } from './session/Summary';
import type { Answer } from './session/Summary';

const CONTRAST_DOTS = 5;

interface Scope {
  type?: CardType;
  /** `src=clues`: only cards made from the clue catalogue (Spot it, Which clue, Live view) */
  clues?: boolean;
  subject?: MetaSubject;
  country?: string;
  chapter?: string;
  /** `map=1`: only cards answered on a regions map; `map=0`: none of them */
  map?: boolean;
  /** `clue=1`: the Clue quiz, text-only fact cards; every other scope leaves them out */
  clue?: boolean;
}

/** `more=new`: "Learn more" (new cards past today's limit); `more=ahead`: "Practise more". */
type More = 'new' | 'ahead';

const SESSIONS: Record<More | 'today', (data: AppSnapshot, now: Date) => { queue: SessionItem[] }> =
  { today: todaySession, new: learnMore, ahead: practiseMore };

/** Cards preloaded ahead of the one showing. */
const PRELOAD_AHEAD = 5;

/**
 * `/session` alone runs today's finite, due-based session; `more=new` and `more=ahead` run the
 * extra sessions Today offers once that is done. Any of `type`, `subject`, `country`,
 * `chapter`, `map`, `clue` or `src=clues` starts endless practice over the cards in that scope instead; a scope
 * of one card shows the summary after each answer rather than looping on it. Text-only clue cards
 * only come up in the Clue quiz (`clue=1`).
 */
export function Session() {
  const { data, error } = useAppData();
  const [params] = useSearchParams();
  const param = params.get('type');
  const type = param && param in CARD_TYPES ? (param as CardType) : undefined;
  const subjectParam = params.get('subject');
  const subject =
    subjectParam && subjectParam in SUBJECTS ? (subjectParam as MetaSubject) : undefined;
  const country = params.get('country')?.toUpperCase() || undefined;
  const chapter = params.get('chapter') || undefined;
  const mapParam = params.get('map');
  const map = mapParam === '1' ? true : mapParam === '0' ? false : undefined;
  const clue = params.get('clue') === '1' || undefined;
  const clues = params.get('src') === 'clues' || undefined;
  const moreParam = params.get('more');
  const more = moreParam === 'new' || moreParam === 'ahead' ? moreParam : undefined;
  if (!data) return <Status error={error} />;
  const key = `${type}|${subject}|${country}|${chapter}|${map}|${clue}|${clues}`;
  return type || subject || country || chapter || map !== undefined || clue || clues ? (
    <PracticeRunner
      key={key}
      data={data}
      scope={{ type, subject, country, chapter, map, clue, clues }}
    />
  ) : (
    <DueRunner key={more ?? 'today'} data={data} more={more} />
  );
}

function inScope(
  cards: Card[],
  { type, subject, country, chapter, map, clue, clues }: Scope,
): Card[] {
  return cards.filter(
    (card) =>
      (clue ? isClueCard(card) : !isClueCard(card)) &&
      // Live view cards only in their own drill (type=live): Google paints road names on them
      (card.type !== 'live' || type === 'live') &&
      (!clues || Boolean(card.clue)) &&
      // regions-map cards only come up in map drills, not with their subject's "which country?"
      (map === undefined ? !subject || !card.map : map === Boolean(card.map)) &&
      (!type || card.type === type) &&
      (!subject || card.subject === subject) &&
      (!country || card.country === country) &&
      // area codes with no pattern (US, Canada) only in their own country's drill
      (Boolean(country) || !isMemoriseAreaCode(card)) &&
      (!chapter || card.chapter === chapter),
  );
}

/** What a drill is over, for its end screen: "Area codes", "Poles", "Brazil". */
function scopeTitle(data: AppSnapshot, scope: Scope): string {
  if (scope.clue) return 'Clue quiz';
  if (scope.type) return CARD_TYPES[scope.type].label;
  if (scope.subject) return SUBJECTS[scope.subject].label;
  const chapter = data.content.chapters.find((c) => c.id === scope.chapter);
  if (chapter) return chapter.title;
  if (scope.country) return label(scope.country);
  return 'Practice';
}

/** Where closing practice leads back to. */
function backTo(data: AppSnapshot, scope: Scope): string {
  const country =
    scope.country ?? data.content.chapters.find((c) => c.id === scope.chapter)?.country;
  return scope.type || !country ? '/drills' : `/atlas/${country}`;
}

/**
 * Warms the cache for upcoming cards: clue images through their signed URLs (one batch for all
 * the cards), else the prompt.
 */
function preload(repo: Repository, upcoming: (Card | undefined)[]) {
  const images = [];
  for (const card of upcoming) {
    if (!card) continue;
    const clue = card.clue;
    if (!clue) preloadPrompt(card.prompt);
    else images.push(...(clue.choices?.map((c) => c.image) ?? (clue.image ? [clue.image] : [])));
  }
  if (images.length > 0) preloadClueImages(repo, images);
}

function DueRunner({ data, more }: { data: AppSnapshot; more?: More }) {
  const { repo } = useAppData();
  const [queue, setQueue] = useState(() => SESSIONS[more ?? 'today'](data, new Date()).queue);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [startedAt] = useState(() => Date.now());
  const cards = data.content.cards;

  useEffect(() => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    preload(
      repo,
      queue.slice(index, index + 1 + PRELOAD_AHEAD).map((item) => byId.get(item.cardId)),
    );
  }, [queue, index, cards, repo]);

  const item = queue[index];
  if (!item || !cards.some((c) => c.id === item.cardId)) {
    return queue.length === 0 ? (
      <CaughtUp more={more} />
    ) : (
      <Summary
        kicker="Session done"
        answers={answers}
        cards={cards}
        startedAt={startedAt}
        spaceTo="/"
        actions={
          <LinkButton to="/">
            Back to Today
            <ArrowIcon />
          </LinkButton>
        }
      />
    );
  }

  // a missed card asked again is answered the way its state now calls for (a contrast question
  // keeps its two sides)
  const shown =
    item.retry && !item.contrastPair
      ? (() => {
          const card = cards.find((c) => c.id === item.cardId) as Card;
          return { ...item, mode: modeFor(card, data.states[card.id]) };
        })()
      : item;
  // the session's own cards set the total; a missed card asked again shows "Again" instead of
  // moving the finish line back
  const counts = (q: SessionItem) => !q.retry;
  const total = queue.filter(counts).length;
  const done = Math.max(1, Math.min(total, queue.slice(0, index + 1).filter(counts).length));

  return (
    <CardRunner
      key={index}
      data={data}
      item={shown}
      onAnswered={(correct) => {
        setAnswers([
          ...answers,
          { cardId: item.cardId, correct, retry: item.retry, scan: item.mode === 'scan' },
        ]);
        // wrong: it comes back at the end, until it is answered right
        if (!correct) setQueue((q) => requeueMissed(q, item, cards));
      }}
      onNext={() => setIndex(index + 1)}
      onLearnt={() => setIndex(index + 1)}
      onSkip={() => {
        // nothing graded: the card goes to the back of the queue
        setQueue([...queue, item]);
        setIndex(index + 1);
      }}
      bar={({ card, options, outcome }) =>
        item.contrastPair ? (
          <ContrastBar
            data={data}
            item={item}
            options={options}
            outcome={outcome}
            scope={scopeOf(card)}
          />
        ) : (
          <div className="session-bar rise">
            <CloseButton to="/" label="Leave session" confirm={index > 0} />
            <ProgressBar value={done} max={total} label={`Card ${done} of ${total}`} />
            {item.retry && <span className="session-retry">Again</span>}
            <span className="session-count">
              {done} / {total}
            </span>
          </div>
        )
      }
    />
  );
}

interface PracticeFlow {
  practice: PracticeState;
  item: SessionItem;
  step: number;
  /** drawn once the current item is answered, so its image can preload during the reveal */
  upcoming?: { item: SessionItem; practice: PracticeState };
}

/** Cards in one round of practice: a drill ends on its summary after this many. */
const PRACTICE_ROUND = 20;

function PracticeRunner({ data, scope }: { data: AppSnapshot; scope: Scope }) {
  const { repo } = useAppData();
  const [pool] = useState(() => inScope(data.content.cards, scope));
  const [flow, setFlow] = useState<PracticeFlow | null>(() => {
    if (pool.length === 0) return null;
    const now = new Date();
    const practice = createPractice({
      cards: pool,
      states: data.states,
      confusions: data.confusions,
      now,
      rng: Math.random,
    });
    return { ...nextPracticeItem(practice, data.states, now), step: 0 };
  });
  const [answers, setAnswers] = useState<Answer[]>([]);
  // practice runs in rounds of PRACTICE_ROUND cards, each ending on its summary
  const [roundStart, setRoundStart] = useState(0);
  const [lessons, setLessons] = useState(0);
  const [lessonsStart, setLessonsStart] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [ended, setEnded] = useState(false);
  const back = backTo(data, scope);
  const freshAhead = (practice: PracticeState) => {
    const ahead = new Set(practice.fresh.slice(0, PRELOAD_AHEAD));
    return pool.filter((c) => ahead.has(c.id));
  };

  // the first cards' images, signed in one batch while the first card shows
  useEffect(() => {
    if (flow) preload(repo, [cardForItem(flow.item, pool), ...freshAhead(flow.practice)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at the start
  }, []);

  if (!flow) {
    return (
      <EmptyState
        size="fill"
        title="No cards here yet"
        text="Add some in the editor, or practise something else."
        actions={[
          { label: 'Open editor', to: '/editor' },
          { label: 'Back', to: back },
        ]}
      />
    );
  }

  if (ended) {
    return (
      <Summary
        kicker={`${scopeTitle(data, scope)} · done`}
        answers={answers.slice(roundStart)}
        cards={pool}
        startedAt={startedAt}
        progress={
          pool.length > 1 ? practiceProgress(flow.upcoming?.practice ?? flow.practice) : undefined
        }
        actions={
          <>
            <Button
              onClick={() => {
                setRoundStart(answers.length);
                setLessonsStart(lessons);
                setStartedAt(Date.now());
                setEnded(false);
              }}
            >
              Keep going
              <ArrowIcon />
            </Button>
            <LinkButton to={back} variant="ghost">
              Done
            </LinkButton>
          </>
        }
      />
    );
  }

  // lessons are steps of the round too, so the counter moves while new clues are shown
  const inRound = answers.length - roundStart + lessons - lessonsStart;

  function onAnswered(correct: boolean, state?: CardState) {
    if (!flow) return;
    setAnswers([...answers, { cardId: flow.item.cardId, correct }]);
    const practice = recordPracticeAnswer(flow.practice, flow.item.cardId, correct);
    const upcoming = nextPracticeItem(
      practice,
      state ? { ...data.states, [state.cardId]: state } : data.states,
      new Date(),
    );
    preload(repo, [cardForItem(upcoming.item, pool), ...freshAhead(upcoming.practice)]);
    setFlow({ ...flow, practice, upcoming });
  }

  function advance() {
    if (!flow?.upcoming) return;
    const { item, practice } = flow.upcoming;
    const card = pool.find((c) => c.id === item.cardId);
    // The answer just recorded may have moved this card past multiple choice; a lesson stays one
    const mode = item.mode !== 'learn' && card ? modeFor(card, data.states[card.id]) : item.mode;
    setFlow({ practice, item: { ...item, mode }, step: flow.step + 1 });
    // one card has nothing else to draw: end at the summary instead of looping on it; otherwise
    // a round ends at its summary after PRACTICE_ROUND cards
    if (pool.length === 1 || inRound >= PRACTICE_ROUND) setEnded(true);
  }

  /** A lesson read: one step of the round, then on to the next card. */
  function learnt() {
    setLessons(lessons + 1);
    skip();
  }

  /** An unanswerable card is passed over ungraded; it stays in the pool and comes back. */
  function skip() {
    if (!flow) return;
    const next = nextPracticeItem(flow.practice, data.states, new Date());
    setFlow({ practice: next.practice, item: next.item, step: flow.step + 1 });
  }

  /** Ending while an answered card is showing moves on, so Keep going never re-serves it. */
  function endPractice() {
    advance();
    setEnded(true);
  }

  return (
    <CardRunner
      key={flow.step}
      data={data}
      item={flow.item}
      onAnswered={onAnswered}
      onNext={advance}
      onSkip={skip}
      // a first look is passed over ungraded; its question is already scheduled
      onLearnt={learnt}
      bar={({ outcome }) => {
        const at = Math.min(PRACTICE_ROUND, inRound + (outcome ? 0 : 1));
        return (
          <div className="session-bar rise">
            <button type="button" className="chip" aria-label="End practice" onClick={endPractice}>
              <CloseIcon />
            </button>
            <ProgressBar
              value={at}
              max={PRACTICE_ROUND}
              label={`Card ${at} of ${PRACTICE_ROUND}`}
            />
            <span className="session-count">
              {at} / {PRACTICE_ROUND}
            </span>
          </div>
        );
      }}
    />
  );
}

interface Shown {
  tips: Tip[];
  aside: RevealProps['aside'];
}

/** "How to spot Chile’s bollards" with that clue's summary, for the reveal's aside. */
function clueAside(name: string, clue: Clue): Shown['aside'] {
  // the pick's own tell, as short as the answer's: its heading without the family part
  if (isGalleryClue(clue)) return undefined;
  const heading = clueHeading(clue);
  const tell = heading.includes(':') ? heading.replace(/^[^:]*:\s*/, '') : '';
  const text = tell || clue.summary?.trim().split(/(?<=[.!?])\s+/)[0];
  if (!text) return undefined;
  return {
    label: name,
    tip: {
      tip: { id: `clue:${clue.id}`, answer: name, scope: 'clue', text, source: clue.credit.url },
      index: 0,
      total: 1,
    },
  };
}

/** A card this stable (days) is well known. */
const MATURE_DAYS = 21;

const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

/** One card from prompt to reveal; the parent decides what comes next. */
function CardRunner({
  data,
  item,
  onAnswered,
  onNext,
  onSkip,
  onLearnt,
  bar,
}: {
  data: AppSnapshot;
  item: SessionItem;
  onAnswered(correct: boolean, state?: CardState): void;
  onNext(): void;
  /** passes over the card without grading it */
  onSkip(): void;
  /** a first look ('learn') was seen: nothing is graded, its question comes later */
  onLearnt(): void;
  bar(context: { card: Card; options: string[]; outcome: Outcome | null }): ReactNode;
}) {
  const { answer, recordTipView } = useAppData();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const shownAt = useRef(performance.now());
  const cards = data.content.cards;
  // one showing: its options are drawn once, from the card, its review count and this moment, so
  // a card that comes back offers other distractors in another order (re-renders keep them)
  const [shownMs] = useState(() => Date.now());
  const reps = data.states[item.cardId]?.reps ?? 0;
  const [seed] = useState(() => showingSeed(item.cardId, reps, shownMs));
  // a practice repeat may show another image of the card's clue
  // what the learner picked for this answer before, most often first (read once per showing)
  const [mixedUp] = useState(() => {
    const base = cardForItem(item, cards);
    if (!base) return [];
    const truth = answerKey(base, base.answer);
    return data.confusions
      .filter((c) => c.truth === truth && c.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((c) => c.picked);
  });
  const card = useMemo(
    () => cardForShowing(cardForItem(item, cards) as Card, seed, mixedUp),
    [item, cards, seed, mixedUp],
  );
  // Options are drawn once per item; later content changes must not reshuffle them.
  const [options] = useState(() => optionsFor(item, card, cards, Math.random));

  useKeys((event) => {
    if (event.key !== ' ' || !outcome) return;
    event.preventDefault();
    onNext();
  });

  const otherSide = item.mode === 'binary' ? options.find((o) => o !== card.answer) : undefined;
  const scope = scopeOf(card);

  /**
   * The answer's tip; area codes share pattern tips keyed "ddd:br:pattern" across all their cards,
   * and Which clue cards (whose answer is an image id) use the country's tips.
   */
  function mainTips(): Tip[] {
    const all = mainTipsRaw();
    // a tip that says what the reason line already said is left out
    const why = card.explain ? fold(card.explain).slice(0, 40) : '';
    return why ? all.filter((tip) => !fold(tip.text).includes(why.slice(0, 30))) : all;
  }

  function mainTipsRaw(): Tip[] {
    const { tips } = data.content;
    const key = card.type === 'which' ? label(card.country) : card.answer;
    const context = cardContext(card);
    const own = rankTips(tips, key, card.type, data.tipViews, context);
    // a patterned area code's reveal has its Pattern line ("9x = …"); the pattern tips only
    // repeat it, so they are shown where there is no pattern line
    return own.length > 0 || card.type !== 'areacode' || !isMemoriseAreaCode(card)
      ? own
      : rankTips(tips, card.id.replace(/:[^:]*$/, ':pattern'), card.type, data.tipViews, context);
  }

  function showTips(asideKey: string | undefined, given?: string) {
    // a card with its own reason (a lookalike's "ř is Czech only") says all a right answer needs
    // and a miss needs only that reason and the other side's tell ("And for Spain")
    const reasoned = Boolean(card.explain) && card.type === 'lookalike';
    if (reasoned && given === undefined) {
      setShown({ tips: [], aside: undefined });
      return;
    }
    // a clue card's reveal is the clue's tell and the pick's: the tips are other lessons
    const tips = reasoned || card.clue ? [] : mainTips();
    // the pick's tip that speaks to this question: one naming the answer, or a letter it shows
    // (after a Kyrgyz word, Russia's "none of ә қ ң ө ү", not "ы, э, ъ, which Ukrainian lacks")
    const stem = label(card.type === 'which' ? card.country : card.answer, scope)
      .slice(0, 5)
      .toLowerCase();
    const letters = [...card.prompt.value].filter((ch) => ch > '\u024f');
    const speaks = (tip: Tip) =>
      tip.text.toLowerCase().includes(stem) || letters.some((ch) => tip.text.includes(ch));
    const candidate = asideKey
      ? pickTip(data.content.tips, asideKey, card.type, data.tipViews, 0, speaks)
      : null;
    // the other side's tip is left out when it only repeats one of the answer's own
    const asideTip =
      candidate && !tips.some((tip) => sameTip(tip, candidate.tip)) ? candidate : null;
    const name = asideKey && label(asideKey, scope);
    const aside: Shown['aside'] = card.clue
      ? (pickedAside(asideKey, given) ?? undefined)
      : asideTip
        ? { label: otherSide ? `And for ${name}` : `How to spot ${name}`, tip: asideTip }
        : (pickedAside(asideKey, given) ?? undefined);
    setShown({ tips, aside });
    // the first tip is recorded by the reveal as it comes on screen; a picked clue is no tip
    if (asideTip && !card.clue) recordTipView(asideTip.tip.id);
  }

  /**
   * On a missed clue card with no tip for the pick: the picked country's own clue of the same
   * family ("How to spot Brazil’s bollards"), so the miss teaches the difference.
   */
  function pickedClue(pickedName: string): Shown['aside'] {
    const clue = card.clue && clueIndex(data.content).byId.get(card.clue.id);
    const code = data.content.pool.find((c) => c.name === pickedName)?.code;
    // "other clues" is a mixed bag: Spain's phone numbers teach nothing about a Greek taxi
    if (!clue || !code || clue.family === 'other') return undefined;
    const candidates =
      clueIndex(data.content)
        .byCountry.get(code)
        ?.clues.filter((c) => c.family === clue.family && !isGalleryClue(c) && c.summary?.trim()) ??
      [];
    // the one that says what to look for, not "fairly rare here"
    // one that says what to look for across the country: not "fairly rare here", not one road
    const theirs = candidates.find((c) => isCountryWide(c));
    return theirs ? clueAside(pickedName, theirs) : undefined;
  }

  /** What a miss teaches about the learner's pick, by card kind; undefined when nothing does. */
  function pickedAside(asideKey: string | undefined, given: string | undefined): Shown['aside'] {
    if (otherSide || !asideKey)
      return card.type === 'which' && given ? pickedChoice(given) : undefined;
    if (card.type === 'areacode') return pickedCodes(asideKey);
    if (card.type === 'which' && given) return pickedChoice(given);
    if (card.type === 'region' && card.map) return pickedRegion(asideKey);
    return card.clue ? pickedClue(asideKey) : undefined;
  }

  /**
   * On a missed map question: what marks the region the learner picked, from that region's own
   * card (the same clue family first), so the miss sets the two apart.
   */
  function pickedRegion(state: string): Shown['aside'] {
    const theirs = cards.filter(
      (c) => c.type === 'region' && c.map === card.map && c.answer === state && c.id !== card.id,
    );
    // the same kind of clue only: stilt houses say nothing about poles
    const pick = theirs.find((c) => c.subject === card.subject);
    if (!pick) return undefined;
    const clue = pick.clue && clueIndex(data.content).byId.get(pick.clue.id);
    const text = (clue ? clue.summary?.trim() || clue.title : whyFor(pick))?.trim();
    if (!text) return undefined;
    const name = label(state, scope);
    return {
      label: `What marks ${name}`,
      tip: {
        tip: { id: `region:${pick.id}`, answer: name, scope: 'region', text, source: pick.source },
        index: 0,
        total: 1,
      },
    };
  }

  /** On a missed area code: the codes of the state the learner picked ("Acre: 68"). */
  function pickedCodes(state: string): Shown['aside'] {
    const codes = cards
      .filter((c) => c.type === 'areacode' && c.country === card.country && c.answer === state)
      .map((c) => c.prompt.value)
      .sort();
    if (codes.length === 0) return undefined;
    const name = label(state, scope);
    return {
      label: `${possessive(name)} codes`,
      tip: {
        tip: {
          id: `codes:${state}`,
          answer: name,
          scope: 'areacode',
          text: codes.join(', '),
          source: '',
        },
        index: 0,
        total: 1,
      },
    };
  }

  /** On a missed Which clue card: the clue behind the picture the learner picked. */
  function pickedChoice(imageId: string): Shown['aside'] {
    const choice = card.clue?.choices?.find((c) => c.image.id === imageId);
    const theirs = choice && clueIndex(data.content).byId.get(choice.clueId);
    return choice && theirs ? clueAside(label(choice.country), theirs) : undefined;
  }

  function onAnswer(given: string) {
    if (outcome) return;
    if (item.mode === 'learn') {
      onLearnt();
      return;
    }
    const correct = isCorrect(item, card, given, cards);
    // a Which clue card's options are image ids, not answers a confusion could pair
    const picked =
      correct || card.type === 'which'
        ? undefined
        : item.mode === 'recall'
          ? matchedOther(card, given, cards)
          : given || undefined;
    const state = answer({
      card,
      given,
      correct,
      picked,
      // "Knew it" on a Refresh card is graded as a fast right answer ("easy")
      msTaken:
        item.mode === 'scan' && correct ? 1000 : Math.round(performance.now() - shownAt.current),
      choices: item.mode === 'scan' ? undefined : options.length,
      retry: item.retry,
      contrastPair: item.contrastPair,
    });
    setOutcome({ given, correct });
    onAnswered(correct, state);
    // a Refresh card already showed its answer: straight on to the next
    if (item.mode === 'scan') {
      onNext();
      return;
    }
    showTips(otherSide ?? picked, correct ? undefined : given);
  }

  const View =
    item.mode === 'binary'
      ? LookalikeCard
      : item.mode === 'scan' || item.mode === 'learn'
        ? ScanCard
        : viewFor(card);
  const verdict = outcome && verdictFor(card, item, outcome);
  const reveal = verdict && shown && (
    <Reveal
      {...verdict}
      tips={shown.tips}
      aside={shown.aside}
      extra={
        card.clue ? (
          <ClueAnswer card={card} />
        ) : (
          card.type === 'areacode' && <PatternHint card={card} cards={cards} labelled />
        )
      }
      onNext={onNext}
      onTipShown={(tip) => recordTipView(tip.id)}
      compactAside={Boolean(card.clue)}
      more={card.clue ? <ClueMore card={card} /> : undefined}
    />
  );

  return (
    <div className="session">
      {bar({ card, options, outcome })}
      <View
        card={card}
        cards={cards}
        mode={item.mode}
        options={options}
        outcome={outcome}
        onAnswer={onAnswer}
        onSkip={onSkip}
        reveal={reveal}
        mature={(data.states[card.id]?.stability ?? 0) > MATURE_DAYS}
      />
      <VerdictAnnouncer text={verdict ? verdict.verdict : ''} />
    </div>
  );
}

function isCorrect(item: SessionItem, card: Card, given: string, cards: Card[]): boolean {
  // an area code that spans a border: the other regions it covers count too
  if (card.spans?.includes(given)) return true;
  if (item.mode !== 'recall') return given === card.answer;
  const others = cards
    .filter((c) => c.type === card.type && c.answer !== card.answer)
    .map((c) => c.answer);
  return matchesAnswer(given, card, others);
}

/** The same-type answer a typed guess names exactly, so typed misses still record a confusion. */
function matchedOther(card: Card, given: string, cards: Card[]): string | undefined {
  const guess = normalizeAnswer(given);
  return cards.find(
    (c) =>
      c.type === card.type &&
      c.answer !== card.answer &&
      [c.answer, ...(c.aliases ?? [])].some((name) => normalizeAnswer(name) === guess),
  )?.answer;
}

function CloseIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

function ContrastBar({
  data,
  item,
  options,
  outcome,
  scope,
}: {
  data: AppSnapshot;
  item: SessionItem;
  options: string[];
  outcome: Outcome | null;
  scope?: LabelScope;
}) {
  const [picked, truth] = item.contrastPair as [string, string];
  const streak =
    data.confusions.find((c) => c.picked === picked && c.truth === truth)?.contrastStreak ?? 0;
  const gained = outcome?.correct ?? false;
  return (
    <div className="session-bar session-bar-contrast rise">
      <CloseButton to="/" label="Leave session" />
      <div className="contrast-title">
        <Chip>Contrast round</Chip>
        <span>
          <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="9" cy="12" r="5.5" />
            <circle cx="15" cy="12" r="5.5" />
          </svg>
          {label(options[0] as string, scope)} vs {label(options[1] as string, scope)}
        </span>
      </div>
      <div
        className="dots"
        role="img"
        aria-label={`${streak} of ${CONTRAST_DOTS} correct in a row`}
      >
        {Array.from({ length: CONTRAST_DOTS }, (_, i) => (
          <span
            key={i}
            className={`dot${i < streak ? ' on' : ''}${gained && i === streak - 1 ? ' new' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}

function CaughtUp({ more }: { more?: More }) {
  const text =
    more === 'new'
      ? 'Every card has been introduced. Keep practising with a drill or a game.'
      : more === 'ahead'
        ? 'Nothing studied yet to practise. Start with today’s session.'
        : 'Nothing is due. Keep practising with a drill or a game.';
  return (
    <div className="session">
      <div className="session-bar rise">
        <CloseButton to="/" label="Leave session" />
      </div>
      <EmptyState
        title="All caught up"
        text={text}
        actions={[
          { label: 'Drills', to: '/drills' },
          { label: 'Mini-games', to: '/games' },
        ]}
      />
    </div>
  );
}

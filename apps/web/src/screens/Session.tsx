import {
  cardForItem,
  cardForShowing,
  createPractice,
  isClueCard,
  matchesAnswer,
  modeFor,
  nextPracticeItem,
  normalizeAnswer,
  pickTip,
  practiceProgress,
  recordPracticeAnswer,
  requeueMissed,
  showingSeed,
} from '@metabook/core';
import type {
  Card,
  CardState,
  CardType,
  MetaSubject,
  PickedTip,
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
import { optionsFor } from './session/options';
import { preloadClueImages } from '../data/clueImages';
import type { Repository } from '../data/repository';
import { ClueAnswer } from './session/ClueAnswer';
import { preloadPrompt } from './session/Prompt';
import { Reveal, VerdictAnnouncer } from './session/Reveal';
import type { RevealProps } from './session/Reveal';
import type { Outcome } from './session/types';
import { useKeys } from './session/useKeys';
import { verdictFor } from './session/verdict';
import { viewFor } from './session/views';
import { LookalikeCard } from './session/LookalikeCard';
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
  const retriesLeft = queue.slice(index + 1).filter((q) => q.retry).length;

  return (
    <CardRunner
      key={index}
      data={data}
      item={shown}
      onAnswered={(correct) => {
        setAnswers([...answers, { cardId: item.cardId, correct, retry: item.retry }]);
        // wrong: it comes back at the end, until it is answered right
        if (!correct) setQueue((q) => requeueMissed(q, item));
      }}
      onNext={() => setIndex(index + 1)}
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
            <CloseButton to="/" label="Leave session" />
            <ProgressBar
              value={index + 1}
              max={queue.length}
              label={`Card ${index + 1} of ${queue.length}`}
            />
            {item.retry ? (
              <span className="session-retry">Again</span>
            ) : (
              retriesLeft > 0 && <span className="session-retry">{retriesLeft} to retry</span>
            )}
            <span className="session-count">
              {index + 1} / {queue.length}
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
  const [startedAt] = useState(() => Date.now());
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
        answers={answers}
        cards={pool}
        startedAt={startedAt}
        progress={
          pool.length > 1 ? practiceProgress(flow.upcoming?.practice ?? flow.practice) : undefined
        }
        actions={
          <>
            <Button onClick={() => setEnded(false)}>
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

  const right = answers.filter((a) => a.correct).length;
  const progress = practiceProgress(flow.practice);

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
    // The answer just recorded may have moved this card past multiple choice.
    const mode = card ? modeFor(card, data.states[card.id]) : item.mode;
    setFlow({ practice, item: { ...item, mode }, step: flow.step + 1 });
    // one card has nothing else to draw: end at the summary instead of looping on it
    if (pool.length === 1) setEnded(true);
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
      bar={() => (
        <div className="session-bar rise">
          <button type="button" className="chip" aria-label="End practice" onClick={endPractice}>
            <CloseIcon />
          </button>
          <span className="practice-count" aria-live="polite">
            {answers.length} answered
            {answers.length > 0 && ` · ${Math.round((right / answers.length) * 100)}% right`}
          </span>
          {pool.length > 1 && (
            <span className="practice-learnt">
              {progress.pass > 1 && `Pass ${progress.pass} · `}
              {progress.learnt} / {progress.total} learnt
            </span>
          )}
        </div>
      )}
    />
  );
}

interface Shown {
  tip: PickedTip | null;
  aside: RevealProps['aside'];
}

/** One card from prompt to reveal; the parent decides what comes next. */
function CardRunner({
  data,
  item,
  onAnswered,
  onNext,
  onSkip,
  bar,
}: {
  data: AppSnapshot;
  item: SessionItem;
  onAnswered(correct: boolean, state?: CardState): void;
  onNext(): void;
  /** passes over the card without grading it */
  onSkip(): void;
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
  const card = useMemo(
    () => cardForShowing(cardForItem(item, cards) as Card, seed),
    [item, cards, seed],
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
  function mainTip(): PickedTip | null {
    const { tips } = data.content;
    const key = card.type === 'which' ? label(card.country) : card.answer;
    return (
      pickTip(tips, key, card.type, data.tipViews) ??
      (card.type === 'areacode'
        ? pickTip(tips, card.id.replace(/:[^:]*$/, ':pattern'), card.type, data.tipViews)
        : null)
    );
  }

  function showTips(asideKey: string | undefined) {
    const tip = mainTip();
    const asideTip = asideKey
      ? pickTip(data.content.tips, asideKey, card.type, data.tipViews)
      : null;
    const name = asideKey && label(asideKey, scope);
    const aside: Shown['aside'] = asideTip
      ? { label: otherSide ? `And for ${name}` : `Spotting ${name}`, tip: asideTip }
      : undefined;
    setShown({ tip, aside });
    for (const picked of [tip, asideTip]) if (picked) recordTipView(picked.tip.id);
  }

  /** Steps the answer's tip through its rotation; the aside keeps its own tip. */
  function anotherTip() {
    if (!shown) return;
    const tip = mainTip();
    if (tip) recordTipView(tip.tip.id);
    setShown({ ...shown, tip });
  }

  function onAnswer(given: string) {
    if (outcome) return;
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
      msTaken: Math.round(performance.now() - shownAt.current),
      contrastPair: item.contrastPair,
    });
    setOutcome({ given, correct });
    showTips(otherSide ?? picked);
    onAnswered(correct, state);
  }

  const View = item.mode === 'binary' ? LookalikeCard : viewFor(card);
  const verdict = outcome && verdictFor(card, item, outcome);
  const reveal = verdict && shown && (
    <Reveal
      {...verdict}
      tip={shown.tip}
      aside={shown.aside}
      extra={
        card.clue ? (
          <ClueAnswer card={card} />
        ) : (
          card.type === 'areacode' && <PatternHint card={card} cards={cards} />
        )
      }
      onNext={onNext}
      onAnotherTip={anotherTip}
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

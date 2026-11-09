import {
  createPractice,
  matchesAnswer,
  modeFor,
  nextPracticeItem,
  normalizeAnswer,
  pickTip,
  recordPracticeAnswer,
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
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { CARD_TYPES } from '../app/cardTypes';
import { label, scopeOf, SUBJECTS } from '../app/labels';
import type { Scope as LabelScope } from '../app/labels';
import { todaySession } from '../app/stats';
import { ArrowIcon, Button, LinkButton } from '../components/Button';
import { Chip, CloseButton } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { ProgressBar } from '../components/ProgressBar';
import { Status } from '../components/Status';
import { optionsFor } from './session/options';
import { preloadPrompt } from './session/Prompt';
import { Reveal, VerdictAnnouncer } from './session/Reveal';
import type { RevealProps } from './session/Reveal';
import type { Outcome } from './session/types';
import { useKeys } from './session/useKeys';
import { verdictFor } from './session/verdict';
import { viewFor } from './session/views';
import { LookalikeCard } from './session/LookalikeCard';

const CONTRAST_DOTS = 5;

interface Scope {
  type?: CardType;
  subject?: MetaSubject;
  country?: string;
  chapter?: string;
  /** `map=1`: only cards answered on a regions map; `map=0`: none of them */
  map?: boolean;
}

/**
 * `/session` alone runs today's finite, due-based session. Any of `type`, `subject`, `country`,
 * `chapter` or `map` starts endless practice over the cards in that scope instead; a scope of
 * one card shows the summary after each answer rather than looping on it.
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
  if (!data) return <Status error={error} />;
  const key = `${type}|${subject}|${country}|${chapter}|${map}`;
  return type || subject || country || chapter || map !== undefined ? (
    <PracticeRunner key={key} data={data} scope={{ type, subject, country, chapter, map }} />
  ) : (
    <DueRunner data={data} />
  );
}

function inScope(cards: Card[], { type, subject, country, chapter, map }: Scope): Card[] {
  return cards.filter(
    (card) =>
      // regions-map cards only come up in map drills, not with their subject's "which country?"
      (map === undefined ? !subject || !card.map : map === Boolean(card.map)) &&
      (!type || card.type === type) &&
      (!subject || card.subject === subject) &&
      (!country || card.country === country) &&
      (!chapter || card.chapter === chapter),
  );
}

/** Where closing practice leads back to. */
function backTo(data: AppSnapshot, scope: Scope): string {
  const country =
    scope.country ?? data.content.chapters.find((c) => c.id === scope.chapter)?.country;
  return scope.type || !country ? '/drills' : `/atlas/${country}`;
}

function DueRunner({ data }: { data: AppSnapshot }) {
  const [queue, setQueue] = useState(() => todaySession(data, new Date()).queue);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const cards = data.content.cards;

  useEffect(() => {
    const upcoming = queue[index + 1];
    preloadPrompt(cards.find((c) => c.id === upcoming?.cardId)?.prompt);
  }, [queue, index, cards]);

  const item = queue[index];
  if (!item || !cards.some((c) => c.id === item.cardId)) {
    return queue.length === 0 ? (
      <CaughtUp />
    ) : (
      <Summary
        kicker="Session done"
        results={results}
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

  return (
    <CardRunner
      key={index}
      data={data}
      item={item}
      onAnswered={(correct) => setResults([...results, correct])}
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
  const [results, setResults] = useState<boolean[]>([]);
  const [ended, setEnded] = useState(false);
  const back = backTo(data, scope);

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
        kicker="Practice done"
        results={results}
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

  const right = results.filter(Boolean).length;

  function onAnswered(correct: boolean, state?: CardState) {
    if (!flow) return;
    setResults([...results, correct]);
    const practice = recordPracticeAnswer(flow.practice, flow.item.cardId, correct);
    const upcoming = nextPracticeItem(
      practice,
      state ? { ...data.states, [state.cardId]: state } : data.states,
      new Date(),
    );
    preloadPrompt(pool.find((c) => c.id === upcoming.item.cardId)?.prompt);
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
          <button
            type="button"
            className="chip"
            aria-label="End practice"
            onClick={endPractice}
          >
            <CloseIcon />
          </button>
          <span className="practice-count" aria-live="polite">
            {results.length} answered
            {results.length > 0 && ` · ${Math.round((right / results.length) * 100)}% right`}
          </span>
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
  const card = cards.find((c) => c.id === item.cardId) as Card;
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
   * and photo picks (whose answer is a photo id) use the country's tips.
   */
  function mainTip(): PickedTip | null {
    const { tips } = data.content;
    const key = card.type === 'photo-choice' ? label(card.country) : card.answer;
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
    // a photo pick's options are photo ids, not answers a confusion could pair
    const picked =
      correct || card.type === 'photo-choice'
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

function CaughtUp() {
  return (
    <div className="session">
      <div className="session-bar rise">
        <CloseButton to="/" label="Leave session" />
      </div>
      <EmptyState
        title="All caught up"
        text="Nothing is due. Keep practising with a drill or a game."
        actions={[
          { label: 'Drills', to: '/drills' },
          { label: 'Mini-games', to: '/games' },
        ]}
      />
    </div>
  );
}

function Summary({
  kicker,
  results,
  actions,
  spaceTo,
}: {
  kicker: string;
  results: boolean[];
  actions: ReactNode;
  /** where Space leads, if anywhere */
  spaceTo?: string;
}) {
  const navigate = useNavigate();
  const right = results.filter(Boolean).length;
  useKeys((event) => {
    if (event.key !== ' ' || !spaceTo) return;
    event.preventDefault();
    navigate(spaceTo);
  });
  return (
    <main className="stage stage-narrow summary summary-full">
      <div className="rise">
        <p className="kicker">{kicker}</p>
        <h1 className="headline">
          {results.length} {results.length === 1 ? 'card' : 'cards'}
        </h1>
        {results.length > 0 && (
          <p className="summary-sub">{Math.round((right / results.length) * 100)}% right</p>
        )}
      </div>
      <div className="summary-actions rise d1">{actions}</div>
    </main>
  );
}

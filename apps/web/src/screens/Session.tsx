import { matchesAnswer, normalizeAnswer, pickTip } from '@metabook/core';
import type { Card, CardType, PickedTip, SessionItem } from '@metabook/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { CARD_TYPES } from '../app/cardTypes';
import { label, scopeOf } from '../app/labels';
import { todaySession } from '../app/stats';
import { ArrowIcon, LinkButton } from '../components/Button';
import { Chip, CloseButton } from '../components/Chip';
import { ProgressBar } from '../components/ProgressBar';
import { Status } from '../components/Status';
import { AreaCodeCard } from './session/AreaCodeCard';
import { FlagCard } from './session/FlagCard';
import { LookalikeCard } from './session/LookalikeCard';
import { MetaCard } from './session/MetaCard';
import { optionsFor } from './session/options';
import { RegionCard } from './session/RegionCard';
import { Reveal } from './session/Reveal';
import type { RevealProps } from './session/Reveal';
import { ScriptCard } from './session/ScriptCard';
import type { CardProps, Outcome } from './session/types';
import { useKeys } from './session/useKeys';

const CARD_VIEWS: Record<CardType, ComponentType<CardProps>> = {
  flag: FlagCard,
  script: ScriptCard,
  meta: MetaCard,
  plate: MetaCard,
  region: RegionCard,
  areacode: AreaCodeCard,
  lookalike: LookalikeCard,
};

const CONTRAST_DOTS = 5;

export function Session() {
  const { data, error } = useAppData();
  const [params] = useSearchParams();
  const param = params.get('type');
  const type = param && param in CARD_TYPES ? (param as CardType) : undefined;
  const country = params.get('country')?.toUpperCase() || undefined;
  const chapter = params.get('chapter') || undefined;
  return data ? (
    <Runner
      key={`${type}|${country}|${chapter}`}
      data={data}
      type={type}
      scope={{ country, chapter }}
    />
  ) : (
    <Status error={error} />
  );
}

interface Shown {
  asideKey: string | undefined;
  tip: PickedTip | null;
  aside: RevealProps['aside'];
}

interface Scope {
  country?: string;
  chapter?: string;
}

function Runner({ data, type, scope }: { data: AppSnapshot; type?: CardType; scope: Scope }) {
  const { answer, recordTipView } = useAppData();
  const navigate = useNavigate();
  const [queue] = useState(() => {
    const { country, chapter } = scope;
    const inScope = data.content.cards.filter(
      (card) =>
        (!type || card.type === type) &&
        (!country || card.country === country) &&
        (!chapter || card.chapter === chapter),
    );
    const scoped = { ...data, content: { ...data.content, cards: inScope } };
    // Contrast rounds only drill pairs whose cards fall inside the filter.
    const ids = new Set(inScope.map((card) => card.id));
    return todaySession(scoped, new Date(), type).queue.filter(
      (item) => !item.contrastPair || ids.has(item.cardId),
    );
  });
  const [index, setIndex] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const shownAt = useRef(0);

  const cards = data.content.cards;
  const item = queue[index];
  const card = useMemo(() => cards.find((c) => c.id === item?.cardId), [cards, item]);
  const options = useMemo(
    () => (item && card ? optionsFor(item, card, cards, Math.random) : []),
    // Options are drawn once per item; later content changes must not reshuffle them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index],
  );

  useEffect(() => {
    shownAt.current = performance.now();
  }, [index]);

  const finished = index >= queue.length;
  useKeys((event) => {
    if (event.key !== ' ') return;
    event.preventDefault();
    if (finished) navigate('/');
    else if (outcome) next();
  });

  if (finished || !item || !card) {
    return <Summary total={queue.length} results={results} />;
  }

  const otherSide = item.mode === 'binary' ? options.find((o) => o !== card.answer) : undefined;

  /** The answer's tip; area codes share pattern tips keyed "ddd:br:pattern" across all their cards. */
  function mainTip(current: Card): PickedTip | null {
    const { tips } = data.content;
    return (
      pickTip(tips, current.answer, current.type, data.tipViews) ??
      (current.type === 'areacode'
        ? pickTip(tips, current.id.replace(/:[^:]*$/, ':pattern'), current.type, data.tipViews)
        : null)
    );
  }

  function showTips(asideKey: string | undefined) {
    if (!card) return;
    const tip = mainTip(card);
    const asideTip = asideKey
      ? pickTip(data.content.tips, asideKey, card.type, data.tipViews)
      : null;
    const name = asideKey && label(asideKey, scopeOf(card.type));
    const aside: Shown['aside'] = asideTip
      ? otherSide
        ? { label: `And for ${name}`, tip: asideTip, variant: 'aside' }
        : { label: `Spotting ${name}`, tip: asideTip, variant: 'warn' }
      : undefined;
    setShown({ asideKey, tip, aside });
    for (const picked of [tip, asideTip]) if (picked) recordTipView(picked.tip.id);
  }

  /** Steps the answer's tip through its rotation; the aside box keeps its own tip. */
  function anotherTip() {
    if (!card || !shown) return;
    const tip = mainTip(card);
    if (tip) recordTipView(tip.tip.id);
    setShown({ ...shown, tip });
  }

  function onAnswer(given: string) {
    if (outcome || !card || !item) return;
    const correct = isCorrect(item, card, given, cards);
    const picked = correct
      ? undefined
      : item.mode === 'recall'
        ? matchedOther(card, given, cards)
        : given || undefined;
    answer({
      card,
      given,
      correct,
      picked,
      msTaken: Math.round(performance.now() - shownAt.current),
      contrastPair: item.contrastPair,
    });
    setOutcome({ given, correct });
    setResults([...results, correct]);
    showTips(otherSide ?? picked);
  }

  function next() {
    setOutcome(null);
    setShown(null);
    setIndex(index + 1);
  }

  const View = item.mode === 'binary' ? LookalikeCard : CARD_VIEWS[card.type];
  const withHeadline = item.mode === 'recall' || card.type === 'meta' || card.type === 'plate';
  const reveal = outcome && shown && (
    <Reveal
      {...verdictFor(card, item, outcome, withHeadline)}
      headline={withHeadline ? label(card.answer, scopeOf(card.type)) : undefined}
      tip={shown.tip}
      aside={shown.aside}
      onNext={next}
      onAnotherTip={anotherTip}
    />
  );

  return (
    <div className="session">
      {item.contrastPair ? (
        <ContrastBar
          data={data}
          item={item}
          options={options}
          outcome={outcome}
          scope={scopeOf(card.type)}
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
      )}
      <View
        key={index}
        card={card}
        mode={item.mode}
        options={options}
        outcome={outcome}
        onAnswer={onAnswer}
        reveal={reveal}
      />
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

function verdictFor(
  card: Card,
  item: SessionItem,
  outcome: Outcome,
  withHeadline: boolean,
): Pick<RevealProps, 'verdict' | 'tone'> {
  if (outcome.correct)
    return { verdict: withHeadline ? 'Right' : 'Right. Here’s why', tone: 'right' };
  if (!outcome.given) return { verdict: 'Now you know', tone: 'neutral' };
  const scope = scopeOf(card.type);
  if (withHeadline) return { verdict: `You said ${label(outcome.given, scope)}`, tone: 'wrong' };
  const reset = item.contrastPair ? '. Streak reset' : '';
  return { verdict: `It’s ${label(card.answer, scope)}${reset}`, tone: 'wrong' };
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
  scope?: 'br';
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

function Summary({ total, results }: { total: number; results: boolean[] }) {
  const right = results.filter(Boolean).length;
  if (total === 0) {
    return (
      <main className="stage stage-narrow summary">
        <div className="rise">
          <p className="kicker">Nothing due</p>
          <h1 className="headline">All caught up</h1>
          <p className="summary-sub">Come back later, or keep practising with a drill or a game.</p>
        </div>
        <div className="summary-actions rise d1">
          <LinkButton to="/drills">
            Drills
            <ArrowIcon />
          </LinkButton>
          <LinkButton to="/games" variant="ghost">
            Mini-games
          </LinkButton>
          <LinkButton to="/" variant="ghost">
            Back to Today
          </LinkButton>
        </div>
      </main>
    );
  }
  return (
    <main className="stage stage-narrow summary">
      <div className="rise">
        <p className="kicker">Session done</p>
        <h1 className="headline">
          {results.length} {results.length === 1 ? 'card' : 'cards'}
        </h1>
        {results.length > 0 && (
          <p className="summary-sub">{Math.round((right / results.length) * 100)}% right</p>
        )}
      </div>
      <LinkButton to="/" className="rise d1">
        Back to Today
        <ArrowIcon />
      </LinkButton>
    </main>
  );
}

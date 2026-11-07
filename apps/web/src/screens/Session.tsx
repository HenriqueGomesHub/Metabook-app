import { matchesAnswer, normalizeAnswer, pickTip } from '@metabook/core';
import type { Card, CardType, PickedTip, SessionItem } from '@metabook/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { CARD_TYPES } from '../app/cardTypes';
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
  return data ? <Runner key={type} data={data} type={type} /> : <Status error={error} />;
}

interface Shown {
  asideKey: string | undefined;
  tip: PickedTip | null;
  aside: RevealProps['aside'];
}

function Runner({ data, type }: { data: AppSnapshot; type?: CardType }) {
  const { answer, recordTipView } = useAppData();
  const navigate = useNavigate();
  const [queue] = useState(() => todaySession(data, new Date(), type).queue);
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

  function showTips(asideKey: string | undefined) {
    if (!card) return;
    const tip = pickTip(data.content.tips, card.answer, card.type, data.tipViews);
    const asideTip = asideKey
      ? pickTip(data.content.tips, asideKey, card.type, data.tipViews)
      : null;
    const aside: Shown['aside'] = asideTip
      ? otherSide
        ? { label: `And for ${asideKey}`, tip: asideTip, variant: 'aside' }
        : { label: `Spotting ${asideKey}`, tip: asideTip, variant: 'warn' }
      : undefined;
    setShown({ asideKey, tip, aside });
    for (const picked of [tip, asideTip]) if (picked) recordTipView(picked.tip.id);
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
      headline={withHeadline ? card.answer : undefined}
      tip={shown.tip}
      aside={shown.aside}
      onNext={next}
      onAnotherTip={() => showTips(shown.asideKey)}
    />
  );

  return (
    <div className="session">
      {item.contrastPair ? (
        <ContrastBar data={data} item={item} options={options} outcome={outcome} />
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
  if (withHeadline) return { verdict: `You said ${outcome.given}`, tone: 'wrong' };
  const reset = item.contrastPair ? '. Streak reset' : '';
  return { verdict: `It’s ${card.answer}${reset}`, tone: 'wrong' };
}

function ContrastBar({
  data,
  item,
  options,
  outcome,
}: {
  data: AppSnapshot;
  item: SessionItem;
  options: string[];
  outcome: Outcome | null;
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
          {options[0]} vs {options[1]}
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
  return (
    <main className="stage stage-narrow summary">
      <div className="rise">
        <p className="kicker">{total === 0 ? 'Nothing due' : 'Session done'}</p>
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

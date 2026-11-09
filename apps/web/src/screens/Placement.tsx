import { applyPlacement, buildPlacement, matchesAnswer } from '@metabook/core';
import type { Card, SessionMode } from '@metabook/core';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { ArrowIcon, LinkButton } from '../components/Button';
import { CloseButton } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { ProgressBar } from '../components/ProgressBar';
import { Status } from '../components/Status';
import { countryName } from './manage/countries';
import './manage/manage.css';
import { optionsFor } from './session/options';
import { Reveal, VerdictAnnouncer } from './session/Reveal';
import type { Outcome } from './session/types';
import { useKeys } from './session/useKeys';
import { verdictFor } from './session/verdict';
import { viewFor } from './session/views';

const TEST_SIZE = 12;

export function Placement() {
  const { data, error } = useAppData();
  const code = (useParams().country ?? '').toUpperCase();
  return data ? <PlacementTest key={code} data={data} code={code} /> : <Status error={error} />;
}

function PlacementTest({ data, code }: { data: AppSnapshot; code: string }) {
  const { addCardStates } = useAppData();
  const name = countryName(data.content.pool, code);
  const [cards] = useState(() => {
    const untouched = data.content.cards.filter((card) => {
      const state = data.states[card.id];
      return !state || state.state === 'new';
    });
    return buildPlacement(untouched, code, Math.random, TEST_SIZE);
  });
  const [results, setResults] = useState<{ cardId: string; correct: boolean }[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const card = cards[results.length];
  const mode: SessionMode = card?.map
    ? 'map'
    : card?.type === 'flag'
      ? 'recall'
      : card?.type === 'lookalike'
        ? 'binary'
        : 'mcq';
  const options = useMemo(
    () =>
      card ? optionsFor({ cardId: card.id, mode }, card, data.content.cards, Math.random) : [],
    // Choices are drawn once per card; later content changes must not reshuffle them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card?.id],
  );

  // Answering shows the verdict first; the next card only appears on Next, so the answering
  // keypress can't carry into the following card's input.
  useKeys((event) => {
    if (event.key !== ' ' || !outcome) return;
    event.preventDefault();
    next();
  });

  function next() {
    if (!card || !outcome) return;
    const done = [...results, { cardId: card.id, correct: outcome.correct }];
    setOutcome(null);
    setResults(done);
    if (done.length === cards.length) {
      addCardStates(applyPlacement(done, new Date(), data.settings.desiredRetention));
    }
  }

  const back = `/atlas/${code}`;
  const known =
    data.content.pool.some((c) => c.code === code) ||
    data.content.cards.some((c) => c.country === code);
  if (!known) {
    return (
      <EmptyState
        size="fill"
        title="Unknown country"
        text={`There is no country “${code}” in Metabook.`}
        actions={[{ label: 'Back to Atlas', to: '/atlas' }]}
      />
    );
  }
  if (cards.length === 0) {
    return (
      <EmptyState
        size="fill"
        title="Nothing to place"
        text={`Every card for ${name} is already in your schedule, or there are none yet.`}
        actions={[{ label: `Back to ${name}`, to: back }]}
      />
    );
  }

  if (!card) {
    const marked = results.filter((r) => r.correct).length;
    return (
      <main className="placement">
        <div className="placement-result rise">
          <p className="kicker">Placement test · {name}</p>
          <h1 className="headline">
            Marked {marked} of {cards.length} as known
          </h1>
          <p className="muted">The rest start from scratch in your normal sessions.</p>
        </div>
        <LinkButton to={back} className="rise d1">
          Back to {name}
          <ArrowIcon />
        </LinkButton>
      </main>
    );
  }

  const View = viewFor(card);
  return (
    <div className="session">
      <div className="session-bar rise">
        <CloseButton to={back} label="Leave placement test" />
        <ProgressBar
          value={results.length + 1}
          max={cards.length}
          label={`Question ${results.length + 1} of ${cards.length}`}
        />
        <span className="session-count">
          {results.length + 1} / {cards.length}
        </span>
      </div>
      <View
        key={card.id}
        card={card}
        cards={data.content.cards}
        mode={mode}
        options={options}
        outcome={outcome}
        onAnswer={(given) =>
          setOutcome({ given, correct: isRight(card, mode, given, data.content.cards) })
        }
        reveal={
          outcome && (
            <Reveal
              {...verdictFor(card, { mode }, outcome)}
              tip={null}
              nextLabel={results.length + 1 === cards.length ? 'See result' : 'Continue'}
              onNext={next}
            />
          )
        }
      />
      <VerdictAnnouncer text={outcome ? verdictFor(card, { mode }, outcome).verdict : ''} />
    </div>
  );
}

function isRight(card: Card, mode: SessionMode, given: string, cards: Card[]): boolean {
  if (mode !== 'recall') return given === card.answer;
  const others = cards
    .filter((c) => c.type === card.type && c.answer !== card.answer)
    .map((c) => c.answer);
  return matchesAnswer(given, card, others);
}

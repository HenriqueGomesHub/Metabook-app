import { applyPlacement, buildPlacement, matchesAnswer } from '@metabook/core';
import type { Card } from '@metabook/core';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { ArrowIcon, LinkButton } from '../components/Button';
import { CloseButton } from '../components/Chip';
import { ProgressBar } from '../components/ProgressBar';
import { Status } from '../components/Status';
import { countryName } from './manage/countries';
import './manage/manage.css';
import { Options } from './session/Options';
import { optionsFor } from './session/options';
import { Prompt } from './session/Prompt';
import { TypedAnswer } from './session/TypedAnswer';

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
  const card = cards[results.length];
  const options = useMemo(
    () =>
      card && card.type !== 'flag'
        ? optionsFor({ cardId: card.id, mode: 'mcq' }, card, data.content.cards, Math.random)
        : [],
    // Choices are drawn once per card; later content changes must not reshuffle them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card?.id],
  );

  function answer(correct: boolean) {
    if (!card) return;
    const next = [...results, { cardId: card.id, correct }];
    setResults(next);
    if (next.length === cards.length) {
      addCardStates(applyPlacement(next, new Date(), data.settings.desiredRetention));
    }
  }

  const back = `/atlas/${code}`;
  if (cards.length === 0) {
    return (
      <main className="placement">
        <div className="placement-result rise">
          <h1 className="headline">Nothing to place</h1>
          <p className="muted">
            Every card for {name} is already in your schedule, or there are none yet.
          </p>
        </div>
        <LinkButton to={back} className="rise d1">
          Back to {name}
          <ArrowIcon />
        </LinkButton>
      </main>
    );
  }

  if (!card) {
    const known = results.filter((r) => r.correct).length;
    return (
      <main className="placement">
        <div className="placement-result rise">
          <p className="kicker">Placement test · {name}</p>
          <h1 className="headline">
            Marked {known} of {cards.length} as known
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
      <main className="placement">
        <figure className="flag-figure unfurl" key={card.id}>
          <Prompt prompt={card.prompt} alt="Item to identify" />
        </figure>
        {card.type === 'flag' ? (
          <TypedAnswer
            key={card.id}
            label="Which country?"
            placeholder="Type a country"
            onAnswer={(given) => answer(isRight(card, given, data.content.cards))}
          />
        ) : (
          <Options
            key={card.id}
            options={options}
            answer={card.answer}
            outcome={null}
            onPick={(given) => answer(given === card.answer)}
            className="options options-grid rise d2"
          />
        )}
      </main>
    </div>
  );
}

function isRight(card: Card, given: string, cards: Card[]): boolean {
  const others = cards
    .filter((c) => c.type === card.type && c.answer !== card.answer)
    .map((c) => c.answer);
  return matchesAnswer(given, card, others);
}

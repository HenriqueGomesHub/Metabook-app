import { useState } from 'react';
import type { CSSProperties } from 'react';
import { label } from '../../app/labels';
import { useRegionMap } from '../../app/useRegionMaps';
import { Button } from '../../components/Button';
import { CountryMap } from '../../components/CountryMap';
import { Stage } from './Stage';
import { stateNameFrom } from './verdict';
import type { CardProps } from './types';

const NO_GROUP: ReadonlySet<string> = new Set();

/**
 * A clue placed inside its country: click (or Tab to and press Enter on) the state it belongs to.
 * The reveal marks the pick and the true state and draws a line between them, as on area codes.
 */
export function RegionMapCard({ card, outcome, onAnswer, onSkip, reveal }: CardProps) {
  const map = useRegionMap(card.country);
  const [hover, setHover] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const country = label(card.country);
  const hovered = hover ? map?.states.find((s) => s.code === hover)?.name : undefined;
  const [, , width = 640, height = 580] = (map?.viewBox ?? '').split(' ').map(Number);

  let main;
  if (map) {
    main = (
      <div className="region-map" style={{ '--map-ar': width / height } as CSSProperties}>
        <CountryMap
          map={map}
          label={`Map of ${country} with region borders`}
          reveal={
            outcome ? { answer: card.answer, picked: outcome.given, group: NO_GROUP } : undefined
          }
          onPick={onAnswer}
          onHover={setHover}
        />
      </div>
    );
  } else if (map === undefined) {
    main = (
      <p className="map-status" role="status">
        Loading the map…
      </p>
    );
  } else if (onSkip) {
    // without the map the card can't be answered: show the state, grade nothing, bring it back later
    const state = stateNameFrom(card.explain);
    main = (
      <div className="map-status" role="alert">
        <p>The map of {country} could not be loaded.</p>
        {showAnswer && (
          <p className="map-answer">
            {state ? `It’s ${state}.` : 'The answer needs the map.'} Nothing was recorded; this card
            comes back later.
          </p>
        )}
        {showAnswer ? (
          <Button onClick={onSkip}>Skip for now</Button>
        ) : (
          <Button variant="ghost" onClick={() => setShowAnswer(true)}>
            Show the answer
          </Button>
        )}
      </div>
    );
  } else {
    main = (
      <div className="map-status" role="alert">
        <p>The map of {country} could not be loaded.</p>
        {!outcome && (
          <Button variant="ghost" onClick={() => onAnswer('')}>
            Show the answer
          </Button>
        )}
      </div>
    );
  }

  return (
    <Stage
      variant="map"
      main={main}
      side={
        <div className="map-prompt">
          <p className="kicker rise">Where in {country}?</p>
          <p className="map-clue pop-in">{card.prompt.value}</p>
          <p className={hovered ? 'code-hover' : 'code-hover idle'} aria-hidden="true">
            {hovered ?? (map ? 'Pick the region on the map' : ' ')}
          </p>
        </div>
      }
      reveal={reveal}
    />
  );
}

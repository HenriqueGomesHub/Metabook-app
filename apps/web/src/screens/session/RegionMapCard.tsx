import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { label } from '../../app/labels';
import { Button } from '../../components/Button';
import { CountryMap } from '../../components/CountryMap';
import { loadedRegionMap, loadRegionMap } from '../../data/content';
import type { RegionMap } from '../../data/content';
import { Stage } from './Stage';
import type { CardProps } from './types';

/** The card's regions map: undefined while it loads, null when it could not be loaded. */
function useRegionMap(country: string): RegionMap | null | undefined {
  const [map, setMap] = useState<RegionMap | null | undefined>(() => loadedRegionMap(country));
  useEffect(() => {
    if (map) return;
    let live = true;
    loadRegionMap(country).then(
      (loaded) => live && setMap(loaded ?? null),
      () => live && setMap(null),
    );
    return () => {
      live = false;
    };
  }, [country, map]);
  return map;
}

const NO_GROUP: ReadonlySet<string> = new Set();

/**
 * A clue placed inside its country: click (or Tab to and press Enter on) the state it belongs to.
 * The reveal marks the pick and the true state and draws a line between them, as on area codes.
 */
export function RegionMapCard({ card, outcome, onAnswer, reveal }: CardProps) {
  const map = useRegionMap(card.country);
  const [hover, setHover] = useState<string | null>(null);
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

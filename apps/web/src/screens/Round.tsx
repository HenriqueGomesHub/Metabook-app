import { orderRoundClues, primaryCardId, quizImages } from '@metabook/core';
import type { Card, Clue, Grade, PoolCountry } from '@metabook/core';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { label } from '../app/labels';
import { Button } from '../components/Button';
import { ClueDetails } from '../components/clues/ClueDetails';
import { SignInPrompt } from '../components/clues/SignInPrompt';
import { Status } from '../components/Status';
import { clueIndex } from '../data/clueIndex';
import './round.css';

interface Where {
  truth: string;
  guess?: string;
  region?: string;
  lat?: number;
  lng?: number;
}

const number = (value: string | null) => {
  if (value === null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** The round as the extension passes it: `truth` and `guess` pool codes, `region`, `lat`, `lng`. */
export function parseRound(params: URLSearchParams): Where {
  const code = (key: string) => params.get(key)?.trim().toUpperCase() || undefined;
  const lat = number(params.get('lat'));
  const lng = number(params.get('lng'));
  const located = lat !== undefined && lng !== undefined && Math.abs(lat) <= 90;
  return {
    truth: code('truth') ?? '',
    guess: code('guess'),
    region: params.get('region')?.trim() || undefined,
    ...(located && { lat, lng }),
  };
}

/**
 * /round: after a GeoGuessr round, the place's clues to check against what you saw. Opened by the
 * extension, often inside its side panel's iframe, so it works framed and at 360 px. It records
 * nothing by itself: "Saw it" and "Missed it" grade the clue's primary card (Good / Again) through
 * the same path as sessions, and "Save this spot" keeps the location.
 */
export function Round() {
  const { data, error, user } = useAppData();
  const [params] = useSearchParams();
  const where = useMemo(() => parseRound(params), [params]);
  if (user === null) {
    return (
      <main className="round">
        <SignInPrompt newTab />
      </main>
    );
  }
  if (!data) return <Status error={error} />;
  return <RoundView data={data} where={where} />;
}

function RoundView({ data, where }: { data: AppSnapshot; where: Where }) {
  const country = data.content.pool.find((c) => c.code === where.truth);
  const index = clueIndex(data.content);
  const clues = useMemo(() => {
    const own = index.byCountry.get(where.truth)?.clues ?? [];
    return orderRoundClues(own, where);
  }, [index, where]);

  if (!country) {
    return (
      <main className="round">
        <p className="kicker">Round</p>
        <h1 className="headline round-title">Unknown country</h1>
        <p className="round-sub">“{where.truth || 'nothing'}” is not a pool country.</p>
      </main>
    );
  }

  const missed = where.guess && where.guess !== where.truth;
  return (
    <main className="round">
      <header className="round-head">
        <p className="kicker">Round</p>
        <h1 className="headline round-title">You were in {country.name}</h1>
        {where.guess && (
          <p className={missed ? 'round-sub round-missed' : 'round-sub'}>
            {missed ? `You guessed ${label(where.guess)}` : 'You guessed right'}
            {where.region && ` · ${where.region}`}
          </p>
        )}
        {!where.guess && where.region && <p className="round-sub">{where.region}</p>}
        {where.lat !== undefined && where.lng !== undefined && (
          <SaveSpot country={country.code} where={where} />
        )}
      </header>
      {clues.length === 0 ? (
        <p className="round-sub">No clues for {country.name} yet.</p>
      ) : (
        <ol className="round-clues">
          {clues.map((clue) => (
            <li key={clue.id} className="round-clue">
              <ClueDetails clue={clue} heading="h2">
                <Grader data={data} country={country} clue={clue} />
              </ClueDetails>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

/** The card a clue is graded on; a stand-in when no drill card was made for it. */
function primaryCard(data: AppSnapshot, country: PoolCountry, clue: Clue): Card {
  // the catalogue as shipped, so the id matches what the extension computes
  const shipped =
    data.content.clues
      .find((c) => c.country.toUpperCase() === country.code)
      ?.clues.find((c) => c.id === clue.id) ?? clue;
  const id = primaryCardId(shipped);
  return (
    data.content.cards.find((card) => card.id === id) ?? {
      id,
      type: quizImages(shipped).length > 0 ? 'spot' : 'meta',
      country: country.code,
      answer: country.name,
      prompt: { kind: 'text', value: clue.title },
      tags: [country.continent, clue.family, 'clue'],
      subject: clue.family,
      source: clue.credit.url,
      credit: clue.credit,
      clue: { id: clue.id },
    }
  );
}

function Grader({ data, country, clue }: { data: AppSnapshot; country: PoolCountry; clue: Clue }) {
  const { answer } = useAppData();
  const [graded, setGraded] = useState<Grade | null>(null);

  function grade(saw: boolean) {
    const card = primaryCard(data, country, clue);
    const next: Grade = saw ? 'good' : 'again';
    answer({
      card,
      given: saw ? card.answer : '',
      correct: saw,
      msTaken: 0,
      grade: next,
    });
    setGraded(next);
  }

  if (graded) {
    return (
      <p className="round-graded" role="status">
        {graded === 'good' ? 'Marked as seen' : 'Marked as missed: it comes back soon'}
      </p>
    );
  }
  return (
    <div className="round-actions">
      <Button onClick={() => grade(true)}>Saw it</Button>
      <Button variant="ghost" onClick={() => grade(false)}>
        Missed it
      </Button>
    </div>
  );
}

function SaveSpot({ country, where }: { country: string; where: Where }) {
  const { repo } = useAppData();
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  async function save() {
    setState('saving');
    try {
      await repo.saveSpot({
        country,
        lat: where.lat as number,
        lng: where.lng as number,
        heading: 0,
        pitch: 0,
        fov: 75,
        ...(where.region && { note: where.region }),
      });
      setState('saved');
    } catch {
      setState('failed');
    }
  }

  if (state === 'saved') {
    return (
      <p className="round-graded" role="status">
        Spot saved
      </p>
    );
  }
  return (
    <div className="round-save">
      <Button variant="ghost" onClick={save} disabled={state === 'saving'}>
        Save this spot
      </Button>
      {state === 'failed' && (
        <span className="round-error" role="alert">
          Couldn’t save the spot
        </span>
      )}
    </div>
  );
}

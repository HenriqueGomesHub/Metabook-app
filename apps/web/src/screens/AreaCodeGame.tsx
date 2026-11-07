import { haversineKm, mastery, medalFor, pickTip, roundScore } from '@metabook/core';
import type { PickedTip } from '@metabook/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { ArrowIcon, Button, LinkButton } from '../components/Button';
import { Medal } from '../components/Medal';
import { CloseButton } from '../components/Chip';
import { Status } from '../components/Status';
import { TipBox } from '../components/TipBox';
import { brStates } from '../data/content';
import { pct } from './atlas/format';
import './games/games.css';

const ROUND_SIZE = 12;
/** GeoGuessr-style score decay for Brazil, in km. */
const SCALE_KM = 700;
const PATTERN_TIP = 'ddd:br:pattern';

/** Small states get their label outside the map, joined by a leader line. */
const CALLOUTS: Record<string, [number, number]> = {
  RN: [600, 152],
  PB: [600, 174],
  PE: [600, 196],
  AL: [600, 218],
  SE: [600, 240],
  ES: [512, 360],
  RJ: [474, 420],
  DF: [410, 284],
};

const fmt = (n: number) => n.toLocaleString('en-US');

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

export function AreaCodeGame() {
  const { data, error } = useAppData();
  const [run, setRun] = useState(0);
  return data ? (
    <Play key={run} data={data} onAgain={() => setRun(run + 1)} />
  ) : (
    <Status error={error} />
  );
}

interface Result {
  correct: boolean;
  km: number;
  points: number;
}

function Play({ data, onAgain }: { data: AppSnapshot; onAgain: () => void }) {
  const { answer, recordTipView } = useAppData();
  const now = useMemo(() => new Date(), []);
  const byCode = useMemo(() => new Map(brStates.states.map((s) => [s.code, s])), []);
  const cards = useMemo(
    () =>
      data.content.cards.filter(
        (card) => card.type === 'areacode' && card.country === 'BR' && byCode.has(card.answer),
      ),
    [data.content.cards, byCode],
  );
  /** First digits of each state's area codes, so the reveal can tint the whole group. */
  const digits = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const card of cards) {
      const set = map.get(card.answer) ?? new Set<string>();
      set.add(card.prompt.value.charAt(0));
      map.set(card.answer, set);
    }
    return map;
  }, [cards]);
  const [queue] = useState(() => shuffled(cards).slice(0, ROUND_SIZE));
  const medalValue = useMemo(
    () =>
      mastery(
        cards.map((c) => c.id),
        data.states,
        now,
      ),
    [cards, data.states, now],
  );

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [tip, setTip] = useState<PickedTip | null>(null);
  const shownAt = useRef(performance.now());
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    shownAt.current = performance.now();
  }, [index]);
  useEffect(() => {
    if (picked) nextRef.current?.focus();
  }, [picked]);

  const card = queue[index];
  const medal = medalFor(medalValue);
  const total = results.reduce((sum, r) => sum + r.points, 0);

  const header = (
    <div className="ddd-bar rise">
      <CloseButton to="/games" label="Back to mini-games" />
      <div className="ddd-title">
        <span>
          <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
          </svg>
          Brazil · Area codes
        </span>
        {cards.length > 0 && (
          <span className="medal-pill" title="Area-code mastery">
            {medal && <Medal medal={medal} size={20} />}
            <span className="cap">{medal ?? 'No medal yet'}</span> · {pct(medalValue)}%
          </span>
        )}
      </div>
      <div className="ddd-score">
        {card && (
          <span className="muted">
            Code {index + 1} / {queue.length}
          </span>
        )}
        <b aria-live="polite">{fmt(total)} pts</b>
      </div>
    </div>
  );

  if (queue.length === 0) {
    return (
      <div className="page">
        {header}
        <main className="stage stage-narrow summary">
          <p className="muted">There are no area-code cards yet.</p>
          <LinkButton to="/games">Back to games</LinkButton>
        </main>
      </div>
    );
  }

  if (!card) {
    const exact = results.filter((r) => r.correct).length;
    const avgKm = Math.round(results.reduce((sum, r) => sum + r.km, 0) / results.length);
    return (
      <div className="page">
        {header}
        <main className="stage stage-narrow summary">
          <div className="rise">
            <p className="kicker">Round done</p>
            <h1 className="headline">{fmt(total)} pts</h1>
            <p className="summary-sub">
              {exact} of {results.length} exact · {fmt(avgKm)} km off on average
            </p>
          </div>
          <div className="reveal-actions rise d1">
            <Button onClick={onAgain}>
              Play again
              <ArrowIcon />
            </Button>
            <LinkButton to="/games" variant="ghost">
              Back to games
            </LinkButton>
          </div>
        </main>
      </div>
    );
  }

  const answerState = byCode.get(card.answer);
  const pickedState = picked ? byCode.get(picked) : undefined;
  const result = picked ? results[index] : undefined;
  const right = result?.correct ?? false;
  const hovered = hover ? byCode.get(hover) : undefined;
  const answerDigits = digits.get(card.answer) ?? new Set<string>();

  function showTip() {
    const next = pickTip(data.content.tips, PATTERN_TIP, 'areacode', data.tipViews);
    setTip(next);
    if (next) recordTipView(next.tip.id);
  }

  function pick(code: string) {
    const guess = byCode.get(code);
    if (picked || !guess || !card || !answerState) return;
    const correct = code === card.answer;
    const km = correct
      ? 0
      : haversineKm(
          { lat: guess.capital.lat, lon: guess.capital.lon },
          { lat: answerState.capital.lat, lon: answerState.capital.lon },
        );
    const points = roundScore(km, SCALE_KM);
    answer({
      card,
      given: code,
      correct,
      picked: correct ? undefined : code,
      msTaken: Math.round(performance.now() - shownAt.current),
    });
    setPicked(code);
    setResults([...results, { correct, km, points }]);
    showTip();
  }

  function next() {
    setPicked(null);
    setHover(null);
    setTip(null);
    setIndex(index + 1);
  }

  function onKey(event: KeyboardEvent, code: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    pick(code);
  }

  const stateClass = (code: string) => {
    if (!picked) return 'ddd-state';
    if (code === card.answer) return 'ddd-state lock ans';
    if (code === picked) return 'ddd-state lock pick';
    const shared = [...(digits.get(code) ?? [])].some((d) => answerDigits.has(d));
    return `ddd-state lock ${shared ? 'grp' : 'dim'}`;
  };

  return (
    <div className="page">
      {header}
      <main className="ddd-main">
        <section className="ddd-side">
          <div className="ddd-prompt rise d1">
            <p>Which state uses</p>
            <div key={index} className="ddd-code headline">
              {card.prompt.value}
            </div>
            <p>Click the state. Closer is better.</p>
          </div>
          {picked && result && answerState && (
            <div className="ddd-result rise">
              <div>
                <p className={right ? 'ddd-verdict right' : 'ddd-verdict'}>
                  {right ? 'Exactly right' : `You picked ${pickedState?.name ?? picked}`}
                </p>
                <h2 className="headline">{answerState.name}</h2>
              </div>
              <dl className="ddd-figures">
                <div>
                  <dt>distance</dt>
                  <dd>{fmt(Math.round(result.km))} km</dd>
                </div>
                <div>
                  <dt>points</dt>
                  <dd>{fmt(result.points)}</dd>
                </div>
              </dl>
              {tip && (
                <div>
                  <TipBox label="The pattern" picked={tip} />
                  <div className="ddd-tip-actions">
                    <button type="button" className="link" onClick={showTip}>
                      Another tip
                    </button>
                  </div>
                </div>
              )}
              <div>
                <button type="button" className="cta" ref={nextRef} onClick={next}>
                  {index + 1 < queue.length ? 'Next code' : 'See results'}
                  <ArrowIcon />
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="ddd-map-wrap rise d2">
          <div className={hovered || picked ? 'ddd-hover' : 'ddd-hover idle'} aria-live="polite">
            {hovered ? hovered.name : picked ? '' : 'Hover a state to see its name'}
          </div>
          <svg
            className="ddd-map"
            role="group"
            aria-label="Map of Brazil with state borders"
            viewBox={brStates.viewBox}
          >
            {brStates.states.map((state) => (
              <path
                key={state.code}
                className={stateClass(state.code)}
                d={state.path}
                role="button"
                tabIndex={picked ? -1 : 0}
                aria-label={state.name}
                aria-disabled={picked ? true : undefined}
                onClick={() => pick(state.code)}
                onKeyDown={(event) => onKey(event, state.code)}
                onMouseEnter={() => setHover(state.code)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(state.code)}
                onBlur={() => setHover(null)}
              />
            ))}
            {brStates.states.map((state) => {
              const callout = CALLOUTS[state.code];
              if (!callout) return null;
              const [x, y] = state.label.length >= 2 ? [state.label[0], state.label[1]] : [0, 0];
              return (
                <path
                  key={state.code}
                  className="ddd-lead"
                  d={`M${x} ${y}L${(callout[0] ?? 0) - 16} ${(callout[1] ?? 0) - 4}`}
                />
              );
            })}
            {brStates.states.map((state) => {
              const callout = CALLOUTS[state.code];
              const onAnswer = Boolean(picked) && state.code === card.answer;
              const classes = ['ddd-label', callout && 'callout', onAnswer && 'on']
                .filter(Boolean)
                .join(' ');
              return (
                <text
                  key={state.code}
                  className={classes}
                  aria-hidden="true"
                  x={callout ? callout[0] : state.label[0]}
                  y={callout ? callout[1] : (state.label[1] ?? 0) + 4}
                >
                  {state.code}
                </text>
              );
            })}
            {picked && pickedState && answerState && (
              <>
                {!right && (
                  <>
                    <path
                      className="ddd-trail"
                      pathLength={1}
                      d={`M${pickedState.capital.xy[0]} ${pickedState.capital.xy[1]}L${answerState.capital.xy[0]} ${answerState.capital.xy[1]}`}
                    />
                    <circle
                      className="ddd-pin"
                      cx={pickedState.capital.xy[0]}
                      cy={pickedState.capital.xy[1]}
                      r="5"
                      fill="var(--ink)"
                      stroke="var(--bg)"
                      strokeWidth="2"
                    />
                  </>
                )}
                <circle
                  className="ddd-pin late"
                  cx={answerState.capital.xy[0]}
                  cy={answerState.capital.xy[1]}
                  r="6"
                  fill="var(--bg)"
                  stroke="var(--ink)"
                  strokeWidth="2"
                />
              </>
            )}
          </svg>
        </div>
      </main>
    </div>
  );
}

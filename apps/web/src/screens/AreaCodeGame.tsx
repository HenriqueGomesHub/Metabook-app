import { haversineKm, mastery, medalFor, pickTip, roundScore } from '@metabook/core';
import type { PickedTip, Tip } from '@metabook/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { BrazilMap, digitGroups, groupOf, stateByCode } from '../components/BrazilMap';
import { ArrowIcon, Button, LinkButton } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Medal } from '../components/Medal';
import { CloseButton } from '../components/Chip';
import { Status } from '../components/Status';
import { TipBox } from '../components/TipBox';
import { pct } from './atlas/format';
import './games/games.css';

const ROUND_SIZE = 12;
/** GeoGuessr-style score decay for Brazil, in km. */
const SCALE_KM = 700;
const PATTERN_TIP = 'ddd:br:pattern';

const fmt = (n: number) => n.toLocaleString('en-US');

/** Pattern tips name digit groups like "4x"; prefer the one for the code being revealed. */
const mentionsGroup = (digit: string) => (tip: Tip) => new RegExp(`\\b${digit}x\\b`).test(tip.text);

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
  const touch = useMemo(() => window.matchMedia?.('(hover: none)').matches ?? false, []);
  const cards = useMemo(
    () =>
      data.content.cards.filter(
        (card) => card.type === 'areacode' && card.country === 'BR' && stateByCode.has(card.answer),
      ),
    [data.content.cards],
  );
  /** First digits of each state's area codes, so the reveal can tint the whole group. */
  const digits = useMemo(() => digitGroups(cards), [cards]);
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
            {medal ? <span className="cap">{medal}</span> : 'No medal yet'} · {pct(medalValue)}%
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
        <EmptyState
          title="No area codes yet"
          text="Area-code cards haven’t been added for this map."
          actions={[{ label: 'Back to games', to: '/games' }]}
        />
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

  const answerState = stateByCode.get(card.answer);
  const pickedState = picked ? stateByCode.get(picked) : undefined;
  const result = picked ? results[index] : undefined;
  const right = result?.correct ?? false;
  const hovered = hover ? stateByCode.get(hover) : undefined;
  const group = groupOf(card.answer, digits);

  function showTip(digit?: string) {
    const prefer = digit ? mentionsGroup(digit) : undefined;
    const next = pickTip(data.content.tips, PATTERN_TIP, 'areacode', data.tipViews, 0, prefer);
    setTip(next);
    if (next) recordTipView(next.tip.id);
  }

  function pick(code: string) {
    const guess = stateByCode.get(code);
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
    showTip(card.prompt.value.charAt(0));
  }

  function next() {
    setPicked(null);
    setHover(null);
    setTip(null);
    setIndex(index + 1);
  }

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
            <p>{touch ? 'Tap' : 'Click'} the state. Closer is better.</p>
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
                    <button type="button" className="link" onClick={() => showTip()}>
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
            {hovered
              ? hovered.name
              : picked
                ? ''
                : touch
                  ? 'Tap a state to answer'
                  : 'Hover a state to see its name'}
          </div>
          <BrazilMap
            reveal={picked ? { answer: card.answer, picked, group } : undefined}
            onPick={pick}
            onHover={setHover}
          />
        </div>
      </main>
    </div>
  );
}

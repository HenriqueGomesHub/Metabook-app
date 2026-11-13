import { haversineKm, mastery, medalFor, pickTip, roundScore } from '@metabook/core';
import type { PickedTip, Tip } from '@metabook/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { label } from '../app/labels';
import { useRegionMap } from '../app/useRegionMaps';
import { AreaCodeMap, areaZones } from '../components/AreaCodeMap';
import { ArrowIcon, Button, LinkButton } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Medal } from '../components/Medal';
import { PatternHint } from '../components/PatternHint';
import { CloseButton } from '../components/Chip';
import { Status } from '../components/Status';
import { TipBox } from '../components/TipBox';
import { areaCodeCountries, placedCodes } from '../data/areaCodes';
import type { MapRegion } from '../data/content';
import { pct } from './atlas/format';
import './games/games.css';

const ROUND_SIZE = 12;
/** GeoGuessr-style score decay, in km, where regions have capitals (Brazil). */
const SCALE_KM = 700;
/** Without capitals: decay over the share of the map's diagonal between the two regions. */
const SCALE_MAP = 0.12;

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

/** `/games/areacode/:country`: the area-code game on one country's map (Brazil by default). */
export function AreaCodeGame() {
  const { data, error } = useAppData();
  const params = useParams();
  const country = (params.country ?? 'br').toUpperCase();
  const [run, setRun] = useState(0);
  return data ? (
    <Play key={`${country}:${run}`} data={data} country={country} onAgain={() => setRun(run + 1)} />
  ) : (
    <Status error={error} />
  );
}

interface Result {
  correct: boolean;
  /** undefined where the map has no capitals to measure between */
  km?: number;
  points: number;
}

const point = (region: MapRegion) => region.capital?.xy ?? region.label;

function Play({
  data,
  country,
  onAgain,
}: {
  data: AppSnapshot;
  country: string;
  onAgain: () => void;
}) {
  const { answer, recordTipView } = useAppData();
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);
  const touch = useMemo(() => window.matchMedia?.('(hover: none)').matches ?? false, []);
  const map = useRegionMap(country);
  const regions = useMemo(() => new Map((map?.states ?? []).map((s) => [s.code, s])), [map]);
  const countries = useMemo(
    () => areaCodeCountries(data.content.cards, data.content.pool),
    [data.content],
  );
  const all = useMemo(
    () => data.content.cards.filter((card) => card.type === 'areacode' && card.country === country),
    [data.content.cards, country],
  );
  const cards = useMemo(
    () => (map ? all.filter((card) => regions.has(card.answer)) : all),
    [all, map, regions],
  );
  const patternTip = `ddd:${country.toLowerCase()}:pattern`;
  const name = label(country);
  const [, , mapW = 640, mapH = 580] = (map?.viewBox ?? '').split(' ').map(Number);
  const diagonal = Math.hypot(mapW, mapH);
  const [queue, setQueue] = useState(() => shuffled(cards).slice(0, ROUND_SIZE));
  // the map arriving can drop codes whose region it lacks: deal again once, before any answer
  useEffect(() => {
    if (map)
      setQueue((q) =>
        q.every((c) => regions.has(c.answer)) ? q : shuffled(cards).slice(0, ROUND_SIZE),
      );
  }, [map, regions, cards]);
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

  // one control, not a row of chips that wraps: the page stays one screen tall
  const chips = countries.length > 1 && (
    <label className="ddd-country">
      <span className="sr-only">Country</span>
      <select
        value={country}
        onChange={(event) => navigate(`/games/areacode/${event.target.value.toLowerCase()}`)}
      >
        {countries.map((code) => (
          <option key={code} value={code}>
            {label(code)}
          </option>
        ))}
      </select>
    </label>
  );

  const header = (
    <>
      <div className="ddd-bar rise">
        <CloseButton to="/games" label="Back to mini-games" />
        <div className="ddd-title">
          {chips}
          <span>
            <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
            </svg>
            {chips ? 'Area codes' : `${name} · Area codes`}
          </span>
          {cards.length > 0 && (
            <span className="medal-pill" title="Area-code mastery">
              {medal && <Medal medal={medal} size={20} />}
              {medal && (
                <>
                  <span className="cap">{medal}</span> ·{' '}
                </>
              )}
              {pct(medalValue)}%
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
    </>
  );

  if (map === undefined && queue.length === 0) {
    return (
      <div className="page">
        {header}
        <p className="map-status" role="status">
          Loading the map…
        </p>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="page">
        {header}
        <EmptyState
          title="No area codes yet"
          text={`Area codes for ${name} haven’t been added yet.`}
          actions={[{ label: 'Back to games', to: '/games' }]}
        />
      </div>
    );
  }

  if (!card) {
    const exact = results.filter((r) => r.correct).length;
    const measured = results.filter((r) => r.km !== undefined);
    const avgKm =
      measured.length > 0
        ? Math.round(measured.reduce((sum, r) => sum + (r.km ?? 0), 0) / measured.length)
        : undefined;
    return (
      <div className="page">
        {header}
        <main className="stage stage-narrow summary">
          <div className="rise">
            <p className="kicker">Round done</p>
            <h1 className="headline">{fmt(total)} pts</h1>
            <p className="summary-sub">
              {exact} of {results.length} right
              {avgKm !== undefined && <> · {fmt(avgKm)} km off on average</>}
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

  const answerState = regions.get(card.answer);
  const pickedState = picked ? regions.get(picked) : undefined;
  const result = picked ? results[index] : undefined;
  const right = result?.correct ?? false;
  const spanned = right && picked !== card.answer;
  const hovered = hover ? regions.get(hover) : undefined;

  function showTip(digit?: string) {
    const prefer = digit ? mentionsGroup(digit) : undefined;
    const next = pickTip(data.content.tips, patternTip, 'areacode', data.tipViews, 0, prefer);
    setTip(next);
    if (next) recordTipView(next.tip.id);
  }

  // where codes cover whole areas (France's 04), the area is the answer, not one of its regions
  const unit =
    country === 'BR'
      ? 'state'
      : Object.keys(areaZones(placedCodes(all, country))).length > 0
        ? 'area'
        : 'region';

  function pick(code: string) {
    const guess = regions.get(code);
    if (picked || !guess || !card || !answerState) return;
    // a code spanning a border: its other regions count as right
    const correct = code === card.answer || (card.spans ?? []).includes(code);
    let km: number | undefined;
    let points: number;
    if (guess.capital && answerState.capital) {
      km = correct
        ? 0
        : haversineKm(
            { lat: guess.capital.lat, lon: guess.capital.lon },
            { lat: answerState.capital.lat, lon: answerState.capital.lon },
          );
      points = roundScore(km, SCALE_KM);
    } else {
      const [ax = 0, ay = 0] = point(guess);
      const [bx = 0, by = 0] = point(answerState);
      const share = correct ? 0 : Math.hypot(ax - bx, ay - by) / diagonal;
      points = roundScore(share, SCALE_MAP);
    }
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
        <section className={picked ? 'ddd-side answered' : 'ddd-side'}>
          <div className="ddd-prompt rise d1">
            <p>Which {unit} uses</p>
            <div key={index} className="ddd-code headline">
              {card.prompt.value}
            </div>
            <p>
              {touch ? 'Tap' : 'Click'} the {unit}. Closer is better.
            </p>
          </div>
          {picked && result && answerState && (
            <div className="ddd-result rise">
              <div>
                <p className={right ? 'ddd-verdict right' : 'ddd-verdict'}>
                  {spanned
                    ? `Right: it also covers ${pickedState?.name ?? picked}`
                    : right
                      ? 'Exactly right'
                      : `You picked ${pickedState?.name ?? picked}`}
                </p>
                <h2 className="headline">
                  {(card.spans?.length ?? 0) >= 2 && unit === 'area'
                    ? `${answerState.name} and ${card.spans?.length} more`
                    : answerState.name}
                </h2>
                <PatternHint card={card} cards={all} />
              </div>
              <dl className="ddd-figures">
                {result.km !== undefined && (
                  <div>
                    <dt>distance</dt>
                    <dd>{fmt(Math.round(result.km))} km</dd>
                  </div>
                )}
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
                  ? 'Tap a region to answer'
                  : 'Hover a region to see its name'}
          </div>
          <div className="ddd-map-box">
            <AreaCodeMap
              country={country}
              cards={all}
              reveal={picked ? { answer: card.answer, picked } : undefined}
              onPick={pick}
              onHover={setHover}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

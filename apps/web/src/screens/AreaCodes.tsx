import { mastery } from '@metabook/core';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { label } from '../app/labels';
import { useRegionMap } from '../app/useRegionMaps';
import { ArrowIcon, ChevronIcon, LinkButton } from '../components/Button';
import { CloseButton } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { ItemList } from '../components/ItemList';
import { FlagImage } from '../components/FlagImage';
import { Header } from '../components/Header';
import { exampleCodes, PatternMap, patternLegend, regionGroupKeys } from '../components/PatternMap';
import { Status } from '../components/Status';
import { areaCodeSections, isExactAreaCode, patternOf, placedCodes } from '../data/areaCodes';
import { pct } from './atlas/format';
import './games/games.css';
import './atlas/atlas.css';
import './areacodes/areacodes.css';

/** Came from Drills: practising means the spaced-repetition drill rather than the map game. */
function useVia() {
  const [params] = useSearchParams();
  const drill = params.get('via') === 'drill';
  return { drill, query: drill ? '?via=drill' : '' };
}

/** `/areacodes`: every country with area codes, those with a pattern apart from those without. */
export function AreaCodes() {
  const { data, error } = useAppData();
  return data ? <Landing data={data} /> : <Status error={error} />;
}

type Section = 'pattern' | 'memorise';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'pattern', label: 'With a pattern' },
  { id: 'memorise', label: 'To memorise' },
];

function Landing({ data }: { data: AppSnapshot }) {
  const now = useMemo(() => new Date(), []);
  const { query } = useVia();
  const sections = useMemo(
    () => areaCodeSections(data.content.cards, data.content.pool),
    [data.content],
  );
  const [chosen, setChosen] = useState<Section | null>(null);
  const tabs = SECTIONS.filter(({ id }) => sections[id].length > 0);
  const active = chosen ?? tabs[0]?.id ?? 'pattern';
  const card = (code: string) => {
    const ids = data.content.cards
      .filter((c) => c.type === 'areacode' && c.country === code)
      .map((c) => c.id);
    const pattern = patternOf(code);
    return (
      <Link className="row-item" to={`/areacodes/${code.toLowerCase()}${query}`}>
        <span className="row-flag">
          <FlagImage code={code} alt="" />
        </span>
        <span className="row-text">
          <span className="row-name">{label(code)}</span>
          {pattern?.hook && <span className="row-sub">{pattern.hook}</span>}
        </span>
        <span className="row-pct">{pct(mastery(ids, data.states, now))}%</span>
        <ChevronIcon />
      </Link>
    );
  };
  const empty = tabs.length === 0;
  return (
    <div className="page page-scroll">
      <Header user={data.user} />
      <main className="page-main">
        <div className="page-title rise">
          <div>
            <h1 className="headline">Area codes</h1>
            <p>Learn the pattern and most codes place themselves.</p>
          </div>
          {!empty && (
            <LinkButton to="/session?type=areacode">
              Drill all codes
              <ArrowIcon />
            </LinkButton>
          )}
        </div>
        {empty && (
          <EmptyState
            title="No area codes yet"
            text="Area codes haven’t been added yet."
            actions={[{ label: 'Back to games', to: '/games' }]}
          />
        )}
        {!empty && (
          <section className="ac-section rise d1" aria-label="Countries">
            <div className="ac-section-head">
              <div className="segments" role="tablist" aria-label="Kind of codes">
                {tabs.map(({ id, label: name }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    className="seg"
                    aria-selected={id === active}
                    onClick={() => setChosen(id)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <ItemList
              className="row-list"
              list
              label="Countries"
              items={sections[active]}
              keyOf={(code) => code}
              render={card}
            />
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * How much to tighten a one-screen page so it never scrolls: 0 as designed, then each level a
 * step tighter (the page's CSS says what each level changes), until it fits or runs out of levels.
 * Measured again when `step` changes or the window resizes.
 */
function useFitLevel(ref: React.RefObject<HTMLElement | null>, max: number, step: unknown) {
  const [level, setLevel] = useState(0);
  useLayoutEffect(() => setLevel(0), [step]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || level >= max) return;
    if (el.scrollHeight > el.clientHeight + 1) setLevel(level + 1);
  }, [ref, level, max, step]);
  useLayoutEffect(() => {
    const reset = () => setLevel(0);
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, []);
  return level;
}

/** `/areacodes/:country`: what the pattern is, on the map, before practising the codes. */
export function AreaCodeIntro() {
  const { data, error } = useAppData();
  const params = useParams();
  const country = (params.country ?? 'br').toUpperCase();
  return data ? <Intro data={data} country={country} /> : <Status error={error} />;
}

function Intro({ data, country }: { data: AppSnapshot; country: string }) {
  const { drill, query } = useVia();
  // phones show the map and the key one at a time, each with the whole screen
  const [step, setStep] = useState<'map' | 'key'>('map');
  const page = useRef<HTMLDivElement>(null);
  const fit = useFitLevel(page, 3, step);
  const map = useRegionMap(country);
  const codes = useMemo(() => placedCodes(data.content.cards, country), [data.content, country]);
  const pattern = patternOf(country);
  const grouped = pattern?.kind === 'pattern';
  const name = label(country);
  const back = `/areacodes${query}`;
  const game = `/games/areacode/${country.toLowerCase()}`;
  const session = `/session?type=areacode&country=${country}`;
  // a big country is drilled by area; its codes one region at a time are an option
  const byArea = data.content.cards.some((c) => c.country === country && isExactAreaCode(c));
  const regionName = (code: string) => map?.states.find((s) => s.code === code)?.name ?? code;

  if (codes.length === 0) {
    return (
      <div className="page">
        <main className="page-main">
          <EmptyState
            title="No area codes yet"
            text={`Area codes for ${name} haven’t been added yet.`}
            actions={[{ label: 'Back to area codes', to: back }]}
          />
        </main>
      </div>
    );
  }

  const legend = grouped ? patternLegend(country, pattern, codes) : [];
  const striped =
    grouped &&
    [...regionGroupKeys(country, codes, pattern.digits).values()].some((k) => k.length > 1);

  return (
    <div className="page" ref={page}>
      <div className="ddd-bar rise">
        <CloseButton to={back} label="Back to area codes" />
      </div>
      <main className={`ac-intro on-${step} fit-${fit}`}>
        <header className="ac-intro-head rise">
          <p className="kicker">{grouped ? 'Codes with a pattern' : 'Codes to memorise'}</p>
          <h1 className="headline">{name} area codes</h1>
          <div className="segments ac-steps ac-phone-only" role="tablist" aria-label="Part">
            {(['map', 'key'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                className="seg"
                aria-selected={step === id}
                onClick={() => setStep(id)}
              >
                {id === 'map' ? 'Map' : grouped ? 'Key' : 'Codes'}
              </button>
            ))}
          </div>
        </header>
        <div className="ac-layout">
          <figure className="ac-map rise d1">
            {map ? (
              <PatternMap
                country={country}
                map={map}
                codes={codes}
                pattern={pattern}
                label={
                  grouped
                    ? `Map of ${name}, each region coloured by the first digits of its area codes`
                    : `Map of ${name} by region, with example area codes`
                }
              />
            ) : (
              <p className="map-status" role={map === null ? 'alert' : 'status'}>
                {map === null ? `The map of ${name} could not be loaded.` : 'Loading the map…'}
              </p>
            )}
          </figure>
          <aside className="ac-side rise d2">
            {grouped ? (
              <>
                <h2 className="ac-side-title">The key</h2>
                <ol
                  className={legend.length > 6 ? 'ac-legend ac-legend-two' : 'ac-legend'}
                  aria-label="Pattern key"
                >
                  {legend.map((row) => (
                    <li key={row.key}>
                      <span
                        className="ac-swatch"
                        style={{ background: row.colour }}
                        data-colour={row.colour}
                      >
                        {row.form}
                      </span>
                      <span>{row.label}</span>
                    </li>
                  ))}
                </ol>
                {striped && <p className="ac-small">Striped regions use codes from two groups.</p>}
              </>
            ) : (
              <>
                <h2 className="ac-side-title">Some codes</h2>
                <ul className="ac-examples">
                  {exampleCodes(codes).map(({ region, code }) => (
                    <li key={region}>
                      <b>{code}</b> {regionName(region)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {pattern?.tip && (
              <p className="ac-tip">
                <span className="kicker">Memory hook</span>
                {pattern.tip}
              </p>
            )}
            <div className="ac-actions">
              <LinkButton to={drill ? session : game}>
                Practise
                <ArrowIcon />
              </LinkButton>
              <LinkButton to={drill ? game : session} variant="ghost">
                {drill ? 'Map game' : 'Drill them'}
              </LinkButton>
            </div>
            {byArea && (
              <LinkButton to={`${session}&exact=1`} variant="ghost" className="ac-exact">
                Every region, code by code
              </LinkButton>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

import { CLUE_FAMILIES, isClueCard, mastery } from '@metabook/core';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { CARD_TYPES, CLUE_TYPES, TYPE_ORDER } from '../app/cardTypes';
import { SUBJECTS } from '../app/labels';
import { ArrowIcon, LinkButton } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Header } from '../components/Header';
import { Status } from '../components/Status';

const WEAK_MASTERY = 0.6;

export function Drills() {
  const { data, error } = useAppData();
  return data ? <DrillsView data={data} /> : <Status error={error} />;
}

function DrillsView({ data }: { data: AppSnapshot }) {
  const now = useMemo(() => new Date(), []);
  // text-only clue cards are drilled in the Clue quiz alone, never as "Where is this?"
  const cards = useMemo(() => data.content.cards.filter((card) => !isClueCard(card)), [data]);
  const tiles = useMemo(
    () =>
      TYPE_ORDER.flatMap((type) => {
        // clue catalogue cards get a tile per family instead (below)
        if (CLUE_TYPES.includes(type)) return [];
        const ids = cards.filter((card) => card.type === type).map((card) => card.id);
        if (ids.length === 0) return [];
        return [
          {
            key: type,
            to: `/session?type=${type}`,
            ...CARD_TYPES[type],
            count: ids.length,
            mastery: mastery(ids, data.states, now),
          },
        ];
      }),
    [data, cards, now],
  );
  // regions-map cards across every country
  const whereTile = useMemo(() => {
    const ids = cards.filter((card) => card.map).map((card) => card.id);
    if (ids.length === 0) return [];
    return [
      {
        key: 'where',
        to: '/session?map=1',
        label: 'Where in the country',
        blurb: 'Place clues on each country’s regions map',
        icon: CARD_TYPES.region.icon,
        count: ids.length,
        mastery: mastery(ids, data.states, now),
      },
    ];
  }, [data, cards, now]);
  // text questions on country facts ("Which country has: …?"), for those who want them
  const clueTile = useMemo(() => {
    const ids = data.content.cards.filter(isClueCard).map((card) => card.id);
    if (ids.length === 0) return [];
    return [
      {
        key: 'clue',
        to: '/session?clue=1',
        label: 'Clue quiz',
        blurb: 'Which country has this? Text questions on country facts',
        icon: CARD_TYPES.meta.icon,
        count: ids.length,
        mastery: mastery(ids, data.states, now),
      },
    ];
  }, [data, now]);
  // one tile per clue family with cards from the clue catalogue (Spot it, Which clue, Live view),
  // e.g. Bollards across every country
  const familyTiles = useMemo(
    () =>
      CLUE_FAMILIES.flatMap((family) => {
        const ids = cards
          .filter((card) => card.clue && card.subject === family && !card.map)
          .map((card) => card.id);
        if (ids.length === 0) return [];
        return [
          {
            key: `family-${family}`,
            to: `/session?subject=${family}`,
            label: family === 'other' ? 'Other clues' : SUBJECTS[family].label,
            blurb: SUBJECTS[family].blurb,
            icon: CARD_TYPES[family === 'plate' ? 'plate' : 'meta'].icon,
            count: ids.length,
            mastery: mastery(ids, data.states, now),
          },
        ];
      }),
    [data, cards, now],
  );

  const allTiles = [...familyTiles, ...tiles, ...whereTile, ...clueTile];

  return (
    <div className="page">
      <Header user={data.user} />
      <main className="page-main">
        <div className="page-title rise">
          <div>
            <h1 className="headline">Drills</h1>
            <p>Mixed is best. Single drills are for focus days.</p>
          </div>
          {allTiles.length > 0 && (
            <LinkButton to="/session">
              Mixed session
              <ArrowIcon />
            </LinkButton>
          )}
        </div>
        {allTiles.length === 0 && (
          <EmptyState
            title="No cards yet"
            text="Add some in the editor, then drill them here."
            actions={[{ label: 'Open the editor', to: '/editor' }]}
          />
        )}
        <div className="tiles">
          {allTiles.map(({ key, to, label, blurb, icon, count, mastery: pct }) => (
            <Link key={key} className="tile" to={to}>
              <div className="tile-top">
                <svg className="icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                  {icon}
                </svg>
                <span className="tile-link">
                  Practice
                  <svg
                    className="icon"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </span>
              </div>
              <div>
                <div className="tile-name headline">{label}</div>
                <div className="tile-blurb">{blurb}</div>
              </div>
              <div className="tile-bar">
                <div className="bar" role="img" aria-label={`Mastery ${Math.round(pct * 100)}%`}>
                  <div
                    className={pct < WEAK_MASTERY ? 'weak' : undefined}
                    style={{ width: `${Math.round(pct * 100)}%` }}
                  />
                </div>
                <span className="muted small">
                  {count} {count === 1 ? 'card' : 'cards'}
                  <span aria-hidden="true"> · {Math.round(pct * 100)}%</span>
                </span>
              </div>
            </Link>
          ))}
          <Link className="tile tile-games" to="/games">
            <div className="tile-top">
              <svg className="icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
                <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
                <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
                <circle cx="17.25" cy="17.25" r="3.75" />
              </svg>
            </div>
            <div>
              <div className="tile-name headline">Mini-games</div>
              <div className="tile-blurb">Area codes, plates, scripts by state</div>
            </div>
            <div className="tile-link">
              Country patterns
              <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}

import { CLUE_FAMILIES, isClueCard, mastery } from '@metabook/core';
import type { Card } from '@metabook/core';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { CARD_TYPES, CLUE_TYPES, TYPE_ORDER } from '../app/cardTypes';
import { FAMILY_NOUNS, SUBJECTS } from '../app/labels';
import { ArrowIcon, LinkButton } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { FitGrid } from '../components/FitGrid';
import { Header } from '../components/Header';
import { ICONS } from '../components/icons';
import { Status } from '../components/Status';
import { areaCodeSections } from '../data/areaCodes';
import './games/games.css';

const WEAK_MASTERY = 0.6;

/** How a type tile counts what it holds, when not in cards. */
const TYPE_NOUNS: Partial<Record<Card['type'], [string, string]>> = {
  flag: ['flag', 'flags'],
  script: ['script', 'scripts'],
  lookalike: ['pair', 'pairs'],
  areacode: ['code', 'codes'],
  plate: ['plate', 'plates'],
};

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('en')} ${count === 1 ? one : many}`;

/**
 * What a tile holds, counted the way a player thinks: clues and countries for clue families
 * ("38 bollards · 35 countries"), not the cards made from them.
 */
function holds(cards: Card[], noun?: [string, string]): string {
  const countries = new Set(cards.map((card) => card.country)).size;
  const clues = new Set(cards.flatMap((card) => (card.clue ? [card.clue.id] : []))).size;
  const first =
    clues > 0
      ? plural(clues, ...(noun ?? ['clue', 'clues']))
      : plural(cards.length, ...(noun ?? ['card', 'cards']));
  return countries > 1 ? `${first} · ${plural(countries, 'country', 'countries')}` : first;
}

interface Tile {
  key: string;
  to: string;
  label: string;
  blurb: string;
  icon: ReactNode;
  count: string;
  mastery: number;
  note?: string;
}

function areaCodeTile(cards: Card[], pool: AppSnapshot['content']['pool']): Partial<Tile> {
  // the countries are picked on the area-codes page itself, not here
  const { pattern } = areaCodeSections(cards, pool);
  return {
    to: '/areacodes?via=drill',
    note: `${plural(pattern.length, 'country', 'countries')} with a pattern`,
  };
}

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
        const ofType = cards.filter((card) => card.type === type);
        if (ofType.length === 0) return [];
        const tile: Tile = {
          key: type,
          to: `/session?type=${type}`,
          ...CARD_TYPES[type],
          count: holds(ofType, TYPE_NOUNS[type]),
          // area codes open on the page that says which countries' codes have a pattern
          ...(type === 'areacode' && areaCodeTile(ofType, data.content.pool)),
          mastery: mastery(
            ofType.map((card) => card.id),
            data.states,
            now,
          ),
        };
        return [tile];
      }),
    [data, cards, now],
  );
  // regions-map cards across every country
  const whereTile = useMemo((): Tile[] => {
    const onMap = cards.filter((card) => card.map);
    if (onMap.length === 0) return [];
    return [
      {
        key: 'where',
        to: '/session?map=1',
        label: 'Where in the country',
        blurb: 'Place clues on each country’s regions map',
        icon: ICONS.where,
        count: holds(onMap, ['place', 'places']),
        mastery: mastery(
          onMap.map((card) => card.id),
          data.states,
          now,
        ),
      },
    ];
  }, [data, cards, now]);
  // the clues' own Street View spots: kept out of family drills and the daily mix, since the
  // keyless embed paints road names on the road
  const streetViewTile = useMemo((): Tile[] => {
    const live = cards.filter((card) => card.type === 'live');
    if (live.length === 0) return [];
    return [
      {
        key: 'streetview',
        to: '/session?type=live',
        label: 'Street View',
        blurb: 'Each clue’s own spot, in the live view',
        note: 'Road labels can show names; Google key needed to hide them',
        icon: ICONS.streetview,
        count: holds(live, ['spot', 'spots']),
        mastery: mastery(
          live.map((card) => card.id),
          data.states,
          now,
        ),
      },
    ];
  }, [data, cards, now]);
  // text questions on country facts ("Which country has: …?"), for those who want them
  const clueTile = useMemo((): Tile[] => {
    const quiz = data.content.cards.filter(isClueCard);
    if (quiz.length === 0) return [];
    return [
      {
        key: 'clue',
        to: '/session?clue=1',
        label: 'Clue quiz',
        blurb: 'Which country has this? Text questions on country facts',
        icon: ICONS.clue,
        count: holds(quiz, ['question', 'questions']),
        mastery: mastery(
          quiz.map((card) => card.id),
          data.states,
          now,
        ),
      },
    ];
  }, [data, now]);
  // one tile per clue family with cards from the clue catalogue (Spot it, Which clue), e.g.
  // Bollards across every country; Live view cards have their own tile
  const familyTiles = useMemo(
    () =>
      CLUE_FAMILIES.flatMap((family): Tile[] => {
        const ofFamily = cards.filter(
          (card) => card.clue && card.subject === family && !card.map && card.type !== 'live',
        );
        if (ofFamily.length === 0) return [];
        return [
          {
            key: `family-${family}`,
            to: `/session?subject=${family}`,
            label: family === 'other' ? 'Other clues' : SUBJECTS[family].label,
            blurb: SUBJECTS[family].blurb,
            icon: ICONS[family],
            count: holds(ofFamily, FAMILY_NOUNS[family]),
            mastery: mastery(
              ofFamily.map((card) => card.id),
              data.states,
              now,
            ),
          },
        ];
      }),
    [data, cards, now],
  );

  const allTiles = [...familyTiles, ...tiles, ...whereTile, ...streetViewTile, ...clueTile];

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
        <FitGrid
          className="tiles"
          label="Drills"
          items={[...allTiles, GAMES_TILE]}
          keyOf={(tile) => tile.key}
          render={(tile) => <DrillTile tile={tile} />}
        />
      </main>
    </div>
  );
}

const GAMES_TILE: Tile = {
  key: 'games',
  to: '/games',
  label: 'Mini-games',
  blurb: 'Area codes, plates, scripts by state',
  icon: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <circle cx="17.25" cy="17.25" r="3.75" />
    </>
  ),
  count: 'Country patterns',
  mastery: -1,
};

function DrillTile({ tile }: { tile: Tile }) {
  const { key, to, label: name, blurb, note, icon, count, mastery: pct } = tile;
  const games = key === 'games';
  return (
    <Link className={games ? 'tile tile-games' : 'tile'} to={to}>
      <div className="tile-top">
        <svg className="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          {icon}
        </svg>
        <div className="tile-name headline">{name}</div>
        <svg className="icon tile-go" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </div>
      <div className="tile-blurb">
        {blurb}
        {note && <span className="tile-note"> · {note}</span>}
      </div>
      {games ? (
        <span className="tile-link">{count}</span>
      ) : (
        <div className="tile-foot">
          <div className="tile-meta">
            <span className="muted small">{count}</span>
            <span className="tile-pct">{Math.round(pct * 100)}%</span>
          </div>
          <div className="bar" role="img" aria-label={`Mastery ${Math.round(pct * 100)}%`}>
            <div
              className={pct < WEAK_MASTERY ? 'weak' : undefined}
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}

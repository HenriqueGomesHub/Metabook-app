import { CLUE_FAMILIES, isClueCard, mastery } from '@metabook/core';
import type { Card, ClueImage } from '@metabook/core';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { CARD_TYPES, CLUE_TYPES, TYPE_ORDER } from '../app/cardTypes';
import { SUBJECTS } from '../app/labels';
import { ArrowIcon, LinkButton } from '../components/Button';
import { ClueImg } from '../components/clues/ClueImg';
import { FlagImage } from '../components/FlagImage';
import { EmptyState } from '../components/EmptyState';
import { ItemList } from '../components/ItemList';
import { Header } from '../components/Header';
import { ICONS } from '../components/icons';
import { Status } from '../components/Status';
import './games/games.css';

const WEAK_MASTERY = 0.6;

/** What a tile shows above its name: a real example of the drill. */
type Cover =
  | { kind: 'photo'; image: ClueImage; alt: string }
  | { kind: 'flags'; codes: string[] }
  | { kind: 'text'; text: string; script?: boolean }
  | { kind: 'icon' };

interface Tile {
  key: string;
  to: string;
  label: string;
  icon: ReactNode;
  mastery: number;
  cover: Cover;
}

/** Countries whose photo stands for a family on its tile, first match wins: clear, typical shots. */
const COVER_COUNTRIES = ['PL', 'CZ', 'FR', 'BR', 'JP', 'DE', 'ZA', 'RU', 'US', 'AU', 'TH', 'MX'];

/** A photo of the family to show on its tile: a Spot it card's image, from a typical country. */
function photoOf(cards: Card[], subject: string | null, type?: Card['type']): Cover {
  // a wide, plain photo of the thing itself: no side-by-side comparison, nothing that names the
  // country, no drawn-on labels
  const fits = (image: ClueImage) =>
    !image.giveaway && (!image.width || !image.height || image.width >= image.height * 1.2);
  const withImage = cards.filter(
    (card) =>
      card.clue?.image &&
      fits(card.clue.image) &&
      (type ? card.type === type : card.type === 'spot' && card.subject === subject),
  );
  const rank = (card: Card) => {
    const i = COVER_COUNTRIES.indexOf(card.country);
    return i < 0 ? COVER_COUNTRIES.length : i;
  };
  const best = [...withImage].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))[0];
  return best?.clue?.image
    ? { kind: 'photo', image: best.clue.image, alt: best.prompt.alt ?? '' }
    : { kind: 'icon' };
}

/** Covers for the drills that are not photos. */
const TYPE_COVERS: Partial<Record<Card['type'], Cover>> = {
  flag: { kind: 'flags', codes: ['id', 'mc', 'pl'] },
  lookalike: { kind: 'flags', codes: ['ro', 'td'] },
  script: { kind: 'text', text: 'ő Ж ก', script: true },
  areacode: { kind: 'text', text: '41' },
};

function areaCodeTile(): Partial<Tile> {
  // the countries are picked on the area-codes page itself, not here
  return { to: '/areacodes?via=drill' };
}

export function Drills() {
  const { data, error } = useAppData();
  return data ? <DrillsView data={data} /> : <Status error={error} />;
}

function DrillsView({ data }: { data: AppSnapshot }) {
  const now = useMemo(() => new Date(), []);
  // text-only clue cards have no picture to drill: they are read in Learn
  const cards = useMemo(() => data.content.cards.filter((card) => !isClueCard(card)), [data]);
  const tiles = useMemo(
    () =>
      TYPE_ORDER.flatMap((type) => {
        // clue catalogue cards get a tile per family instead (below)
        // and region cards are the one "Where in the country" drill (below)
        if (CLUE_TYPES.includes(type) || type === 'region') return [];
        const ofType = cards.filter((card) => card.type === type);
        if (ofType.length === 0) return [];
        const tile: Tile = {
          key: type,
          to: `/session?type=${type}`,
          label: CARD_TYPES[type].label,
          icon: CARD_TYPES[type].icon,
          cover: TYPE_COVERS[type] ?? { kind: 'icon' },
          // area codes open on the page that says which countries' codes have a pattern
          ...(type === 'areacode' && areaCodeTile()),
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
    const onMap = data.content.cards.filter((card) => card.type === 'region');
    if (onMap.length === 0) return [];
    return [
      {
        key: 'where',
        to: '/session?type=region',
        label: 'Where in the country',
        icon: ICONS.where,
        cover: { kind: 'icon' },
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
        icon: ICONS.streetview,
        cover: photoOf(live, null, 'live'),
        mastery: mastery(
          live.map((card) => card.id),
          data.states,
          now,
        ),
      },
    ];
  }, [data, cards, now]);
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
            icon: ICONS[family],
            cover: photoOf(ofFamily, family),
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

  const allTiles = [...familyTiles, ...tiles, ...whereTile, ...streetViewTile];

  return (
    <div className="page page-scroll">
      <Header user={data.user} />
      <main className="page-main">
        <div className="page-title drills-title rise">
          <h1 className="headline">Drills</h1>
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
        <ItemList
          className="drill-grid"
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
  cover: { kind: 'icon' },
  icon: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <circle cx="17.25" cy="17.25" r="3.75" />
    </>
  ),
  mastery: -1,
};

function DrillTile({ tile }: { tile: Tile }) {
  const { key, to, label: name, icon, mastery: pct, cover } = tile;
  const games = key === 'games';
  const percent = Math.round(pct * 100);
  return (
    <Link className="drill-card" to={to}>
      <span className={`drill-cover drill-cover-${cover.kind}`} aria-hidden="true">
        <CoverArt cover={cover} icon={icon} />
      </span>
      <span className="drill-name headline">{name}</span>
      {!games && (
        <span className="drill-prog" role="img" aria-label={`Mastery ${percent}%`}>
          <span className="bar">
            <div
              className={pct < WEAK_MASTERY ? 'weak' : undefined}
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="drill-pct">{percent}%</span>
        </span>
      )}
    </Link>
  );
}

function CoverArt({ cover, icon }: { cover: Cover; icon: ReactNode }) {
  switch (cover.kind) {
    case 'photo':
      return <ClueImg image={cover.image} alt={cover.alt} fit="cover" />;
    case 'flags':
      return (
        <>
          {cover.codes.map((code) => (
            <FlagImage key={code} code={code} alt="" />
          ))}
        </>
      );
    case 'text':
      return (
        <span className={cover.script ? 'drill-cover-glyphs script' : 'drill-cover-glyphs'}>
          {cover.text}
        </span>
      );
    default:
      return (
        <svg className="icon" viewBox="0 0 24 24" width="44" height="44" aria-hidden="true">
          {icon}
        </svg>
      );
  }
}

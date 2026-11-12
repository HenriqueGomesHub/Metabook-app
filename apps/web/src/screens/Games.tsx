import { mastery } from '@metabook/core';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { FitGrid } from '../components/FitGrid';
import { Header } from '../components/Header';
import { Status } from '../components/Status';
import { areaCodeSections } from '../data/areaCodes';
import './games/games.css';

const STRONG = 0.6;

interface GameTile {
  title: string;
  blurb: string;
  icon: ReactNode;
  countries: string[];
  /** Playable countries: label to route. */
  playable?: Record<string, string>;
}

const GAMES: GameTile[] = [
  {
    title: 'Area codes',
    blurb: 'See a code, click the state',
    icon: (
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    ),
    countries: ['Brazil', 'France', 'Australia', 'Japan', 'Italy', 'Spain', 'Argentina', 'Mexico'],
  },
  {
    title: 'Plate codes',
    blurb: 'Letters or numbers that name a region',
    icon: (
      <>
        <rect x="3" y="7" width="18" height="10" rx="2" />
        <path d="M7 12h2" />
        <path d="M12 12h5" />
      </>
    ),
    countries: ['Indonesia', 'Russia', 'Turkey', 'Poland', 'Austria'],
  },
  {
    title: 'Scripts by state',
    blurb: 'The alphabet tells you the state',
    icon: (
      <>
        <path d="M3.5 19 8.5 5l5 14" />
        <path d="M5.6 13.5h5.8" />
        <circle cx="17.5" cy="15.5" r="3" />
        <path d="M20.5 12v7" />
      </>
    ),
    countries: ['India'],
  },
  {
    title: 'State metas',
    blurb: 'Poles, plates and signs that change by state',
    icon: (
      <>
        <path d="M12 3v18" />
        <path d="M6 6h12" />
        <path d="M7 9h10" />
      </>
    ),
    countries: ['Australia', 'United States', 'Canada'],
  },
  {
    title: 'Islands',
    blurb: 'Which island are you on',
    icon: (
      <>
        <path d="M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        <path d="M7 11c1.5-3 3.5-4 5-4s3.5 1 5 4" />
      </>
    ),
    countries: ['Indonesia', 'Philippines', 'Japan'],
  },
  {
    title: 'Languages by region',
    blurb: 'Which language is on the sign',
    icon: (
      <>
        <path d="M4 5h9v7H8l-4 3z" />
        <path d="M13 9h7v7l-3-2h-4z" />
      </>
    ),
    countries: ['Spain', 'Switzerland', 'Belgium'],
  },
];

const MAX_CHIPS = 8;

export function Games() {
  const { data, error } = useAppData();
  return data ? <GamesView data={data} /> : <Status error={error} />;
}

function GamesView({ data }: { data: AppSnapshot }) {
  const now = useMemo(() => new Date(), []);
  // area codes: every country with a content/areacodes file (Brazil's ship as cards) is playable
  const areaCodes = useMemo(() => {
    const { pattern, memorise } = areaCodeSections(data.content.cards, data.content.pool);
    const codes = [...pattern, ...memorise];
    const name = (code: string) => data.content.pool.find((c) => c.code === code)?.name ?? code;
    // each country opens on its pattern page, which leads on to the game
    const playable = Object.fromEntries(
      codes.map((code) => [name(code), `/areacodes/${code.toLowerCase()}`]),
    );
    const strong = new Set(
      codes
        .filter((code) => {
          const ids = data.content.cards
            .filter((card) => card.type === 'areacode' && card.country === code)
            .map((card) => card.id);
          return mastery(ids, data.states, now) >= STRONG;
        })
        .map(name),
    );
    return { names: codes.map(name), playable, strong };
  }, [data, now]);
  const games = GAMES.map((game) =>
    game.title === 'Area codes'
      ? {
          ...game,
          countries: [
            ...areaCodes.names,
            ...game.countries.filter((c) => !areaCodes.names.includes(c)),
          ],
          playable: areaCodes.playable,
        }
      : game,
  );

  return (
    <div className="page">
      <Header user={data.user} />
      <main className="page-main">
        <div className="page-title rise">
          <div>
            <h1 className="headline">Mini-games</h1>
            <p>Patterns inside one country. Green dot means the pattern is strong.</p>
          </div>
        </div>
        <FitGrid
          className="games-grid"
          label="Mini-games"
          items={games}
          keyOf={(game) => game.title}
          render={(game) => {
            const playable = game.playable ?? {};
            const open = Object.keys(playable).length > 0;
            return (
              <section className="game">
                <div className="game-head">
                  <svg
                    className="icon"
                    viewBox="0 0 24 24"
                    width="28"
                    height="28"
                    aria-hidden="true"
                  >
                    {game.icon}
                  </svg>
                  <div>
                    <h2 className="headline">
                      {game.title === 'Area codes' && open ? (
                        <Link to="/areacodes">{game.title}</Link>
                      ) : (
                        game.title
                      )}
                    </h2>
                    <p>{game.blurb}</p>
                  </div>
                  {!open && <span className="soon-pill">Soon</span>}
                </div>
                <div className="game-chips">
                  {game.countries.slice(0, MAX_CHIPS).map((name) => {
                    const to = playable[name];
                    if (!to) {
                      return (
                        <span key={name} className="game-chip soon">
                          {name}
                          {open && <span className="chip-soon">Soon</span>}
                        </span>
                      );
                    }
                    const strong = areaCodes.strong.has(name);
                    return (
                      <Link key={name} to={to} className={strong ? 'game-chip hot' : 'game-chip'}>
                        {strong && <span className="dot" role="img" aria-label="Strong pattern" />}
                        {name}
                      </Link>
                    );
                  })}
                  {game.countries.length > MAX_CHIPS && (
                    <span className="game-more">+{game.countries.length - MAX_CHIPS}</span>
                  )}
                </div>
              </section>
            );
          }}
        />
      </main>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { ChevronIcon } from '../components/Button';
import { Header } from '../components/Header';
import { ItemList } from '../components/ItemList';
import { Status } from '../components/Status';
import { areaCodeSections } from '../data/areaCodes';

interface Game {
  title: string;
  blurb: string;
  icon: ReactNode;
  to: string;
}

/** `/games`: the mini-games that can be played, one row each. */
export function Games() {
  const { data, error } = useAppData();
  return data ? <GamesView data={data} /> : <Status error={error} />;
}

function GamesView({ data }: { data: AppSnapshot }) {
  const { pattern, memorise } = areaCodeSections(data.content.cards, data.content.pool);
  const games: Game[] =
    pattern.length + memorise.length > 0
      ? [
          {
            title: 'Area codes',
            blurb: 'See a code, find the state',
            to: '/areacodes',
            icon: (
              <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
            ),
          },
        ]
      : [];

  return (
    <div className="page page-scroll">
      <Header user={data.user} />
      <main className="page-main">
        <div className="page-title rise">
          <div>
            <h1 className="headline">Mini-games</h1>
            <p>Patterns inside one country.</p>
          </div>
        </div>
        <ItemList
          className="row-list"
          list
          label="Mini-games"
          items={games}
          keyOf={(game) => game.title}
          render={(game) => (
            <Link className="row-item" to={game.to}>
              <svg className="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                {game.icon}
              </svg>
              <span className="row-text">
                <span className="row-name">{game.title}</span>
                <span className="row-sub">{game.blurb}</span>
              </span>
              <span />
              <ChevronIcon />
            </Link>
          )}
        />
      </main>
    </div>
  );
}

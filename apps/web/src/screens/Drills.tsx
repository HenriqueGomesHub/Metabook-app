import { mastery } from '@metabook/core';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { CARD_TYPES, TYPE_ORDER } from '../app/cardTypes';
import { todaySession } from '../app/stats';
import { ArrowIcon, LinkButton } from '../components/Button';
import { Header } from '../components/Header';
import { Status } from '../components/Status';

const WEAK_MASTERY = 0.6;

export function Drills() {
  const { data, error } = useAppData();
  return data ? <DrillsView data={data} /> : <Status error={error} />;
}

function DrillsView({ data }: { data: AppSnapshot }) {
  const now = useMemo(() => new Date(), []);
  const tiles = useMemo(
    () =>
      TYPE_ORDER.flatMap((type) => {
        const ids = data.content.cards.filter((card) => card.type === type).map((card) => card.id);
        if (ids.length === 0) return [];
        return [
          {
            type,
            due: todaySession(data, now, type).queue.length,
            mastery: mastery(ids, data.states, now),
          },
        ];
      }),
    [data, now],
  );

  return (
    <div className="page">
      <Header user={data.user} />
      <main className="page-main">
        <div className="page-title rise">
          <div>
            <h1 className="headline">Drills</h1>
            <p>Mixed is best. Single drills are for focus days.</p>
          </div>
          {tiles.length > 0 && (
            <LinkButton to="/session">
              Mixed session
              <ArrowIcon />
            </LinkButton>
          )}
        </div>
        {tiles.length === 0 && (
          <p className="muted rise d1">
            No cards yet. Add some in the <Link to="/editor">editor</Link>.
          </p>
        )}
        <div className="tiles">
          {tiles.map(({ type, due, mastery: pct }) => (
            <Link key={type} className="tile" to={`/session?type=${type}`}>
              <div className="tile-top">
                <svg className="icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                  {CARD_TYPES[type].icon}
                </svg>
                <span className="muted small">{due} due</span>
              </div>
              <div>
                <div className="tile-name headline">{CARD_TYPES[type].label}</div>
                <div className="tile-blurb">{CARD_TYPES[type].blurb}</div>
              </div>
              <div className="tile-bar">
                <div className="bar" role="img" aria-label={`Mastery ${Math.round(pct * 100)}%`}>
                  <div
                    className={pct < WEAK_MASTERY ? 'weak' : undefined}
                    style={{ width: `${Math.round(pct * 100)}%` }}
                  />
                </div>
                <span className="muted small" aria-hidden="true">
                  {Math.round(pct * 100)}%
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

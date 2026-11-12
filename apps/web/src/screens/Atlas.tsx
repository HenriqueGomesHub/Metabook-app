import { mastery, medalFor } from '@metabook/core';
import type { Medal as MedalKind, PoolCountry } from '@metabook/core';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { EmptyState } from '../components/EmptyState';
import { FitGrid } from '../components/FitGrid';
import { Header } from '../components/Header';
import { Medal } from '../components/Medal';
import { Status } from '../components/Status';
import { pct, WEAK } from './atlas/format';
import './atlas/atlas.css';

const CONTINENTS: { id: PoolCountry['continent']; label: string }[] = [
  { id: 'europe', label: 'Europe' },
  { id: 'asia', label: 'Asia' },
  { id: 'americas', label: 'Americas' },
  { id: 'africa', label: 'Africa' },
  { id: 'oceania', label: 'Oceania' },
];

const TALLY: { medal: Exclude<MedalKind, null>; label: string; at: number }[] = [
  { medal: 'gold', label: 'gold', at: 80 },
  { medal: 'silver', label: 'silver', at: 50 },
  { medal: 'bronze', label: 'bronze', at: 25 },
];

interface CountryTile {
  code: string;
  name: string;
  continent: PoolCountry['continent'];
  cardCount: number;
  value: number;
  medal: MedalKind;
}

export function Atlas() {
  const { data, error } = useAppData();
  return data ? <AtlasView data={data} /> : <Status error={error} />;
}

function AtlasView({ data }: { data: AppSnapshot }) {
  const now = useMemo(() => new Date(), []);
  const tiles = useMemo<CountryTile[]>(() => {
    const idsByCountry = new Map<string, string[]>();
    for (const card of data.content.cards) {
      idsByCountry.set(card.country, [...(idsByCountry.get(card.country) ?? []), card.id]);
    }
    return data.content.pool
      .filter((country) => country.in_pool)
      .map((country) => {
        const ids = idsByCountry.get(country.code) ?? [];
        const value = mastery(ids, data.states, now);
        return {
          code: country.code,
          name: country.name,
          continent: country.continent,
          cardCount: ids.length,
          value,
          medal: ids.length > 0 ? medalFor(value) : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, now]);

  const continents = CONTINENTS.filter(({ id }) => tiles.some((t) => t.continent === id));
  const firstWithCards = continents.find(({ id }) =>
    tiles.some((t) => t.continent === id && t.cardCount > 0),
  );
  const [chosen, setChosen] = useState<PoolCountry['continent'] | null>(null);
  const active = chosen ?? firstWithCards?.id ?? continents[0]?.id;
  const shown = tiles.filter((t) => t.continent === active);

  return (
    <div className="page">
      <Header user={data.user} />
      <main className="page-main">
        <div className="atlas-head rise">
          <div>
            <h1 className="headline">Atlas</h1>
            <p className="atlas-scope">
              <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              Competitive pool only · follows the current ranked maps
            </p>
            <ul className="tally" aria-label="Medal tally">
              {TALLY.map(({ medal, label, at }) => (
                <li key={medal}>
                  <i style={{ background: `var(--${medal})` }} />
                  {tiles.filter((t) => t.medal === medal).length} {label} · {at}%+
                </li>
              ))}
            </ul>
          </div>
          {continents.length > 0 && (
            <div className="segments" role="tablist" aria-label="Continent">
              {continents.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className="seg"
                  aria-selected={id === active}
                  onClick={() => setChosen(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {tiles.length === 0 && (
          <EmptyState
            title="No countries yet"
            text="The competitive pool is empty. Check back after the next content update."
            actions={[{ label: 'Drills', to: '/drills' }]}
          />
        )}
        <div className="atlas-panel" role="tabpanel" aria-label="Countries">
          <FitGrid
            className="atlas-tiles"
            label="Countries"
            items={shown}
            reset={active}
            keyOf={(tile) => tile.code}
            render={(tile) => (
              <Link className="atlas-tile" to={`/atlas/${tile.code}`}>
                <div className="atlas-tile-top">
                  <span className="atlas-tile-name">{tile.name}</span>
                  <span className="atlas-tile-pct">
                    {tile.medal && <Medal medal={tile.medal} />}
                    {tile.cardCount > 0 ? `${pct(tile.value)}%` : '—'}
                  </span>
                </div>
                <div className="bar" aria-hidden="true">
                  {tile.cardCount > 0 && (
                    <div
                      className={tile.value < WEAK ? 'weak' : undefined}
                      style={{ width: `${pct(tile.value)}%` }}
                    />
                  )}
                </div>
              </Link>
            )}
          />
        </div>
      </main>
    </div>
  );
}

import { mastery, medalFor } from '@metabook/core';
import type { Medal as MedalKind, PoolCountry } from '@metabook/core';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { ChevronIcon } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { FlagImage } from '../components/FlagImage';
import { ItemList } from '../components/ItemList';
import { Header } from '../components/Header';
import { Medal } from '../components/Medal';
import { Status } from '../components/Status';
import { pct } from './atlas/format';
import './atlas/atlas.css';

const CONTINENTS: { id: PoolCountry['continent']; label: string }[] = [
  { id: 'europe', label: 'Europe' },
  { id: 'asia', label: 'Asia' },
  { id: 'americas', label: 'Americas' },
  { id: 'africa', label: 'Africa' },
  { id: 'oceania', label: 'Oceania' },
];

const TALLY: { medal: Exclude<MedalKind, null>; label: string }[] = [
  { medal: 'gold', label: 'gold' },
  { medal: 'silver', label: 'silver' },
  { medal: 'bronze', label: 'bronze' },
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
  const medals = tiles.filter((t) => t.medal).length;

  return (
    <div className="page page-scroll">
      <Header user={data.user} />
      <main className="page-main">
        <div className="page-title rise">
          <div>
            <h1 className="headline">Atlas</h1>
            <p>Every country, and how well you know it.</p>
          </div>
          {medals > 0 && (
            <ul className="tally" aria-label="Medal tally">
              {TALLY.map(({ medal, label }) => (
                <li key={medal}>
                  <i style={{ background: `var(--${medal})` }} />
                  {tiles.filter((t) => t.medal === medal).length} {label}
                </li>
              ))}
            </ul>
          )}
          {continents.length > 0 && (
            <div className="segments atlas-continents" role="tablist" aria-label="Continent">
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
          <ItemList
            className="row-list"
            list
            label="Countries"
            items={shown}
            keyOf={(tile) => tile.code}
            render={(tile) => (
              <Link className="row-item" to={`/atlas/${tile.code}`}>
                <span className="row-flag">
                  <FlagImage code={tile.code} alt="" />
                </span>
                <span className="row-text">
                  <span className="row-name">{tile.name}</span>
                </span>
                <span className="row-pct atlas-pct">
                  {tile.medal && <Medal medal={tile.medal} />}
                  {tile.cardCount > 0 ? `${pct(tile.value)}%` : '—'}
                </span>
                <ChevronIcon />
              </Link>
            )}
          />
        </div>
      </main>
    </div>
  );
}

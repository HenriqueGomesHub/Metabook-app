import { mastery } from '@metabook/core';
import { useMemo } from 'react';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { label, pairLabel } from '../app/labels';
import { mapsOf, pairScope } from '../app/stats';
import { useRegionMaps } from '../app/useRegionMaps';
import { EmptyState } from '../components/EmptyState';
import { Header } from '../components/Header';
import { Status } from '../components/Status';
import { dailyAccuracy, niceAxis, TREND_DAYS } from './stats/trend';
import './stats/stats.css';

const PLOT_W = 600;
const PLOT_H = 200;
const TOP_CONFUSIONS = 5;
const HOT_CONFUSIONS = 2;

const fmt = (n: number) => n.toLocaleString('en-US');

export function Stats() {
  const { data, error } = useAppData();
  return data ? <StatsView data={data} /> : <Status error={error} />;
}

function trained(ms: number): { value: string; unit: string } {
  if (ms >= 3_600_000) return { value: (ms / 3_600_000).toFixed(1), unit: 'h' };
  return { value: String(Math.round(ms / 60_000)), unit: 'min' };
}

function StatsView({ data }: { data: AppSnapshot }) {
  const now = useMemo(() => new Date(), []);

  const kpis = useMemo(() => {
    const seen = Object.values(data.states).filter((s) => s.state !== 'new' && s.reps > 0);
    const recall = seen.length
      ? mastery(
          seen.map((s) => s.cardId),
          data.states,
          now,
        )
      : null;
    const scored = data.rounds.filter((r) => r.score !== undefined);
    const avgScore = scored.length
      ? scored.reduce((sum, r) => sum + (r.score ?? 0), 0) / scored.length
      : null;
    const ms = data.reviews.reduce((sum, r) => sum + r.msTaken, 0);
    return { recall, avgScore, learned: seen.length, time: trained(ms) };
  }, [data, now]);

  const points = useMemo(() => dailyAccuracy(data.reviews, now), [data.reviews, now]);
  const axis = useMemo(() => niceAxis(points.map((p) => p.value)), [points]);
  const x = (day: number) => (day / (TREND_DAYS - 1)) * PLOT_W;
  const y = (value: number) => ((axis.hi - value) / (axis.hi - axis.lo)) * PLOT_H;
  const first = points[0];
  const last = points.at(-1);
  const delta = first && last && points.length > 1 ? Math.round(last.value - first.value) : null;
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1 - TREND_DAYS);

  const confusions = useMemo(
    () =>
      data.confusions
        .filter((c) => c.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_CONFUSIONS),
    [data.confusions],
  );
  useRegionMaps(mapsOf(confusions.flatMap((c) => [c.picked, c.truth])));

  const cells: { value: string; unit?: string; label: string }[] = [
    {
      value: kpis.recall === null ? '—' : `${Math.round(kpis.recall * 100)}%`,
      label: 'Recall in a week',
    },
    {
      value: kpis.avgScore === null ? '—' : fmt(Math.round(kpis.avgScore)),
      label: 'Avg round score',
    },
    { value: fmt(kpis.learned), label: 'Cards learned' },
    { value: kpis.time.value, unit: kpis.time.unit, label: 'Time trained' },
  ];

  return (
    <div className="page">
      <Header user={data.user} />
      <main className="page-main stats-main">
        <div className="stats-title rise">
          <h1 className="headline">Stats</h1>
          <span>Last 30 days</span>
        </div>

        <div className="kpis">
          {cells.map((cell, i) => (
            <div
              key={cell.label}
              className="stat-panel"
              style={{ '--i': i } as React.CSSProperties}
            >
              <p className="kpi-big">
                {cell.value}
                {cell.unit && <small> {cell.unit}</small>}
              </p>
              <p className="kpi-label">{cell.label}</p>
            </div>
          ))}
        </div>

        <div className="stats-rows">
          <section className="stat-panel stat-chart" style={{ '--i': 4 } as React.CSSProperties}>
            <div className="stat-panel-head">
              <h2>Daily accuracy</h2>
              {delta !== null && (
                <span className={delta < 0 ? 'trend-delta down' : 'trend-delta'}>
                  {delta < 0 ? '−' : '+'}
                  {Math.abs(delta)} pts
                </span>
              )}
            </div>
            {points.length === 0 ? (
              <EmptyState
                size="compact"
                title="No answers yet"
                text="Answer a few cards and your accuracy curve shows up here."
                actions={[{ label: 'Start a drill', to: '/drills' }]}
              />
            ) : (
              <svg
                className="trend-svg"
                role="img"
                aria-label={
                  delta === null
                    ? `Accuracy ${Math.round(last?.value ?? 0)}% on the one day practised`
                    : `Accuracy went from ${Math.round(first?.value ?? 0)}% to ${Math.round(last?.value ?? 0)}% over 30 days`
                }
                viewBox={`-36 -8 ${PLOT_W + 48} ${PLOT_H + 38}`}
              >
                {axis.ticks.map((tick) => (
                  <g key={tick}>
                    <path className="trend-grid" d={`M0 ${y(tick)}H${PLOT_W}`} />
                    <text className="trend-axis" x="-10" y={y(tick) + 4} textAnchor="end">
                      {tick}%
                    </text>
                  </g>
                ))}
                {points.length > 1 && (
                  <polyline
                    className="trend-line"
                    pathLength={1}
                    points={points
                      .map((p) => `${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`)
                      .join(' ')}
                  />
                )}
                {last && <circle className="trend-end" cx={x(last.day)} cy={y(last.value)} r="5" />}
                <text className="trend-axis" x="0" y={PLOT_H + 20}>
                  {startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </text>
                <text className="trend-axis" x={PLOT_W} y={PLOT_H + 20} textAnchor="end">
                  Today
                </text>
              </svg>
            )}
          </section>

          <section className="stat-panel stat-list" style={{ '--i': 5 } as React.CSSProperties}>
            <h2>Top confusions</h2>
            {confusions.length === 0 ? (
              <EmptyState
                size="compact"
                title="No confusions yet"
                text="Mix-ups between answers will rank here."
              />
            ) : (
              <ol className="confusions">
                {confusions.map((c, i) => {
                  const scope = pairScope(data.content.cards, c.picked, c.truth);
                  return (
                    <li
                      key={`${c.picked}|${c.truth}`}
                      title={`Said ${label(c.picked, scope)} for ${label(c.truth, scope)}`}
                    >
                      <span>{pairLabel(c.picked, c.truth, scope)}</span>
                      <span className={i < HOT_CONFUSIONS ? 'count hot' : 'count'}>{c.count}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

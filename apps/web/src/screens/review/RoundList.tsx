import { pickTip } from '@metabook/core';
import type { Round } from '@metabook/core';
import { ItemList } from '../../components/ItemList';
import type { AppSnapshot } from '../../app/AppData';
import { countryName } from '../manage/countries';

const MODE_LABELS = { move: 'Move', nm: 'NM', nmpz: 'NMPZ' } as const;

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

const isMiss = (round: Round) => round.guess.country !== round.truth.country;

/** Newest day first; within a day misses come before correct rounds (each newest first). */
function groupByDay(rounds: Round[]): { label: string; rounds: Round[] }[] {
  const groups: { label: string; rounds: Round[] }[] = [];
  for (const round of rounds) {
    const label = dayLabel(round.playedAt);
    const last = groups.at(-1);
    if (last?.label === label) last.rounds.push(round);
    else groups.push({ label, rounds: [round] });
  }
  for (const group of groups) {
    group.rounds = [...group.rounds.filter(isMiss), ...group.rounds.filter((r) => !isMiss(r))];
  }
  return groups;
}

const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** Every round, newest day first and misses first within a day, paged to fit the screen. */
export function RoundList({ data }: { data: AppSnapshot }) {
  const { pool, cards, tips } = data.content;
  const name = (key: string) => countryName(pool, key);
  const newestFirst = [...data.rounds].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  const rounds = groupByDay(newestFirst).flatMap((group) => group.rounds);

  return (
    <section className="sheet round-sheet" aria-label="Rounds">
      <ItemList
        className="round-list"
        label="Rounds"
        list
        items={rounds}
        keyOf={(round) => round.id}
        render={(round) => {
          const miss = isMiss(round);
          const truthName = name(round.truth.country);
          const answer =
            cards.find((c) => c.type === 'flag' && c.country === round.truth.country)?.answer ??
            truthName;
          const tip = miss ? pickTip(tips, answer, 'flag', data.tipViews) : null;
          const meta = [
            round.map,
            round.mode && MODE_LABELS[round.mode],
            round.distanceKm !== undefined && `${Math.round(round.distanceKm)} km`,
            round.score !== undefined && `${round.score} pts`,
          ].filter(Boolean);
          return (
            <div className={miss ? 'round round-miss' : 'round'} title={dayLabel(round.playedAt)}>
              <span className="round-day">{shortDay(round.playedAt)}</span>
              <div className="round-body">
                <div className="round-line">
                  <span className="round-main">
                    {miss ? (
                      <>
                        You guessed <strong>{name(round.guess.country)}</strong> — it was{' '}
                        {truthName}
                      </>
                    ) : (
                      <>Right: {truthName}</>
                    )}
                    {round.truth.region && <span className="muted"> · {round.truth.region}</span>}
                  </span>
                  <span className="round-meta">{meta.join(' · ')}</span>
                </div>
                {tip && (
                  <p className="round-tip">
                    <span>Spotting {truthName}:</span> {tip.tip.text}
                  </p>
                )}
              </div>
            </div>
          );
        }}
      />
    </section>
  );
}

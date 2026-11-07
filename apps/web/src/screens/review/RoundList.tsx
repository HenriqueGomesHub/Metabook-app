import { pickTip } from '@metabook/core';
import type { Round } from '@metabook/core';
import { TipBox } from '../../components/TipBox';
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

export function RoundList({ data }: { data: AppSnapshot }) {
  const { pool, cards, tips } = data.content;
  const name = (key: string) => countryName(pool, key);
  const newestFirst = [...data.rounds].sort((a, b) => b.playedAt.localeCompare(a.playedAt));

  return (
    <>
      {groupByDay(newestFirst).map(({ label, rounds }) => (
        <section key={label} className="sheet" aria-label={label}>
          <h2 className="headline">{label}</h2>
          <ul className="list">
            {rounds.map((round) => {
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
                <li key={round.id} className={miss ? 'round round-miss' : 'round'}>
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
                  {tip && <TipBox label={`Spotting ${truthName}`} picked={tip} variant="warn" />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

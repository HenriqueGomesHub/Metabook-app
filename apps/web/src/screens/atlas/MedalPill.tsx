import type { Medal as MedalKind } from '@metabook/core';
import { nextMedal } from '@metabook/core';
import { Medal } from '../../components/Medal';
import { pct } from './format';

const NAMES = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' } as const;

/** The medal held plus a hint at the next one, e.g. "Silver · gold at 80%". */
export function MedalPill({
  medal,
  value,
  short,
}: {
  medal: MedalKind;
  value: number;
  /** just the medal earned, without the next one to aim for */
  short?: boolean;
}) {
  const next = short ? null : nextMedal(value);
  return (
    <span className="medal-pill">
      {medal && <Medal medal={medal} size={20} />}
      <span>{medal ? NAMES[medal] : 'No medal yet'}</span>
      {next && (
        <span className="muted">
          · <span className="cap">{next.medal}</span> at {pct(next.at)}%
        </span>
      )}
    </span>
  );
}

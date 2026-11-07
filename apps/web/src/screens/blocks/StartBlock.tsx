import { planBlock } from '@metabook/core';
import type { TrainingBlock } from '@metabook/core';
import { useId, useMemo, useState } from 'react';
import { currentSnapshot } from '../../app/dataActions';
import type { AppSnapshot } from '../../app/AppData';
import { ArrowIcon, Button } from '../../components/Button';
import { Targets } from './Targets';

const DAYS = { min: 7, max: 30 };
const MINUTES = { min: 10, max: 60 };

export function StartBlock({
  data,
  now,
  onStart,
}: {
  data: AppSnapshot;
  now: Date;
  onStart(block: TrainingBlock): void;
}) {
  const [days, setDays] = useState(data.settings.blockDays);
  const [minutes, setMinutes] = useState(data.settings.blockMinutes);
  const daysId = useId();
  const minutesId = useId();
  const baseline = useMemo(() => currentSnapshot(data, now), [data, now]);
  const plan = useMemo(
    () => planBlock({ snapshot: baseline, settings: data.settings, now, days, minutes }),
    [baseline, data.settings, now, days, minutes],
  );

  return (
    <section className="sheet" aria-label="Start a block">
      <div className="sheet-head">
        <h2 className="headline">Start a block</h2>
        <span className="note">Targets come from your last 30 days of games and drills.</span>
      </div>
      <div className="fields">
        <div className="field">
          <label htmlFor={daysId}>Length (days)</label>
          <div className="range-row">
            <input
              id={daysId}
              type="range"
              {...DAYS}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
            <output htmlFor={daysId}>{days}</output>
          </div>
        </div>
        <div className="field">
          <label htmlFor={minutesId}>Minutes per day</label>
          <div className="range-row">
            <input
              id={minutesId}
              type="range"
              {...MINUTES}
              step={5}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
            <output htmlFor={minutesId}>{minutes}</output>
          </div>
        </div>
      </div>
      <Targets targets={plan.targets} content={data.content} />
      <div className="actions">
        <Button onClick={() => onStart(plan)}>
          Start block
          <ArrowIcon />
        </Button>
      </div>
    </section>
  );
}

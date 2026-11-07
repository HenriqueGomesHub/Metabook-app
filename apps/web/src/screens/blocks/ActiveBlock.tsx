import { blockProgress } from '@metabook/core';
import type { TrainingBlock } from '@metabook/core';
import type { AppSnapshot } from '../../app/AppData';
import { Button } from '../../components/Button';
import { ProgressBar } from '../../components/ProgressBar';
import { Targets } from './Targets';

export function ActiveBlock({
  data,
  block,
  now,
  onEnd,
}: {
  data: AppSnapshot;
  block: TrainingBlock;
  now: Date;
  onEnd(): void;
}) {
  const progress = blockProgress(block, data.blockDays, now);
  const minutes = Math.round(progress.todayMinutes);
  return (
    <section className="sheet" aria-label="Active block">
      <div className="sheet-head">
        <h2 className="headline">Training block</h2>
        <span className="note">
          {progress.missedDays} missed {progress.missedDays === 1 ? 'day' : 'days'}. Missed days
          don’t break a block.
        </span>
      </div>
      <div className="big-row">
        <div className="big">
          Day {progress.dayIndex + 1} <small>of {progress.totalDays}</small>
        </div>
        <div className="big">
          {minutes} <small>of {block.minutesPerDay} min today</small>
        </div>
      </div>
      <ProgressBar
        value={Math.min(minutes, block.minutesPerDay)}
        max={block.minutesPerDay}
        label="Minutes today"
      />
      <Targets targets={block.targets} content={data.content} />
      <div className="actions">
        <Button variant="ghost" onClick={onEnd}>
          End early
        </Button>
      </div>
    </section>
  );
}

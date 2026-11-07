import { compareBlocks } from '@metabook/core';
import type { TargetDelta, TrainingBlock } from '@metabook/core';
import type { AppSnapshot } from '../../app/AppData';
import { targetLabel } from './targets';

const percent = (value: number) => `${Math.round(value * 100)}%`;

function Delta({ row }: { row: TargetDelta }) {
  if (row.delta === null) return <span className="muted">Not enough data</span>;
  const pair = row.target.kind === 'pair';
  const change = pair ? row.delta : Math.round(row.delta * 100);
  if (change === 0) return <span className="muted">No change</span>;
  const better = pair ? change < 0 : change > 0;
  return (
    <span className={better ? 'delta-up' : 'delta-down'}>
      {change > 0 ? '+' : '−'}
      {Math.abs(change)}
      {pair ? '' : ' pts'}
    </span>
  );
}

function Values({ row }: { row: TargetDelta }) {
  if (row.before === null || row.after === null) return <span>—</span>;
  const show = row.target.kind === 'pair' ? String : percent;
  return (
    <span>
      {show(row.before)} → {show(row.after)}
      {row.target.kind === 'pair' && ' misses'}
    </span>
  );
}

export function FinishedBlock({ data, block }: { data: AppSnapshot; block: TrainingBlock }) {
  const practised = data.blockDays.filter(
    (d) => d.blockId === block.id && (d.minutesDone > 0 || d.cardsDone > 0),
  ).length;
  const rows = block.final ? compareBlocks(block.targets, block.baseline, block.final) : [];
  return (
    <li>
      <div className="sheet-head">
        <h3 className="headline">
          {block.startsOn} to {block.endsOn}
        </h3>
        <span className="note">
          {block.status === 'ended-early' ? 'Ended early' : 'Finished'} · {practised}{' '}
          {practised === 1 ? 'day' : 'days'} practised
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="note">No targets in this block.</p>
      ) : (
        <dl className="compare">
          {rows.map((row) => (
            <div key={`${row.target.kind}:${row.target.key}`} style={{ display: 'contents' }}>
              <dt>{targetLabel(row.target, data.content)}</dt>
              <dd>
                <Values row={row} />
              </dd>
              <dd>
                <Delta row={row} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

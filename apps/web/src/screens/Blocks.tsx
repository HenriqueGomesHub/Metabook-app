import { blockProgress } from '@metabook/core';
import { useEffect, useMemo } from 'react';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { activeBlock } from '../app/dataActions';
import { FitGrid } from '../components/FitGrid';
import { Status } from '../components/Status';
import { ActiveBlock } from './blocks/ActiveBlock';
import { FinishedBlock } from './blocks/FinishedBlock';
import { StartBlock } from './blocks/StartBlock';
import { Page } from './manage/Page';

export function Blocks() {
  const { data, error } = useAppData();
  return data ? <BlocksView data={data} /> : <Status error={error} />;
}

function BlocksView({ data }: { data: AppSnapshot }) {
  const { startBlock, finishBlock } = useAppData();
  const now = useMemo(() => new Date(), []);
  const active = activeBlock(data);
  const expired = active ? blockProgress(active, data.blockDays, now).finished : false;
  const past = data.blocks.filter((block) => block.status !== 'active');

  useEffect(() => {
    if (active && expired) finishBlock(active.id, 'finished');
  }, [active, expired, finishBlock]);

  return (
    <Page
      user={data.user}
      title="Training blocks"
      subtitle="A few weeks of focused practice on your weakest countries, then a before and after."
    >
      {active && !expired ? (
        <ActiveBlock
          data={data}
          block={active}
          now={now}
          onEnd={() => finishBlock(active.id, 'ended-early')}
        />
      ) : (
        <StartBlock data={data} now={now} onStart={startBlock} />
      )}
      {past.length > 0 && (
        <section className="sheet finished-sheet" aria-label="Finished blocks">
          <h2 className="headline">Finished blocks</h2>
          <FitGrid
            className="list finished-list"
            label="Finished blocks"
            list
            items={past}
            keyOf={(block) => block.id}
            render={(block) => <FinishedBlock data={data} block={block} />}
          />
        </section>
      )}
    </Page>
  );
}

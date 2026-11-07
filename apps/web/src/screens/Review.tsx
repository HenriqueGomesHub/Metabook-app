import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Status } from '../components/Status';
import { Page } from './manage/Page';
import { ImportRounds } from './review/ImportRounds';
import { LogGame } from './review/LogGame';
import { RoundList } from './review/RoundList';

export function Review() {
  const { data, error } = useAppData();
  return data ? <ReviewView data={data} /> : <Status error={error} />;
}

function ReviewView({ data }: { data: AppSnapshot }) {
  const { logRounds } = useAppData();
  const [logging, setLogging] = useState(false);
  const [result, setResult] = useState<{ message: string; ok: boolean } | null>(null);

  return (
    <Page
      user={data.user}
      title="Game review"
      subtitle="Every miss becomes a confusion to drill and pulls that country’s cards forward."
      actions={
        <>
          <ImportRounds onImport={(rounds) => logRounds(rounds).rounds} onResult={setResult} />
          <Button onClick={() => setLogging(true)} disabled={logging}>
            Log a game
          </Button>
        </>
      }
    >
      <p className="note rise d1">
        Extension captures single-player games automatically — pair it in{' '}
        <Link to="/settings">Settings</Link>.
      </p>
      {result && (
        <p className={`note ${result.ok ? 'note-ok' : 'note-warn'}`} role="status">
          {result.message}
        </p>
      )}
      {logging && (
        <LogGame
          pool={data.content.pool}
          onCancel={() => setLogging(false)}
          onLog={(rounds) => {
            const summary = logRounds(rounds);
            setLogging(false);
            setResult({
              ok: true,
              message: `Logged ${summary.rounds} ${summary.rounds === 1 ? 'round' : 'rounds'}, ${summary.misses} ${summary.misses === 1 ? 'miss' : 'misses'}${summary.pulledForward > 0 ? `, ${summary.pulledForward} cards due now` : ''}`,
            });
          }}
        />
      )}
      {data.rounds.length > 0 ? (
        <RoundList data={data} />
      ) : (
        !logging && (
          <EmptyState
            title="No games yet"
            text="Log one by hand, import a Round Analyzer file, or pair the extension."
            actions={[{ label: 'Pair the extension', to: '/settings' }]}
          />
        )
      )}
    </Page>
  );
}

import { useState } from 'react';
import { useAppData } from '../../app/AppData';
import { Button } from '../../components/Button';

export function Account() {
  const { mode, auth, data } = useAppData();
  const [error, setError] = useState('');
  return (
    <section className="sheet" aria-label="Account">
      <h2 className="headline">Account</h2>
      {mode === 'local' ? (
        <p className="note">Local mode — data stays in this browser.</p>
      ) : (
        <>
          <p>{data?.user?.name}</p>
          <div className="actions">
            <Button
              variant="ghost"
              onClick={() =>
                auth
                  .signOut()
                  .catch((r: unknown) => setError(String(r instanceof Error ? r.message : r)))
              }
            >
              Sign out
            </Button>
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

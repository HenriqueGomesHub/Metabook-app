import { useEffect, useState } from 'react';
import { useAppData } from '../../app/AppData';
import type { Pairing as PairingInfo } from '../../data/repository';
import { Button } from '../../components/Button';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function Pairing() {
  const { repo, mode } = useAppData();
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'cloud') return;
    let live = true;
    repo.getPairing().then(
      (found) => live && setPairing(found),
      (reason: unknown) =>
        live && setError(String(reason instanceof Error ? reason.message : reason)),
    );
    return () => {
      live = false;
    };
  }, [repo, mode]);

  async function create() {
    setError('');
    setCopied(false);
    try {
      const code = await repo.createPairingCode();
      setToken(code);
      if (code) setPairing({ createdAt: new Date().toISOString() });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setError('Copy failed. Select the token and copy it by hand.');
    }
  }

  return (
    <section className="sheet" aria-label="Extension pairing">
      <h2 className="headline">Extension</h2>
      {mode !== 'cloud' ? (
        <p className="note">
          Pairing the browser extension needs cloud mode, because the extension sends rounds to your
          Supabase project. Add your Supabase URL and key to run in cloud mode.
        </p>
      ) : (
        <>
          <p className="note">
            {pairing
              ? `Paired ${when(pairing.createdAt)}. ${
                  pairing.lastUsedAt ? `Last used ${when(pairing.lastUsedAt)}.` : 'Not used yet.'
                }`
              : 'Not paired yet.'}
          </p>
          {token && (
            <div className="token">
              <code aria-label="Pairing token">{token}</code>
              <Button variant="ghost" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
          {token && (
            <p className="note note-warn">Shown once. Paste it into the extension popup now.</p>
          )}
          <p className="note">Creating a new token replaces the previous one.</p>
          <div className="actions">
            <Button variant="ghost" onClick={create}>
              Create pairing token
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

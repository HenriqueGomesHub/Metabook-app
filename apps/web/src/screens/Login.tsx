import { useState } from 'react';
import { useAppData } from '../app/AppData';
import { Button } from '../components/Button';
import './manage/manage.css';

export function Login() {
  const { auth } = useAppData();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setError('');
    try {
      await auth.signInWithEmail(address);
      setSentTo(address);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="rise">
        <p className="kicker">Metabook</p>
        <h1 className="headline">{sentTo ? 'Check your email' : 'Sign in'}</h1>
      </div>
      {sentTo ? (
        <div className="rise d1">
          <p className="muted">
            We sent a sign-in link to {sentTo}. Open it on this device to continue.
          </p>
          <button type="button" className="link" onClick={() => setSentTo(null)}>
            Use a different email
          </button>
        </div>
      ) : (
        <form className="sheet" onSubmit={submit} aria-label="Sign in">
          <label className="field">
            Email
            <input
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            Send magic link
          </Button>
        </form>
      )}
    </main>
  );
}

import { useEffect, useState } from 'react';
import { useAppData } from '../app/AppData';
import { Button } from '../components/Button';
import './manage/manage.css';

/** The address a code was sent to, kept so reopening the home-screen app goes back to the code. */
const PENDING_KEY = 'metabook.login.pending';
/** Seconds before another email can be asked for. */
const RESEND_SECONDS = 60;

function readPending(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function writePending(email: string | null) {
  try {
    if (email) localStorage.setItem(PENDING_KEY, email);
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // private mode: the code screen just won't survive a reload
  }
}

/**
 * Email sign-in that finishes inside this window: the email carries a code as well as a link, and
 * the code is typed here. The link alone would open Safari, which on an iPhone home-screen app is a
 * different browser with its own storage, so the app itself would stay signed out.
 */
export function Login() {
  const { auth } = useAppData();
  const [email, setEmail] = useState(() => readPending() ?? '');
  const [sentTo, setSentTo] = useState<string | null>(readPending);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function send(address: string) {
    setBusy(true);
    setError('');
    try {
      await auth.signInWithEmail(address);
      setSentTo(address);
      setCode('');
      setWait(RESEND_SECONDS);
      writePending(address);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (address) await send(address);
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    const token = code.replace(/\D/g, '');
    if (!sentTo || token.length < 6) return;
    setBusy(true);
    setError('');
    try {
      await auth.verifyEmailCode(sentTo, token);
      writePending(null);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(/expired|invalid/i.test(message) ? 'That code is wrong or has expired.' : message);
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    writePending(null);
    setSentTo(null);
    setCode('');
    setError('');
  }

  return (
    <main className="login">
      <div className="rise">
        <p className="kicker">Metabook</p>
        <h1 className="headline">{sentTo ? 'Check your email' : 'Sign in'}</h1>
      </div>
      {sentTo ? (
        <form className="sheet rise d1" onSubmit={submitCode} aria-label="Enter code">
          <p className="muted">
            We sent a code to {sentTo}. Type it here to sign in on this screen, or open the link on
            this device.
          </p>
          <label className="field">
            Code
            <input
              className="login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={10}
              pattern="[0-9 ]*"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
              placeholder="123456"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || code.replace(/\D/g, '').length < 6}>
            Sign in
          </Button>
          <div className="login-more">
            <button
              type="button"
              className="link"
              disabled={busy || wait > 0}
              onClick={() => void send(sentTo)}
            >
              {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
            </button>
            <button type="button" className="link" onClick={restart}>
              Use a different email
            </button>
          </div>
        </form>
      ) : (
        <form className="sheet" onSubmit={submitEmail} aria-label="Sign in">
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
            Email me a code
          </Button>
        </form>
      )}
    </main>
  );
}

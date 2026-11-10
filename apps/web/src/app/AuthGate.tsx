import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Status } from '../components/Status';
import { useAppData } from './AppData';

/**
 * Pages that show their own sign-in prompt instead of redirecting: /round is opened inside the
 * extension's side panel, where a redirect would strand the login in the frame.
 */
const OWN_PROMPT = ['/round'];

/** In cloud mode every route but /login needs a session; in local mode /login is never shown. */
export function AuthGate() {
  const { mode, user, error } = useAppData();
  const { pathname } = useLocation();
  const onLogin = pathname === '/login';

  if (mode === 'local') return onLogin ? <Navigate to="/" replace /> : <Outlet />;
  if (user === undefined) return <Status error={error} />;
  if (user && onLogin) return <Navigate to="/" replace />;
  if (!user && !onLogin && !OWN_PROMPT.includes(pathname)) return <Navigate to="/login" replace />;
  return <Outlet />;
}

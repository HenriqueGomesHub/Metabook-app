import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Status } from '../components/Status';
import { useAppData } from './AppData';

/** In cloud mode every route but /login needs a session; in local mode /login is never shown. */
export function AuthGate() {
  const { mode, user, error } = useAppData();
  const onLogin = useLocation().pathname === '/login';

  if (mode === 'local') return onLogin ? <Navigate to="/" replace /> : <Outlet />;
  if (user === undefined) return <Status error={error} />;
  if (user && onLogin) return <Navigate to="/" replace />;
  if (!user && !onLogin) return <Navigate to="/login" replace />;
  return <Outlet />;
}

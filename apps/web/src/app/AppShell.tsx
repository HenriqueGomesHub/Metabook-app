import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Grain } from '../components/Grain';

const HIDDEN_NAV_PREFIXES = ['/session', '/games/areacode', '/placement'];

const NAV_ITEMS: { to: string; label: string; icon: ReactNode }[] = [
  {
    to: '/',
    label: 'Today',
    icon: (
      <>
        <path d="M3 18h18" />
        <path d="M6.5 18a5.5 5.5 0 0 1 11 0" />
        <path d="M12 5v3" />
        <path d="m5.3 9.3 1.6 1.6" />
        <path d="m18.7 9.3-1.6 1.6" />
      </>
    ),
  },
  {
    to: '/drills',
    label: 'Drills',
    icon: (
      <>
        <rect x="3.5" y="7.5" width="13" height="13" rx="2.5" />
        <path d="M7.5 3.5h10a3 3 0 0 1 3 3v10" />
      </>
    ),
  },
  {
    to: '/review',
    label: 'Game review',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" />
      </>
    ),
  },
  {
    to: '/atlas',
    label: 'Atlas',
    icon: (
      <>
        <path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2z" />
        <path d="M9 4.5v13" />
        <path d="M15 6.5v13" />
      </>
    ),
  },
  {
    to: '/stats',
    label: 'Stats',
    icon: (
      <>
        <path d="M5 20v-6" />
        <path d="M12 20V5" />
        <path d="M19 20v-10" />
      </>
    ),
  },
];

export function AppShell() {
  const { pathname } = useLocation();
  const showNav = !HIDDEN_NAV_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  return (
    <>
      <div>
        <Outlet />
      </div>
      {showNav && (
        <nav className="nav" aria-label="Main">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              aria-label={label}
              title={label}
              className={({ isActive }) => (isActive ? 'on' : undefined)}
            >
              <svg className="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                {icon}
              </svg>
            </NavLink>
          ))}
        </nav>
      )}
      <Grain />
    </>
  );
}

import { Link } from 'react-router-dom';
import type { AuthUser } from '../data';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2);

export function Header({ user, date }: { user: AuthUser | null; date?: Date }) {
  return (
    <header className="topbar rise">
      <div className="brand">
        <svg className="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18" />
        </svg>
        <span className="headline">Metabook</span>
      </div>
      <div className="topbar-end">
        {date && (
          <span className="topbar-date">
            {date.toLocaleDateString('en-GB', { weekday: 'long' })},{' '}
            {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
          </span>
        )}
        <Link to="/settings" className="avatar" aria-label="Profile and settings">
          {user ? initials(user.name) : ''}
        </Link>
      </div>
    </header>
  );
}

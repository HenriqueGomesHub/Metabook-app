import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function CloseButton({ to, label }: { to: string; label: string }) {
  return (
    <Link className="chip" to={to} aria-label={label}>
      <svg className="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M6 6l12 12" />
        <path d="M18 6 6 18" />
      </svg>
    </Link>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="chip chip-label">{children}</span>;
}

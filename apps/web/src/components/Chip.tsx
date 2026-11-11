import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

/**
 * The close chip. With `confirm`, the first tap only arms it ("Tap again to leave") for a few
 * seconds, so a stray tap mid-session does not throw away the cards still to retry.
 */
export function CloseButton({
  to,
  label,
  confirm,
}: {
  to: string;
  label: string;
  confirm?: boolean;
}) {
  const navigate = useNavigate();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  if (confirm) {
    return (
      <button
        type="button"
        className={armed ? 'chip chip-armed' : 'chip'}
        aria-label={armed ? `${label}: tap again` : label}
        onClick={() => (armed ? navigate(to) : setArmed(true))}
      >
        {armed ? (
          <span className="chip-confirm">Tap again to leave</span>
        ) : (
          <svg className="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12" />
            <path d="M18 6 6 18" />
          </svg>
        )}
      </button>
    );
  }
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

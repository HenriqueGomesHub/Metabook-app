import type { ReactNode } from 'react';

/** A labelled control with an inline error underneath. */
export function Field({
  label,
  error,
  wide,
  children,
}: {
  label: string;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field${wide ? ' field-wide' : ''}${error ? ' field-error' : ''}`}>
      <label>
        {label}
        {children}
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

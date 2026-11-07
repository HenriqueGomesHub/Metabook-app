import type { PickedTip } from '@metabook/core';

/** `main` is the answer's tip with its rotation count; `aside` boxes explain another option. */
export function TipBox({
  label,
  picked,
  variant = 'main',
}: {
  label: string;
  picked: PickedTip;
  variant?: 'main' | 'warn' | 'aside';
}) {
  return (
    <section className={`tipbox tipbox-${variant}`} aria-label={label}>
      <div className="tipbox-head">
        {variant === 'main' ? (
          <span className="tipbox-label">
            <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            {label}
          </span>
        ) : (
          <span className="tipbox-label">{label}</span>
        )}
        {variant === 'main' && (
          <span className="tipbox-count">
            Tip {picked.index + 1} of {picked.total}
          </span>
        )}
      </div>
      <p key={picked.tip.id} className="swap">
        {picked.tip.text}
      </p>
    </section>
  );
}

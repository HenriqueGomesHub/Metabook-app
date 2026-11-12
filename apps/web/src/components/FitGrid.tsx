import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './fit-grid.css';

/** More pages than this show as "3 / 12" instead of dots. */
const MAX_DOTS = 8;

/**
 * A grid that never scrolls: it shows as many items as fit in the space it is given and pages
 * through the rest (arrows, dots, the arrow keys or a swipe). The grid's own CSS decides the
 * columns; the count per page is measured from the first row. Where nothing can be measured (tests,
 * a hidden tab) every item is shown.
 */
export function FitGrid<T>({
  items,
  render,
  keyOf,
  className,
  label,
  reset,
  list = false,
}: {
  items: T[];
  render(item: T): ReactNode;
  keyOf(item: T): string;
  /** the grid's own class, which sets its columns and gaps */
  className: string;
  /** what the items are, for the pager's accessible name */
  label: string;
  /** back to the first page when this changes (a filter, a tab) */
  reset?: unknown;
  /** render as a list (ul / li) */
  list?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLElement>(null);
  const [perPage, setPerPage] = useState(items.length);
  const [page, setPage] = useState(0);
  const touch = useRef<number | null>(null);

  useLayoutEffect(() => setPage(0), [reset]);

  useLayoutEffect(() => {
    const outer = box.current;
    const inner = grid.current;
    if (!outer || !inner) return;
    const measure = () => {
      const height = outer.clientHeight;
      const first = inner.firstElementChild as HTMLElement | null;
      if (!height || !first) return setPerPage(items.length);
      const style = getComputedStyle(inner);
      const columns = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
      const gap = parseFloat(style.rowGap) || 0;
      // the tallest item of the first row sets the row height
      const row = Math.max(
        ...[...inner.children].slice(0, columns).map((c) => (c as HTMLElement).offsetHeight),
      );
      const rows = Math.max(1, Math.floor((height + gap) / (row + gap)));
      setPerPage(Math.max(1, Math.min(items.length, rows * columns)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [items.length]);

  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(page, pages - 1);
  const shown = items.slice(current * perPage, (current + 1) * perPage);
  const go = (to: number) => setPage(Math.max(0, Math.min(pages - 1, to)));

  return (
    <div
      className="fit"
      onKeyDown={(event) => {
        if (pages < 2 || (event.target as HTMLElement).closest('input, textarea, select')) return;
        if (event.key === 'ArrowRight' || event.key === 'PageDown') go(current + 1);
        else if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(current - 1);
      }}
      onTouchStart={(event) => (touch.current = event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        const start = touch.current;
        const end = event.changedTouches[0]?.clientX;
        touch.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 48) return;
        go(current + (end < start ? 1 : -1));
      }}
    >
      <div className="fit-box" ref={box}>
        {list ? (
          <ul
            className={`${className} fit-list`}
            ref={grid as React.RefObject<HTMLUListElement>}
            key={current}
          >
            {shown.map((item) => (
              <li key={keyOf(item)} className="fit-cell">
                {render(item)}
              </li>
            ))}
          </ul>
        ) : (
          <div className={className} ref={grid as React.RefObject<HTMLDivElement>} key={current}>
            {shown.map((item) => (
              <div key={keyOf(item)} className="fit-cell">
                {render(item)}
              </div>
            ))}
          </div>
        )}
      </div>
      {pages > 1 && (
        <nav className="fit-pager" aria-label={`${label} pages`}>
          <button
            type="button"
            className="fit-step"
            aria-label="Previous page"
            disabled={current === 0}
            onClick={() => go(current - 1)}
          >
            <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
          {pages > MAX_DOTS ? (
            <span className="fit-count" aria-live="polite">
              {current + 1} / {pages}
            </span>
          ) : (
            <div className="fit-dots">
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={i === current ? 'fit-dot on' : 'fit-dot'}
                  aria-label={`Page ${i + 1} of ${pages}`}
                  aria-current={i === current ? 'page' : undefined}
                  onClick={() => go(i)}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            className="fit-step"
            aria-label="Next page"
            disabled={current === pages - 1}
            onClick={() => go(current + 1)}
          >
            <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </nav>
      )}
    </div>
  );
}

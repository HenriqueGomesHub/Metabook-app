import type { ReactNode } from 'react';

/**
 * Items to choose from (drills, countries, chapters, games), all of them, in a list the page
 * scrolls. FitGrid's paging is for reading through explanations, not for picking.
 */
export function ItemList<T>({
  items,
  render,
  keyOf,
  className,
  label,
  list = false,
}: {
  items: T[];
  render(item: T): ReactNode;
  keyOf(item: T): string;
  /** the list's own class, which sets its columns and gaps */
  className: string;
  /** what the items are, for screen readers */
  label: string;
  /** render as a list (ul / li) */
  list?: boolean;
}) {
  if (list) {
    return (
      <ul className={`${className} item-list`} aria-label={label}>
        {items.map((item) => (
          <li key={keyOf(item)} className="item-cell">
            {render(item)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className={className} role="group" aria-label={label}>
      {items.map((item) => (
        <div key={keyOf(item)} className="item-cell">
          {render(item)}
        </div>
      ))}
    </div>
  );
}

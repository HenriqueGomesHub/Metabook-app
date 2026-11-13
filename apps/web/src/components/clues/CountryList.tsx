import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { label } from '../../app/labels';
import { ItemList } from '../ItemList';
import { FlagImage } from '../FlagImage';
import '../fit-grid.css';
import './clues.css';

/** Past this many names the list is cut to two lines whether or not it measured as overflowing. */
const ALWAYS_CUT = 10;

/**
 * Country names as one line of text, never more than two lines on screen: a longer list is cut
 * and "See all" opens every name with its flag on a sheet, paged to fit.
 */
export function CountryList({ codes, title }: { codes: string[]; title: string }) {
  const names = codes.map((code) => ({
    code: code.toUpperCase(),
    name: label(code.toUpperCase()),
  }));
  const box = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [codes]);
  const cut = overflows || names.length > ALWAYS_CUT;
  return (
    <>
      <span ref={box} className={cut ? 'country-list cut' : 'country-list'}>
        {names.map((n) => n.name).join(', ')}
      </span>
      {cut && (
        <button type="button" className="link country-list-all" onClick={() => setOpen(true)}>
          See all {names.length}
        </button>
      )}
      {open && <CountrySheet title={title} names={names} onClose={() => setOpen(false)} />}
    </>
  );
}

function CountrySheet({
  title,
  names,
  onClose,
}: {
  title: string;
  names: { code: string; name: string }[];
  onClose(): void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== ' ') return;
      // capture, so a session's own keys do not act behind the sheet
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const sorted = [...names].sort((a, b) => a.name.localeCompare(b.name));
  return createPortal(
    <div
      className="clue-sheet-back"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="clue-sheet country-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="clue-sheet-bar">
          <h3 className="country-sheet-title">
            {title} <span className="muted">· {names.length}</span>
          </h3>
          <button
            ref={closeRef}
            type="button"
            className="fit-step"
            aria-label="Close"
            onClick={onClose}
          >
            <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <ItemList
          className="country-sheet-grid"
          label="Countries"
          list
          items={sorted}
          keyOf={(n) => n.code}
          render={(n) => (
            <span className="country-sheet-name">
              <FlagImage code={n.code} alt="" />
              {n.name}
            </span>
          )}
        />
      </div>
    </div>,
    document.body,
  );
}

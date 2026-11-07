import { useEffect, useRef } from 'react';

/** Window keydown shortcuts, ignored while typing in a text field. */
export function useKeys(handler: (event: KeyboardEvent) => void, enabled = true) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      // A keydown a component already handled (or a held key) must not trigger a second action.
      if (event.defaultPrevented || event.repeat) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      latest.current(event);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

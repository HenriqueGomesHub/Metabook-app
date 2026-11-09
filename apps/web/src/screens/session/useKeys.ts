import { useLayoutEffect, useRef } from 'react';

/**
 * Window keydown shortcuts, ignored while typing in a text field. The listener is attached in a
 * layout effect, so it is live as soon as the view that shows the shortcuts is on screen: a passive
 * effect can run a frame later, and a key pressed in between would be lost.
 */
export function useKeys(handler: (event: KeyboardEvent) => void, enabled = true) {
  const latest = useRef(handler);
  latest.current = handler;
  useLayoutEffect(() => {
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

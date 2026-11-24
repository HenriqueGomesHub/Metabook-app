import { useEffect } from 'react';

const HREF =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@500;600&family=Noto+Sans+Devanagari:wght@500;600&family=Noto+Sans+Bengali:wght@500;600&family=Noto+Sans+KR:wght@500;600&display=swap';

/**
 * The fonts for Thai, Devanagari, Bengali and Hangul, loaded once the Languages pages open (the
 * rest of the app never needs them). Cyrillic and Greek are in the app's own fonts.
 */
export function useScriptFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${HREF}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = HREF;
    document.head.appendChild(link);
  }, []);
}

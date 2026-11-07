import type { ReactNode } from 'react';
import './play.css';

/**
 * One viewport-high layout for every card: the prompt fills `main`, the answer controls sit in
 * `side` (a right-hand column on desktop, below the prompt on phones). The reveal overlays `side`
 * and the controls under it fade out.
 */
export function Stage({
  main,
  side,
  reveal,
  variant,
}: {
  main: ReactNode;
  side: ReactNode;
  reveal: ReactNode;
  variant?: 'map';
}) {
  return (
    <main className={variant ? `play play-${variant}` : 'play'}>
      <div className="play-main">{main}</div>
      <div className={reveal ? 'play-side revealed' : 'play-side'}>
        <div className="play-side-inner">{side}</div>
        {reveal}
      </div>
    </main>
  );
}

export function Question({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <div className="play-q rise d1">
      {kicker && <p className="kicker">{kicker}</p>}
      <h1 className="headline">{children}</h1>
    </div>
  );
}

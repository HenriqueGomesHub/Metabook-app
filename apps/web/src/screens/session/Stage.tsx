import type { ReactNode } from 'react';
import './play.css';

/**
 * One viewport-high layout for every card: the prompt fills `main`, the answer controls sit in
 * `side` (a right-hand column on desktop, below the prompt on phones). The reveal takes `side`'s
 * place; on phones the prompt shrinks above it but stays in view, so the learner can look back at
 * what they answered. `map` and `top` put `side` above the prompt on phones (a map, a photo grid).
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
  variant?: 'map' | 'top';
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

export function Question({
  kicker,
  tone,
  children,
}: {
  kicker?: string;
  /** 'new': a lesson, not a question */
  tone?: 'new';
  children: ReactNode;
}) {
  return (
    <div className="play-q rise d1">
      {kicker && <p className={tone ? `kicker kicker-${tone}` : 'kicker'}>{kicker}</p>}
      <h1 className="headline">{children}</h1>
    </div>
  );
}

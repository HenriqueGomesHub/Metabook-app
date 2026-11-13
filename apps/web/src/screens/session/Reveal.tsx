import type { PickedTip, Tip } from '@metabook/core';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../components/Button';
import { useKeys } from './useKeys';

export type Tone = 'right' | 'wrong' | 'neutral';

export interface RevealProps {
  verdict: string;
  tone: Tone;
  /** one short line under the verdict, e.g. what was typed */
  detail?: string;
  /** the card's own reason, shown before the rotating tip */
  why?: string;
  /** more about the answer after the tips, e.g. the clue behind a clue card */
  extra?: ReactNode;
  /** the answer's tips, the one about this card first; arrows page through the rest */
  tips: Tip[];
  /** a tip about another option: the wrong pick, or the other lookalike */
  aside?: { label: string; tip: PickedTip };
  onNext(): void;
  /** each tip as it comes on screen, the first one included */
  onTipShown?(tip: Tip): void;
  nextLabel?: string;
}

/**
 * The explanation shown after an answer. It enters once the verdict animation on the options has
 * played: a bottom sheet on phones, a panel over the answer column on desktop. Continue takes
 * focus; Space or Enter advances.
 */
export function Reveal({
  verdict,
  tone,
  detail,
  why,
  extra,
  tips,
  aside,
  onNext,
  onTipShown,
  nextLabel = 'Continue',
}: RevealProps) {
  const id = useId();
  return (
    <section
      className={`reveal reveal-${tone}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={id}
    >
      <div className="reveal-body">
        <div className="reveal-head">
          <h2 id={id} className="headline">
            {verdict}
          </h2>
          {detail && <p>{detail}</p>}
        </div>
        {why && <p className="reveal-why">{why}</p>}
        {tips.length > 0 && <TipPager tips={tips} onShown={onTipShown} />}
        {extra}
        {/* the other option comes after everything about the answer */}
        {aside && (
          <section className="reveal-section" aria-label={aside.label}>
            <p className="reveal-label">{aside.label}</p>
            <p className="reveal-text">{aside.tip.tip.text}</p>
          </section>
        )}
      </div>
      <Button className="reveal-next" onClick={onNext} autoFocus>
        {nextLabel}
        <kbd>Space</kbd>
      </Button>
    </section>
  );
}

/**
 * The answer's tips in one box: a "Tip" label first, then the tip. Touch screens swipe between
 * tips (dots show how many); with a mouse, arrows sit at the box's edges. Left and right arrow
 * keys page too.
 */
/** Past this many tips, dots stop saying anything: the count alone shows where you are. */
const MAX_DOTS = 5;

function TipPager({ tips, onShown }: { tips: Tip[]; onShown?(tip: Tip): void }) {
  const [at, setAt] = useState(0);
  const tip = tips[Math.min(at, tips.length - 1)] as Tip;
  const many = tips.length > 1;
  const touch = useRef<number | null>(null);
  // the first tip counts as seen once, when the box opens
  const first = useRef(tips[0]);
  useEffect(() => {
    if (first.current) onShown?.(first.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per box
  }, []);
  function go(by: number) {
    const next = (at + by + tips.length) % tips.length;
    setAt(next);
    onShown?.(tips[next] as Tip);
  }
  useKeys((event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    go(event.key === 'ArrowLeft' ? -1 : 1);
  }, many);
  return (
    <section
      className={many ? 'tip-box many' : 'tip-box'}
      aria-roledescription={many ? 'carousel' : undefined}
      aria-label="Tips"
      onTouchStart={(event) => (touch.current = event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        const from = touch.current;
        const to = event.changedTouches[0]?.clientX;
        touch.current = null;
        if (!many || from === null || to === undefined || Math.abs(to - from) < 40) return;
        go(to < from ? 1 : -1);
      }}
    >
      <p className="reveal-label">
        <svg className="icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" />
        </svg>
        Tip
      </p>
      <div className="tip-stage">
        {many && (
          <button
            type="button"
            className="tip-step"
            aria-label="Previous tip"
            onClick={() => go(-1)}
          >
            <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        )}
        <p key={tip.id} className="tip-text swap">
          {tip.text}
        </p>
        {many && (
          <button type="button" className="tip-step" aria-label="Next tip" onClick={() => go(1)}>
            <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </div>
      {many && tips.length <= MAX_DOTS && (
        <span className="tip-dots" aria-hidden="true">
          {tips.map((t, i) => (
            <span key={t.id} className={i === at ? 'on' : undefined} />
          ))}
        </span>
      )}
    </section>
  );
}

/** Polite live region announcing the verdict; keep it mounted across cards. */
export function VerdictAnnouncer({ text }: { text: string }) {
  return (
    <p className="sr-only" aria-live="polite">
      {text}
    </p>
  );
}

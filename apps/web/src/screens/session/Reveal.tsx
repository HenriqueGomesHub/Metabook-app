import type { PickedTip, Tip } from '@metabook/core';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../components/Button';

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
        {aside && (
          <div className="reveal-aside">
            <p className="reveal-aside-label">{aside.label}</p>
            <p>{aside.tip.tip.text}</p>
          </div>
        )}
        {extra}
      </div>
      <Button className="reveal-next" onClick={onNext} autoFocus>
        {nextLabel}
        <kbd>Space</kbd>
      </Button>
    </section>
  );
}

/** The tips in one box, the first on show; back and next arrows under it step through all. */
function TipPager({ tips, onShown }: { tips: Tip[]; onShown?(tip: Tip): void }) {
  const [at, setAt] = useState(0);
  const tip = tips[Math.min(at, tips.length - 1)] as Tip;
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
  return (
    <div className="reveal-tip">
      <p key={tip.id} className="swap">
        {tip.text}
      </p>
      {tips.length > 1 && (
        <div className="reveal-meta tip-pager" role="group" aria-label="Tips">
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
          <span>
            Tip {at + 1} of {tips.length}
          </span>
          <button type="button" className="tip-step" aria-label="Next tip" onClick={() => go(1)}>
            <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
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

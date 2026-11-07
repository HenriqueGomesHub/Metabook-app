import type { PickedTip } from '@metabook/core';
import { useId } from 'react';
import { Button } from '../../components/Button';

export type Tone = 'right' | 'wrong' | 'neutral';

export interface RevealProps {
  verdict: string;
  tone: Tone;
  /** one short line under the verdict, e.g. what was typed */
  detail?: string;
  tip: PickedTip | null;
  /** a tip about another option: the wrong pick, or the other lookalike */
  aside?: { label: string; tip: PickedTip };
  onNext(): void;
  /** omit to hide the "Another tip" button */
  onAnotherTip?(): void;
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
  tip,
  aside,
  onNext,
  onAnotherTip,
  nextLabel = 'Continue',
}: RevealProps) {
  const id = useId();
  const rotates = onAnotherTip && (tip?.total ?? 0) > 1;
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
        {tip && (
          <div className="reveal-tip">
            <p key={tip.tip.id} className="swap">
              {tip.tip.text}
            </p>
            <div className="reveal-meta">
              <span>
                Tip {tip.index + 1} of {tip.total}
              </span>
              {rotates && (
                <button type="button" className="link" onClick={onAnotherTip}>
                  Another tip
                </button>
              )}
            </div>
          </div>
        )}
        {aside && (
          <div className="reveal-aside">
            <p className="reveal-aside-label">{aside.label}</p>
            <p>{aside.tip.tip.text}</p>
          </div>
        )}
      </div>
      <Button className="reveal-next" onClick={onNext} autoFocus>
        {nextLabel}
        <kbd>Space</kbd>
      </Button>
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

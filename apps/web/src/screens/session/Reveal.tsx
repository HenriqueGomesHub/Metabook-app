import type { PickedTip } from '@metabook/core';
import { Button } from '../../components/Button';
import { TipBox } from '../../components/TipBox';

export interface RevealProps {
  verdict: string;
  tone: 'right' | 'wrong' | 'neutral';
  /** the answer as a headline; when omitted the verdict labels the tip box instead */
  headline?: string;
  tip: PickedTip | null;
  aside?: { label: string; tip: PickedTip; variant: 'warn' | 'aside' };
  onNext(): void;
  /** omit to hide the "Another tip" button */
  onAnotherTip?(): void;
  nextLabel?: string;
}

export function Reveal({
  verdict,
  tone,
  headline,
  tip,
  aside,
  onNext,
  onAnotherTip,
  nextLabel = 'Next',
}: RevealProps) {
  return (
    <div className="reveal rise">
      {headline !== undefined && (
        <div className="reveal-head">
          <p className={`verdict verdict-${tone}`}>{verdict}</p>
          <h1 className="headline">{headline}</h1>
        </div>
      )}
      {headline === undefined && !tip && <p className={`verdict verdict-${tone}`}>{verdict}</p>}
      {tip && <TipBox label={headline === undefined ? verdict : 'Remember'} picked={tip} />}
      {aside && <TipBox label={aside.label} picked={aside.tip} variant={aside.variant} />}
      <div className="reveal-actions">
        <Button onClick={onNext} autoFocus>
          {nextLabel}
          <kbd>Space</kbd>
        </Button>
        {onAnotherTip && (tip?.total ?? 0) > 1 && (
          <Button variant="ghost" onClick={onAnotherTip}>
            Another tip
          </Button>
        )}
      </div>
    </div>
  );
}

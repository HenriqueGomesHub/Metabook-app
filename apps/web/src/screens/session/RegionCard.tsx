import { Options } from './Options';
import { Prompt } from './Prompt';
import { Question, Stage } from './Stage';
import { TypedAnswer } from './TypedAnswer';
import type { CardProps } from './types';

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function RegionCard({ card, mode, options, outcome, onAnswer, reveal }: CardProps) {
  return (
    <Stage
      main={
        <div className="scene settle" style={{ '--ar': 16 / 10 } as React.CSSProperties}>
          <Prompt prompt={card.prompt} alt="Street scene to place" />
        </div>
      }
      side={
        <>
          <Question kicker={regionNames.of(card.country) ?? card.country}>Which region?</Question>
          {mode === 'recall' ? (
            <TypedAnswer
              label="Region"
              placeholder="Type a region"
              outcome={outcome}
              onAnswer={onAnswer}
            />
          ) : (
            <Options
              options={options}
              answer={card.answer}
              outcome={outcome}
              onPick={onAnswer}
              className="options options-compact rise d2"
            />
          )}
        </>
      }
      reveal={reveal}
    />
  );
}

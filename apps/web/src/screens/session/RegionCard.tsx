import { Options } from './Options';
import { Prompt } from './Prompt';
import { TypedAnswer } from './TypedAnswer';
import type { CardProps } from './types';

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function RegionCard({ card, mode, options, outcome, onAnswer, reveal }: CardProps) {
  return (
    <main className="stage stage-split">
      <div className="scene scene-16x10 settle">
        <Prompt prompt={card.prompt} alt="Street scene to place" />
      </div>
      <section className="stage-side">
        <div className="rise d1">
          <p className="kicker">{regionNames.of(card.country) ?? card.country}</p>
          <h1 className="headline question">Which region?</h1>
        </div>
        {mode === 'recall' ? (
          !outcome && <TypedAnswer label="Region" placeholder="Type a region" onAnswer={onAnswer} />
        ) : (
          <Options
            options={options}
            answer={card.answer}
            outcome={outcome}
            onPick={onAnswer}
            className="options options-compact rise d2"
          />
        )}
        {reveal}
      </section>
    </main>
  );
}

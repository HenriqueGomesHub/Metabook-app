import { Options } from './Options';
import type { CardProps } from './types';

/** Multiple-choice stand-in for the map game: pick the state (UF) for an area code. */
export function AreaCodeCard({ card, options, outcome, onAnswer, reveal }: CardProps) {
  return (
    <main className="stage stage-medium">
      <figure className="areacode-figure">
        <div className="areacode headline pop-in">{card.prompt.value}</div>
        <figcaption className="rise d1">Which state has this area code?</figcaption>
      </figure>
      <Options
        options={options}
        answer={card.answer}
        outcome={outcome}
        onPick={onAnswer}
        className="options options-grid rise d2"
      />
      {reveal}
    </main>
  );
}

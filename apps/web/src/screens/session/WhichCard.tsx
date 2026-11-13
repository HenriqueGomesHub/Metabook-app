import { label } from '../../app/labels';
import { ClueImg } from '../../components/clues/ClueImg';
import { Mark, optionState } from './Mark';
import { Question, Stage } from './Stage';
import type { CardProps } from './types';
import { useKeys } from './useKeys';

/**
 * Which clue: "Which is the Poland bollard?" over a 2×2 grid of same-family images from different
 * countries; keys 1–4 pick. Once answered every image names its country.
 */
export function WhichCard({ card, options, outcome, onAnswer, reveal }: CardProps) {
  useKeys((event) => {
    const option = options[Number(event.key) - 1];
    if (option !== undefined) onAnswer(option);
  }, outcome === null);
  const choices = card.clue?.choices ?? [];

  return (
    <Stage
      variant="top"
      main={
        <div className="photo-grid settle">
          {options.map((id, i) => {
            const choice = choices.find((c) => c.image.id === id);
            const { state, mark } = optionState(id, card.answer, outcome?.given);
            return (
              <div key={id} className={`photo-opt ${state}`}>
                <button
                  type="button"
                  className="photo"
                  disabled={outcome !== null}
                  onClick={() => onAnswer(id)}
                  aria-label={`Image ${i + 1}`}
                >
                  {choice ? (
                    <ClueImg image={choice.image} alt="" fit="cover" cropped />
                  ) : (
                    <span className="photo-missing">Image unavailable</span>
                  )}
                  <kbd>{i + 1}</kbd>
                  {mark && <Mark kind={mark} />}
                </button>
                {outcome !== null && choice && (
                  <p className="photo-caption">
                    <span>{label(choice.country)}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      }
      side={<Question kicker="Which clue">{card.prompt.value}</Question>}
      reveal={reveal}
    />
  );
}

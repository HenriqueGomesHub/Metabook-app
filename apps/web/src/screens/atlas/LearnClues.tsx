import { byStep } from '@metabook/core';
import type { ClueCountry } from '@metabook/core';
import { ArrowIcon, LinkButton } from '../../components/Button';
import { ClueDetails } from '../../components/clues/ClueDetails';
import { SignInPrompt } from '../../components/clues/SignInPrompt';

/**
 * A country's clues to read before drilling, in Plonk It's order with its steps as headings. The
 * Study button runs the country's clue cards (Spot it, Which clue, Live view).
 */
export function LearnClues({
  catalogue,
  name,
  code,
  studyCount,
  signedIn,
}: {
  catalogue: ClueCountry | undefined;
  name: string;
  code: string;
  /** the country's clue cards that practice can draw */
  studyCount: number;
  signedIn: boolean;
}) {
  if (!signedIn) {
    return (
      <section className="learn rise d3" aria-labelledby="learn-heading">
        <div className="learn-head">
          <h2 id="learn-heading" className="headline">
            Learn
          </h2>
        </div>
        <SignInPrompt />
      </section>
    );
  }
  if (!catalogue || catalogue.clues.length === 0) return null;
  const steps = catalogue.steps
    .map((step, index) => ({
      title: step.title,
      clues: catalogue.clues.filter((clue) => clue.step === index).sort(byStep),
    }))
    .filter((step) => step.clues.length > 0);
  const unplaced = catalogue.clues.filter((clue) => !catalogue.steps[clue.step]).sort(byStep);
  if (unplaced.length > 0) steps.push({ title: 'More clues', clues: unplaced });

  return (
    <section className="learn rise d3" aria-labelledby="learn-heading">
      <div className="learn-head learn-head-row">
        <div>
          <h2 id="learn-heading" className="headline">
            Learn
          </h2>
          <p>
            What gives {name} away, from{' '}
            <a href={catalogue.sourceUrl} target="_blank" rel="noreferrer noopener">
              Plonk It
            </a>
          </p>
        </div>
        {studyCount > 0 && (
          <LinkButton to={`/session?country=${code}&src=clues`}>
            Study these clues
            <ArrowIcon />
          </LinkButton>
        )}
      </div>
      {steps.map((step) => (
        <div key={step.title} className="learn-group">
          <h3>{step.title}</h3>
          <ul className="learn-list learn-clues">
            {step.clues.map((clue) => (
              <li key={clue.id} className="learn-card">
                <ClueDetails clue={clue} heading="h4" teachSame />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

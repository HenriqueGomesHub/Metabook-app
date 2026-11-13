import { byStep, distinctImages } from '@metabook/core';
import type { Clue, ClueCountry } from '@metabook/core';
import { useState } from 'react';
import { ArrowIcon, LinkButton } from '../../components/Button';
import { clueHeading, clueLead } from '../../components/clues/ClueDetails';
import { ClueImg } from '../../components/clues/ClueImg';
import { ClueSheet } from '../../components/clues/ClueSheet';
import { SignInPrompt } from '../../components/clues/SignInPrompt';
import { FitGrid } from '../../components/FitGrid';
import { useClueText } from '../../data/clueText';

/**
 * A country's clues to read before drilling, in Plonk It's order, one step at a time. Each clue is
 * a small card paged to fit the screen; opening one shows all of it (text, pictures, the full
 * Plonk It text) on a sheet, with left and right through the step. The Study button runs the
 * country's clue cards (Spot it, Which clue, Live view).
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
  const [chosen, setChosen] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  if (!signedIn) {
    return (
      <section className="learn" aria-labelledby="learn-heading">
        <h2 id="learn-heading" className="sr-only">
          Learn
        </h2>
        <SignInPrompt />
      </section>
    );
  }
  if (!catalogue || catalogue.clues.length === 0) {
    return (
      <section className="learn" aria-labelledby="learn-heading">
        <h2 id="learn-heading" className="sr-only">
          Learn
        </h2>
        <p className="muted">No clues written for {name} yet.</p>
      </section>
    );
  }
  const steps = catalogue.steps
    .map((step, index) => ({
      title: step.title,
      clues: catalogue.clues.filter((clue) => clue.step === index).sort(byStep),
    }))
    .filter((step) => step.clues.length > 0);
  const unplaced = catalogue.clues.filter((clue) => !catalogue.steps[clue.step]).sort(byStep);
  if (unplaced.length > 0) steps.push({ title: 'More clues', clues: unplaced });
  const step = steps[Math.min(chosen, steps.length - 1)] ?? steps[0];
  if (!step) return null;
  const opened = open === null ? undefined : step.clues[open];

  return (
    <section className="learn" aria-labelledby="learn-heading">
      <h2 id="learn-heading" className="sr-only">
        Learn
      </h2>
      <div className="learn-bar">
        {steps.length > 1 ? (
          <label className="learn-steps">
            <span className="sr-only">Step</span>
            <select
              value={steps.indexOf(step)}
              onChange={(event) => {
                setChosen(Number(event.target.value));
                setOpen(null);
              }}
            >
              {steps.map((s, i) => (
                <option key={s.title} value={i}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="learn-steps">{step.title}</span>
        )}
        <span className="learn-source">
          From{' '}
          <a href={catalogue.sourceUrl} target="_blank" rel="noreferrer noopener">
            Plonk It
          </a>
        </span>
        {studyCount > 0 && (
          <LinkButton to={`/session?country=${code}&src=clues`}>
            Study these clues
            <ArrowIcon />
          </LinkButton>
        )}
      </div>
      <h3 className="sr-only">{step.title}</h3>
      <FitGrid
        className="learn-list"
        label={step.title}
        items={step.clues}
        reset={step.title}
        keyOf={(clue) => clue.id}
        render={(clue) => <ClueCard clue={clue} onOpen={() => setOpen(step.clues.indexOf(clue))} />}
      />
      {opened && open !== null && (
        <ClueSheet
          clue={opened}
          index={open}
          count={step.clues.length}
          onStep={(by) => setOpen((i) => ((i ?? 0) + by + step.clues.length) % step.clues.length)}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

/** A clue at a glance: its first picture, title, region and lead, opening the whole clue. */
function ClueCard({ clue, onOpen }: { clue: Clue; onOpen(): void }) {
  const lead = clueLead(clue, useClueText(clue));
  const [image] = distinctImages(clue.images);
  return (
    <button type="button" className="learn-card" onClick={onOpen}>
      {image && (
        <span className="learn-thumb">
          <ClueImg image={image} alt="" fit="cover" />
        </span>
      )}
      <span className="learn-card-text">
        <span className="learn-card-title">{clueHeading(clue)}</span>
        {clue.region && <span className="learn-region">{clue.region}</span>}
        {lead && <span className="learn-lead">{lead.lead}</span>}
      </span>
    </button>
  );
}

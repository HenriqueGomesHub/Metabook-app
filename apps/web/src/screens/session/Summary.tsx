import type { Card } from '@metabook/core';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CARD_TYPES } from '../../app/cardTypes';
import { label, scopeOf, SUBJECTS } from '../../app/labels';
import { useKeys } from './useKeys';

/** One answer given in a session or drill; `retry` marks a missed card asked again. */
export interface Answer {
  cardId: string;
  correct: boolean;
  retry?: boolean;
}

/** Where a drill stands: its pass and the cards learnt in it. */
export interface DrillProgress {
  pass: number;
  learnt: number;
  total: number;
}

const MISSED_SHOWN = 6;
const RING = 2 * Math.PI * 52;

/** What a missed card was about, in a few words: the answer, and the kind of clue. */
function describe(card: Card): { name: string; kind: string } {
  const kind = card.subject ? SUBJECTS[card.subject].label : CARD_TYPES[card.type].label;
  if (card.type === 'areacode') {
    return { name: `${card.prompt.value} · ${label(card.answer, scopeOf(card))}`, kind };
  }
  const name = card.clue ? label(card.country) : label(card.answer, scopeOf(card));
  return { name, kind };
}

function longestRun(answers: Answer[]): number {
  let best = 0;
  let run = 0;
  for (const a of answers) {
    run = a.correct ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

/**
 * The end of a session or drill: the score on first tries as a ring, what it took, the cards that
 * were missed (to look at again), a drill's pass progress, and what to do next.
 */
export function Summary({
  kicker,
  answers,
  cards,
  startedAt,
  progress,
  actions,
  spaceTo,
}: {
  kicker: string;
  answers: Answer[];
  cards: Card[];
  startedAt: number;
  progress?: DrillProgress;
  actions: ReactNode;
  /** where Space leads, if anywhere */
  spaceTo?: string;
}) {
  const navigate = useNavigate();
  useKeys((event) => {
    if (event.key !== ' ' || !spaceTo) return;
    event.preventDefault();
    navigate(spaceTo);
  });

  const first = answers.filter((a) => !a.retry);
  const right = first.filter((a) => a.correct).length;
  const score = first.length > 0 ? Math.round((right / first.length) * 100) : 0;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const missedIds = [...new Set(answers.filter((a) => !a.correct).map((a) => a.cardId))];
  // missed, then answered right later on
  const fixed = missedIds.filter((id) => {
    const firstMiss = answers.findIndex((a) => a.cardId === id && !a.correct);
    return answers.slice(firstMiss + 1).some((a) => a.cardId === id && a.correct);
  }).length;
  const missed = missedIds.flatMap((id) => {
    const card = byId.get(id);
    return card ? [{ id, ...describe(card) }] : [];
  });
  const streak = longestRun(answers);
  const tone =
    score >= 90
      ? 'Sharp.'
      : score >= 70
        ? 'Solid.'
        : score >= 40
          ? 'Getting there.'
          : 'Keep at it.';

  const facts = [
    `${first.length} ${first.length === 1 ? 'card' : 'cards'}`,
    `${right} right first time`,
    ...(fixed > 0 ? [`${fixed} fixed on retry`] : []),
    duration(Date.now() - startedAt),
  ];

  return (
    <main className="stage stage-narrow summary summary-full">
      <div className="summary-head rise">
        <p className="kicker">{kicker}</p>
        {first.length === 0 ? (
          <h1 className="headline summary-empty">No cards answered</h1>
        ) : (
          <div className="summary-score">
            <svg className="summary-ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle className="summary-ring-track" cx="60" cy="60" r="52" />
              <circle
                className="summary-ring-fill"
                cx="60"
                cy="60"
                r="52"
                strokeDasharray={RING}
                style={{ strokeDashoffset: RING * (1 - score / 100) }}
              />
            </svg>
            <h1 className="headline summary-number" aria-label={`${score}% right first time`}>
              {score}
              <span>%</span>
            </h1>
          </div>
        )}
        {first.length > 0 && <p className="summary-tone headline">{tone}</p>}
      </div>

      {first.length > 0 && (
        <ul className="summary-facts rise d1">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
          {streak >= 5 && <li className="summary-streak">Best run {streak}</li>}
        </ul>
      )}

      {progress && (
        <section className="summary-panel rise d1" aria-label="Drill progress">
          <div className="summary-panel-head">
            <span>Pass {progress.pass}</span>
            <span>
              {progress.learnt} of {progress.total} learnt
            </span>
          </div>
          <div
            className="summary-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.learnt}
            aria-label={`${progress.learnt} of ${progress.total} learnt`}
          >
            <div
              style={{ width: `${progress.total ? (progress.learnt / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="summary-panel-note">
            {progress.learnt >= progress.total
              ? 'Every card learnt this pass. Keep going to start the next one.'
              : 'Keep going until every card is learnt, then the drill starts a new pass.'}
          </p>
        </section>
      )}

      {missed.length > 0 && (
        <section className="summary-panel rise d2" aria-label="Missed cards">
          <div className="summary-panel-head">
            <span>To look at again</span>
            <span>{missed.length}</span>
          </div>
          <ul className="summary-missed">
            {missed.slice(0, MISSED_SHOWN).map((m) => (
              <li key={m.id}>
                <span className="summary-missed-name">{m.name}</span>
                <span className="summary-missed-kind">{m.kind}</span>
              </li>
            ))}
          </ul>
          {missed.length > MISSED_SHOWN && (
            <p className="summary-panel-note">and {missed.length - MISSED_SHOWN} more</p>
          )}
        </section>
      )}

      <div className="summary-actions rise d2">{actions}</div>
    </main>
  );
}

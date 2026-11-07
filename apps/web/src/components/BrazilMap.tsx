import type { Card } from '@metabook/core';
import type { KeyboardEvent } from 'react';
import { brStates } from '../data/content';
import './brazil-map.css';

/** Small states get their label outside the map, joined by a leader line. */
const CALLOUTS: Record<string, [number, number]> = {
  RN: [600, 152],
  PB: [600, 174],
  PE: [600, 196],
  AL: [600, 218],
  SE: [600, 240],
  ES: [512, 360],
  RJ: [474, 420],
  DF: [410, 284],
};

export const stateByCode = new Map(brStates.states.map((s) => [s.code, s]));

/** First digits of each state's area codes, from the area-code cards. */
export function digitGroups(cards: Card[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const card of cards) {
    if (card.type !== 'areacode') continue;
    const set = map.get(card.answer) ?? new Set<string>();
    set.add(card.prompt.value.charAt(0));
    map.set(card.answer, set);
  }
  return map;
}

/** States sharing a first area-code digit with `answer`, tinted on reveal. */
export function groupOf(answer: string, digits: Map<string, Set<string>>): Set<string> {
  const mine = digits.get(answer) ?? new Set<string>();
  return new Set(
    [...digits].filter(([, set]) => [...set].some((d) => mine.has(d))).map(([code]) => code),
  );
}

export interface MapReveal {
  answer: string;
  picked: string;
  /** states in the answer's digit group */
  group: ReadonlySet<string>;
}

/**
 * Brazil on real borders. Every state (and the callout labels of small ones) is a keyboard
 * pickable button until `reveal` is set; then the answer, the pick and the answer's digit group
 * are coloured and a trail runs from the pick to the answer.
 */
export function BrazilMap({
  reveal,
  onPick,
  onHover,
  className = 'ddd-map',
}: {
  reveal?: MapReveal;
  onPick(code: string): void;
  onHover(code: string | null): void;
  className?: string;
}) {
  const locked = Boolean(reveal);
  const pickedState = reveal && stateByCode.get(reveal.picked);
  const answerState = reveal && stateByCode.get(reveal.answer);
  const right = reveal ? reveal.picked === reveal.answer : false;

  function onKey(event: KeyboardEvent, code: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!locked) onPick(code);
  }

  const stateClass = (code: string) => {
    if (!reveal) return 'ddd-state';
    if (code === reveal.answer) return 'ddd-state lock ans';
    if (code === reveal.picked) return 'ddd-state lock pick';
    return `ddd-state lock ${reveal.group.has(code) ? 'grp' : 'dim'}`;
  };

  return (
    <svg
      className={className}
      role="group"
      aria-label="Map of Brazil with state borders"
      viewBox={brStates.viewBox}
    >
      {brStates.states.map((state) => (
        <path
          key={state.code}
          className={stateClass(state.code)}
          d={state.path}
          role="button"
          tabIndex={locked ? -1 : 0}
          aria-label={state.name}
          aria-disabled={locked ? true : undefined}
          onClick={() => !locked && onPick(state.code)}
          onKeyDown={(event) => onKey(event, state.code)}
          onMouseEnter={() => onHover(state.code)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(state.code)}
          onBlur={() => onHover(null)}
        />
      ))}
      {brStates.states.map((state) => {
        const callout = CALLOUTS[state.code];
        if (!callout) return null;
        const [x, y] = state.label.length >= 2 ? [state.label[0], state.label[1]] : [0, 0];
        return (
          <path
            key={state.code}
            className="ddd-lead"
            d={`M${x} ${y}L${callout[0] - 16} ${callout[1] - 4}`}
          />
        );
      })}
      {brStates.states.map((state) => {
        const callout = CALLOUTS[state.code];
        const onAnswer = state.code === reveal?.answer;
        const classes = ['ddd-label', callout && 'callout', onAnswer && 'on']
          .filter(Boolean)
          .join(' ');
        return (
          <text
            key={state.code}
            className={classes}
            aria-hidden="true"
            x={callout ? callout[0] : state.label[0]}
            y={callout ? callout[1] : (state.label[1] ?? 0) + 4}
          >
            {state.code}
          </text>
        );
      })}
      {brStates.states.map((state) => {
        const callout = CALLOUTS[state.code];
        if (!callout) return null;
        // the label itself ignores the pointer; this invisible box makes it pickable
        return (
          <rect
            key={state.code}
            className={locked ? 'ddd-hit lock' : 'ddd-hit'}
            aria-hidden="true"
            x={callout[0] - 4}
            y={callout[1] - 12}
            width={26}
            height={16}
            onClick={() => !locked && onPick(state.code)}
            onMouseEnter={() => onHover(state.code)}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}
      {pickedState && answerState && (
        <>
          {!right && (
            <>
              <path
                className="ddd-trail"
                pathLength={1}
                d={`M${pickedState.capital.xy[0]} ${pickedState.capital.xy[1]}L${answerState.capital.xy[0]} ${answerState.capital.xy[1]}`}
              />
              <circle
                className="ddd-pin"
                cx={pickedState.capital.xy[0]}
                cy={pickedState.capital.xy[1]}
                r="5"
                fill="var(--ink)"
                stroke="var(--bg)"
                strokeWidth="2"
              />
            </>
          )}
          <circle
            className="ddd-pin late"
            cx={answerState.capital.xy[0]}
            cy={answerState.capital.xy[1]}
            r="6"
            fill="var(--bg)"
            stroke="var(--ink)"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );
}

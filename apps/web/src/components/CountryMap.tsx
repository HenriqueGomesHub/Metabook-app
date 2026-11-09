import type { KeyboardEvent } from 'react';
import type { RegionMap } from '../data/content';
import './country-map.css';

export interface MapReveal {
  answer: string;
  picked: string;
  /** regions tinted with the answer, e.g. the states sharing its first area-code digit */
  group: ReadonlySet<string>;
}

/**
 * A country on real borders, from any regions file (br-states.json or <code>-regions.json).
 * Every region (and the callout label of a small one) is a keyboard-pickable button until
 * `reveal` is set; then the answer, the pick and the group are coloured and a trail runs from
 * the pick to the answer (capital to capital, or label to label where there is no capital).
 */
export function CountryMap({
  map,
  label,
  callouts = {},
  reveal,
  onPick,
  onHover,
  className = 'ddd-map',
}: {
  map: RegionMap;
  /** accessible label, e.g. "Map of Poland with region borders" */
  label: string;
  /** small regions get their label outside the map at these points, joined by a leader line */
  callouts?: Record<string, [number, number]>;
  reveal?: MapReveal;
  onPick(code: string): void;
  onHover(code: string | null): void;
  className?: string;
}) {
  const locked = Boolean(reveal);
  const byCode = new Map(map.states.map((s) => [s.code, s]));
  const pickedRegion = reveal && byCode.get(reveal.picked);
  const answerRegion = reveal && byCode.get(reveal.answer);
  const right = reveal ? reveal.picked === reveal.answer : false;
  const point = (region: RegionMap['states'][number]) => region.capital?.xy ?? region.label;

  function onKey(event: KeyboardEvent, code: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!locked) onPick(code);
  }

  const regionClass = (code: string) => {
    if (!reveal) return 'ddd-state';
    if (code === reveal.answer) return 'ddd-state lock ans';
    if (code === reveal.picked) return 'ddd-state lock pick';
    return `ddd-state lock ${reveal.group.has(code) ? 'grp' : 'dim'}`;
  };

  return (
    <svg className={className} role="group" aria-label={label} viewBox={map.viewBox}>
      {map.states.map((region) => (
        <path
          key={region.code}
          className={regionClass(region.code)}
          d={region.path}
          role="button"
          tabIndex={locked ? -1 : 0}
          aria-label={region.name}
          aria-disabled={locked ? true : undefined}
          onClick={() => !locked && onPick(region.code)}
          onKeyDown={(event) => onKey(event, region.code)}
          onMouseEnter={() => onHover(region.code)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(region.code)}
          onBlur={() => onHover(null)}
        />
      ))}
      {map.states.map((region) => {
        const callout = callouts[region.code];
        if (!callout) return null;
        const [x, y] = region.label.length >= 2 ? [region.label[0], region.label[1]] : [0, 0];
        return (
          <path
            key={region.code}
            className="ddd-lead"
            d={`M${x} ${y}L${callout[0] - 16} ${callout[1] - 4}`}
          />
        );
      })}
      {map.states.map((region) => {
        const callout = callouts[region.code];
        const onAnswer = region.code === reveal?.answer;
        const classes = ['ddd-label', callout && 'callout', onAnswer && 'on']
          .filter(Boolean)
          .join(' ');
        return (
          <text
            key={region.code}
            className={classes}
            aria-hidden="true"
            x={callout ? callout[0] : region.label[0]}
            y={callout ? callout[1] : (region.label[1] ?? 0) + 4}
          >
            {region.code}
          </text>
        );
      })}
      {map.states.map((region) => {
        const callout = callouts[region.code];
        if (!callout) return null;
        // the label itself ignores the pointer; this invisible box makes it pickable
        return (
          <rect
            key={region.code}
            className={locked ? 'ddd-hit lock' : 'ddd-hit'}
            aria-hidden="true"
            x={callout[0] - 4}
            y={callout[1] - 12}
            width={26}
            height={16}
            onClick={() => !locked && onPick(region.code)}
            onMouseEnter={() => onHover(region.code)}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}
      {pickedRegion && answerRegion && (
        <>
          {!right && (
            <>
              <path
                className="ddd-trail"
                pathLength={1}
                d={`M${point(pickedRegion)[0]} ${point(pickedRegion)[1]}L${point(answerRegion)[0]} ${point(answerRegion)[1]}`}
              />
              <circle
                className="ddd-pin"
                cx={point(pickedRegion)[0]}
                cy={point(pickedRegion)[1]}
                r="5"
                fill="var(--ink)"
                stroke="var(--bg)"
                strokeWidth="2"
              />
            </>
          )}
          <circle
            className="ddd-pin late"
            cx={point(answerRegion)[0]}
            cy={point(answerRegion)[1]}
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

import { useState, type KeyboardEvent } from 'react';
import type { RegionMap } from '../data/content';
import './country-map.css';

/** Area codes written under a region on reveal, at most; more show as "+n". */
const MAX_NUMBERS = 3;

export interface MapReveal {
  answer: string;
  picked: string;
  /** regions tinted with the answer, e.g. the states sharing its first area-code digit */
  group: ReadonlySet<string>;
}

/**
 * A country on real borders, from any regions file (br-states.json or <code>-regions.json).
 * Far islands drawn apart from the mainland sit in thin inset frames.
 * Every region (and the callout label of a small one) is a keyboard-pickable button until
 * `reveal` is set; then the answer, the pick and the group are coloured and a trail runs from
 * the pick to the answer (capital to capital, or label to label where there is no capital).
 */
export function CountryMap({
  map,
  label,
  callouts = {},
  reveal,
  numbers,
  zones,
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
  /**
   * Each region's area codes, written under its label once answered, so the whole pattern is
   * seen at once (Poland: 81 under LU, 52 56 under KP…)
   */
  numbers?: Record<string, string[]>;
  /**
   * Regions that are answered as one area (France's 04 covers 24 departments): region -> the
   * area's key region. A pick anywhere in an area picks its key region, the area is drawn and
   * hovered as one, and its regions carry no labels of their own.
   */
  zones?: Record<string, string>;
  onPick(code: string): void;
  onHover(code: string | null): void;
  className?: string;
}) {
  const locked = Boolean(reveal);
  const [hotZone, setHotZone] = useState<string | null>(null);
  const zoneOf = (code: string) => zones?.[code];
  const keyOf = (code: string) => zoneOf(code) ?? code;
  const zoneIndex = new Map([...new Set(Object.values(zones ?? {}))].map((z, i) => [z, i]));
  const pick = (code: string) => onPick(keyOf(code));
  const hover = (code: string | null) => {
    const zone = code ? zoneOf(code) : undefined;
    setHotZone(zone ?? null);
    // an area has no single name to show: the region's own name would mislead
    onHover(zone ? null : code);
  };
  const byCode = new Map(map.states.map((s) => [s.code, s]));
  const pickedRegion = reveal && byCode.get(reveal.picked);
  const answerRegion = reveal && byCode.get(reveal.answer);
  const right = reveal ? reveal.picked === reveal.answer : false;
  const point = (region: RegionMap['states'][number]) => region.capital?.xy ?? region.label;

  function onKey(event: KeyboardEvent, code: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!locked) pick(code);
  }

  const regionClass = (code: string) => {
    const zone = zoneOf(code);
    const area = zone ? ` zone z${(zoneIndex.get(zone) ?? 0) % 4}` : '';
    if (!reveal) return `ddd-state${area}${zone && zone === hotZone ? ' hot' : ''}`;
    const key = keyOf(code);
    if (key === reveal.answer) return `ddd-state lock ans${area}`;
    if (key === reveal.picked) return `ddd-state lock pick${area}`;
    return `ddd-state lock ${reveal.group.has(code) ? 'grp' : 'dim'}${area}`;
  };

  return (
    <svg className={className} role="group" aria-label={label} viewBox={map.viewBox}>
      {map.insets?.map((inset) => (
        <rect
          key={`${inset.x},${inset.y}`}
          className="ddd-inset"
          aria-hidden="true"
          x={inset.x}
          y={inset.y}
          width={inset.w}
          height={inset.h}
        />
      ))}
      {map.states.map((region) => (
        <path
          key={region.code}
          className={regionClass(region.code)}
          d={region.path}
          role="button"
          tabIndex={locked ? -1 : 0}
          aria-label={region.name}
          aria-disabled={locked ? true : undefined}
          onClick={() => !locked && pick(region.code)}
          onKeyDown={(event) => onKey(event, region.code)}
          onMouseEnter={() => hover(region.code)}
          onMouseLeave={() => hover(null)}
          onFocus={() => hover(region.code)}
          onBlur={() => hover(null)}
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
        // a region inside an area has no label: France's department numbers look like area codes
        if (zoneOf(region.code)) return null;
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
      {reveal &&
        numbers &&
        map.states.map((region) => {
          const codes = numbers[region.code];
          if (!codes?.length) return null;
          const callout = callouts[region.code];
          const shown =
            codes.length > MAX_NUMBERS
              ? `${codes.slice(0, MAX_NUMBERS).join(' ')} +${codes.length - MAX_NUMBERS}`
              : codes.join(' ');
          const classes = [
            'ddd-num',
            callout && 'callout',
            region.code === reveal.answer && 'on',
            reveal.group.has(region.code) && 'grp',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <text
              key={region.code}
              className={classes}
              aria-hidden="true"
              x={callout ? callout[0] : region.label[0]}
              y={(callout ? callout[1] : (region.label[1] ?? 0) + 4) + 11}
            >
              {shown}
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
            onClick={() => !locked && pick(region.code)}
            onMouseEnter={() => hover(region.code)}
            onMouseLeave={() => hover(null)}
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

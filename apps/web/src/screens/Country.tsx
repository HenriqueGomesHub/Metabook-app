import { mastery, medalFor } from '@metabook/core';
import type { Card } from '@metabook/core';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { ArrowIcon, LinkButton } from '../components/Button';
import { Header } from '../components/Header';
import { Status } from '../components/Status';
import { answerLabel, pct, WEAK } from './atlas/format';
import { MedalPill } from './atlas/MedalPill';
import './atlas/atlas.css';

const RING_LENGTH = 176;
const TOP_MISSES = 3;

const STEPS = [
  { title: 'Learn', sub: 'Study a chapter here, in order' },
  { title: 'Drill', sub: 'Every card you learn joins your deck' },
  { title: 'Mix', sub: 'It comes back inside Today, mixed with everything else' },
];

export function Country() {
  const { data, error } = useAppData();
  const { country = '' } = useParams();
  return data ? <CountryView data={data} code={country.toUpperCase()} /> : <Status error={error} />;
}

function chapterLink(id: string): string {
  return id === 'br:areacodes'
    ? '/games/areacode/br'
    : `/session?chapter=${encodeURIComponent(id)}`;
}

function CountryView({ data, code }: { data: AppSnapshot; code: string }) {
  const now = useMemo(() => new Date(), []);
  const [focus, setFocus] = useState(false);
  const country = data.content.pool.find((c) => c.code === code);

  const view = useMemo(() => {
    const cards = data.content.cards.filter((card) => card.country === code);
    const ids = cards.map((card) => card.id);
    const byChapter = (chapter: string): Card[] => cards.filter((card) => card.chapter === chapter);
    const chapters = data.content.chapters
      .filter((chapter) => chapter.country === code)
      .sort((a, b) => a.order - b.order)
      .map((chapter) => {
        const chapterIds = byChapter(chapter.id).map((card) => card.id);
        return {
          ...chapter,
          cardCount: chapterIds.length,
          value: mastery(chapterIds, data.states, now),
        };
      });
    const answers = new Set(cards.map((card) => card.answer));
    const misses = data.confusions
      .filter((c) => answers.has(c.truth) && c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_MISSES);
    const due = ids.filter((id) => {
      const state = data.states[id];
      return state && state.state !== 'new' && Date.parse(state.due) <= now.getTime();
    }).length;
    return { cards, chapters, misses, due, value: mastery(ids, data.states, now) };
  }, [data, code, now]);

  if (!country) {
    return (
      <div className="page">
        <Header user={data.user} />
        <main className="page-main">
          <p className="muted">
            That country isn’t in the pool. <Link to="/atlas">Back to the atlas</Link>
          </p>
        </main>
      </div>
    );
  }

  const { cards, chapters, misses, due, value } = view;
  const percent = pct(value);
  const medal = cards.length > 0 ? medalFor(value) : null;

  return (
    <div className="page">
      <Header user={data.user} />
      <div className="country-main">
        <section className="country-body">
          <Link to="/atlas" className="country-back rise">
            <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="m15 6-6 6 6 6" />
            </svg>
            Atlas
          </Link>
          <div className="country-hero rise d1">
            <svg
              role="img"
              aria-label={`${country.name} mastery ${percent}%`}
              viewBox="0 0 64 64"
              width="88"
              height="88"
            >
              <circle cx="32" cy="32" r="28" fill="none" stroke="var(--line)" strokeWidth="5" />
              <circle
                className="ring-fill"
                cx="32"
                cy="32"
                r="28"
                transform="rotate(-90 32 32)"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={RING_LENGTH}
                strokeDashoffset={Math.round(RING_LENGTH * (1 - value))}
              />
              <text className="ring-text" x="32" y="37">
                {cards.length > 0 ? `${percent}%` : '—'}
              </text>
            </svg>
            <div>
              <h1 className="headline">{country.name}</h1>
              <p>
                {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'} · {cards.length}{' '}
                {cards.length === 1 ? 'card' : 'cards'} · {due} due
              </p>
              <MedalPill medal={medal} value={value} />
            </div>
          </div>

          <div className="country-actions rise d2">
            {cards.length > 0 ? (
              <LinkButton to={`/session?country=${code}`}>
                Study {country.name}
                <ArrowIcon />
              </LinkButton>
            ) : (
              <p className="muted">No cards for {country.name} yet.</p>
            )}
            <button
              type="button"
              className="tog"
              aria-pressed={focus}
              onClick={() => setFocus(!focus)}
            >
              <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {focus ? 'In this week’s focus' : 'Add to focus'}
            </button>
          </div>

          {chapters.length > 0 && (
            <nav aria-label={`${country.name} chapters`}>
              {chapters.map((chapter, i) => {
                const chapterMedal = chapter.cardCount > 0 ? medalFor(chapter.value) : null;
                return (
                  <Link
                    key={chapter.id}
                    className="chapter-row"
                    to={chapterLink(chapter.id)}
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    <span className="chapter-n">{String(chapter.order).padStart(2, '0')}</span>
                    <span>
                      <span className="chapter-title">{chapter.title}</span>
                      <span className="chapter-sub">{chapter.subtitle}</span>
                    </span>
                    <span className="bar" aria-hidden="true">
                      {chapter.cardCount > 0 && (
                        <div
                          className={chapter.value < WEAK ? 'weak' : undefined}
                          style={{ width: `${pct(chapter.value)}%` }}
                        />
                      )}
                    </span>
                    <span className="chapter-pct">
                      {chapterMedal && (
                        <i
                          className="md"
                          role="img"
                          aria-label={`${chapterMedal} medal`}
                          style={{ background: `var(--${chapterMedal})` }}
                        />
                      )}
                      {chapter.cardCount > 0 ? `${pct(chapter.value)}%` : '—'}
                    </span>
                    <svg
                      className="icon"
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      aria-hidden="true"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </Link>
                );
              })}
            </nav>
          )}
        </section>

        <aside className="country-side rise d3">
          <div className="card-box">
            <h2>How it feeds your mixed sessions</h2>
            <ol className="steps">
              {STEPS.map(({ title, sub }, i) => (
                <li key={title}>
                  <span className={i === STEPS.length - 1 ? 'step-n last' : 'step-n'}>{i + 1}</span>
                  <span>
                    <b>{title}</b>
                    <span className="step-sub">{sub}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="card-box">
            <h2>Where you miss in {country.name}</h2>
            {misses.length === 0 ? (
              <p className="muted small">No misses logged yet.</p>
            ) : (
              misses.map((miss) => (
                <div key={`${miss.picked}|${miss.truth}`} className="miss-row">
                  <span>
                    {answerLabel(miss.picked)} <span className="muted">/</span>{' '}
                    {answerLabel(miss.truth)}
                  </span>
                  <span className="count">{miss.count}</span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

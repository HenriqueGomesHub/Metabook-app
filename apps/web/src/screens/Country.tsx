import { answerKey, isClueCard, mastery, medalFor } from '@metabook/core';
import type { Card, MetaSubject } from '@metabook/core';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { pairLabel, scopeOf, SUBJECT_ORDER, SUBJECTS } from '../app/labels';
import { mapsOf } from '../app/stats';
import { useRegionMaps } from '../app/useRegionMaps';
import { ArrowIcon, LinkButton } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ItemList } from '../components/ItemList';
import { Header } from '../components/Header';
import { Status } from '../components/Status';
import { pct, WEAK } from './atlas/format';
import { clueIndex } from '../data/clueIndex';
import { LearnClues } from './atlas/LearnClues';
import { MedalPill } from './atlas/MedalPill';
import './atlas/atlas.css';

const RING_LENGTH = 176;
const TOP_MISSES = 8;
/** an auto chapter per subject needs this many cards; fewer go to the Basics chapter */
const MIN_CHAPTER_CARDS = 3;

export function Country() {
  const { data, error, saveSettings } = useAppData();
  const { country = '' } = useParams();
  return data ? (
    <CountryView data={data} code={country.toUpperCase()} saveSettings={saveSettings} />
  ) : (
    <Status error={error} />
  );
}

function chapterLink(id: string): string {
  const areaCodes = /^([a-z]{2}):areacodes$/.exec(id);
  return areaCodes ? `/areacodes/${areaCodes[1]}` : `/session?chapter=${encodeURIComponent(id)}`;
}

function CountryView({
  data,
  code,
  saveSettings,
}: {
  data: AppSnapshot;
  code: string;
  saveSettings: (settings: AppSnapshot['settings']) => Promise<void>;
}) {
  const now = useMemo(() => new Date(), []);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'chapters' | 'learn' | 'misses'>('chapters');
  const focusCountries = data.settings.focusCountries ?? [];
  const focus = focusCountries.includes(code);
  const country = data.content.pool.find((c) => c.code === code);

  const view = useMemo(() => {
    const all = data.content.cards.filter((card) => card.country === code);
    // text-only clue cards are read in the Learn section (and quizzed in the Clue quiz), not drilled
    const cards = all.filter((card) => !isClueCard(card));
    const ids = cards.map((card) => card.id);
    const byChapter = (chapter: string): Card[] => cards.filter((card) => card.chapter === chapter);
    const written = data.content.chapters
      .filter((chapter) => chapter.country === code)
      .sort((a, b) => a.order - b.order)
      .map((chapter) => ({
        ...chapter,
        to: chapterLink(chapter.id),
        cards: byChapter(chapter.id),
      }));
    // countries without hand-written chapters get one per meta subject with enough cards to drill;
    // the rest share one Basics chapter, which practises all the country's non-map cards. Cards
    // answered on the regions map have their own chapter instead
    const subjectCards = cards.filter((card) => !card.map && card.type !== 'areacode');
    const ownChapter = (subject: MetaSubject) =>
      subject !== 'other' &&
      subjectCards.filter((card) => card.subject === subject).length >= MIN_CHAPTER_CARDS;
    const leftovers = subjectCards.some((card) => !card.subject || !ownChapter(card.subject));
    const chapterList =
      written.length > 0
        ? written
        : SUBJECT_ORDER.filter(ownChapter).map((subject, i) => ({
            id: `auto:${code}:${subject}`,
            order: i + 1,
            title: SUBJECTS[subject].label,
            subtitle: SUBJECTS[subject].blurb,
            to: `/session?country=${code}&subject=${subject}`,
            cards: subjectCards.filter((card) => card.subject === subject),
          }));
    if (written.length === 0 && leftovers) {
      chapterList.push({
        id: `auto:${code}:basics`,
        order: chapterList.length + 1,
        title: 'Basics',
        subtitle: `Every ${country?.name ?? code} card, mixed`,
        to: `/session?country=${code}&map=0`,
        cards: subjectCards,
      });
    }
    const codeCards = cards.filter((card) => card.type === 'areacode');
    if (written.length === 0 && codeCards.length > 0) {
      chapterList.push({
        id: `auto:${code}:areacodes`,
        order: chapterList.length + 1,
        title: 'Area codes',
        subtitle: 'See a code, click the region',
        to: `/areacodes/${code.toLowerCase()}`,
        cards: codeCards,
      });
    }
    const mapCards = cards.filter((card) => card.map);
    if (mapCards.length > 0) {
      chapterList.push({
        id: `auto:${code}:where`,
        order: chapterList.length + 1,
        title: `Where in ${country?.name ?? code}`,
        subtitle: 'Place each clue on the regions map',
        to: `/session?country=${code}&map=1`,
        cards: mapCards,
      });
    }
    const chapters = chapterList.map(({ cards: chapterCards, ...chapter }) => {
      const chapterIds = chapterCards.map((card) => card.id);
      return {
        ...chapter,
        cardCount: chapterIds.length,
        value: mastery(chapterIds, data.states, now),
      };
    });
    // regions-map cards record map-scoped keys ("ca:NL"), so look cards up by those
    const cardByAnswer = new Map(all.map((card) => [answerKey(card, card.answer), card]));
    const misses = data.confusions
      .filter((c) => cardByAnswer.has(c.truth) && c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_MISSES)
      .map((c) => ({ ...c, card: cardByAnswer.get(c.truth) }));
    const due = ids.filter((id) => {
      const state = data.states[id];
      return state && state.state !== 'new' && Date.parse(state.due) <= now.getTime();
    }).length;
    const studyCount = cards.filter((card) => card.clue).length;
    return { cards, chapters, misses, due, studyCount, value: mastery(ids, data.states, now) };
  }, [data, code, now, country?.name]);

  // misses on regions-map cards are state codes, named from the map once it has loaded
  useRegionMaps(mapsOf(view.misses.flatMap((miss) => [miss.picked, miss.truth])));

  if (!country) {
    return (
      <div className="page">
        <Header user={data.user} />
        <EmptyState
          title="Not in the pool"
          text="That country isn’t part of the competitive pool."
          actions={[{ label: 'Back to Atlas', to: '/atlas' }]}
        />
      </div>
    );
  }

  const { cards, chapters, misses, due, studyCount, value } = view;

  async function toggleFocus() {
    setSaving(true);
    try {
      await saveSettings({
        ...data.settings,
        focusCountries: focus
          ? focusCountries.filter((c) => c !== code)
          : [...focusCountries, code],
      });
    } finally {
      setSaving(false);
    }
  }
  const percent = pct(value);
  const medal = cards.length > 0 ? medalFor(value) : null;

  const tabs = [
    { id: 'chapters', label: 'Chapters' },
    { id: 'learn', label: 'Learn' },
    { id: 'misses', label: misses.length > 0 ? `Misses · ${misses.length}` : 'Misses' },
  ] as const;

  return (
    <div className="page page-scroll">
      <Header user={data.user} />
      <div className="country-main">
        <Link to="/atlas" className="country-back">
          <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
          Atlas
        </Link>
        <div className="country-top">
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
              {(due > 0 || medal) && (
                <div className="country-meta">
                  {due > 0 && <p>{due} due</p>}
                  {medal && <MedalPill medal={medal} value={value} short />}
                </div>
              )}
            </div>
          </div>

          <div className="country-actions rise d2">
            {cards.length > 0 ? (
              <LinkButton to={`/session?country=${code}`}>
                Study {country.name}
                <ArrowIcon />
              </LinkButton>
            ) : null}
            <button
              type="button"
              className="tog"
              aria-pressed={focus}
              disabled={saving}
              onClick={toggleFocus}
            >
              <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {focus ? 'In focus' : 'Add to focus'}
            </button>
          </div>
        </div>
        <div className="country-nav">
          <div
            className="segments country-tabs"
            role="tablist"
            aria-label={`${country.name} sections`}
          >
            {tabs.map(({ id, label: name }) => (
              <button
                key={id}
                type="button"
                role="tab"
                className="seg"
                aria-selected={id === tab}
                onClick={() => setTab(id)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <section className="country-panel" role="tabpanel" aria-label={tab}>
          {tab === 'chapters' && (
            <div className="country-chapters">
              <div className="country-chapter-list">
                {cards.length === 0 && (
                  <EmptyState
                    size="compact"
                    title={`No cards for ${country.name} yet`}
                    text="Its chapters fill in as cards are added."
                    actions={[{ label: 'Open the editor', to: '/editor' }]}
                  />
                )}
                {cards.length > 0 && chapters.length > 0 && (
                  <nav className="country-chapter-nav" aria-label={`${country.name} chapters`}>
                    <ItemList
                      className="chapter-grid"
                      label="Chapters"
                      items={chapters
                        .filter((chapter) => chapter.cardCount > 0)
                        .map((chapter, i) => ({ ...chapter, order: i + 1 }))}
                      keyOf={(chapter) => chapter.id}
                      render={(chapter) => {
                        const chapterMedal = medalFor(chapter.value);
                        return (
                          <Link key={chapter.id} className="chapter-row" to={chapter.to}>
                            <span className="chapter-n">
                              {String(chapter.order).padStart(2, '0')}
                            </span>
                            <span>
                              <span className="chapter-title">{chapter.title}</span>
                              <span className="chapter-sub">{chapter.subtitle}</span>
                            </span>
                            <div className="bar" aria-hidden="true">
                              <div
                                className={chapter.value < WEAK ? 'weak' : undefined}
                                style={{ width: `${pct(chapter.value)}%` }}
                              />
                            </div>
                            <span className="chapter-pct">
                              {chapterMedal && (
                                <i
                                  className="md"
                                  role="img"
                                  aria-label={`${chapterMedal} medal`}
                                  style={{ background: `var(--${chapterMedal})` }}
                                />
                              )}
                              {pct(chapter.value)}%
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
                      }}
                    />
                  </nav>
                )}
              </div>
            </div>
          )}
          {tab === 'learn' && (
            <LearnClues
              catalogue={clueIndex(data.content).byCountry.get(code)}
              name={country.name}
              code={code}
              studyCount={studyCount}
              signedIn={data.user !== null}
            />
          )}
          {tab === 'misses' && (
            <div className="card-box">
              <h2>Where you miss in {country.name}</h2>
              {misses.length === 0 ? (
                <EmptyState
                  size="compact"
                  title="No misses yet"
                  text={`Missed rounds in ${country.name} show up here.`}
                />
              ) : (
                misses.map((miss) => (
                  <div key={`${miss.picked}|${miss.truth}`} className="miss-row">
                    <span>{pairLabel(miss.picked, miss.truth, scopeOf(miss.card))}</span>
                    <span className="count">{miss.count}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

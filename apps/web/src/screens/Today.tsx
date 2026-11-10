import { activePairs, blockProgress, LEARN_MORE } from '@metabook/core';
import type { CardType } from '@metabook/core';
import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { CARD_TYPES, TYPE_ORDER } from '../app/cardTypes';
import { activeBlock } from '../app/dataActions';
import { label, pairLabel } from '../app/labels';
import {
  curriculum,
  mapsOf,
  pairScope,
  practisedDays,
  streakLength,
  todaySession,
  weakestGroup,
} from '../app/stats';
import { useRegionMaps } from '../app/useRegionMaps';
import { ArrowIcon, LinkButton } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Header } from '../components/Header';
import { Status } from '../components/Status';
import { preloadClueImages } from '../data/clueImages';

const SECONDS_PER_CARD = 8;
/** Cards of today's queue whose images are signed and fetched while Today shows. */
const PRELOAD = 5;
const MIX_COLOURS = ['#eeeae2', '#a3c49a', '#bdb8ad', '#8e897f', '#66625a', '#46433d', '#3a3832'];

export function Today() {
  const { data, error } = useAppData();
  return data ? <TodayView data={data} /> : <Status error={error} />;
}

function TodayView({ data }: { data: AppSnapshot }) {
  const navigate = useNavigate();
  const { repo } = useAppData();
  const now = useMemo(() => new Date(), []);
  const { queue } = useMemo(() => todaySession(data, now), [data, now]);
  const { newAvailable, learningNow } = useMemo(() => curriculum(data), [data]);
  const cardsById = useMemo(
    () => new Map(data.content.cards.map((card) => [card.id, card])),
    [data.content.cards],
  );
  const empty = data.content.cards.length === 0;

  // the session's first images are ready by the time it starts
  useEffect(() => {
    const images = queue.slice(0, PRELOAD).flatMap((item) => {
      const clue = cardsById.get(item.cardId)?.clue;
      return clue?.choices?.map((c) => c.image) ?? (clue?.image ? [clue.image] : []);
    });
    if (images.length > 0) preloadClueImages(repo, images);
  }, [queue, cardsById, repo]);

  useEffect(() => {
    if (empty || queue.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      navigate('/session');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [empty, queue.length, navigate]);

  const counts = new Map<CardType, number>();
  let fresh = 0;
  for (const item of queue) {
    const card = cardsById.get(item.cardId);
    if (!card) continue;
    counts.set(card.type, (counts.get(card.type) ?? 0) + 1);
    if ((data.states[card.id]?.state ?? 'new') === 'new') fresh++;
  }
  const mix = TYPE_ORDER.filter((type) => counts.has(type))
    .map((type) => ({ type, count: counts.get(type) as number }))
    .sort((a, b) => b.count - a.count);

  const minutes = Math.max(1, Math.round((queue.length * SECONDS_PER_CARD) / 60));
  const seenAny = Object.values(data.states).some((state) => state.state !== 'new');
  // today's new cards are used up (or nothing is queued) while unseen cards remain
  const canLearnMore = newAvailable > 0 && fresh === 0;
  const canPractiseMore = queue.length === 0 && seenAny;
  const days = practisedDays(data.reviews, now);
  const streak = streakLength(days);
  const confusion = activePairs(data.confusions, now)[0];
  useRegionMaps(mapsOf(confusion ? [confusion.picked, confusion.truth] : []));
  const weakest = weakestGroup(data, now);
  const activeBlockLine = activeBlock(data);
  const progress = activeBlockLine && blockProgress(activeBlockLine, data.blockDays, now);
  const block =
    activeBlockLine && progress && !progress.finished
      ? { ...progress, minutes: activeBlockLine.minutesPerDay }
      : null;

  return (
    <div className="today">
      <svg className="contour" aria-hidden="true" viewBox="0 0 800 800">
        <path d="M400 120c120 10 230 80 260 190s-20 230-130 280-250 40-330-40-110-200-60-300 140-140 260-130z" />
        <path d="M400 170c100 8 190 70 214 160s-18 190-108 232-206 32-272-34-90-166-50-248 116-118 216-110z" />
        <path d="M402 222c80 6 150 56 168 128s-14 150-86 184-162 26-214-28-70-130-38-194 90-96 170-90z" />
        <path d="M404 276c58 4 108 40 122 92s-10 108-62 132-118 18-156-20-50-94-28-140 66-68 124-64z" />
        <path d="M406 330c36 3 66 26 75 58s-7 66-39 80-72 12-95-12-30-56-17-84 40-44 76-42z" />
        <path d="M408 380c16 2 30 12 34 26s-3 30-17 36-32 6-43-6-14-26-8-38 18-20 34-18z" />
      </svg>
      <Header user={data.user} date={now} />

      {empty ? (
        <EmptyState
          title="No cards yet"
          text="Add your first cards in the editor to start studying."
          actions={[{ label: 'Open the editor', to: '/editor' }]}
        />
      ) : (
        <div className="today-grid">
          <section className="rise d1">
            <p className="today-kicker">Due today</p>
            <div className="today-count headline">{queue.length}</div>
            <p className="today-sub">
              {queue.length === 1 ? 'card' : 'cards'} · about {minutes}{' '}
              {minutes === 1 ? 'minute' : 'minutes'}
            </p>
            {queue.length > 0 ? (
              <div className="today-start">
                <LinkButton to="/session" className="cta-large">
                  Start session
                  <ArrowIcon />
                </LinkButton>
                <span className="today-hint">
                  or press <kbd>Space</kbd>
                </span>
              </div>
            ) : (
              <p className="today-hint">All done for today.</p>
            )}
            {(canLearnMore || canPractiseMore) && (
              <div className="today-more">
                {canLearnMore && (
                  <LinkButton to="/session?more=new" variant="ghost">
                    Learn {Math.min(LEARN_MORE, newAvailable)} more
                  </LinkButton>
                )}
                {canPractiseMore && (
                  <LinkButton to="/session?more=ahead" variant="ghost">
                    Practise more
                  </LinkButton>
                )}
              </div>
            )}
            <p className="today-avail">
              {newAvailable.toLocaleString('en')} new available
              {learningNow.length > 0 && (
                <>
                  <br />
                  Learning now: {learningNow.map((code) => label(code)).join(', ')}
                </>
              )}
            </p>
          </section>

          <div className="today-side rise d2">
            <section className="panel">
              <div>
                <div className="panel-row panel-title">
                  <span>Today’s mix</span>
                  <span className="muted small">
                    {queue.length - fresh} review · {fresh} new
                  </span>
                </div>
                <div className="mix">
                  {mix.map(({ type, count }, i) => (
                    <div key={type} style={{ flex: count, background: MIX_COLOURS[i] }} />
                  ))}
                </div>
                <ul className="mix-legend">
                  {mix.map(({ type, count }, i) => (
                    <li key={type}>
                      <span className="swatch" style={{ background: MIX_COLOURS[i] }} />
                      {CARD_TYPES[type].label}
                      <span className="muted">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rule" />
              <dl className="facts">
                <div>
                  <dt>Weakest</dt>
                  <dd>{weakest ?? <span className="muted">Nothing yet</span>}</dd>
                </div>
                <div>
                  <dt>Top confusion</dt>
                  <dd>
                    {confusion ? (
                      <>
                        {pairLabel(
                          confusion.picked,
                          confusion.truth,
                          pairScope(data.content.cards, confusion.picked, confusion.truth),
                        )}
                      </>
                    ) : (
                      <span className="muted">None right now</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{streak > 0 ? `${streak}-day streak` : 'No streak yet'}</dt>
                  <dd
                    className="streak"
                    role="img"
                    aria-label={`Practised ${days.filter(Boolean).length} of the last 14 days`}
                  >
                    {days.map((done, i) => (
                      <span
                        key={i}
                        className={
                          done ? (i === days.length - 1 ? 'today-dot' : 'done') : undefined
                        }
                      />
                    ))}
                  </dd>
                </div>
              </dl>
            </section>
            {block && (
              <Link to="/blocks" className="block-line">
                Training block · day {block.dayIndex + 1} of {block.totalDays} ·{' '}
                {Math.round(block.todayMinutes)} of {block.minutes} min today
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../../app/AppData';
import { ChevronIcon } from '../../../components/Button';
import { CloseButton } from '../../../components/Chip';
import { Status } from '../../../components/Status';
import { LEVELS } from './data';
import { EMPTY, loadProgress, saveProgress } from './progress';
import '../languages.css';

/** `/languages/cyrillic`: practice, the letters read so far, and the ten lessons. */
export function CyrillicHome() {
  const { data, error } = useAppData();
  const [progress, setProgress] = useState(loadProgress);
  const [confirmReset, setConfirmReset] = useState(false);
  if (!data) return <Status error={error} />;

  const bs = progress.bestStreaks;
  const best = Math.max(0, bs.letters, bs.words, bs.cities);
  const completed = progress.completed;
  const firstLocked = LEVELS.findIndex((lv) => !completed.includes(lv.id));
  const allDone = firstLocked === -1;
  const allLetters = LEVELS.flatMap((lv) => lv.letters.map((x) => ({ ...x, lv: lv.id })));
  const learnedCount = allLetters.filter((x) => completed.includes(x.lv)).length;
  const pct = Math.round((learnedCount / allLetters.length) * 100);

  const reset = () => {
    if (!confirmReset) return setConfirmReset(true);
    setProgress(EMPTY);
    saveProgress(EMPTY);
    setConfirmReset(false);
  };

  return (
    <div className="page page-scroll">
      <main className="page-main cy-home">
        <div className="cy-home-bar rise">
          <CloseButton to="/languages" label="Back to languages" />
        </div>
        <div className="page-title rise">
          <div>
            <h1 className="headline">Read Cyrillic</h1>
            <p>Turn each letter into Latin ones.</p>
          </div>
        </div>

        <Link className="cy-endless rise" to="/languages/cyrillic/practice">
          <span className="cy-endless-text">
            <span className="cy-endless-title">Endless practice</span>
            <span className="cy-endless-sub">Letters, words and city names</span>
          </span>
          {best > 0 && (
            <span className="cy-endless-best">
              <b>{best}</b>
              <span>best streak</span>
            </span>
          )}
          <ChevronIcon />
        </Link>

        <div className="cy-columns">
          <section className="cy-lessons-col" aria-labelledby="cy-lessons-title">
            <h2 className="cy-h2" id="cy-lessons-title">
              Lessons
            </h2>
            <ol className="cy-lessons">
              {LEVELS.map((lv, i) => {
                const done = completed.includes(lv.id);
                const current = !done && i === firstLocked;
                const locked = !done && !current;
                const body = (
                  <>
                    <span className="cy-lesson-num" aria-hidden="true">
                      {done ? '✓' : lv.id}
                    </span>
                    <span className="row-text">
                      <span className="row-name">{lv.name}</span>
                      <span className="row-sub">
                        {locked ? `Finish lesson ${lv.id - 1} first` : lv.desc}
                      </span>
                    </span>
                    <span className="cy-lesson-letters cyr" aria-hidden="true">
                      {lv.letters.map((l) => l.c).join(' ')}
                    </span>
                  </>
                );
                return (
                  <li key={lv.id}>
                    {locked ? (
                      <span className="cy-lesson locked">{body}</span>
                    ) : (
                      <Link
                        className={current ? 'cy-lesson current' : 'cy-lesson'}
                        to={`/languages/cyrillic/lesson/${lv.id}`}
                      >
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="cy-overview rise" aria-label="Letters you can read">
            <div className="cy-overview-top">
              <h2 className="cy-h2">Letters you can read</h2>
              <span className="cy-overview-count">
                {learnedCount} of {allLetters.length}
              </span>
            </div>
            <div className="cy-track" aria-hidden="true">
              <div className="cy-track-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="cy-chips">
              {allLetters.map((x) => (
                <span
                  key={`${x.lv}-${x.c}`}
                  className={completed.includes(x.lv) ? 'cy-chip on' : 'cy-chip'}
                >
                  <span className="cy-chip-c cyr">{x.c}</span>
                  <span className="cy-chip-l">{x.l === '—' ? '·' : x.l}</span>
                </span>
              ))}
            </div>
          </section>
        </div>

        {allDone && (
          <p className="cy-trophy rise">
            You can read the whole alphabet, Russian through Montenegrin. Replay any lesson to stay
            sharp.
          </p>
        )}

        {(completed.length > 0 || progress.xp > 0) && (
          <div className="cy-foot">
            <span className="cy-xp">{progress.xp} XP</span>
            <button
              type="button"
              className="ghost cy-reset"
              onClick={reset}
              onBlur={() => setConfirmReset(false)}
            >
              {confirmReset ? 'Tap again to reset' : 'Reset progress'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

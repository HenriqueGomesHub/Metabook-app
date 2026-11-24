import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowIcon, LinkButton } from '../../components/Button';
import { CloseButton } from '../../components/Chip';
import { courseById, EMPTY, loadProgress, saveProgress, setLastCourse } from './engine';
import { useScriptFonts } from './fonts';
import './languages.css';

/** `/languages/:course`: the next lesson, practice, every lesson, and the letters read so far. */
export function CourseHome() {
  const { course: id } = useParams();
  const course = courseById(id);
  useScriptFonts();
  const [progress, setProgress] = useState(() => loadProgress(id ?? ''));
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    if (course) setLastCourse(course.id);
  }, [course]);
  if (!course) {
    return (
      <main className="page-main lg-page">
        <p className="lg-empty">No such script.</p>
        <LinkButton to="/languages">Back to languages</LinkButton>
      </main>
    );
  }

  const back = course.group ? `/languages/g/${course.group}` : '/languages';
  const completed = progress.completed;
  const firstOpen = course.levels.findIndex((lv) => !completed.includes(lv.id));
  const next = firstOpen >= 0 ? course.levels[firstOpen] : undefined;
  const letters = course.levels.flatMap((lv) =>
    lv.letters.map((r) => ({ ...course.toLetter(r), lv: lv.id })),
  );
  const learned = letters.filter((x) => completed.includes(x.lv)).length;
  const pct = Math.round((learned / letters.length) * 100);
  const best = Math.max(0, ...Object.values(progress.bestStreaks));

  const reset = () => {
    if (!confirmReset) return setConfirmReset(true);
    setProgress(EMPTY);
    saveProgress(course.id, EMPTY);
    setConfirmReset(false);
  };

  return (
    <div className="page page-scroll">
      <main className="page-main lg-page" style={{ '--c': course.accent } as CSSProperties}>
        <div className="lg-bar-top rise">
          <CloseButton to={back} label="Back" />
        </div>

        <header className="lg-hero rise">
          <span className="lg-hero-glyph script" aria-hidden="true">
            {course.sample[0]}
          </span>
          <div>
            <h1 className="headline">{course.name}</h1>
            <p>{course.langs.replaceAll(' · ', ', ')}</p>
          </div>
        </header>

        <div className="lg-actions rise">
          {next ? (
            <Link className="lg-next" to={`/languages/${course.id}/lesson/${next.id}`}>
              <span className="lg-next-num">{next.id}</span>
              <span className="lg-next-text">
                <span className="lg-next-kicker">
                  {completed.length ? 'Next lesson' : 'Start here'}
                </span>
                <span className="lg-next-name">{next.name}</span>
              </span>
              <span className="lg-next-letters script" aria-hidden="true">
                {next.letters
                  .slice(0, 4)
                  .map((r) => course.toLetter(r).tag)
                  .join(' ')}
              </span>
              <ArrowIcon />
            </Link>
          ) : (
            <div className="lg-next lg-next-done">
              <span className="lg-next-text">
                <span className="lg-next-kicker">All {course.levels.length} lessons done</span>
                <span className="lg-next-name">You can read every letter</span>
              </span>
            </div>
          )}
          <Link className="lg-practice" to={`/languages/${course.id}/practice`}>
            <span className="lg-practice-name">Endless practice</span>
            {best > 0 ? (
              <span className="lg-practice-best">Best streak {best}</span>
            ) : (
              <span className="lg-practice-best">Letters, words, phrases, places</span>
            )}
          </Link>
        </div>

        <div className="lg-columns">
          <section aria-labelledby="lg-lessons">
            <h2 className="lg-h2" id="lg-lessons">
              Lessons
            </h2>
            <ol className="lg-lessons">
              {course.levels.map((lv, i) => {
                const done = completed.includes(lv.id);
                const current = i === firstOpen;
                const locked = !done && !current;
                const body = (
                  <>
                    <span className="lg-lesson-num" aria-hidden="true">
                      {done ? '✓' : lv.id}
                    </span>
                    <span className="lg-lesson-name">{lv.name}</span>
                    <span className="lg-lesson-letters script" aria-hidden="true">
                      {lv.letters.map((r) => course.toLetter(r).tag).join(' ')}
                    </span>
                  </>
                );
                const cls = `lg-lesson${done ? ' done' : ''}${current ? ' current' : ''}${locked ? ' locked' : ''}`;
                return (
                  <li key={lv.id}>
                    {locked ? (
                      <span
                        className={cls}
                        aria-label={`${lv.name}: finish lesson ${lv.id - 1} first`}
                      >
                        {body}
                      </span>
                    ) : (
                      <Link className={cls} to={`/languages/${course.id}/lesson/${lv.id}`}>
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="lg-letters" aria-labelledby="lg-letters">
            <div className="lg-letters-top">
              <h2 className="lg-h2" id="lg-letters">
                Letters you can read
              </h2>
              <span className="lg-count">
                {learned} / {letters.length}
              </span>
            </div>
            <span className="lg-bar" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
            <div className="lg-chips">
              {letters.map((x, i) => (
                <span key={i} className={completed.includes(x.lv) ? 'lg-chip on' : 'lg-chip'}>
                  <span className="lg-chip-c script">{x.tag}</span>
                  <span className="lg-chip-l">{x.l === '—' ? '·' : x.l}</span>
                </span>
              ))}
            </div>
          </section>
        </div>

        {(completed.length > 0 || best > 0) && (
          <div className="lg-foot">
            <button
              type="button"
              className="ghost lg-reset"
              onClick={reset}
              onBlur={() => setConfirmReset(false)}
            >
              {confirmReset ? 'Tap again to reset' : `Reset ${course.name}`}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

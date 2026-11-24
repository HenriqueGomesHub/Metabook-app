import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, LinkButton } from '../../components/Button';
import { CloseButton } from '../../components/Chip';
import {
  beep,
  courseById,
  loadProgress,
  makeSpot,
  markTells,
  saveProgress,
  tonguesOf,
} from './engine';
import type { SpotQuestion } from './engine';
import type { TongueId } from './tongues';
import { useScriptFonts } from './fonts';
import './languages.css';

/**
 * `/languages/:course/spot`: a word, phrase or place, and which language it is. Every one has a
 * letter only its language uses (or a pair no other language has both of), lit up on the answer.
 */
export function Spot() {
  const { course: courseId } = useParams();
  useScriptFonts();
  const course = courseById(courseId);
  if (!course || tonguesOf(course).length === 0) {
    return (
      <main className="cy-stage cy-done">
        <p className="cy-empty">No languages to tell apart here.</p>
        <LinkButton to="/languages">Back to languages</LinkButton>
      </main>
    );
  }
  return <SpotRun courseId={course.id} />;
}

function SpotRun({ courseId }: { courseId: string }) {
  const [q, setQ] = useState<SpotQuestion>(() => makeSpot());
  const [picked, setPicked] = useState<TongueId | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => loadProgress(courseId).bestStreaks.spot ?? 0);
  const last = useRef<TongueId[]>([]);
  const timer = useRef<number | null>(null);

  const next = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setQ((prev) => {
      last.current = [...last.current, prev.tongue.id].slice(-2);
      return makeSpot(last.current);
    });
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: TongueId) => {
      if (picked) return;
      setPicked(id);
      if (id === q.tongue.id) {
        beep('good');
        const ns = streak + 1;
        setStreak(ns);
        if (ns > best) {
          setBest(ns);
          const saved = loadProgress(courseId);
          saveProgress(courseId, { ...saved, bestStreaks: { ...saved.bestStreaks, spot: ns } });
        }
        timer.current = window.setTimeout(next, 900);
      } else {
        beep('bad');
        setStreak(0);
      }
    },
    [picked, q, streak, best, courseId, next],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!picked) {
        const n = parseInt(e.key, 10);
        const option = q.options[n - 1];
        if (option) pick(option.id);
      } else if (e.key === 'Enter' || e.key === ' ') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked, q, pick, next]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const missed = picked !== null && picked !== q.tongue.id;
  const multi = q.c.includes(' ');

  return (
    <div className="cy-stage">
      <div className="session-bar rise">
        <CloseButton to={`/languages/${courseId}`} label="Leave" />
        <span className="cy-streak" aria-live="polite">
          <b>{streak}</b> in a row
        </span>
        <span className="cy-best">Best {best}</span>
      </div>

      <main className="cy-body">
        <h2 className="cy-q">Which language is this?</h2>
        <div className="cy-hero">
          <span className={`cy-glyph script phrase${multi ? ' multi' : ''}`}>
            {picked
              ? markTells(q.c, q.tongue).map(({ g, tell }, i) =>
                  tell ? (
                    <mark key={i} className="cy-tell">
                      {g}
                    </mark>
                  ) : (
                    g
                  ),
                )
              : q.c}
          </span>
        </div>

        <div className="cy-opts" role="group" aria-label="Languages">
          {q.options.map((t, i) => {
            let cls = 'cy-opt';
            if (picked) {
              if (t.id === q.tongue.id) cls += ' right';
              else if (t.id === picked) cls += ' wrong';
              else cls += ' dim';
            }
            return (
              <button
                key={t.id}
                type="button"
                className={cls}
                disabled={picked !== null}
                onClick={() => pick(t.id)}
              >
                <span className="cy-kbd" aria-hidden="true">
                  {i + 1}
                </span>
                {t.name}
              </button>
            );
          })}
        </div>

        {missed && (
          <div className="cy-spot-why" role="status">
            <p>{q.tongue.rule}</p>
            <Button onClick={next}>Next</Button>
          </div>
        )}
      </main>
    </div>
  );
}

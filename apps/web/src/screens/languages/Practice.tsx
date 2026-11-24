import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, LinkButton } from '../../components/Button';
import { CloseButton } from '../../components/Chip';
import { useParams, useSearchParams } from 'react-router-dom';
import type { Course } from './data';
import {
  beep,
  CATS,
  courseById,
  loadProgress,
  makeQ,
  norm,
  saveProgress,
  sourceOf,
  streakKey,
  tonguesOf,
} from './engine';
import type { PracticeCategory } from './engine';
import type { Tongue } from './tongues';
import { useScriptFonts } from './fonts';
import './languages.css';

/** `/languages/:course/practice`: endless letters, words, phrases or places; a miss resets the streak. */
export function Practice() {
  const { course: courseId } = useParams();
  useScriptFonts();
  const course = courseById(courseId);
  if (!course) {
    return (
      <main className="cy-stage cy-done">
        <p className="cy-empty">No such script.</p>
        <LinkButton to="/languages">Back to languages</LinkButton>
      </main>
    );
  }
  return <PracticeRun key={course.id} course={course} />;
}

/** The language practised last, so practice opens on it again. */
const TONGUE = 'metabook.alphabets.tongue';

function firstTongue(tongues: Tongue[], asked: string | null): Tongue | undefined {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(TONGUE);
  } catch {
    /* storage unavailable */
  }
  return tongues.find((t) => t.id === asked) ?? tongues.find((t) => t.id === saved) ?? tongues[0];
}

function PracticeRun({ course }: { course: Course }) {
  const [params] = useSearchParams();
  const tongues = tonguesOf(course);
  const [tongue, setTongue] = useState(() => firstTongue(tongues, params.get('lang')));
  const source = useMemo(() => sourceOf(course, tongue), [course, tongue]);
  const [cat, setCat] = useState<PracticeCategory>('letters');
  const [typeMode, setTypeMode] = useState(false);
  const [q, setQ] = useState(() => makeQ(source, 'letters', null));
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [typedOk, setTypedOk] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bests, setBests] = useState(() => loadProgress(course.id).bestStreaks);
  const timer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clearTimer = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const next = useCallback(() => {
    clearTimer();
    setQ((prev) => makeQ(source, cat, prev.c));
    setPicked(null);
    setTyped('');
    setTypedOk(null);
    setLocked(false);
  }, [cat, source]);

  const restart = (c: PracticeCategory, t: Tongue | undefined) => {
    clearTimer();
    setCat(c);
    setTongue(t);
    setStreak(0);
    setPicked(null);
    setTyped('');
    setTypedOk(null);
    setLocked(false);
    setQ(makeQ(sourceOf(course, t), c, null));
  };

  const switchCat = (c: PracticeCategory) => {
    if (c !== cat) restart(c, tongue);
  };

  const switchTongue = (t: Tongue) => {
    if (t.id === tongue?.id) return;
    try {
      localStorage.setItem(TONGUE, t.id);
    } catch {
      /* storage unavailable */
    }
    restart(cat, t);
  };

  const key = streakKey(cat, tongue);
  const best = bests[key] ?? 0;

  // shared scoring + advance for both input modes
  const register = useCallback(
    (correct: boolean) => {
      setLocked(true);
      if (correct) {
        beep('good');
        const ns = streak + 1;
        setStreak(ns);
        if (ns > best) {
          const nextBests = { ...bests, [key]: ns };
          setBests(nextBests);
          saveProgress(course.id, { ...loadProgress(course.id), bestStreaks: nextBests });
        }
        timer.current = window.setTimeout(next, 560);
      } else {
        beep('bad');
        setStreak(0);
        timer.current = window.setTimeout(next, 1450);
      }
    },
    [streak, best, bests, key, next, course.id],
  );

  const pick = useCallback(
    (i: number) => {
      if (locked) return;
      setPicked(i);
      register(q.options[i] === q.answer);
    },
    [locked, q, register],
  );

  const submit = useCallback(() => {
    if (locked || !typed.trim()) return;
    const ok = norm(typed) === norm(q.answer);
    setTypedOk(ok);
    register(ok);
  }, [locked, typed, q, register]);

  // keyboard shortcuts for choose mode only (1-4 / Enter)
  useEffect(() => {
    if (typeMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!locked) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= q.options.length) pick(n - 1);
      } else if (e.key === 'Enter' || e.key === ' ') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, q, pick, next, typeMode]);

  // keep the text field focused for rapid typing
  useEffect(() => {
    if (typeMode && !locked) inputRef.current?.focus();
  }, [q, typeMode, locked]);

  useEffect(() => () => clearTimer(), []);

  const meta = CATS.find((c) => c.id === cat)!;

  return (
    <div className="cy-stage">
      <div className="session-bar rise">
        <CloseButton to={`/languages/${course.id}`} label="Leave practice" />
        <span className="cy-streak" aria-live="polite">
          <b>{streak}</b> in a row
        </span>
        <span className="cy-best">Best {best}</span>
      </div>

      <main className="cy-body">
        {tongues.length > 0 && (
          <div className="cy-langs" role="group" aria-label="Language">
            {tongues.map((t) => (
              <button
                key={t.id}
                type="button"
                className={t.id === tongue?.id ? 'on' : undefined}
                aria-pressed={t.id === tongue?.id}
                onClick={() => switchTongue(t)}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
        <div className="cy-controls">
          <div className="cy-seg" role="group" aria-label="What to read">
            {CATS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={c.id === cat ? 'on' : undefined}
                aria-pressed={c.id === cat}
                onClick={() => switchCat(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={typeMode ? 'cy-type-toggle on' : 'cy-type-toggle'}
            aria-pressed={typeMode}
            aria-label="Type the answer"
            title="Type the answer"
            onClick={() => setTypeMode((t) => !t)}
          >
            <svg className="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
              <path d="M6.5 9.5h.01M10 9.5h.01M14 9.5h.01M17.5 9.5h.01M7.5 14.5h9" />
            </svg>
          </button>
        </div>

        <h2 className="cy-q">{meta.prompt}</h2>
        <div className="cy-hero">
          <span className={`cy-glyph script${q.phrase ? ' phrase' : ''}${q.multi ? ' multi' : ''}`}>
            {q.c}
          </span>
        </div>

        {typeMode ? (
          <div className="cy-type">
            <input
              ref={inputRef}
              className={locked ? (typedOk ? 'cy-input right' : 'cy-input wrong') : 'cy-input'}
              value={typed}
              disabled={locked}
              placeholder="Type it in Latin letters"
              aria-label="Your answer in Latin letters"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (locked) next();
                  else submit();
                }
              }}
            />
            {locked && !typedOk && (
              <p className="cy-answer" role="status">
                Answer: <b>{q.answer}</b>
              </p>
            )}
            {!locked && (
              <Button onClick={submit} disabled={!typed.trim()}>
                Check
              </Button>
            )}
          </div>
        ) : (
          <div className="cy-opts" role="group" aria-label="Answers">
            {q.options.map((o, i) => {
              let cls = 'cy-opt';
              if (locked) {
                if (o === q.answer) cls += ' right';
                else if (picked === i) cls += ' wrong';
                else cls += ' dim';
              }
              return (
                <button
                  key={o}
                  type="button"
                  className={cls}
                  disabled={locked}
                  onClick={() => pick(i)}
                >
                  <span className="cy-kbd" aria-hidden="true">
                    {i + 1}
                  </span>
                  {o}
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, LinkButton } from '../../../components/Button';
import { CloseButton } from '../../../components/Chip';
import { ProgressBar } from '../../../components/ProgressBar';
import { LEVELS } from './data';
import { buildLesson } from './engine';
import type { Exercise } from './engine';
import { beep, loadProgress, saveProgress } from './progress';
import '../languages.css';

const HOME = '/languages/cyrillic';
/** XP for finishing a lesson. */
const LESSON_XP = 20;

/** `/languages/cyrillic/lesson/:id`: new letters in batches of three, each drilled, then a review. */
export function CyrillicLesson() {
  const { id } = useParams();
  const levelIndex = LEVELS.findIndex((lv) => String(lv.id) === id);
  if (levelIndex < 0) {
    return (
      <main className="cy-stage">
        <p className="cy-empty">No such lesson.</p>
        <LinkButton to={HOME}>Back to lessons</LinkButton>
      </main>
    );
  }
  return <LessonRun key={levelIndex} levelIndex={levelIndex} />;
}

function LessonRun({ levelIndex }: { levelIndex: number }) {
  const level = LEVELS[levelIndex]!;
  const [queue, setQueue] = useState<Exercise[]>(() => buildLesson(levelIndex));
  const [pos, setPos] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [correctFirst, setCorrectFirst] = useState(0);
  const [seen, setSeen] = useState(0);
  const [result, setResult] = useState<{ xp: number; accuracy: number } | null>(null);

  const ex = queue[pos];
  const total = queue.length;
  const isCorrect = ex?.type === 'choice' && sel !== null && ex.options[sel] === ex.answer;

  const advance = useCallback(() => {
    if (pos + 1 >= queue.length) {
      const accuracy = seen ? Math.round((correctFirst / seen) * 100) : 100;
      const progress = loadProgress();
      saveProgress({
        ...progress,
        completed: progress.completed.includes(level.id)
          ? progress.completed
          : [...progress.completed, level.id],
        xp: progress.xp + LESSON_XP,
      });
      setResult({ xp: LESSON_XP, accuracy });
      return;
    }
    setPos((p) => p + 1);
    setSel(null);
    setChecked(false);
  }, [pos, queue.length, seen, correctFirst, level.id]);

  const check = useCallback(() => {
    if (sel === null || checked || !ex || ex.type !== 'choice') return;
    setChecked(true);
    setSeen((s) => s + 1);
    if (ex.options[sel] === ex.answer) {
      setCorrectFirst((c) => c + 1);
      beep('good');
    } else {
      beep('bad');
      // a miss comes back at the end of the lesson
      setQueue((q) => [...q, { ...ex }]);
    }
  }, [sel, checked, ex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ex || result) return;
      if (ex.type === 'intro') {
        if (e.key === 'Enter') advance();
        return;
      }
      if (!checked) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= ex.options.length) setSel(n - 1);
        else if (e.key === 'Enter' && sel !== null) check();
      } else if (e.key === 'Enter') advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ex, sel, checked, advance, check, result]);

  if (result) return <Done name={level.name} result={result} />;
  if (!ex) return null;

  return (
    <div className="cy-stage">
      <div className="session-bar rise">
        <CloseButton to={HOME} label="Leave lesson" confirm={pos > 0} />
        <ProgressBar value={pos} max={total} label={`Step ${pos + 1} of ${total}`} />
      </div>

      <main className="cy-body">
        {ex.type === 'intro' ? (
          <>
            <p className="cy-kicker">New letter</p>
            <div className="cy-hero">
              <div className="cy-transform">
                <span className="cy-glyph cyr">{ex.c}</span>
                <span className="cy-arrow" aria-hidden="true">
                  →
                </span>
                <span className="cy-latin">
                  <b>{ex.l}</b>
                  <span>{ex.l === '—' ? 'usually dropped' : 'in Latin'}</span>
                </span>
              </div>
              <p className="cy-tip">{ex.tip}</p>
            </div>
          </>
        ) : (
          <>
            <p className="cy-kicker">{ex.mode === 'word' ? 'Word' : 'Letter'}</p>
            <h2 className="cy-q">{ex.q}</h2>
            <div className="cy-hero">
              {ex.bigCyr ? (
                <span className={ex.mode === 'word' ? 'cy-glyph cyr word' : 'cy-glyph cyr'}>
                  {ex.big}
                </span>
              ) : (
                <span className="cy-glyph latin">{ex.big}</span>
              )}
            </div>
            <div className="cy-opts" role="group" aria-label="Answers">
              {ex.options.map((o, i) => {
                let cls = 'cy-opt';
                if (!checked) cls += sel === i ? ' sel' : '';
                else if (o === ex.answer) cls += ' right';
                else if (sel === i) cls += ' wrong';
                else cls += ' dim';
                if (ex.optCyr) cls += ' cyr';
                return (
                  <button
                    key={o}
                    type="button"
                    className={cls}
                    disabled={checked}
                    aria-pressed={sel === i}
                    onClick={() => !checked && setSel(i)}
                  >
                    <span className="cy-kbd" aria-hidden="true">
                      {i + 1}
                    </span>
                    {o}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </main>

      <div className={`cy-foot-bar${checked ? (isCorrect ? ' ok' : ' bad') : ''}`}>
        {ex.type === 'choice' && checked && (
          <div className="cy-feedback" role="status">
            <b>{isCorrect ? 'Correct' : `Answer: ${ex.answer}`}</b>
            {ex.mode === 'word' && (
              <span>
                <span className="cyr">{ex.big}</span> → {ex.answer}
              </span>
            )}
          </div>
        )}
        {ex.type === 'intro' ? (
          <Button onClick={advance}>Continue</Button>
        ) : !checked ? (
          <Button onClick={check} disabled={sel === null}>
            Check
          </Button>
        ) : (
          <Button onClick={advance} autoFocus>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

function Done({ name, result }: { name: string; result: { xp: number; accuracy: number } }) {
  const colors = ['#a3c49a', '#d9a35e', '#d4b25e', '#eeeae2', '#b9805a'];
  const bits = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.5 + Math.random() * 1.2,
        color: colors[i % colors.length],
        rot: Math.random() * 360,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <main className="cy-stage cy-done">
      <div className="cy-confetti" aria-hidden="true">
        {bits.map((b, i) => (
          <span
            key={i}
            style={{
              left: `${b.left}%`,
              background: b.color,
              animationDelay: `${b.delay}s`,
              animationDuration: `${b.dur}s`,
              transform: `rotate(${b.rot}deg)`,
            }}
          />
        ))}
      </div>
      <h1 className="headline">Lesson complete</h1>
      <p className="cy-done-lead">{name}: you read every one.</p>
      <div className="cy-done-tiles">
        <div>
          <b>+{result.xp}</b>
          <span>XP</span>
        </div>
        <div>
          <b>{result.accuracy}%</b>
          <span>right first time</span>
        </div>
      </div>
      <LinkButton to={HOME}>Continue</LinkButton>
    </main>
  );
}

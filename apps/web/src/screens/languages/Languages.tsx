import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppData } from '../../app/AppData';
import { ArrowIcon, LinkButton } from '../../components/Button';
import { CloseButton } from '../../components/Chip';
import { Header } from '../../components/Header';
import { Status } from '../../components/Status';
import { COURSES } from './data';
import type { Course } from './data';
import { courseProgress, lastCourse, loadProgress } from './engine';
import { useScriptFonts } from './fonts';
import './languages.css';

/** A course, or a script read two ways (Bengali or Assamese, Korean letters or syllables). */
type Entry = { kind: 'course'; course: Course } | { kind: 'group'; id: string; variants: Course[] };

function entries(): Entry[] {
  const out: Entry[] = [];
  for (const course of COURSES) {
    if (!course.group) out.push({ kind: 'course', course });
    else if (!out.some((e) => e.kind === 'group' && e.id === course.group))
      out.push({
        kind: 'group',
        id: course.group,
        variants: COURSES.filter((c) => c.group === course.group),
      });
  }
  return out;
}

const accent = (color: string) => ({ '--c': color }) as CSSProperties;

/** `/languages`: every script, with how much of it the learner can read. */
export function Languages() {
  const { data, error } = useAppData();
  useScriptFonts();
  if (!data) return <Status error={error} />;
  const resume = lastCourse();
  return (
    <div className="page page-scroll">
      <Header user={data.user} />
      <main className="page-main">
        <div className="page-title rise">
          <div>
            <h1 className="headline">Languages</h1>
            <p>Read the scripts on the signs.</p>
          </div>
        </div>
        {resume && <Resume course={resume} />}
        <ul className="lg-grid" aria-label="Scripts">
          {entries().map((entry, i) => (
            <li
              key={entry.kind === 'course' ? entry.course.id : entry.id}
              className="rise"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {entry.kind === 'course' ? (
                <ScriptCard
                  to={`/languages/${entry.course.id}`}
                  name={entry.course.name}
                  sample={entry.course.sample}
                  color={entry.course.accent}
                  courses={[entry.course]}
                />
              ) : (
                <ScriptCard
                  to={`/languages/g/${entry.id}`}
                  name={entry.variants[0]!.groupName ?? entry.id}
                  sample={entry.variants[0]!.groupSample ?? entry.variants[0]!.sample}
                  color={entry.variants[0]!.groupAccent ?? entry.variants[0]!.accent}
                  courses={entry.variants}
                  ways={entry.variants.length}
                />
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

/** The course last opened, with its next lesson. */
function Resume({ course }: { course: Course }) {
  const done = loadProgress(course.id).completed;
  const next = course.levels.find((lv) => !done.includes(lv.id));
  return (
    <Link className="lg-resume rise" to={`/languages/${course.id}`} style={accent(course.accent)}>
      <span className="lg-resume-glyph script" aria-hidden="true">
        {course.sample[0]}
      </span>
      <span className="lg-resume-text">
        <span className="lg-resume-kicker">{course.name}</span>
        <span className="lg-resume-title">
          {next ? `Lesson ${next.id}: ${next.name}` : 'Every letter learnt'}
        </span>
      </span>
      <span className="lg-resume-go">
        {next ? 'Continue' : 'Practise'}
        <ArrowIcon />
      </span>
    </Link>
  );
}

function ScriptCard({
  to,
  name,
  sample,
  color,
  courses,
  ways,
}: {
  to: string;
  name: string;
  sample: string[];
  color: string;
  courses: Course[];
  ways?: number;
}) {
  let learned = 0;
  let all = 0;
  for (const course of courses) {
    const p = courseProgress(course);
    learned += p.learned;
    all += p.all;
  }
  const pct = all ? Math.round((learned / all) * 100) : 0;
  return (
    <Link className="lg-card" to={to} style={accent(color)}>
      <span className="lg-card-glyphs script" aria-hidden="true">
        {sample.map((g) => (
          <span key={g}>{g}</span>
        ))}
      </span>
      <span className="lg-card-name">
        {name}
        {ways && <span className="lg-card-ways">{ways} ways</span>}
      </span>
      <span className="lg-card-prog">
        <span className="lg-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
        <span className="lg-card-count">
          {learned} / {all}
        </span>
      </span>
    </Link>
  );
}

/** `/languages/g/:group`: one script read two ways; pick which. */
export function LanguageGroup() {
  const { group } = useParams();
  useScriptFonts();
  const variants = COURSES.filter((c) => c.group === group);
  const meta = variants[0];
  if (!meta) {
    return (
      <main className="lg-page page-main">
        <p className="lg-empty">No such script.</p>
        <LinkButton to="/languages">Back to languages</LinkButton>
      </main>
    );
  }
  return (
    <div className="page page-scroll">
      <main className="page-main lg-page" style={accent(meta.groupAccent ?? meta.accent)}>
        <div className="lg-bar-top rise">
          <CloseButton to="/languages" label="Back to languages" />
        </div>
        <header className="lg-hero rise">
          <span className="lg-hero-glyph script" aria-hidden="true">
            {meta.groupSample?.[0] ?? meta.sample[0]}
          </span>
          <div>
            <h1 className="headline">{meta.groupName}</h1>
            <p>{meta.groupHint}</p>
          </div>
        </header>
        <ul className="lg-grid lg-grid-two" aria-label="Ways to read it">
          {variants.map((v) => (
            <li key={v.id} className="rise">
              <ScriptCard
                to={`/languages/${v.id}`}
                name={v.variantLabel ?? v.name}
                sample={v.sample}
                color={v.accent}
                courses={[v]}
              />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

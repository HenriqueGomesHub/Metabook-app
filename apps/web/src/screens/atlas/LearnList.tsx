import type { FactNote, MetaSubject } from '@metabook/core';
import { useEffect, useState } from 'react';
import { SUBJECT_ORDER, SUBJECTS } from '../../app/labels';
import { loadNotes } from '../../data/facts';

/** Headings for the Learn list; `other` is "Basics" on drill tiles, which reads oddly here. */
const heading = (subject: MetaSubject) =>
  subject === 'other' ? 'Other clues' : SUBJECTS[subject].label;

/**
 * A country's notes, grouped by subject, to read before drilling. The same facts are the reveal
 * on photo cards and the questions of the Clue quiz.
 */
export function LearnList({ code, name }: { code: string; name: string }) {
  const [notes, setNotes] = useState<FactNote[] | null>(null);

  useEffect(() => {
    let live = true;
    loadNotes(code).then(
      (loaded) => live && setNotes(loaded),
      () => live && setNotes([]),
    );
    return () => {
      live = false;
    };
  }, [code]);

  if (!notes || notes.length === 0) return null;
  const groups = SUBJECT_ORDER.map((subject) => ({
    subject,
    notes: notes.filter((note) => note.subject === subject),
  })).filter((group) => group.notes.length > 0);

  return (
    <section className="learn rise d3" aria-labelledby="learn-heading">
      <div className="learn-head">
        <h2 id="learn-heading" className="headline">
          Learn
        </h2>
        <p>What gives {name} away, by topic</p>
      </div>
      {groups.map((group) => (
        <div key={group.subject} className="learn-group">
          <h3>{heading(group.subject)}</h3>
          <ul className="learn-list">
            {group.notes.map((note) => (
              <li key={note.id} className="learn-card">
                <p>{note.text}</p>
                {note.region && <span className="learn-region">{note.region}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

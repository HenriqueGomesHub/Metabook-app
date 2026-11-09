import type { MetaSubject } from '@metabook/core';
import { useState } from 'react';
import { SUBJECT_ORDER, SUBJECTS } from '../../app/labels';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import type { Candidate, Decision } from '../../data/curation';
import { mediaUrl } from '../../data/media';
import { useKeys } from '../session/useKeys';

/**
 * One candidate, large, with its edits. Keys: K keep, R reject, G giveaway, U undo last,
 * 1–9 subject. Typing in the caption never triggers them.
 */
export function CandidateReview({
  candidate,
  country,
  busy,
  canUndo,
  onDecide,
  onUndo,
}: {
  candidate: Candidate;
  country: string;
  busy: boolean;
  canUndo: boolean;
  onDecide(decision: Decision): void;
  onUndo(): void;
}) {
  const [subject, setSubject] = useState<MetaSubject>(candidate.subject);
  const [giveaway, setGiveaway] = useState(candidate.giveaways.includes(candidate.subject));
  const [caption, setCaption] = useState(candidate.caption ?? '');

  const decide = (status: Decision['status']) =>
    onDecide({
      status,
      subject,
      // the photo is a clear giveaway for its subject
      giveaways: giveaway ? [subject] : [],
      caption: caption.trim() || null,
    });

  useKeys((event) => {
    const key = event.key.toLowerCase();
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (key === 'k') decide('approved');
    else if (key === 'r') decide('rejected');
    else if (key === 'g') setGiveaway((on) => !on);
    else if (key === 'u' && canUndo) onUndo();
    else {
      const picked = SUBJECT_ORDER[Number(key) - 1];
      if (picked && /^[1-9]$/.test(key)) setSubject(picked);
    }
  }, !busy);

  return (
    <section className="sheet curate" aria-label="Candidate photo">
      <div
        className="curate-photo"
        style={candidate.preview ? { backgroundImage: `url(${candidate.preview})` } : undefined}
      >
        <img
          src={mediaUrl(candidate.storagePath)}
          alt={caption || candidate.title || 'Candidate photo'}
          decoding="async"
        />
      </div>
      <div className="curate-meta">
        <span className="curate-country headline">{country}</span>
        <Chip>{SUBJECTS[subject].label}</Chip>
        <a className="note" href={candidate.sourceUrl} target="_blank" rel="noreferrer">
          {candidate.credit}
        </a>
      </div>

      <div className="toggles" role="group" aria-label="Subject">
        {SUBJECT_ORDER.map((s, i) => (
          <button
            key={s}
            type="button"
            className="toggle"
            aria-pressed={subject === s}
            onClick={() => setSubject(s)}
          >
            {i < 9 && <kbd>{i + 1}</kbd>}
            {SUBJECTS[s].label}
          </button>
        ))}
      </div>

      <div className="field">
        <label>
          Caption (alt text; never name the country)
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} />
        </label>
      </div>

      <div className="curate-actions">
        <button
          type="button"
          className="toggle"
          aria-pressed={giveaway}
          onClick={() => setGiveaway((on) => !on)}
        >
          <kbd>G</kbd>
          Giveaway
        </button>
        <Button variant="ghost" disabled={busy || !canUndo} onClick={onUndo}>
          <kbd>U</kbd>
          Undo last
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => decide('rejected')}>
          <kbd>R</kbd>
          Reject
        </Button>
        <Button disabled={busy} onClick={() => decide('approved')}>
          <kbd>K</kbd>
          Keep
        </Button>
      </div>
    </section>
  );
}

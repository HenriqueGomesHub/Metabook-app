import type { MetaSubject } from '@metabook/core';
import { useState } from 'react';
import { SUBJECT_ORDER, SUBJECTS } from '../../app/labels';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { CroppedImage } from '../../components/CroppedImage';
import { CropBox } from '../../components/CropBox';
import type { Candidate, Crop, Decision } from '../../data/curation';
import { mediaUrl } from '../../data/media';
import { useKeys } from '../session/useKeys';

/**
 * One candidate, large, with its edits. Keys: K keep, R reject, C crop, G giveaway, U undo last,
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
  const [caption, setCaption] = useState('');
  const [cropping, setCropping] = useState(false);

  const decide = (status: Decision['status'], crop?: Crop | null) =>
    onDecide({
      status,
      subject,
      // the photo is a clear giveaway for its subject
      giveaways: giveaway ? [subject] : [],
      caption: caption.trim() || null,
      ...(crop !== undefined ? { crop } : {}),
    });

  useKeys((event) => {
    const key = event.key.toLowerCase();
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (key === 'k') decide('approved');
    else if (key === 'r') decide('rejected');
    else if (key === 'c') setCropping(true);
    else if (key === 'g') setGiveaway((on) => !on);
    else if (key === 'u' && canUndo) onUndo();
    else {
      const picked = SUBJECT_ORDER[Number(key) - 1];
      if (picked && /^[1-9]$/.test(key)) setSubject(picked);
    }
  }, !busy && !cropping);

  const alt = caption || candidate.title || 'Candidate photo';

  return (
    <section className="sheet curate" aria-label="Candidate photo">
      {cropping ? (
        <CropBox
          src={mediaUrl(candidate.storagePath)}
          alt={alt}
          initial={candidate.crop}
          size={candidate}
          busy={busy}
          onCancel={() => setCropping(false)}
          onConfirm={(crop) => decide('approved', crop)}
        />
      ) : (
        <div
          className="curate-photo"
          style={candidate.preview ? { backgroundImage: `url(${candidate.preview})` } : undefined}
        >
          <CroppedImage
            src={mediaUrl(candidate.storagePath)}
            crop={candidate.crop}
            alt={alt}
            fit="contain"
            size={candidate}
          />
        </div>
      )}
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

      {candidate.description && (
        <p className="note">
          <strong>Description (curators only, may name the country):</strong>{' '}
          {candidate.description}
        </p>
      )}

      <div className="field">
        <label>
          Caption (alt text; never name the country)
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} />
        </label>
      </div>

      {!cropping && (
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
          <Button variant="ghost" disabled={busy} onClick={() => setCropping(true)}>
            <kbd>C</kbd>
            Crop
          </Button>
          <Button disabled={busy} onClick={() => decide('approved')}>
            <kbd>K</kbd>
            Keep
          </Button>
        </div>
      )}
    </section>
  );
}

import type { MetaSubject } from '@metabook/core';
import { useEffect, useRef, useState } from 'react';
import { label, SUBJECT_ORDER, SUBJECTS } from '../../app/labels';
import { Button } from '../../components/Button';
import { CroppedImage } from '../../components/CroppedImage';
import { CropBox } from '../../components/CropBox';
import { EmptyState } from '../../components/EmptyState';
import { UsesUnavailable } from '../../data/curation';
import type { Crop, CurationApi, Use } from '../../data/curation';
import { mediaUrl } from '../../data/media';
import { useKeys } from '../session/useKeys';

const PAGE = 12;
/** Keys for tiles 1–12, in order. */
const TILE_KEYS = '1234567890-=';
const LONG_PRESS_MS = 500;
const WHOLE: Crop = { x: 0, y: 0, w: 1, h: 1 };

type Counts = Partial<Record<MetaSubject, number>>;

const countryName = (code: string) => label(code.toUpperCase());
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));
const add = (counts: Counts, subject: MetaSubject, n: number): Counts => ({
  ...counts,
  [subject]: Math.max(0, (counts[subject] ?? 0) + n),
});

/**
 * "By topic": the agents' suggested uses (media_uses), one subject at a time. Pick a subject, then
 * approve a page of 12 crops at once (tap marks a reject), adjust a crop or move it to another
 * subject from the large view.
 */
export function TopicReview({ api }: { api: CurationApi }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [subject, setSubject] = useState<MetaSubject | null>(null);
  const [uses, setUses] = useState<Use[] | null>(null);
  /** pages already decided in this subject, newest last, for "Undo page" */
  const [pages, setPages] = useState<Use[][]>([]);
  /** bumped whenever a page is decided or undone: remounts the grid, clearing its marks */
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api.countUses().then(
      (next) => live && setCounts(next),
      (reason: unknown) => {
        if (!live) return;
        if (reason instanceof UsesUnavailable) setUnavailable(true);
        else setError(message(reason));
      },
    );
    return () => {
      live = false;
    };
  }, [api]);

  useEffect(() => {
    if (!subject) return;
    let live = true;
    api.listUses(subject).then(
      (rows) => live && setUses(rows),
      (reason: unknown) => live && setError(message(reason)),
    );
    return () => {
      live = false;
    };
  }, [api, subject]);

  function pick(next: MetaSubject | null) {
    setSubject(next);
    setUses(null);
    setPages([]);
    setError('');
  }

  /** Runs one request at a time; resolves false (and shows why) when it failed. */
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
      return true;
    } catch (reason) {
      setError(message(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const page = (uses ?? []).slice(0, PAGE);

  // Sequential, so a failure leaves the page on screen and retrying is safe.
  const approveRest = (rejectedIds: string[]) =>
    run(async () => {
      const rejected = new Set(rejectedIds);
      await api.decideUses(
        page.filter((u) => !rejected.has(u.id)).map((u) => u.id),
        'approved',
      );
      await api.decideUses(rejectedIds, 'rejected');
      setUses((list) => (list ?? []).filter((u) => !page.includes(u)));
      setPages((list) => [...list, page]);
      setRound((n) => n + 1);
      setCounts((c) => add(c ?? {}, subject!, -page.length));
    });

  const undoPage = () =>
    run(async () => {
      const last = pages.at(-1);
      if (!last) return;
      const reset = new Set(
        await api.decideUses(
          last.map((u) => u.id),
          'suggested',
        ),
      );
      setPages((list) => list.slice(0, -1));
      setRound((n) => n + 1);
      setUses((list) => [...last.filter((u) => reset.has(u.id)), ...(list ?? [])]);
      setCounts((c) => add(c ?? {}, subject!, reset.size));
      const kept = last.length - reset.size;
      if (kept > 0) {
        setError(
          `${kept} ${kept === 1 ? 'photo is' : 'photos are'} already in the cards and can’t be undone here.`,
        );
      }
    });

  const adjust = (use: Use, crop: Crop) =>
    run(async () => {
      await api.updateUse(use.id, { crop });
      setUses((list) => (list ?? []).map((u) => (u.id === use.id ? { ...u, crop } : u)));
    });

  const move = (use: Use, to: MetaSubject) =>
    run(async () => {
      await api.updateUse(use.id, { subject: to });
      setUses((list) => (list ?? []).filter((u) => u.id !== use.id));
      setCounts((c) => add(add(c ?? {}, use.subject, -1), to, 1));
    });

  const alert = error && (
    <p className="error" role="alert">
      {error}
    </p>
  );

  if (unavailable) {
    return (
      <EmptyState
        title="Suggestions not set up"
        text="Run supabase/migrations/0005_media_uses.sql in the Supabase SQL editor to review the agents’ suggestions."
      />
    );
  }
  if (!counts) return alert || <p className="note">Loading suggestions…</p>;

  if (!subject) {
    const subjects = SUBJECT_ORDER.filter((s) => (counts[s] ?? 0) > 0);
    return (
      <>
        {alert}
        {subjects.length ? (
          <div className="toggles topic-list" role="group" aria-label="Subjects">
            {subjects.map((s) => (
              <button key={s} type="button" className="toggle" onClick={() => pick(s)}>
                {SUBJECTS[s].label}
                <span className="topic-count">{counts[s]}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No suggestions"
            text="Push content/jobs/review-apply.json with the agents’ content/review files to load suggestions."
          />
        )}
      </>
    );
  }

  return (
    <>
      {alert}
      <div className="topic-head">
        <Button variant="ghost" onClick={() => pick(null)}>
          All subjects
        </Button>
        <h2 className="headline">
          {SUBJECTS[subject].label} · {counts[subject] ?? 0} suggested
        </h2>
      </div>
      {!uses && <p className="note">Loading…</p>}
      {uses && !page.length && (
        <EmptyState
          title={`No ${SUBJECTS[subject].label.toLowerCase()} left`}
          text="Every suggestion in this subject is decided."
          actions={pages.length ? [{ label: 'Undo page', onClick: undoPage }] : []}
        />
      )}
      {page.length > 0 && (
        <UseGrid
          key={`${subject}-${round}`}
          page={page}
          busy={busy}
          canUndo={pages.length > 0}
          onApproveRest={approveRest}
          onUndo={undoPage}
          onCrop={adjust}
          onSubject={move}
        />
      )}
    </>
  );
}

/**
 * One page of suggested uses. Tap (or 1–=) marks a reject; Enter approves the rest. Long-press or
 * right-click opens a use large, to adjust its crop (C) or move it to another subject. Remount per
 * page (key) to clear the marks; a use moved to another subject leaves the others' marks as they are.
 */
function UseGrid({
  page,
  busy,
  canUndo,
  onApproveRest,
  onUndo,
  onCrop,
  onSubject,
}: {
  page: Use[];
  busy: boolean;
  canUndo: boolean;
  onApproveRest(rejectedIds: string[]): void;
  onUndo(): void;
  onCrop(use: Use, crop: Crop): Promise<boolean>;
  onSubject(use: Use, subject: MetaSubject): Promise<boolean>;
}) {
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const timer = useRef<number>();
  const longPressed = useRef(false);
  // the page's copy, so an adjusted crop shows at once
  const viewing = page.find((u) => u.id === viewingId) ?? null;

  const toggle = (id: string) =>
    setMarked((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const approveRest = () => onApproveRest(page.filter((u) => marked.has(u.id)).map((u) => u.id));

  useKeys((event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      approveRest();
      return;
    }
    const tile = page[TILE_KEYS.indexOf(event.key)];
    if (tile && event.key.length === 1) toggle(tile.id);
  }, !busy && !viewing);

  useKeys(
    (event) => {
      if (event.key === 'Escape') setViewingId(null);
      else if (
        event.key.toLowerCase() === 'c' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        setCropping(true);
      }
    },
    !!viewing && !cropping && !busy,
  );

  const close = () => {
    setCropping(false);
    setViewingId(null);
  };

  const crop = async (use: Use, value: Crop | null) => {
    setCropping(false);
    if (!(await onCrop(use, value ?? WHOLE))) return;
    // an adjusted crop is a keep
    setMarked((set) => {
      const next = new Set(set);
      next.delete(use.id);
      return next;
    });
  };

  const startPress = (use: Use) => {
    longPressed.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      setViewingId(use.id);
    }, LONG_PRESS_MS);
  };
  const endPress = () => window.clearTimeout(timer.current);

  return (
    <section className="sheet curate" aria-label="Suggestion grid">
      <div className="grid-photos">
        {page.map((use, i) => {
          const rejected = marked.has(use.id);
          const country = countryName(use.country);
          return (
            <button
              key={use.id}
              type="button"
              className="grid-tile"
              aria-pressed={rejected}
              aria-label={`Use ${i + 1}, ${country}${rejected ? ', rejected' : ''}`}
              style={use.preview ? { backgroundImage: `url(${use.preview})` } : undefined}
              disabled={busy}
              onClick={() => {
                if (longPressed.current) longPressed.current = false;
                else toggle(use.id);
              }}
              onPointerDown={() => startPress(use)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onPointerCancel={endPress}
              onContextMenu={(event) => {
                event.preventDefault();
                endPress();
                setViewingId(use.id);
              }}
            >
              <CroppedImage
                src={mediaUrl(use.storagePath)}
                crop={use.crop}
                alt=""
                fit="cover"
                size={use}
                loading="lazy"
              />
              <span className="grid-key" aria-hidden="true">
                {TILE_KEYS[i]}
              </span>
              <span className="grid-label">{country}</span>
              {rejected && (
                <span className="grid-x" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="40" height="40">
                    <path d="M6 6l12 12" />
                    <path d="M18 6 6 18" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="curate-actions">
        <Button variant="ghost" disabled={busy || !canUndo} onClick={onUndo}>
          Undo page
        </Button>
        <Button disabled={busy} onClick={approveRest}>
          <kbd>Enter</kbd>
          Approve the rest
        </Button>
      </div>

      {viewing && (
        <div
          className="grid-overlay"
          role="presentation"
          onClick={() => {
            if (!cropping) close();
          }}
        >
          <div
            className="grid-overlay-card sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Suggestion"
            onClick={(event) => event.stopPropagation()}
          >
            {cropping ? (
              <CropBox
                src={mediaUrl(viewing.storagePath)}
                alt={viewing.title || 'Candidate photo'}
                initial={viewing.crop}
                size={viewing}
                busy={busy}
                confirmLabel="Save crop"
                onCancel={() => setCropping(false)}
                onConfirm={(value) => void crop(viewing, value)}
              />
            ) : (
              <CroppedImage
                src={mediaUrl(viewing.storagePath)}
                crop={viewing.crop}
                alt={viewing.title || 'Candidate photo'}
                fit="contain"
                size={viewing}
              />
            )}
            <p className="note">{countryName(viewing.country)}</p>
            {viewing.note && <p>{viewing.note}</p>}
            {viewing.description && <p className="note">{viewing.description}</p>}
            <a className="note" href={viewing.sourceUrl} target="_blank" rel="noreferrer">
              {viewing.credit}
            </a>
            {!cropping && (
              <div className="curate-actions">
                <label className="topic-move">
                  <span className="sr-only">Change subject</span>
                  <select
                    className="input"
                    value={viewing.subject}
                    disabled={busy}
                    onChange={(event) => {
                      const to = event.target.value as MetaSubject;
                      void onSubject(viewing, to).then((ok) => ok && close());
                    }}
                  >
                    {SUBJECT_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {SUBJECTS[s].label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button variant="ghost" disabled={busy} onClick={() => setCropping(true)}>
                  <kbd>C</kbd>
                  Adjust crop
                </Button>
                <Button variant="ghost" autoFocus onClick={close}>
                  Close
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

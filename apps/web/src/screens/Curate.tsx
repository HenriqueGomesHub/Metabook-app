import { useEffect, useMemo, useState } from 'react';
import { useAppData } from '../app/AppData';
import { label, SUBJECT_ORDER, SUBJECTS } from '../app/labels';
import { EmptyState } from '../components/EmptyState';
import { Status } from '../components/Status';
import { AlreadyCollected } from '../data/curation';
import type { Candidate, Crop, CurationApi, Decision } from '../data/curation';
import { CandidateGrid } from './curate/CandidateGrid';
import { CandidateReview } from './curate/CandidateReview';
import { TopicReview } from './curate/TopicReview';
import { Page } from './manage/Page';
import './curate/curate.css';

const GRID_PAGE = 12;
const VIEW_KEY = 'metabook.curate.view';
type View = 'grid' | 'single' | 'topic';

function savedView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return saved === 'single' || saved === 'topic' ? saved : 'grid';
  } catch {
    return 'grid';
  }
}

const countryName = (code: string) => label(code.toUpperCase());

/** /curate: admins keep or reject queued photos, one at a time. Cloud mode only. */
export function Curate() {
  const { data, error, curation: api } = useAppData();
  const [admin, setAdmin] = useState<boolean | null>(api ? null : false);

  useEffect(() => {
    if (!api) return;
    let live = true;
    api.isAdmin().then(
      (yes) => live && setAdmin(yes),
      () => live && setAdmin(false),
    );
    return () => {
      live = false;
    };
  }, [api]);

  if (!data || admin === null) return <Status error={error} />;
  if (!admin || !api) {
    return (
      <Page user={data.user} title="Curate photos">
        <EmptyState
          title="Admins only"
          text="Photo curation needs cloud mode and an app_admins row for your account."
          actions={[{ label: 'Back to Settings', to: '/settings' }]}
        />
      </Page>
    );
  }
  return <CurateQueue api={api} user={data.user} />;
}

function CurateQueue({
  api,
  user,
}: {
  api: CurationApi;
  user: Parameters<typeof Page>[0]['user'];
}) {
  const [pending, setPending] = useState<Candidate[] | null>(null);
  const [decided, setDecided] = useState<Candidate[]>([]);
  /** grid pages already decided, newest last, for "Undo page" */
  const [pages, setPages] = useState<Candidate[][]>([]);
  const [view, setView] = useState<View>(savedView);
  const [country, setCountry] = useState('');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api.listPending().then(
      (rows) => live && setPending(rows),
      (reason: unknown) => live && setError(message(reason)),
    );
    return () => {
      live = false;
    };
  }, [api]);

  const shown = useMemo(
    () =>
      (pending ?? []).filter(
        (c) => (!country || c.country === country) && (!subject || c.subject === subject),
      ),
    [pending, country, subject],
  );
  const countries = [...new Set((pending ?? []).map((c) => c.country))].sort();
  const subjects = SUBJECT_ORDER.filter((s) => pending?.some((c) => c.subject === s));
  const current = shown[0];
  const page = shown.slice(0, GRID_PAGE);
  const decidedCount = decided.length + pages.reduce((n, p) => n + p.length, 0);

  function chooseView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // private mode or blocked storage: the choice just won't persist
    }
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

  const decide = (candidate: Candidate, decision: Decision) =>
    run(async () => {
      await api.decide(candidate.id, decision);
      setPending((list) => (list ?? []).filter((c) => c.id !== candidate.id));
      const { crop = candidate.crop } = decision;
      setDecided((list) => [...list, { ...candidate, crop }]);
    });

  // Grid: decideMany can't carry a crop per row, so it is saved now; "Keep the rest" approves it.
  const cropOne = (candidate: Candidate, crop: Crop | null) =>
    run(async () => {
      await api.setCrop(candidate.id, crop);
      setPending((list) => (list ?? []).map((c) => (c.id === candidate.id ? { ...c, crop } : c)));
    });

  const undo = () =>
    run(async () => {
      const last = decided.at(-1);
      if (!last) return;
      const { subject: was, giveaways, caption } = last;
      try {
        await api.decide(last.id, {
          status: 'pending',
          subject: was,
          giveaways,
          caption,
          // back in the queue uncropped
          ...(last.crop ? { crop: null } : {}),
        });
      } catch (reason) {
        // already collected: it stays approved, and the next undo reaches the one before
        if (reason instanceof AlreadyCollected) setDecided((list) => list.slice(0, -1));
        throw reason;
      }
      setDecided((list) => list.slice(0, -1));
      setPending((list) => [{ ...last, crop: null }, ...(list ?? [])]);
    });

  // Two requests at most. Sequential, so a failure leaves the page on screen and retrying is safe
  // (writing a status twice changes nothing).
  const keepRest = (rejectedIds: string[]) =>
    run(async () => {
      const rejected = new Set(rejectedIds);
      const approvedIds = page.filter((c) => !rejected.has(c.id)).map((c) => c.id);
      await api.decideMany(approvedIds, 'approved');
      await api.decideMany(rejectedIds, 'rejected');
      setPending((list) => (list ?? []).filter((c) => !page.some((p) => p.id === c.id)));
      setPages((list) => [...list, page]);
    });

  const undoPage = () =>
    run(async () => {
      const last = pages.at(-1);
      if (!last) return;
      const reset = new Set(
        await api.decideMany(
          last.map((c) => c.id),
          'pending',
        ),
      );
      setPages((list) => list.slice(0, -1));
      // decideMany cleared their crops too
      setPending((list) => [
        ...last.filter((c) => reset.has(c.id)).map((c) => ({ ...c, crop: null })),
        ...(list ?? []),
      ]);
      const kept = last.length - reset.size;
      if (kept > 0) {
        setError(
          `${kept} ${kept === 1 ? 'photo is' : 'photos are'} already in the cards and can’t be undone here.`,
        );
      }
    });

  const toggles = (
    <div className="toggles curate-view" role="group" aria-label="View">
      <button
        type="button"
        className="toggle"
        aria-pressed={view === 'single'}
        onClick={() => chooseView('single')}
      >
        One by one
      </button>
      <button
        type="button"
        className="toggle"
        aria-pressed={view === 'grid'}
        onClick={() => chooseView('grid')}
      >
        Grid
      </button>
      <button
        type="button"
        className="toggle"
        aria-pressed={view === 'topic'}
        onClick={() => chooseView('topic')}
      >
        By topic
      </button>
    </div>
  );

  // the agents' suggestions (media_uses); the other views show candidates still pending
  if (view === 'topic') {
    return (
      <Page user={user} title="Curate photos" subtitle="Agent suggestions, by subject">
        {toggles}
        <TopicReview api={api} />
      </Page>
    );
  }

  return (
    <Page
      user={user}
      title="Curate photos"
      subtitle={
        pending
          ? `${shown.length} pending${decidedCount ? ` · ${decidedCount} decided` : ''}`
          : 'Loading the queue…'
      }
      actions={
        <div className="curate-filters">
          <label>
            <span className="sr-only">Filter by country</span>
            <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {countries.map((code) => (
                <option key={code} value={code}>
                  {countryName(code)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by subject</span>
            <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {SUBJECTS[s].label}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {toggles}
      {pending && !current && (
        <EmptyState
          title="Nothing to curate"
          text="Run a content job with the commons or mapillary step to queue photos."
          actions={
            view === 'grid'
              ? pages.length
                ? [{ label: 'Undo page', onClick: undoPage }]
                : []
              : decided.length
                ? [{ label: 'Undo last', onClick: undo }]
                : []
          }
        />
      )}
      {current && view === 'grid' && (
        <CandidateGrid
          key={page.map((c) => c.id).join()}
          page={page}
          busy={busy}
          canUndo={pages.length > 0}
          onKeepRest={keepRest}
          onUndo={undoPage}
          onCrop={cropOne}
        />
      )}
      {current && view === 'single' && (
        <CandidateReview
          key={current.id}
          candidate={current}
          country={countryName(current.country)}
          busy={busy}
          canUndo={decided.length > 0}
          onDecide={(decision) => decide(current, decision)}
          onUndo={undo}
        />
      )}
    </Page>
  );
}

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));

import { useEffect, useMemo, useState } from 'react';
import { useAppData } from '../app/AppData';
import { label, SUBJECT_ORDER, SUBJECTS } from '../app/labels';
import { EmptyState } from '../components/EmptyState';
import { Status } from '../components/Status';
import type { Candidate, CurationApi, Decision } from '../data/curation';
import { CandidateReview } from './curate/CandidateReview';
import { Page } from './manage/Page';
import './curate/curate.css';

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

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  const decide = (candidate: Candidate, decision: Decision) =>
    run(async () => {
      await api.decide(candidate.id, decision);
      setPending((list) => (list ?? []).filter((c) => c.id !== candidate.id));
      setDecided((list) => [...list, candidate]);
    });

  const undo = () =>
    run(async () => {
      const last = decided.at(-1);
      if (!last) return;
      const { subject: was, giveaways, caption } = last;
      await api.decide(last.id, { status: 'pending', subject: was, giveaways, caption });
      setDecided((list) => list.slice(0, -1));
      setPending((list) => [last, ...(list ?? [])]);
    });

  return (
    <Page
      user={user}
      title="Curate photos"
      subtitle={
        pending
          ? `${shown.length} pending${decided.length ? ` · ${decided.length} decided` : ''}`
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
      {pending && !current && (
        <EmptyState
          title="Nothing to curate"
          text="Run a content job with the commons or mapillary step to queue photos."
          actions={decided.length ? [{ label: 'Undo last', onClick: undo }] : []}
        />
      )}
      {current && (
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

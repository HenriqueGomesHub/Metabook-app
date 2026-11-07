import type { PoolCountry, Round } from '@metabook/core';
import { useId, useState } from 'react';
import { Button } from '../../components/Button';
import { resolveCountry } from '../manage/countries';

const MAX_ROWS = 5;
const MODES: { value: NonNullable<Round['mode']> | ''; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: 'move', label: 'Move' },
  { value: 'nm', label: 'NM' },
  { value: 'nmpz', label: 'NMPZ' },
];

interface Row {
  guess: string;
  truth: string;
  region: string;
}

const blank = (): Row => ({ guess: '', truth: '', region: '' });
const isBlank = (row: Row) => !row.guess.trim() && !row.truth.trim() && !row.region.trim();

export function LogGame({
  pool,
  onLog,
  onCancel,
}: {
  pool: PoolCountry[];
  onLog(rounds: Round[]): void;
  onCancel(): void;
}) {
  const listId = useId();
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [map, setMap] = useState('');
  const [mode, setMode] = useState<(typeof MODES)[number]['value']>('');
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState('');

  const edit = (index: number, patch: Partial<Row>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const now = Date.now();
    const found: Record<number, string> = {};
    const rounds: Round[] = [];
    rows.forEach((row, i) => {
      if (isBlank(row)) return;
      const guess = resolveCountry(pool, row.guess);
      const truth = resolveCountry(pool, row.truth);
      if (!guess || !truth) {
        found[i] = 'Pick both countries from the list.';
        return;
      }
      rounds.push({
        id: `manual:${crypto.randomUUID()}`,
        source: 'manual',
        playedAt: new Date(now + i).toISOString(),
        ...(map.trim() && { map: map.trim() }),
        ...(mode && { mode }),
        truth: { country: truth, ...(row.region.trim() && { region: row.region.trim() }) },
        guess: { country: guess },
      });
    });
    setErrors(found);
    const empty = rounds.length === 0 && Object.keys(found).length === 0;
    setFormError(empty ? 'Add at least one round.' : '');
    if (rounds.length > 0 && Object.keys(found).length === 0) onLog(rounds);
  }

  return (
    <form className="sheet" onSubmit={submit} aria-label="Log a game">
      <div className="sheet-head">
        <h2 className="headline">Log a game</h2>
        <span className="note">Up to {MAX_ROWS} rounds. Misses become confusions to drill.</span>
      </div>
      <datalist id={listId}>
        {pool.map((country) => (
          <option key={country.code} value={country.name} />
        ))}
      </datalist>
      <div className="fields">
        <label className="field">
          Map name
          <input value={map} onChange={(e) => setMap(e.target.value)} placeholder="Optional" />
        </label>
        <label className="field">
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.map((row, i) => (
        <fieldset key={i} className="log-row" aria-label={`Round ${i + 1}`}>
          <label className={`field${errors[i] ? ' field-error' : ''}`}>
            You guessed
            <input
              list={listId}
              role="combobox"
              value={row.guess}
              onChange={(e) => edit(i, { guess: e.target.value })}
              placeholder="Country"
            />
          </label>
          <label className={`field${errors[i] ? ' field-error' : ''}`}>
            It was
            <input
              list={listId}
              role="combobox"
              value={row.truth}
              onChange={(e) => edit(i, { truth: e.target.value })}
              placeholder="Country"
            />
          </label>
          <label className="field">
            Region
            <input
              value={row.region}
              onChange={(e) => edit(i, { region: e.target.value })}
              placeholder="Optional"
            />
          </label>
          {errors[i] && <p className="error log-error">{errors[i]}</p>}
        </fieldset>
      ))}
      {formError && (
        <p className="error" role="alert">
          {formError}
        </p>
      )}
      <div className="actions">
        {rows.length < MAX_ROWS && (
          <Button variant="ghost" onClick={() => setRows([...rows, blank()])}>
            Add round
          </Button>
        )}
        <Button type="submit">Log game</Button>
        <button type="button" className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

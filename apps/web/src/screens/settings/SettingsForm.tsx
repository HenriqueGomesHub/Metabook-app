import type { Settings } from '@metabook/core';
import { useId, useState } from 'react';
import { Button } from '../../components/Button';

type Format = Settings['formats'][number];
const FORMATS: { value: Format; label: string }[] = [
  { value: 'move', label: 'Move' },
  { value: 'nm', label: 'NM' },
  { value: 'nmpz', label: 'NMPZ' },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value) || min));

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function SettingsForm({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave(settings: Settings): Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const retentionId = useId();
  const set = (patch: Partial<Settings>) => {
    setDraft({ ...draft, ...patch });
    setStatus(null);
  };

  function toggle(format: Format) {
    const on = draft.formats.includes(format);
    if (on && draft.formats.length === 1) return;
    set({
      formats: FORMATS.map((f) => f.value).filter((f) =>
        f === format ? !on : draft.formats.includes(f),
      ),
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Settings = {
      ...draft,
      maxReviewsPerDay: clamp(draft.maxReviewsPerDay, 1, 1000),
      newPerDay: clamp(draft.newPerDay, 0, 200),
      blockDays: clamp(draft.blockDays, 7, 30),
      blockMinutes: clamp(draft.blockMinutes, 10, 60),
    };
    try {
      await onSave(next);
      setDraft(next);
      setStatus({ text: 'Saved.', ok: true });
    } catch (reason) {
      setStatus({ text: reason instanceof Error ? reason.message : String(reason), ok: false });
    }
  }

  return (
    <form className="sheet" onSubmit={submit} aria-label="Study settings">
      <h2 className="headline">Study</h2>
      <div className="fields">
        <NumberField
          label="Reviews per day"
          value={draft.maxReviewsPerDay}
          min={1}
          max={1000}
          onChange={(maxReviewsPerDay) => set({ maxReviewsPerDay })}
        />
        <NumberField
          label="New cards per day"
          value={draft.newPerDay}
          min={0}
          max={200}
          onChange={(newPerDay) => set({ newPerDay })}
        />
        <div className="field field-wide">
          <label htmlFor={retentionId}>Desired retention</label>
          <div className="range-row">
            <input
              id={retentionId}
              type="range"
              min={0.8}
              max={0.97}
              step={0.01}
              value={draft.desiredRetention}
              onChange={(e) => set({ desiredRetention: Number(e.target.value) })}
            />
            <output htmlFor={retentionId}>{Math.round(draft.desiredRetention * 100)}%</output>
          </div>
        </div>
        <NumberField
          label="Block length (days)"
          value={draft.blockDays}
          min={7}
          max={30}
          onChange={(blockDays) => set({ blockDays })}
        />
        <NumberField
          label="Block minutes per day"
          value={draft.blockMinutes}
          min={10}
          max={60}
          onChange={(blockMinutes) => set({ blockMinutes })}
        />
      </div>
      <div className="field">
        Formats you train
        <div className="toggles" role="group" aria-label="Formats you train">
          {FORMATS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className="toggle"
              aria-pressed={draft.formats.includes(value)}
              onClick={() => toggle(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="actions">
        <Button type="submit">Save settings</Button>
        {status && (
          <span className={`note ${status.ok ? 'note-ok' : 'note-warn'}`} role="status">
            {status.text}
          </span>
        )}
      </div>
    </form>
  );
}

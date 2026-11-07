import { useState } from 'react';
import { Field } from '../manage/Field';
import { emptyTipForm, formToTip, tipToForm, validateTip } from './validate';
import type { EditableTip, TipForm } from './validate';

export function TipEditor({
  existing,
  takenIds,
  onSave,
  children,
}: {
  existing?: EditableTip;
  takenIds: ReadonlySet<string>;
  onSave(tip: EditableTip): void;
  children?: React.ReactNode;
}) {
  const [form, setForm] = useState<TipForm>(existing ? tipToForm(existing) : emptyTipForm());
  const [errors, setErrors] = useState<ReturnType<typeof validateTip>>({});
  const set = <K extends keyof TipForm>(key: K, value: TipForm[K]) =>
    setForm({ ...form, [key]: value });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = validateTip(form, existing ? new Set() : takenIds);
    setErrors(found);
    if (Object.keys(found).length === 0) onSave(formToTip(form));
  }

  return (
    <form
      className="sheet"
      onSubmit={submit}
      aria-label={existing ? 'Edit tip' : 'New tip'}
      noValidate
    >
      <h2 className="headline">{existing ? 'Edit tip' : 'New tip'}</h2>
      <div className="fields">
        <Field label="Id" error={errors.id}>
          <input
            value={form.id}
            readOnly={Boolean(existing)}
            onChange={(e) => set('id', e.target.value)}
            placeholder="tip:flag:lt"
          />
        </Field>
        <Field label="Answer" error={errors.answer}>
          <input value={form.answer} onChange={(e) => set('answer', e.target.value)} />
        </Field>
        <Field label="Scope" error={errors.scope}>
          <input value={form.scope} onChange={(e) => set('scope', e.target.value)} />
        </Field>
        <Field label="Source URL" error={errors.source}>
          <input
            type="url"
            value={form.source}
            onChange={(e) => set('source', e.target.value)}
            placeholder="https://"
          />
        </Field>
        <Field label="Tip text" error={errors.text} wide>
          <textarea value={form.text} onChange={(e) => set('text', e.target.value)} />
        </Field>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={form.verified}
          onChange={(e) => set('verified', e.target.checked)}
        />
        Verified against the source
      </label>
      <div className="actions">
        <button type="submit" className="cta">
          Save tip
        </button>
        {children}
      </div>
    </form>
  );
}

import { useState } from 'react';
import { Field } from '../manage/Field';
import {
  CARD_TYPE_LIST,
  PROMPT_KINDS,
  cardToForm,
  emptyCardForm,
  formToCard,
  validateCard,
} from './validate';
import type { CardForm, EditableCard } from './validate';

/** Fields of a card; `existing` is set when editing, so its id is fixed. */
export function CardEditor({
  existing,
  takenIds,
  onSave,
  children,
}: {
  existing?: EditableCard;
  takenIds: ReadonlySet<string>;
  onSave(card: EditableCard): void;
  children?: React.ReactNode;
}) {
  const [form, setForm] = useState<CardForm>(existing ? cardToForm(existing) : emptyCardForm());
  const [errors, setErrors] = useState<ReturnType<typeof validateCard>>({});
  const set = <K extends keyof CardForm>(key: K, value: CardForm[K]) =>
    setForm({ ...form, [key]: value });
  const text = (key: Exclude<keyof CardForm, 'verified' | 'type' | 'promptKind'>) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = validateCard(form, existing ? new Set() : takenIds);
    setErrors(found);
    if (Object.keys(found).length === 0) onSave(formToCard(form));
  }

  return (
    <form
      className="sheet"
      onSubmit={submit}
      aria-label={existing ? 'Edit card' : 'New card'}
      noValidate
    >
      <h2 className="headline">{existing ? 'Edit card' : 'New card'}</h2>
      <div className="fields">
        <Field label="Id" error={errors.id}>
          <input {...text('id')} readOnly={Boolean(existing)} placeholder="flag:lt" />
        </Field>
        <Field label="Type">
          <select
            value={form.type}
            onChange={(e) => set('type', e.target.value as CardForm['type'])}
          >
            {CARD_TYPE_LIST.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </Field>
        <Field label="Country code" error={errors.country}>
          <input {...text('country')} placeholder="LT" maxLength={2} />
        </Field>
        <Field label="Answer" error={errors.answer}>
          <input {...text('answer')} />
        </Field>
        <Field label="Aliases (comma separated)" wide>
          <input {...text('aliases')} />
        </Field>
        <Field label="Options (comma separated)" wide>
          <input {...text('options')} />
        </Field>
        <Field label="Prompt kind">
          <select
            value={form.promptKind}
            onChange={(e) => set('promptKind', e.target.value as CardForm['promptKind'])}
          >
            {PROMPT_KINDS.map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </Field>
        <Field label="Prompt value" error={errors.promptValue}>
          <input {...text('promptValue')} />
        </Field>
        <Field label="Ratio (height:width)">
          <input {...text('ratio')} placeholder="2:3" />
        </Field>
        <Field label="Language">
          <input {...text('lang')} placeholder="ka" />
        </Field>
        <Field label="Image alt text">
          <input {...text('imageAlt')} />
        </Field>
        <Field label="Image credit">
          <input {...text('credit')} placeholder="Author · Licence" />
        </Field>
        <Field label="Image credit URL">
          <input {...text('creditUrl')} />
        </Field>
        <Field label="Tags (comma separated)" wide>
          <input {...text('tags')} />
        </Field>
        <Field label="Chapter">
          <input {...text('chapter')} placeholder="br:regions" />
        </Field>
        <Field label="Source URL" error={errors.source}>
          <input {...text('source')} type="url" placeholder="https://" />
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
          Save card
        </button>
        {children}
      </div>
    </form>
  );
}

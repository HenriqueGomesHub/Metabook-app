import type { Card, CardType, PromptKind, Tip } from '@metabook/core';

export const CARD_TYPE_LIST: CardType[] = [
  'flag',
  'script',
  'meta',
  'lookalike',
  'region',
  'areacode',
  'plate',
];
export const PROMPT_KINDS: PromptKind[] = ['flag', 'text', 'image', 'embed', 'svg'];

export type Errors<K extends string> = Partial<Record<K, string>>;

/** Fields shared with the bundled JSON, which also carries a `verified` flag. */
export type EditableCard = Card & { verified?: boolean };
export type EditableTip = Tip & { verified?: boolean };

export interface CardForm {
  id: string;
  type: CardType;
  country: string;
  answer: string;
  aliases: string;
  options: string;
  promptKind: PromptKind;
  promptValue: string;
  ratio: string;
  lang: string;
  tags: string;
  chapter: string;
  source: string;
  verified: boolean;
}

export interface TipForm {
  id: string;
  answer: string;
  scope: string;
  text: string;
  source: string;
  verified: boolean;
}

export const splitList = (text: string) =>
  text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function sourceError(source: string): string | undefined {
  try {
    const url = new URL(source.trim());
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? undefined
      : 'Source must be an http(s) URL.';
  } catch {
    return source.trim() ? 'Source must be an http(s) URL.' : 'A source URL is required.';
  }
}

const required = (value: string, message: string) => (value.trim() ? undefined : message);

function compact<K extends string>(errors: Errors<K>): Errors<K> {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v)) as Errors<K>;
}

export type CardField = keyof CardForm;
export type TipField = keyof TipForm;

export function validateCard(form: CardForm, takenIds: ReadonlySet<string>): Errors<CardField> {
  return compact<CardField>({
    id:
      required(form.id, 'An id is required.') ??
      (takenIds.has(form.id.trim()) ? 'This id is already used.' : undefined),
    country: /^[A-Za-z]{2}$/.test(form.country.trim())
      ? undefined
      : 'Use a two-letter country code.',
    answer: required(form.answer, 'An answer is required.'),
    promptValue: required(form.promptValue, 'A prompt is required.'),
    source: sourceError(form.source),
  });
}

export function validateTip(form: TipForm, takenIds: ReadonlySet<string>): Errors<TipField> {
  return compact<TipField>({
    id:
      required(form.id, 'An id is required.') ??
      (takenIds.has(form.id.trim()) ? 'This id is already used.' : undefined),
    answer: required(form.answer, 'An answer is required.'),
    scope: required(form.scope, 'A scope is required (a drill type or “any”).'),
    text: required(form.text, 'The tip text is required.'),
    source: sourceError(form.source),
  });
}

export function cardToForm(card: EditableCard): CardForm {
  return {
    id: card.id,
    type: card.type,
    country: card.country,
    answer: card.answer,
    aliases: (card.aliases ?? []).join(', '),
    options: (card.options ?? []).join(', '),
    promptKind: card.prompt.kind,
    promptValue: card.prompt.value,
    ratio: card.prompt.ratio ?? '',
    lang: card.prompt.lang ?? '',
    tags: card.tags.join(', '),
    chapter: card.chapter ?? '',
    source: card.source,
    verified: card.verified ?? false,
  };
}

export const emptyCardForm = (): CardForm => ({
  id: '',
  type: 'flag',
  country: '',
  answer: '',
  aliases: '',
  options: '',
  promptKind: 'text',
  promptValue: '',
  ratio: '',
  lang: '',
  tags: '',
  chapter: '',
  source: '',
  verified: false,
});

export function formToCard(form: CardForm): EditableCard {
  const aliases = splitList(form.aliases);
  const options = splitList(form.options);
  return {
    id: form.id.trim(),
    type: form.type,
    country: form.country.trim().toUpperCase(),
    answer: form.answer.trim(),
    ...(aliases.length > 0 && { aliases }),
    ...(options.length > 0 && { options }),
    prompt: {
      kind: form.promptKind,
      value: form.promptValue.trim(),
      ...(form.ratio.trim() && { ratio: form.ratio.trim() }),
      ...(form.lang.trim() && { lang: form.lang.trim() }),
    },
    tags: splitList(form.tags),
    ...(form.chapter.trim() && { chapter: form.chapter.trim() }),
    source: form.source.trim(),
    verified: form.verified,
  };
}

export const tipToForm = (tip: EditableTip): TipForm => ({
  id: tip.id,
  answer: tip.answer,
  scope: tip.scope,
  text: tip.text,
  source: tip.source,
  verified: tip.verified ?? false,
});

export const emptyTipForm = (): TipForm => ({
  id: '',
  answer: '',
  scope: 'any',
  text: '',
  source: '',
  verified: false,
});

export const formToTip = (form: TipForm): EditableTip => ({
  id: form.id.trim(),
  answer: form.answer.trim(),
  scope: form.scope.trim(),
  text: form.text.trim(),
  source: form.source.trim(),
  verified: form.verified,
});

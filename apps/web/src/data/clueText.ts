import type { Clue } from '@metabook/core';
import { useEffect, useState } from 'react';
import loaders from 'virtual:clue-text';

type Texts = Record<string, string[]>;

const loaded = new Map<string, Texts>();
const pending = new Map<string, Promise<Texts>>();

/** The content/clues file a clue comes from: its id's first part ("us-ak-x1y2" is in us.json). */
const fileOf = (clueId: string) => clueId.split('-')[0]?.toLowerCase() ?? '';

/** One country's clue text by clue id, fetched once; empty when there is none. */
export function loadClueTexts(file: string): Promise<Texts> {
  const hit = loaded.get(file);
  if (hit) return Promise.resolve(hit);
  let request = pending.get(file);
  if (!request) {
    const load = loaders[file];
    request = (load ? load().then((module) => module.default) : Promise.resolve({}))
      .then((texts) => {
        loaded.set(file, texts);
        return texts;
      })
      .finally(() => pending.delete(file));
    pending.set(file, request);
  }
  return request;
}

/** A clue's text: the catalogue's own when it carries it, else its country's text once loaded. */
export function useClueText(clue: Pick<Clue, 'id' | 'text'>): string[] | undefined {
  const file = fileOf(clue.id);
  const own = clue.text.length > 0 ? clue.text : undefined;
  const [texts, setTexts] = useState(() => loaded.get(file));
  useEffect(() => {
    if (own || texts) return;
    let live = true;
    loadClueTexts(file)
      .then((result) => live && setTexts(result))
      .catch(() => live && setTexts({}));
    return () => {
      live = false;
    };
  }, [file, own, texts]);
  return own ?? (texts ? (texts[clue.id] ?? []) : undefined);
}

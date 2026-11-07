import { useMemo, useState } from 'react';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Status } from '../components/Status';
import { bundled } from '../data/content';
import { CardEditor } from './editor/CardEditor';
import { TipEditor } from './editor/TipEditor';
import { CARD_TYPE_LIST } from './editor/validate';
import type { EditableCard, EditableTip } from './editor/validate';
import { Page } from './manage/Page';

const SHOWN = 200;

type Kind = 'card' | 'tip';
/** `id: null` is a new, unsaved item. */
type Selection = { kind: Kind; id: string | null };

export function Editor() {
  const { data, error } = useAppData();
  return data ? <EditorView data={data} /> : <Status error={error} />;
}

function EditorView({ data }: { data: AppSnapshot }) {
  const { saveOverride, deleteOverride } = useAppData();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [message, setMessage] = useState('');

  const items = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    const all = [
      ...data.content.cards.map((card) => ({
        kind: 'card' as const,
        id: card.id,
        title: card.answer,
        sub: `${card.id} · ${card.type}`,
        haystack: `${card.id} ${card.answer} ${card.country} ${(card.aliases ?? []).join(' ')}`,
        type: card.type as string,
      })),
      ...data.content.tips.map((tip) => ({
        kind: 'tip' as const,
        id: tip.id,
        title: tip.text,
        sub: `${tip.id} · tip for ${tip.answer}`,
        haystack: `${tip.id} ${tip.answer} ${tip.text}`,
        type: 'tip',
      })),
    ];
    return all.filter(
      (item) =>
        (filter === 'all' || item.type === filter) &&
        (!wanted || item.haystack.toLowerCase().includes(wanted)),
    );
  }, [data.content, query, filter]);

  const takenIds = useMemo(
    () => new Set([...data.content.cards, ...data.content.tips].map((item) => item.id)),
    [data.content],
  );
  const overridden = new Set(data.overrides.map((o) => o.id));
  const bundledIds = useMemo(
    () => new Set([...bundled.cards, ...bundled.tips].map((item) => item.id)),
    [],
  );

  const card =
    selection?.kind === 'card' && selection.id
      ? data.content.cards.find((c) => c.id === selection.id)
      : undefined;
  const tip =
    selection?.kind === 'tip' && selection.id
      ? data.content.tips.find((t) => t.id === selection.id)
      : undefined;

  async function save(kind: Kind, item: EditableCard | EditableTip) {
    setMessage('');
    try {
      await saveOverride(
        kind === 'card'
          ? { id: item.id, kind, data: item as EditableCard }
          : { id: item.id, kind, data: item as EditableTip },
      );
      setSelection({ kind, id: item.id });
      setMessage(`Saved ${item.id}.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function revert(id: string) {
    setMessage('');
    try {
      await deleteOverride(id);
      if (!bundledIds.has(id)) setSelection(null);
      setMessage(bundledIds.has(id) ? `Reverted ${id} to the bundled version.` : `Deleted ${id}.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const revertButton = (id: string) =>
    overridden.has(id) && (
      <Button variant="ghost" onClick={() => revert(id)}>
        {bundledIds.has(id) ? 'Revert to bundled' : 'Delete'}
      </Button>
    );

  return (
    <Page
      user={data.user}
      title="Editor"
      subtitle="Edit or add cards and tips. Every item needs a source URL; edits are stored as overrides."
      actions={
        <>
          <Button variant="ghost" onClick={() => setSelection({ kind: 'tip', id: null })}>
            New tip
          </Button>
          <Button onClick={() => setSelection({ kind: 'card', id: null })}>New card</Button>
        </>
      }
    >
      <div className="editor">
        <section className="sheet editor-list" aria-label="Cards and tips">
          <input
            className="input"
            type="search"
            aria-label="Search"
            placeholder="Search id, answer, text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="input"
            aria-label="Type"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All types</option>
            {[...CARD_TYPE_LIST, 'tip'].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <div className="editor-items">
            {items.slice(0, SHOWN).map((item) => (
              <button
                key={`${item.kind}:${item.id}`}
                type="button"
                className="item"
                aria-current={selection?.kind === item.kind && selection.id === item.id}
                onClick={() => {
                  setMessage('');
                  setSelection({ kind: item.kind, id: item.id });
                }}
              >
                <span>{item.title.length > 60 ? `${item.title.slice(0, 60)}…` : item.title}</span>
                <small>
                  {item.sub}
                  {overridden.has(item.id) && ' · edited'}
                </small>
              </button>
            ))}
            {items.length === 0 && (
              <EmptyState
                size="compact"
                title="Nothing matches"
                text="Try another search or type."
                actions={[
                  {
                    label: 'Clear filters',
                    onClick: () => {
                      setQuery('');
                      setFilter('all');
                    },
                  },
                ]}
              />
            )}
            {items.length > SHOWN && (
              <p className="note">
                Showing {SHOWN} of {items.length}. Narrow the search to see the rest.
              </p>
            )}
          </div>
        </section>
        <div className="manage">
          {message && (
            <p className="note note-ok" role="status">
              {message}
            </p>
          )}
          {selection?.kind === 'card' && (selection.id === null || card) && (
            <CardEditor
              key={selection.id ?? 'new-card'}
              existing={card}
              takenIds={takenIds}
              onSave={(item) => save('card', item)}
            >
              {card && revertButton(card.id)}
            </CardEditor>
          )}
          {selection?.kind === 'tip' && (selection.id === null || tip) && (
            <TipEditor
              key={selection.id ?? 'new-tip'}
              existing={tip}
              takenIds={takenIds}
              onSave={(item) => save('tip', item)}
            >
              {tip && revertButton(tip.id)}
            </TipEditor>
          )}
          {!selection && (
            <EmptyState
              title="Nothing selected"
              text="Pick a card or tip to edit, or create a new one."
            />
          )}
        </div>
      </div>
    </Page>
  );
}

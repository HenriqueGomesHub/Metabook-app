import { Fragment } from 'react';
import type { ReactNode } from 'react';

// Just what Plonk It writes: **bold**, *italic* or _italic_, and [links](https://…). Built as React
// elements, never as HTML, so nothing in the text can inject markup.
const TOKEN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_/g;

/** One paragraph of clue markdown as inline elements; links open in a new tab. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index;
    if (at > last) out.push(text.slice(last, at));
    const [, label, href, bold, bold2, em, em2] = match;
    if (href !== undefined && !label?.trim()) {
      // a link without words (an image link, an empty anchor) shows nothing
    } else if (label && href) {
      out.push(
        <a key={key++} href={href} target="_blank" rel="noreferrer noopener">
          {inline(label)}
        </a>,
      );
    } else if (bold ?? bold2) {
      out.push(<strong key={key++}>{inline((bold ?? bold2) as string)}</strong>);
    } else {
      out.push(<em key={key++}>{inline((em ?? em2) as string)}</em>);
    }
    last = at + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * A paragraph tidied for reading: image embeds and empty links gone, runs of spaces and stray
 * spaces before punctuation collapsed. Empty when nothing readable is left.
 */
export function tidy(paragraph: string): string {
  return paragraph
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\s*\]\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();
}

/** Clue paragraphs, each its own <p>; notes ("NOTE: …") set apart. Empty paragraphs are dropped. */
export function Markdown({ paragraphs }: { paragraphs: string[] }) {
  const readable = paragraphs.map(tidy).filter((p) => /[\p{L}\p{N}]/u.test(p));
  return (
    <>
      {readable.map((paragraph, i) => (
        <Fragment key={i}>
          <p className={/^\s*(\*\*)?note\b/i.test(paragraph) ? 'clue-note' : undefined}>
            {inline(paragraph)}
          </p>
        </Fragment>
      ))}
    </>
  );
}

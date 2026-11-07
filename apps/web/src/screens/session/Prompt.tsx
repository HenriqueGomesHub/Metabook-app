import type { CardPrompt } from '@metabook/core';
import { useState } from 'react';
import { FlagImage } from '../../components/FlagImage';

/**
 * Renders a card's prompt; `alt` must describe it without giving the answer away. Text with a
 * language is shown as a sign, plain text as a written clue.
 */
export function Prompt({
  prompt,
  alt,
  revealed = false,
}: {
  prompt: CardPrompt;
  alt: string;
  /** the card is answered; image credits can name the place, so they wait until then */
  revealed?: boolean;
}) {
  switch (prompt.kind) {
    case 'flag':
      return <FlagImage code={prompt.value} ratio={prompt.ratio} alt={alt} />;
    case 'text':
      return prompt.lang ? (
        <div className="sign" role="img" aria-label={alt}>
          <span lang={prompt.lang}>{prompt.value}</span>
        </div>
      ) : (
        <p className="clue">{prompt.value}</p>
      );
    case 'image':
      return <PromptImage key={prompt.value} prompt={prompt} alt={prompt.alt ?? alt} revealed={revealed} />;
    case 'svg':
      return (
        <img
          className="scene-media"
          src={`data:image/svg+xml,${encodeURIComponent(prompt.value)}`}
          alt={alt}
        />
      );
    case 'embed':
      return <iframe className="scene-media" src={prompt.value} title={alt} />;
  }
}

/** A photo filling its frame: shimmer while loading, fade in, credit pill once revealed; text if it fails. */
function PromptImage({
  prompt,
  alt,
  revealed,
}: {
  prompt: CardPrompt;
  alt: string;
  revealed: boolean;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  if (status === 'failed') {
    return <p className="clue">{prompt.alt ?? 'Image unavailable'}</p>;
  }
  return (
    <div className={`photo ${status}`}>
      <img
        className="scene-media"
        src={prompt.value}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('failed')}
      />
      {revealed &&
        prompt.credit &&
        (prompt.creditUrl ? (
          <a className="credit" href={prompt.creditUrl} target="_blank" rel="noreferrer">
            {prompt.credit}
          </a>
        ) : (
          <span className="credit">{prompt.credit}</span>
        ))}
    </div>
  );
}

/** Warms the browser cache for an upcoming image prompt. */
export function preloadPrompt(prompt: CardPrompt | undefined) {
  if (prompt?.kind !== 'image') return;
  const img = new Image();
  img.decoding = 'async';
  img.src = prompt.value;
}

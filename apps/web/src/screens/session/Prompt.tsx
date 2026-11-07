import type { CardPrompt } from '@metabook/core';
import { FlagImage } from '../../components/FlagImage';

/**
 * Renders a card's prompt; `alt` must describe it without giving the answer away. Text with a
 * language is shown as a sign, plain text as a written clue.
 */
export function Prompt({ prompt, alt }: { prompt: CardPrompt; alt: string }) {
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
      return <img className="scene-media" src={prompt.value} alt={alt} />;
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

import type { MediaItem } from '@metabook/core';
import { useState } from 'react';
import { label } from '../../app/labels';
import { mediaById, mediaUrl } from '../../data/media';
import { Mark, optionState } from './Mark';
import { Question, Stage } from './Stage';
import type { CardProps } from './types';
import { useKeys } from './useKeys';

/**
 * Reverse card: "Poland's bollard?" over a 2×2 grid of photos from different countries; keys 1–4
 * pick. Once answered every photo names its country, and its credit appears.
 */
export function PhotoChoiceCard({ card, options, outcome, onAnswer, reveal }: CardProps) {
  useKeys((event) => {
    const option = options[Number(event.key) - 1];
    if (option !== undefined) onAnswer(option);
  }, outcome === null);

  return (
    <Stage
      main={
        <div className="photo-grid settle">
          {options.map((id, i) => (
            <PhotoOption
              key={id}
              index={i}
              item={mediaById.get(id)}
              {...optionState(id, card.answer, outcome?.given)}
              revealed={outcome !== null}
              onPick={() => onAnswer(id)}
            />
          ))}
        </div>
      }
      side={<Question kicker="Pick the photo">{card.prompt.value}</Question>}
      reveal={reveal}
    />
  );
}

function PhotoOption({
  index,
  item,
  state,
  mark,
  revealed,
  onPick,
}: {
  index: number;
  item: MediaItem | undefined;
  state: string;
  mark?: 'ok' | 'bad';
  revealed: boolean;
  onPick(): void;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const country = item ? label(item.country.toUpperCase()) : undefined;
  return (
    <div className={`photo-opt ${state}`}>
      <button
        type="button"
        className={`photo ${status}`}
        disabled={revealed}
        onClick={onPick}
        aria-label={`Photo ${index + 1}${item?.caption ? `: ${item.caption}` : ''}`}
        style={item?.preview ? { backgroundImage: `url(${item.preview})` } : undefined}
      >
        {item && status !== 'failed' ? (
          <img
            className="scene-media"
            src={mediaUrl(item.url)}
            alt=""
            decoding="async"
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('failed')}
          />
        ) : (
          <span className="photo-missing">Photo unavailable</span>
        )}
        <kbd>{index + 1}</kbd>
        {mark && <Mark kind={mark} />}
      </button>
      {revealed && item && (
        <p className="photo-caption">
          <span>{country}</span>
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
            {item.credit}
          </a>
        </p>
      )}
    </div>
  );
}

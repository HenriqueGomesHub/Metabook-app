import { useAppData } from '../../app/AppData';
import { Button } from '../../components/Button';
import { clueHeading } from '../../components/clues/ClueDetails';
import { ClueImg } from '../../components/clues/ClueImg';
import { Glossed } from '../../components/clues/Glossed';
import { clueIndex } from '../../data/clueIndex';
import { Question, Stage } from './Stage';
import type { CardProps } from './types';
import { useKeys } from './useKeys';

/**
 * Refresh: a clue's photo shown with its answer, for a player who has seen most of this before.
 * "Knew it" passes it for weeks; "New to me" brings it back as a real question at the end of the
 * session. Seeing a forgotten clue once is usually enough to bring it back; asking it cold first
 * would only cost time.
 */
export function ScanCard({ card, mode, onAnswer }: CardProps) {
  // 'learn': a brand-new clue's first look, with one way on; its question comes a few cards later
  const learn = mode === 'learn';
  const { data } = useAppData();
  const clue = card.clue && data ? clueIndex(data.content).byId.get(card.clue.id) : undefined;
  const image = card.clue?.image;
  const knew = () => onAnswer(card.answer);
  const fresh = () => onAnswer('');
  useKeys((event) => {
    if (learn) {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        knew();
      }
    } else if (event.key === '1' || event.key.toLowerCase() === 'k') knew();
    else if (event.key === '2' || event.key.toLowerCase() === 'n') fresh();
  });
  return (
    <Stage
      main={
        <figure className="scene settle" style={{ '--ar': 4 / 3 } as React.CSSProperties}>
          {image ? (
            <ClueImg image={image} alt={card.prompt.alt ?? 'Clue'} cropped />
          ) : (
            <p className="clue">Image unavailable</p>
          )}
        </figure>
      }
      side={
        <>
          <Question kicker={learn ? 'New clue' : 'Refresh'}>{card.answer}</Question>
          {clue && (
            <div className="scan-clue rise d1">
              <p className="clue-title">{clueHeading(clue)}</p>
              {clue.summary && <Glossed className="clue-summary" text={clue.summary} />}
            </div>
          )}
          {learn ? (
            <Button className="reveal-next rise d2" onClick={knew} autoFocus>
              Got it
            </Button>
          ) : (
            <>
              <div className="options options-compact scan-actions rise d2">
                <button type="button" className="opt scan-knew" onClick={knew}>
                  <kbd>1</kbd> Knew it
                </button>
                <button type="button" className="opt" onClick={fresh}>
                  <kbd>2</kbd> New to me
                </button>
              </div>
              <p className="scan-note rise d2">
                Knew it: back in a few weeks. New to me: asked again at the end of the session.
              </p>
            </>
          )}
        </>
      }
      reveal={null}
    />
  );
}

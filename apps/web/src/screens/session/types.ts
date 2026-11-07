import type { Card, SessionMode } from '@metabook/core';
import type { ReactNode } from 'react';

/** `given` is empty when the learner chose "I don't know". */
export interface Outcome {
  given: string;
  correct: boolean;
}

export interface CardProps {
  card: Card;
  mode: SessionMode;
  /** choices for mcq and binary modes, in display order */
  options: string[];
  outcome: Outcome | null;
  onAnswer(given: string): void;
  /** the reveal panel, rendered once answered */
  reveal: ReactNode;
}

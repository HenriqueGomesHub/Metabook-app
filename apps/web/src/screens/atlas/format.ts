import { brStatesByCode } from '../../data/content';

export const pct = (value: number) => Math.round(value * 100);

/** A weak mastery bar turns warn-coloured below this. */
export const WEAK = 0.5;

/** Brazilian UF codes read better as state names; every other answer is shown as is. */
export const answerLabel = (answer: string) => brStatesByCode.get(answer)?.name ?? answer;

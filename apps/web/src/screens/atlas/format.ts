import { brStates } from '../../data/content';

export const pct = (value: number) => Math.round(value * 100);

/** A weak mastery bar turns warn-coloured below this. */
export const WEAK = 0.5;

const UF_NAMES = new Map(brStates.states.map((state) => [state.code, state.name]));

/** Brazilian UF codes read better as state names; every other answer is shown as is. */
export const answerLabel = (answer: string) => UF_NAMES.get(answer) ?? answer;

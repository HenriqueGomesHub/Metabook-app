import {
  answerKey,
  answerReview,
  contrastResult,
  gradeAnswer,
  newCardState,
  recordAnswer,
} from '@metabook/core';
import type {
  BlockDay,
  Card,
  CardState,
  Confusion,
  Grade,
  Review,
  Round,
  Settings,
  TipView,
  TrainingBlock,
} from '@metabook/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loadContent } from '../data/content';
import type { Content } from '../data/content';
import type { Auth, AuthUser, Mode } from '../data';
import type { CurationApi } from '../data/curation';
import type { CardOverride, Repository } from '../data/repository';
import {
  blockStudyChange,
  finishBlockChange,
  logRoundsChange,
  startBlockChange,
} from './dataActions';
import type { Change, IngestSummary } from './dataActions';
import { medianMs } from './stats';

export interface AppSnapshot {
  content: Content;
  settings: Settings;
  states: Record<string, CardState>;
  confusions: Confusion[];
  tipViews: TipView[];
  /** oldest first */
  reviews: Review[];
  /** newest first */
  rounds: Round[];
  /** newest first */
  blocks: TrainingBlock[];
  blockDays: BlockDay[];
  overrides: CardOverride[];
  user: AuthUser | null;
}

export interface AnswerInput {
  card: Card;
  given: string;
  correct: boolean;
  /** the answer the learner confused this card with, when known */
  picked?: string;
  msTaken: number;
  /** how many options were shown (0 for a typed answer) */
  choices?: number;
  /** a missed card asked again in the same session */
  retry?: boolean;
  contrastPair?: [string, string];
  /** a grade the learner chose (Saw it / Missed it after a round), instead of one from the answer */
  grade?: Grade;
}

interface AppDataValue {
  data: AppSnapshot | null;
  error: Error | null;
  repo: Repository;
  mode: Mode;
  auth: Auth;
  /** clue image review; null in local mode */
  curation: CurationApi | null;
  /** undefined until the session has been looked up */
  user: AuthUser | null | undefined;
  /** returns the card's new schedule state, when the answer produced one */
  answer(input: AnswerInput): CardState | undefined;
  recordTipView(tipId: string): void;
  logRounds(rounds: Round[]): IngestSummary;
  startBlock(block: TrainingBlock): void;
  finishBlock(blockId: string, status: 'finished' | 'ended-early'): void;
  saveSettings(settings: Settings): Promise<void>;
  saveOverride(override: CardOverride): Promise<void>;
  deleteOverride(id: string): Promise<void>;
  addCardStates(states: CardState[]): void;
  /** Reloads content (and clue image overrides) after a change made elsewhere, such as /curate. */
  refreshContent(): Promise<void>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function useAppData(): AppDataValue {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}

export function AppDataProvider({
  repo,
  auth,
  mode = 'local',
  curation = null,
  children,
}: {
  repo: Repository;
  auth: Auth;
  mode?: Mode;
  curation?: CurationApi | null;
  children: ReactNode;
}) {
  const [data, setData] = useState<AppSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    auth.getSession().then(
      (session) => live && setUser(session),
      (reason: unknown) =>
        live && setError(reason instanceof Error ? reason : Error(String(reason))),
    );
    const unsubscribe = auth.onAuthChange((session) => live && setUser(session));
    return () => {
      live = false;
      unsubscribe();
    };
  }, [auth]);

  // Reloads whenever the signed-in user changes; cloud mode loads nothing while signed out.
  const userId = user === undefined ? undefined : (user?.id ?? null);
  useEffect(() => {
    setData(null);
    if (userId === undefined || (mode === 'cloud' && userId === null)) return;
    let live = true;
    Promise.all([
      loadContent(repo),
      repo.getSettings(),
      repo.listCardStates(),
      repo.listConfusions(),
      repo.listTipViews(),
      repo.listReviews(),
      repo.listRounds(),
      repo.listBlocks(),
      repo.listCardOverrides(),
    ])
      .then(
        async ([
          content,
          settings,
          states,
          confusions,
          tipViews,
          reviews,
          rounds,
          blocks,
          overrides,
        ]) => {
          const blockDays = (await Promise.all(blocks.map((b) => repo.listBlockDays(b.id)))).flat();
          if (!live) return;
          const byId = Object.fromEntries(states.map((state) => [state.cardId, state]));
          setData({
            content,
            settings,
            states: byId,
            confusions,
            tipViews,
            reviews,
            rounds,
            blocks,
            blockDays,
            overrides,
            user: user ?? null,
          });
        },
      )
      .catch((reason: unknown) => {
        if (live) setError(reason instanceof Error ? reason : Error(String(reason)));
      });
    return () => {
      live = false;
    };
    // `user` itself is only read to fill the snapshot; the load follows its id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, mode, userId]);

  const persist = useCallback((work: Promise<unknown>[]) => {
    Promise.all(work).catch((reason: unknown) =>
      setError(reason instanceof Error ? reason : Error(String(reason))),
    );
  }, []);

  const answer = useCallback(
    (input: AnswerInput) => {
      if (!data) return undefined;
      const now = new Date();
      const { card, contrastPair } = input;
      /** Applies the answer's changes together with its time on the active training block. */
      const commit = (next: AppSnapshot, work: Promise<unknown>[]) => {
        const study = blockStudyChange(next, input.msTaken, now);
        setData(study?.data ?? next);
        persist([...work, ...(study?.save(repo) ?? [])]);
      };

      if (contrastPair) {
        const [picked, truth] = contrastPair;
        const confusions = contrastResult(data.confusions, { picked, truth }, input.correct);
        const changed = confusions.filter((c) => c.picked === picked && c.truth === truth);
        commit({ ...data, confusions }, [repo.upsertConfusions(changed)]);
        return undefined;
      }

      const grade =
        input.grade ??
        gradeAnswer({
          correct: input.correct,
          usedHint: false,
          msTaken: input.msTaken,
          medianMs: medianMs(data.reviews, data.content.cards, card.type),
          choices: input.choices,
          retry: input.retry,
        });
      const before = data.states[card.id] ?? newCardState(card.id, now);
      const state = answerReview(before, grade, now, data.settings.desiredRetention);
      const review: Review = {
        id: crypto.randomUUID(),
        cardId: card.id,
        grade,
        answerGiven: input.given,
        correct: input.correct,
        usedHint: false,
        msTaken: input.msTaken,
        reviewedAt: now.toISOString(),
      };
      const confusions =
        input.picked === undefined
          ? data.confusions
          : recordAnswer(
              data.confusions,
              answerKey(card, input.picked),
              answerKey(card, card.answer),
              input.correct,
              now,
            );
      const changed = confusions.filter((c) => !data.confusions.includes(c));

      commit(
        {
          ...data,
          states: { ...data.states, [card.id]: state },
          reviews: [...data.reviews, review],
          confusions,
        },
        [repo.upsertCardStates([state]), repo.addReview(review), repo.upsertConfusions(changed)],
      );
      return state;
    },
    [data, repo, persist],
  );

  const recordTipView = useCallback(
    (tipId: string) => {
      const view = { tipId, lastShown: new Date().toISOString() };
      setData(
        (current) =>
          current && {
            ...current,
            tipViews: [...current.tipViews.filter((v) => v.tipId !== tipId), view],
          },
      );
      persist([repo.recordTipView(view)]);
    },
    [repo, persist],
  );

  const apply = useCallback(
    (change: Change) => {
      setData(change.data);
      persist(change.save(repo));
    },
    [repo, persist],
  );

  const logRounds = useCallback(
    (rounds: Round[]): IngestSummary => {
      if (!data) return { rounds: 0, misses: 0, pulledForward: 0 };
      const { summary, ...change } = logRoundsChange(data, rounds, new Date());
      apply(change);
      return summary;
    },
    [data, apply],
  );

  const startBlock = useCallback(
    (block: TrainingBlock) => data && apply(startBlockChange(data, block)),
    [data, apply],
  );

  const finishBlock = useCallback(
    (blockId: string, status: 'finished' | 'ended-early') =>
      data && apply(finishBlockChange(data, blockId, status, new Date())),
    [data, apply],
  );

  const saveSettings = useCallback(
    async (settings: Settings) => {
      await repo.saveSettings(settings);
      setData((current) => current && { ...current, settings });
    },
    [repo],
  );

  /** Writes through the repository, then reloads content so the merged cards and tips refresh. */
  const reloadAfter = useCallback(
    async (write: Promise<void>) => {
      await write;
      const [content, overrides] = await Promise.all([loadContent(repo), repo.listCardOverrides()]);
      setData((current) => current && { ...current, content, overrides });
    },
    [repo],
  );

  const refreshContent = useCallback(() => reloadAfter(Promise.resolve()), [reloadAfter]);

  const saveOverride = useCallback(
    (override: CardOverride) => reloadAfter(repo.saveCardOverride(override)),
    [repo, reloadAfter],
  );

  const deleteOverride = useCallback(
    (id: string) => reloadAfter(repo.deleteCardOverride(id)),
    [repo, reloadAfter],
  );

  const addCardStates = useCallback(
    (states: CardState[]) => {
      setData(
        (current) =>
          current && {
            ...current,
            states: { ...current.states, ...Object.fromEntries(states.map((s) => [s.cardId, s])) },
          },
      );
      persist([repo.upsertCardStates(states)]);
    },
    [repo, persist],
  );

  const value = useMemo(
    () => ({
      data,
      error,
      repo,
      mode,
      auth,
      curation,
      user,
      answer,
      recordTipView,
      logRounds,
      startBlock,
      finishBlock,
      saveSettings,
      saveOverride,
      deleteOverride,
      addCardStates,
      refreshContent,
    }),
    [
      data,
      error,
      repo,
      mode,
      auth,
      curation,
      user,
      answer,
      recordTipView,
      logRounds,
      startBlock,
      finishBlock,
      saveSettings,
      saveOverride,
      deleteOverride,
      addCardStates,
      refreshContent,
    ],
  );
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

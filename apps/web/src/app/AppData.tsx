import {
  applyReview,
  contrastResult,
  gradeAnswer,
  newCardState,
  recordAnswer,
} from '@metabook/core';
import type { Card, CardState, Confusion, Review, Settings, TipView } from '@metabook/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loadContent } from '../data/content';
import type { Content } from '../data/content';
import type { Auth, AuthUser } from '../data';
import type { Repository } from '../data/repository';
import { medianMs } from './stats';

export interface AppSnapshot {
  content: Content;
  settings: Settings;
  states: Record<string, CardState>;
  confusions: Confusion[];
  tipViews: TipView[];
  /** oldest first */
  reviews: Review[];
  user: AuthUser | null;
}

export interface AnswerInput {
  card: Card;
  given: string;
  correct: boolean;
  /** the answer the learner confused this card with, when known */
  picked?: string;
  msTaken: number;
  contrastPair?: [string, string];
}

interface AppDataValue {
  data: AppSnapshot | null;
  error: Error | null;
  answer(input: AnswerInput): void;
  recordTipView(tipId: string): void;
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
  children,
}: {
  repo: Repository;
  auth: Auth;
  children: ReactNode;
}) {
  const [data, setData] = useState<AppSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      loadContent(repo),
      repo.getSettings(),
      repo.listCardStates(),
      repo.listConfusions(),
      repo.listTipViews(),
      repo.listReviews(),
      auth.getSession(),
    ]).then(
      ([content, settings, states, confusions, tipViews, reviews, user]) => {
        if (!live) return;
        const byId = Object.fromEntries(states.map((state) => [state.cardId, state]));
        setData({ content, settings, states: byId, confusions, tipViews, reviews, user });
      },
      (reason: unknown) =>
        live && setError(reason instanceof Error ? reason : Error(String(reason))),
    );
    return () => {
      live = false;
    };
  }, [repo, auth]);

  const persist = useCallback((work: Promise<unknown>[]) => {
    Promise.all(work).catch((reason: unknown) =>
      setError(reason instanceof Error ? reason : Error(String(reason))),
    );
  }, []);

  const answer = useCallback(
    (input: AnswerInput) => {
      if (!data) return;
      const now = new Date();
      const { card, contrastPair } = input;

      if (contrastPair) {
        const [picked, truth] = contrastPair;
        const confusions = contrastResult(data.confusions, { picked, truth }, input.correct);
        const changed = confusions.filter((c) => c.picked === picked && c.truth === truth);
        setData({ ...data, confusions });
        persist([repo.upsertConfusions(changed)]);
        return;
      }

      const grade = gradeAnswer({
        correct: input.correct,
        usedHint: false,
        msTaken: input.msTaken,
        medianMs: medianMs(data.reviews, data.content.cards, card.type),
      });
      const state = applyReview(
        data.states[card.id] ?? newCardState(card.id, now),
        grade,
        now,
        data.settings.desiredRetention,
      );
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
          : recordAnswer(data.confusions, input.picked, card.answer, input.correct, now);
      const changed = confusions.filter((c) => !data.confusions.includes(c));

      setData({
        ...data,
        states: { ...data.states, [card.id]: state },
        reviews: [...data.reviews, review],
        confusions,
      });
      persist([
        repo.upsertCardStates([state]),
        repo.addReview(review),
        repo.upsertConfusions(changed),
      ]);
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

  const value = useMemo(
    () => ({ data, error, answer, recordTipView }),
    [data, error, answer, recordTipView],
  );
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

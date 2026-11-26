import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade,
} from 'ts-fsrs';
import type {
  CardLearningState,
  ISODateString,
  ReviewRating,
  ReviewState,
} from '../../types/models';
import type { SchedulingOutcome, SpacedRepetitionScheduler } from './types';
export type { SchedulingOutcome, SpacedRepetitionScheduler };

function mapStateToFsrs(state: CardLearningState): State {
  switch (state) {
    case 'new':
      return State.New;
    case 'learning':
      return State.Learning;
    case 'review':
      return State.Review;
    case 'relearning':
      return State.Relearning;
  }
}

function mapStateFromFsrs(state: State): CardLearningState {
  switch (state) {
    case State.New:
      return 'new';
    case State.Learning:
      return 'learning';
    case State.Review:
      return 'review';
    case State.Relearning:
      return 'relearning';
    default:
      return 'new';
  }
}

function mapRatingToFsrs(rating: ReviewRating): Grade {
  switch (rating) {
    case 1:
      return Rating.Again;
    case 2:
      return Rating.Hard;
    case 3:
      return Rating.Good;
    case 4:
      return Rating.Easy;
  }
}

function toFsrsCard(reviewState: ReviewState): FsrsCard {
  const empty = createEmptyCard(new Date(reviewState.dueAt));
  return {
    ...empty,
    due: new Date(reviewState.dueAt),
    stability: reviewState.stability,
    difficulty: reviewState.difficulty,
    scheduled_days: reviewState.scheduledDays,
    reps: reviewState.reps,
    lapses: reviewState.lapses,
    state: mapStateToFsrs(reviewState.state),
    last_review: reviewState.lastReviewAt ? new Date(reviewState.lastReviewAt) : undefined,
  };
}

export class FsrsSpacedRepetitionScheduler implements SpacedRepetitionScheduler {
  readonly name = 'FSRS-5 (ts-fsrs)';
  private readonly engine = fsrs(
    generatorParameters({
      enable_fuzz: false,
      enable_short_term: true,
      request_retention: 0.9,
      maximum_interval: 36500,
    })
  );

  createInitialState(cardId: string, now: Date = new Date()): ReviewState {
    const iso = now.toISOString();
    return {
      cardId,
      dueAt: iso,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 'new',
      lastReviewAt: null,
      updatedAt: iso,
    };
  }

  review(
    currentState: ReviewState,
    rating: ReviewRating,
    now: Date = new Date()
  ): SchedulingOutcome {
    const card = toFsrsCard(currentState);
    const recordLog = this.engine.repeat(card, now);
    const chosen = recordLog[mapRatingToFsrs(rating)];
    const next = chosen.card;
    const nowIsoStr = now.toISOString();
    const stateAfter = mapStateFromFsrs(next.state);

    // For short-term intervals (< 1 day), derive fractional scheduled days from due - now
    const diffDays = Math.max(0, (next.due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const scheduledDays = next.scheduled_days > 0 ? next.scheduled_days : diffDays;
    const elapsedDays = currentState.lastReviewAt
      ? Math.max(
          0,
          (now.getTime() - new Date(currentState.lastReviewAt).getTime()) / (1000 * 60 * 60 * 24)
        )
      : 0;

    return {
      stateBefore: currentState.state,
      stateAfter,
      scheduledDays,
      elapsedDays,
      stability: next.stability,
      difficulty: next.difficulty,
      nextState: {
        cardId: currentState.cardId,
        dueAt: next.due.toISOString(),
        stability: next.stability,
        difficulty: next.difficulty,
        elapsedDays,
        scheduledDays,
        reps: next.reps,
        lapses: next.lapses,
        state: stateAfter,
        lastReviewAt: nowIsoStr,
        updatedAt: nowIsoStr,
      },
    };
  }

  previewAllRatings(
    currentState: ReviewState,
    now: Date = new Date()
  ): Record<ReviewRating, { dueAt: ISODateString; scheduledDays: number }> {
    const ratings: ReviewRating[] = [1, 2, 3, 4];
    const result = {} as Record<ReviewRating, { dueAt: ISODateString; scheduledDays: number }>;
    for (const r of ratings) {
      const outcome = this.review(currentState, r, now);
      result[r] = {
        dueAt: outcome.nextState.dueAt,
        scheduledDays: outcome.scheduledDays,
      };
    }
    return result;
  }
}

export const defaultScheduler: SpacedRepetitionScheduler = new FsrsSpacedRepetitionScheduler();

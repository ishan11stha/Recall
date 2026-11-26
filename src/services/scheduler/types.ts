import type {
  CardLearningState,
  ISODateString,
  ReviewRating,
  ReviewState,
} from '../../types/models';

export interface SchedulingOutcome {
  nextState: ReviewState;
  stateBefore: CardLearningState;
  stateAfter: CardLearningState;
  scheduledDays: number;
  elapsedDays: number;
  stability: number;
  difficulty: number;
}

export interface SpacedRepetitionScheduler {
  readonly name: string;
  createInitialState(cardId: string, now?: Date): ReviewState;
  review(currentState: ReviewState, rating: ReviewRating, now?: Date): SchedulingOutcome;
  previewAllRatings(
    currentState: ReviewState,
    now?: Date
  ): Record<ReviewRating, { dueAt: ISODateString; scheduledDays: number }>;
}

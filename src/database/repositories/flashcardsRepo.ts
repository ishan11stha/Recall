import type { DatabaseAdapter } from '../adapter';
import type {
  CardLearningState,
  Flashcard,
  FlashcardType,
  ReviewLog,
  ReviewRating,
  ReviewState,
  UUID,
} from '../../types/models';
import { generateId, nowIso } from '../../utils/id';
import {
  defaultScheduler,
  type SpacedRepetitionScheduler,
} from '../../services/scheduler/fsrsScheduler';
import { recordOutboxMutation } from './syncHelpers';

interface FlashcardJoinedRow {
  id: string;
  note_id: string | null;
  collection_id: string | null;
  card_type: string;
  front: string;
  back: string;
  extra: string | null;
  tags_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  collection_name?: string | null;
  note_title?: string | null;
  due_at?: string | null;
  stability?: number | null;
  difficulty?: number | null;
  elapsed_days?: number | null;
  scheduled_days?: number | null;
  reps?: number | null;
  lapses?: number | null;
  state?: string | null;
  last_review_at?: string | null;
  rs_updated_at?: string | null;
}

function mapFlashcard(row: FlashcardJoinedRow): Flashcard {
  const reviewState: ReviewState | undefined = row.due_at
    ? {
        cardId: row.id,
        dueAt: row.due_at,
        stability: row.stability ?? 0,
        difficulty: row.difficulty ?? 0,
        elapsedDays: row.elapsed_days ?? 0,
        scheduledDays: row.scheduled_days ?? 0,
        reps: row.reps ?? 0,
        lapses: row.lapses ?? 0,
        state: (row.state as CardLearningState) ?? 'new',
        lastReviewAt: row.last_review_at ?? null,
        updatedAt: row.rs_updated_at ?? row.updated_at,
      }
    : undefined;

  return {
    id: row.id,
    noteId: row.note_id,
    collectionId: row.collection_id,
    cardType: row.card_type as FlashcardType,
    front: row.front,
    back: row.back,
    extra: row.extra,
    tagsJson: row.tags_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    collectionName: row.collection_name ?? null,
    noteTitle: row.note_title ?? null,
    reviewState,
  };
}

const BASE_CARD_SELECT = `
  SELECT f.*,
    c.name AS collection_name,
    n.title AS note_title,
    rs.due_at, rs.stability, rs.difficulty, rs.elapsed_days,
    rs.scheduled_days, rs.reps, rs.lapses, rs.state,
    rs.last_review_at, rs.updated_at AS rs_updated_at
  FROM flashcards f
  LEFT JOIN review_states rs ON rs.card_id = f.id
  LEFT JOIN collections c ON c.id = f.collection_id AND c.deleted_at IS NULL
  LEFT JOIN notes n ON n.id = f.note_id AND n.deleted_at IS NULL
`;

export async function listFlashcards(
  db: DatabaseAdapter,
  options: { collectionId?: UUID | null; noteId?: UUID | null; dueOnly?: boolean; now?: Date } = {}
): Promise<Flashcard[]> {
  const conditions = ['f.deleted_at IS NULL'];
  const params: (string | number)[] = [];

  if (options.collectionId) {
    conditions.push('f.collection_id = ?');
    params.push(options.collectionId);
  }
  if (options.noteId) {
    conditions.push('f.note_id = ?');
    params.push(options.noteId);
  }
  if (options.dueOnly) {
    conditions.push('rs.due_at <= ?');
    params.push((options.now ?? new Date()).toISOString());
  }

  const orderBy = options.dueOnly ? 'rs.due_at ASC' : 'f.updated_at DESC';
  const rows = await db.getAllAsync<FlashcardJoinedRow>(
    `${BASE_CARD_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy}`,
    params
  );
  return rows.map(mapFlashcard);
}

export async function getFlashcardById(
  db: DatabaseAdapter,
  id: UUID
): Promise<Flashcard | null> {
  const row = await db.getFirstAsync<FlashcardJoinedRow>(
    `${BASE_CARD_SELECT} WHERE f.id = ? AND f.deleted_at IS NULL`,
    [id]
  );
  return row ? mapFlashcard(row) : null;
}

export async function createFlashcard(
  db: DatabaseAdapter,
  input: {
    front: string;
    back: string;
    cardType?: FlashcardType;
    extra?: string | null;
    noteId?: UUID | null;
    collectionId?: UUID | null;
    tags?: string[];
  },
  scheduler: SpacedRepetitionScheduler = defaultScheduler
): Promise<Flashcard> {
  const front = input.front.trim();
  const back = input.back.trim();
  if (!front || !back) {
    throw new Error('Flashcard front and back are required.');
  }

  const id = generateId();
  const ts = nowIso();
  const initialState = scheduler.createInitialState(id, new Date(ts));
  const tagsJson = JSON.stringify(input.tags ?? []);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO flashcards (
         id, note_id, collection_id, card_type, front, back, extra, tags_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.noteId ?? null,
        input.collectionId ?? null,
        input.cardType ?? 'basic',
        front,
        back,
        input.extra?.trim() || null,
        tagsJson,
        ts,
        ts,
      ]
    );

    await db.runAsync(
      `INSERT INTO review_states (
         card_id, due_at, stability, difficulty, elapsed_days,
         scheduled_days, reps, lapses, state, last_review_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        initialState.dueAt,
        initialState.stability,
        initialState.difficulty,
        initialState.elapsedDays,
        initialState.scheduledDays,
        initialState.reps,
        initialState.lapses,
        initialState.state,
        initialState.lastReviewAt,
        initialState.updatedAt,
      ]
    );

    await recordOutboxMutation(db, 'flashcard', id, 'upsert', { id, front });
  });

  const created = await getFlashcardById(db, id);
  if (!created) throw new Error('Failed to create flashcard');
  return created;
}

export async function updateFlashcard(
  db: DatabaseAdapter,
  id: UUID,
  patch: {
    front?: string;
    back?: string;
    cardType?: FlashcardType;
    extra?: string | null;
    collectionId?: UUID | null;
    tags?: string[];
  }
): Promise<Flashcard | null> {
  const existing = await getFlashcardById(db, id);
  if (!existing) return null;

  const front = patch.front !== undefined ? patch.front.trim() : existing.front;
  const back = patch.back !== undefined ? patch.back.trim() : existing.back;
  if (!front || !back) throw new Error('Flashcard front and back cannot be empty.');

  const ts = nowIso();
  const tagsJson = patch.tags !== undefined ? JSON.stringify(patch.tags) : existing.tagsJson;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE flashcards
       SET front = ?, back = ?, card_type = ?, extra = ?, collection_id = ?, tags_json = ?, updated_at = ?
       WHERE id = ?`,
      [
        front,
        back,
        patch.cardType ?? existing.cardType,
        patch.extra !== undefined ? patch.extra?.trim() || null : existing.extra,
        patch.collectionId !== undefined ? patch.collectionId : existing.collectionId,
        tagsJson,
        ts,
        id,
      ]
    );
    await recordOutboxMutation(db, 'flashcard', id, 'upsert', { id, front });
  });

  return getFlashcardById(db, id);
}

export async function deleteFlashcard(db: DatabaseAdapter, id: UUID): Promise<void> {
  const ts = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE flashcards SET deleted_at = ?, updated_at = ? WHERE id = ?',
      [ts, ts, id]
    );
    await recordOutboxMutation(db, 'flashcard', id, 'delete', { id });
  });
}

export async function recordFlashcardReview(
  db: DatabaseAdapter,
  cardId: UUID,
  rating: ReviewRating,
  options: {
    reviewDurationMs?: number;
    now?: Date;
    scheduler?: SpacedRepetitionScheduler;
  } = {}
): Promise<{ reviewState: ReviewState; reviewLog: ReviewLog }> {
  const scheduler = options.scheduler ?? defaultScheduler;
  const now = options.now ?? new Date();
  const card = await getFlashcardById(db, cardId);
  if (!card) throw new Error('Flashcard not found.');

  const currentState = card.reviewState ?? scheduler.createInitialState(cardId, now);
  const outcome = scheduler.review(currentState, rating, now);
  const logId = generateId();
  const reviewedAt = now.toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO review_states (
         card_id, due_at, stability, difficulty, elapsed_days,
         scheduled_days, reps, lapses, state, last_review_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(card_id) DO UPDATE SET
         due_at = excluded.due_at,
         stability = excluded.stability,
         difficulty = excluded.difficulty,
         elapsed_days = excluded.elapsed_days,
         scheduled_days = excluded.scheduled_days,
         reps = excluded.reps,
         lapses = excluded.lapses,
         state = excluded.state,
         last_review_at = excluded.last_review_at,
         updated_at = excluded.updated_at`,
      [
        cardId,
        outcome.nextState.dueAt,
        outcome.nextState.stability,
        outcome.nextState.difficulty,
        outcome.nextState.elapsedDays,
        outcome.nextState.scheduledDays,
        outcome.nextState.reps,
        outcome.nextState.lapses,
        outcome.nextState.state,
        outcome.nextState.lastReviewAt,
        outcome.nextState.updatedAt,
      ]
    );

    await db.runAsync(
      `INSERT INTO review_logs (
         id, card_id, rating, state_before, state_after,
         scheduled_days, elapsed_days, stability, difficulty,
         review_duration_ms, reviewed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        logId,
        cardId,
        rating,
        outcome.stateBefore,
        outcome.stateAfter,
        outcome.scheduledDays,
        outcome.elapsedDays,
        outcome.stability,
        outcome.difficulty,
        options.reviewDurationMs ?? 0,
        reviewedAt,
      ]
    );

    await recordOutboxMutation(db, 'review_log', logId, 'upsert', {
      id: logId,
      cardId,
      rating,
      reviewedAt,
    });
  });

  return {
    reviewState: outcome.nextState,
    reviewLog: {
      id: logId,
      cardId,
      rating,
      stateBefore: outcome.stateBefore,
      stateAfter: outcome.stateAfter,
      scheduledDays: outcome.scheduledDays,
      elapsedDays: outcome.elapsedDays,
      stability: outcome.stability,
      difficulty: outcome.difficulty,
      reviewDurationMs: options.reviewDurationMs ?? 0,
      reviewedAt,
    },
  };
}

export async function listReviewLogs(
  db: DatabaseAdapter,
  options: { cardId?: UUID; limit?: number } = {}
): Promise<ReviewLog[]> {
  const params: (string | number)[] = [];
  let where = '';
  if (options.cardId) {
    where = 'WHERE card_id = ?';
    params.push(options.cardId);
  }
  params.push(options.limit ?? 50);

  const rows = await db.getAllAsync<{
    id: string;
    card_id: string;
    rating: number;
    state_before: string;
    state_after: string;
    scheduled_days: number;
    elapsed_days: number;
    stability: number;
    difficulty: number;
    review_duration_ms: number;
    reviewed_at: string;
  }>(
    `SELECT * FROM review_logs ${where} ORDER BY reviewed_at DESC LIMIT ?`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    cardId: r.card_id,
    rating: r.rating as ReviewRating,
    stateBefore: r.state_before as CardLearningState,
    stateAfter: r.state_after as CardLearningState,
    scheduledDays: r.scheduled_days,
    elapsedDays: r.elapsed_days,
    stability: r.stability,
    difficulty: r.difficulty,
    reviewDurationMs: r.review_duration_ms,
    reviewedAt: r.reviewed_at,
  }));
}

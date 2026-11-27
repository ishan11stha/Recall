import {
  createFlashcard,
  getFlashcardById,
  listFlashcards,
  listReviewLogs,
  recordFlashcardReview,
} from '../../src/database/repositories/flashcardsRepo';
import { createNote } from '../../src/database/repositories/notesRepo';
import { FsrsSpacedRepetitionScheduler } from '../../src/services/scheduler/fsrsScheduler';
import { createTestDb } from '../helpers/nodeSqliteAdapter';

describe('FSRS Spaced Repetition & Review Logs', () => {
  it('schedules intervals monotonically across ratings and persists review history', async () => {
    const scheduler = new FsrsSpacedRepetitionScheduler();
    const t0 = new Date('2026-05-01T09:00:00.000Z');
    const initial = scheduler.createInitialState('card-1', t0);
    const previews = scheduler.previewAllRatings(initial, t0);

    expect(previews[4].scheduledDays).toBeGreaterThanOrEqual(previews[3].scheduledDays);
    expect(previews[3].scheduledDays).toBeGreaterThanOrEqual(previews[2].scheduledDays);

    const db = await createTestDb();
    try {
      const note = await createNote(db, {
        title: 'Fiscal Policy',
        content: 'Government spending and taxation.',
      });

      const card = await createFlashcard(db, {
        front: 'What is fiscal policy?',
        back: 'Use of government spending and taxation to influence the economy.',
        cardType: 'definition',
        noteId: note.id,
      });

      const dueBefore = await listFlashcards(db, { dueOnly: true, now: new Date() });
      expect(dueBefore.length).toBe(1);

      const now = new Date();
      const review1 = await recordFlashcardReview(db, card.id, 3, { now, reviewDurationMs: 2400 });
      expect(review1.reviewState.reps).toBe(1);
      expect(review1.reviewState.stability).toBeGreaterThan(0);

      const updatedCard = await getFlashcardById(db, card.id);
      expect(updatedCard?.reviewState?.reps).toBe(1);

      const logs = await listReviewLogs(db, { cardId: card.id });
      expect(logs.length).toBe(1);
      expect(logs[0].rating).toBe(3);
    } finally {
      await db.closeAsync();
    }
  });
});

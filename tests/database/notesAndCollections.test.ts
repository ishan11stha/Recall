import {
  createNote,
  listNoteRevisions,
  listNotes,
  listNotesByIds,
  restoreNote,
  restoreNoteRevision,
  softDeleteNote,
  updateNote,
} from '../../src/database/repositories/notesRepo';
import { listTags } from '../../src/database/repositories/tagsRepo';
import { createTestDb } from '../helpers/nodeSqliteAdapter';

describe('Notes, Batched Tags, Pinning, Revisions, and Trash', () => {
  it('batch-loads tags, orders pinned notes first, and fetches by IDs cleanly', async () => {
    const db = await createTestDb();
    try {
      const n1 = await createNote(db, {
        title: 'Spaced Repetition',
        content: 'Initial draft about memory decay.',
        tags: ['Learning', 'Memory', 'learning'],
      });
      const n2 = await createNote(db, {
        title: 'Orbital Mind Map',
        content: 'Visual concept navigation.',
        isPinned: true,
        tags: ['visual'],
      });

      const listed = await listNotes(db);
      expect(listed[0].id).toBe(n2.id); // pinned first
      expect(listed[0].tags?.map((t) => t.name)).toEqual(['visual']);
      expect(listed[1].tags?.map((t) => t.name)).toEqual(['learning', 'memory']);

      const byIds = await listNotesByIds(db, [n1.id]);
      expect(byIds.length).toBe(1);
      expect(byIds[0].tags?.map((t) => t.name)).toEqual(['learning', 'memory']);

      const allTags = await listTags(db);
      expect(allTags.length).toBe(3);

      // Edit with revision snapshot & restore
      await updateNote(db, n1.id, {
        content: 'Updated content explaining FSRS stability curves.',
        saveRevision: true,
      });
      const revisions = await listNoteRevisions(db, n1.id);
      expect(revisions.length).toBe(1);
      const restoredRev = await restoreNoteRevision(db, n1.id, revisions[0].id);
      expect(restoredRev?.content).toContain('Initial draft');

      // Soft delete & restore
      await softDeleteNote(db, n1.id);
      expect((await listNotes(db, { scope: 'all' })).length).toBe(1);
      expect((await listNotes(db, { scope: 'trash' })).length).toBe(1);

      await restoreNote(db, n1.id);
      expect((await listNotes(db, { scope: 'all' })).length).toBe(2);
    } finally {
      await db.closeAsync();
    }
  });
});

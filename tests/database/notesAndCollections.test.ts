import {
  createCollection,
  deleteCollectionSafely,
  getCollectionBreadcrumbs,
  listCollections,
} from '../../src/database/repositories/collectionsRepo';
import {
  createNote,
  createNoteTemplate,
  getNoteById,
  listNoteRevisions,
  listNotes,
  listNoteTemplates,
  restoreNote,
  restoreNoteRevision,
  softDeleteNote,
  updateNote,
} from '../../src/database/repositories/notesRepo';
import { listTags } from '../../src/database/repositories/tagsRepo';
import { createTestDb } from '../helpers/nodeSqliteAdapter';

describe('Notes, Collections, Tags, Revisions, and Templates', () => {
  it('supports nested collections and safe deletion without losing notes', async () => {
    const db = await createTestDb();
    try {
      const econ = await createCollection(db, { name: 'Economics' });
      const macro = await createCollection(db, { name: 'Macroeconomics', parentId: econ.id });
      const policy = await createCollection(db, { name: 'Monetary Policy', parentId: macro.id });

      const breadcrumbs = await getCollectionBreadcrumbs(db, policy.id);
      expect(breadcrumbs.map((b) => b.name)).toEqual([
        'Economics',
        'Macroeconomics',
        'Monetary Policy',
      ]);

      const note = await createNote(db, {
        title: 'Inflation Targeting',
        content: 'Central banks adjust policy rates to stabilize inflation.',
        noteType: 'concept',
        collectionId: macro.id,
      });
      expect(note.isInbox).toBe(false);

      // Deleting Macroeconomics should move its notes and child collections safely to Economics
      await deleteCollectionSafely(db, macro.id);

      const updatedNote = await getNoteById(db, note.id);
      expect(updatedNote?.collectionId).toBe(econ.id);

      const childrenOfEcon = await listCollections(db, econ.id);
      expect(childrenOfEcon.map((c) => c.name)).toContain('Monetary Policy');

      // Deleting top-level Economics moves notes safely back to Inbox
      await deleteCollectionSafely(db, econ.id);
      const inboxNote = await getNoteById(db, note.id);
      expect(inboxNote?.collectionId).toBeNull();
      expect(inboxNote?.isInbox).toBe(true);
    } finally {
      await db.closeAsync();
    }
  });

  it('tracks tags, revisions, pin/favorite/archive/trash, and templates', async () => {
    const db = await createTestDb();
    try {
      const note = await createNote(db, {
        title: 'Spaced Repetition',
        content: 'Initial draft about memory decay.',
        tags: ['Learning', 'Memory', 'learning'], // duplicate normalized
      });

      expect(note.tags?.map((t) => t.name)).toEqual(['learning', 'memory']);
      const allTags = await listTags(db);
      expect(allTags.length).toBe(2);

      // Edit with revision snapshot
      const edited = await updateNote(db, note.id, {
        content: 'Updated content explaining FSRS stability and retrievability curves.',
        isPinned: true,
        isFavorite: true,
        saveRevision: true,
      });
      expect(edited?.isPinned).toBe(true);
      expect(edited?.wordCount).toBeGreaterThan(5);

      const revisions = await listNoteRevisions(db, note.id);
      expect(revisions.length).toBe(1);
      expect(revisions[0].content).toContain('Initial draft');

      // Restore revision
      const restoredRev = await restoreNoteRevision(db, note.id, revisions[0].id);
      expect(restoredRev?.content).toContain('Initial draft');

      // Soft delete & restore
      await softDeleteNote(db, note.id);
      expect((await listNotes(db, { scope: 'all' })).length).toBe(0);
      expect((await listNotes(db, { scope: 'trash' })).length).toBe(1);

      await restoreNote(db, note.id);
      expect((await listNotes(db, { scope: 'all' })).length).toBe(1);

      // Templates
      await createNoteTemplate(db, {
        name: 'Concept Card',
        noteType: 'concept',
        contentTemplate: '## Definition\n\n## Examples\n',
      });
      const templates = await listNoteTemplates(db);
      expect(templates.length).toBe(1);
      expect(templates[0].name).toBe('Concept Card');
    } finally {
      await db.closeAsync();
    }
  });
});

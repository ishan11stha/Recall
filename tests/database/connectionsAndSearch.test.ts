import { createCollection } from '../../src/database/repositories/collectionsRepo';
import { createNote, softDeleteNote, updateNote } from '../../src/database/repositories/notesRepo';
import {
  createNoteLink,
  getConnectionsForNote,
  getKnowledgeGraphData,
} from '../../src/database/repositories/linksRepo';
import { createAttachment } from '../../src/database/repositories/attachmentsRepo';
import { searchService } from '../../src/services/search/searchService';
import { createTestDb } from '../helpers/nodeSqliteAdapter';

describe('Knowledge Connections & SQLite FTS5 Search', () => {
  it('manages typed connections, backlinks, and graph data', async () => {
    const db = await createTestDb();
    try {
      const a = await createNote(db, { title: 'Central Banking', content: 'Monetary authority.' });
      const b = await createNote(db, { title: 'Policy Rate', content: 'Interest rate instrument.' });
      const c = await createNote(db, { title: 'Inflation', content: 'Sustained price rise.' });

      await createNoteLink(db, {
        sourceNoteId: a.id,
        targetNoteId: b.id,
        relationshipType: 'part_of',
        description: 'Key instrument',
      });
      await createNoteLink(db, {
        sourceNoteId: b.id,
        targetNoteId: c.id,
        relationshipType: 'supports',
      });

      const bConns = await getConnectionsForNote(db, b.id);
      expect(bConns.backlinks.length).toBe(1);
      expect(bConns.backlinks[0].linkedNoteId).toBe(a.id);
      expect(bConns.outgoing.length).toBe(1);
      expect(bConns.outgoing[0].linkedNoteId).toBe(c.id);

      const graph = await getKnowledgeGraphData(db);
      expect(graph.nodes.length).toBe(3);
      expect(graph.edges.length).toBe(2);
    } finally {
      await db.closeAsync();
    }
  });

  it('keeps FTS5 synchronized on insert/update/delete and supports filters', async () => {
    const db = await createTestDb();
    try {
      const col = await createCollection(db, { name: 'Banking' });
      const n1 = await createNote(db, {
        title: 'Commercial Banking',
        content: 'Fractional reserve lending and liquidity ratios.',
        noteType: 'concept',
        collectionId: col.id,
        tags: ['finance'],
      });
      await createAttachment(db, {
        title: 'Monetary Policy Document.pdf',
        fileType: 'pdf',
        notesMetadata: 'Liquidity and bank rate report',
        linkedNoteIds: [n1.id],
      });

      // Search across both notes and resources
      const res1 = await searchService.search(db, 'liquidity');
      expect(res1.some((r) => r.entityType === 'note' && r.id === n1.id)).toBe(true);
      expect(res1.some((r) => r.entityType === 'resource')).toBe(true);

      // Update note content -> FTS5 trigger should reflect new terms immediately
      await updateNote(db, n1.id, { content: 'Capital adequacy under Basel III framework.' });
      const baselResults = await searchService.search(db, 'Basel', {
        collectionId: col.id,
        noteType: 'concept',
      });
      expect(baselResults.length).toBe(1);
      expect(baselResults[0].title).toBe('Commercial Banking');

      // Soft delete removes note from active FTS5 search
      await softDeleteNote(db, n1.id);
      const afterDelete = await searchService.search(db, 'Basel');
      expect(afterDelete.length).toBe(0);

      // Recent searches
      await searchService.recordRecentSearch(db, 'Basel');
      const recent = await searchService.getRecentSearches(db);
      expect(recent).toEqual(['Basel']);
    } finally {
      await db.closeAsync();
    }
  });
});

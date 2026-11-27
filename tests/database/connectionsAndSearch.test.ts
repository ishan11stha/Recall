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
  it('manages typed connections, backlinks, linkedDegree, and graph data', async () => {
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

      const aConns = await getConnectionsForNote(db, a.id);
      expect(aConns.outgoing.length).toBe(1);
      // b connects to c, so b's linkedDegree from a's perspective is 1
      expect(aConns.outgoing[0].linkedDegree).toBe(1);

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

  it('keeps FTS5 synchronized on insert/update/delete', async () => {
    const db = await createTestDb();
    try {
      const n1 = await createNote(db, {
        title: 'Commercial Banking',
        content: 'Fractional reserve lending and liquidity ratios.',
        noteType: 'concept',
        tags: ['finance'],
      });
      await createAttachment(db, {
        title: 'Monetary Policy Document.pdf',
        fileType: 'pdf',
        notesMetadata: 'Liquidity and bank rate report',
        linkedNoteIds: [n1.id],
      });

      const res1 = await searchService.search(db, 'liquidity');
      expect(res1.some((r) => r.entityType === 'note' && r.id === n1.id)).toBe(true);
      expect(res1.some((r) => r.entityType === 'resource')).toBe(true);

      await updateNote(db, n1.id, { content: 'Capital adequacy under Basel III framework.' });
      const baselResults = await searchService.search(db, 'Basel', { noteType: 'concept' });
      expect(baselResults.length).toBe(1);
      expect(baselResults[0].title).toBe('Commercial Banking');

      await softDeleteNote(db, n1.id);
      const afterDelete = await searchService.search(db, 'Basel');
      expect(afterDelete.length).toBe(0);
    } finally {
      await db.closeAsync();
    }
  });
});

import { createCollection } from '../../src/database/repositories/collectionsRepo';
import { createNote, listNotes } from '../../src/database/repositories/notesRepo';
import { createNoteLink } from '../../src/database/repositories/linksRepo';
import {
  createFlashcard,
  listFlashcards,
  recordFlashcardReview,
} from '../../src/database/repositories/flashcardsRepo';
import { createAttachment, listAttachments } from '../../src/database/repositories/attachmentsRepo';
import { saveAppSettings, loadAppSettings } from '../../src/database/repositories/settingsRepo';
import {
  createBackupZipBase64,
  exportLibraryAsJson,
  exportLibraryAsMarkdown,
  restoreFromBackupZipBase64,
  type AttachmentFileIO,
} from '../../src/services/backup/backupService';
import { searchService } from '../../src/services/search/searchService';
import { createTestDb } from '../helpers/nodeSqliteAdapter';

describe('Versioned Backup, Restore, and Portable Exports', () => {
  it('exports full archive including attachments and restores cleanly into a fresh DB', async () => {
    const sourceDb = await createTestDb();
    const freshDb = await createTestDb();

    // In-memory attachment file store for testing binary backup/restore
    const virtualFiles = new Map<string, string>([
      ['file:///app/recall_attachments/doc1.pdf', Buffer.from('%PDF-1.7 sample').toString('base64')],
    ]);

    const mockFileIO: AttachmentFileIO = {
      async readFileBase64(uri: string) {
        return virtualFiles.get(uri) ?? null;
      },
      async writeFileBase64(filename: string, base64: string) {
        const uri = `file:///restored/${filename}`;
        virtualFiles.set(uri, base64);
        return uri;
      },
    };

    try {
      const col = await createCollection(sourceDb, { name: 'Management' });
      const n1 = await createNote(sourceDb, {
        title: 'Strategic Management',
        content: 'Competitive advantage and long-term positioning.',
        collectionId: col.id,
        tags: ['strategy', 'core'],
      });
      const n2 = await createNote(sourceDb, {
        title: 'Organizational Behaviour',
        content: 'Human dynamics inside organizations.',
        collectionId: col.id,
      });
      await createNoteLink(sourceDb, {
        sourceNoteId: n1.id,
        targetNoteId: n2.id,
        relationshipType: 'related_to',
      });
      await createAttachment(sourceDb, {
        title: 'Strategy Paper.pdf',
        fileType: 'pdf',
        localUri: 'file:///app/recall_attachments/doc1.pdf',
        fileSizeBytes: 15,
        linkedNoteIds: [n1.id],
      });
      const card = await createFlashcard(sourceDb, {
        front: 'Define competitive advantage',
        back: 'Attributes allowing an organization to outperform peers.',
        noteId: n1.id,
        collectionId: col.id,
      });
      await recordFlashcardReview(sourceDb, card.id, 3);
      await saveAppSettings(sourceDb, { theme: 'dark', fontSize: 'large' });

      // Export Markdown & JSON
      const md = await exportLibraryAsMarkdown(sourceDb);
      expect(md).toContain('# Strategic Management');
      const json = await exportLibraryAsJson(sourceDb);
      expect(JSON.parse(json).manifest.app).toBe('RECALL');

      // Export full versioned ZIP
      const { base64, manifest } = await createBackupZipBase64(sourceDb, mockFileIO);
      expect(manifest.backupFormatVersion).toBe(1);
      expect(manifest.counts.notes).toBe(2);
      expect(manifest.counts.flashcards).toBe(1);
      expect(manifest.counts.attachments).toBe(1);

      // Restore into completely fresh DB
      const restoreOutcome = await restoreFromBackupZipBase64(freshDb, base64, mockFileIO);
      expect(restoreOutcome.integrityOk).toBe(true);

      const restoredNotes = await listNotes(freshDb);
      expect(restoredNotes.length).toBe(2);

      const restoredCards = await listFlashcards(freshDb);
      expect(restoredCards.length).toBe(1);
      expect(restoredCards[0].reviewState?.reps).toBe(1);

      const restoredAtts = await listAttachments(freshDb);
      expect(restoredAtts.length).toBe(1);
      expect(restoredAtts[0].localUri).toContain('file:///restored/');

      const restoredSettings = await loadAppSettings(freshDb);
      expect(restoredSettings.theme).toBe('dark');
      expect(restoredSettings.fontSize).toBe('large');

      // Verify FTS5 index was rebuilt and is immediately searchable after restore
      const searchHits = await searchService.search(freshDb, 'Competitive');
      expect(searchHits.length).toBeGreaterThanOrEqual(1);
      expect(searchHits[0].title).toBe('Strategic Management');
    } finally {
      await sourceDb.closeAsync();
      await freshDb.closeAsync();
    }
  });
});

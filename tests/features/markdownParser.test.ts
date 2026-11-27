import {
  extractInlineTags,
  extractWikilinks,
  syncNoteWikilinksAndTags,
} from '../../src/features/notes/markdownParser';
import { createNote } from '../../src/database/repositories/notesRepo';
import { getConnectionsForNote } from '../../src/database/repositories/linksRepo';
import { getTagsForNote } from '../../src/database/repositories/tagsRepo';
import { createTestDb } from '../helpers/nodeSqliteAdapter';

describe('Markdown [[Wikilink]] and #tag parser & sync', () => {
  it('extracts wikilinks and inline tags while ignoring headings and code blocks', () => {
    const md = [
      '# Main Heading',
      'See [[Monetary Policy]] and [[Inflation|CPI inflation]] for #economics #macro.',
      '```',
      'const ignored = "[[Not A Link]] #notatag";',
      '```',
      'Inline `[[Also Ignored]] #nope` and repeat [[monetary policy]].',
    ].join('\n');

    expect(extractWikilinks(md)).toEqual(['Monetary Policy', 'Inflation']);
    expect(extractInlineTags(md)).toEqual(['economics', 'macro']);
  });

  it('automatically syncs [[Wikilinks]] to note_links and #tags to note_tags in SQLite', async () => {
    const db = await createTestDb();
    try {
      const target = await createNote(db, { title: 'Monetary Policy', content: 'Rates.' });
      const source = await createNote(db, {
        title: 'Inflation',
        content: 'Closely tied to [[Monetary Policy]] #economics #central-bank',
      });

      await syncNoteWikilinksAndTags(db, source.id, source.content);

      const conns = await getConnectionsForNote(db, target.id);
      expect(conns.backlinks.length).toBe(1);
      expect(conns.backlinks[0].linkedNoteId).toBe(source.id);

      const tags = await getTagsForNote(db, source.id);
      expect(tags.map((t) => t.name)).toEqual(['central-bank', 'economics']);
    } finally {
      await db.closeAsync();
    }
  });
});

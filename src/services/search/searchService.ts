import type { DatabaseAdapter } from '../../database/adapter';
import type {
  AttachmentType,
  NoteType,
  SearchFilters,
  SearchResultItem,
} from '../../types/models';
import { generateId, nowIso, sanitizeFtsQuery } from '../../utils/id';

export interface SearchProvider {
  readonly id: string;
  search(
    db: DatabaseAdapter,
    query: string,
    filters?: SearchFilters
  ): Promise<SearchResultItem[]>;
}

function getDateCutoffIso(range?: SearchFilters['dateRange']): string | null {
  if (!range || range === 'all') return null;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export class Fts5SearchProvider implements SearchProvider {
  readonly id = 'sqlite-fts5';

  async search(
    db: DatabaseAdapter,
    rawQuery: string,
    filters: SearchFilters = {}
  ): Promise<SearchResultItem[]> {
    const trimmed = rawQuery.trim();
    const ftsQuery = sanitizeFtsQuery(trimmed);
    const results: SearchResultItem[] = [];
    const cutoffIso = getDateCutoffIso(filters.dateRange);

    if (!ftsQuery) {
      return [];
    }

    // 1. FTS5 search across notes (title + content)
    const noteConditions = ['notes_fts MATCH ?', 'n.deleted_at IS NULL'];
    const noteParams: (string | number)[] = [ftsQuery];

    if (filters.collectionId) {
      noteConditions.push('n.collection_id = ?');
      noteParams.push(filters.collectionId);
    }
    if (filters.noteType) {
      noteConditions.push('n.note_type = ?');
      noteParams.push(filters.noteType);
    }
    if (cutoffIso) {
      noteConditions.push('n.updated_at >= ?');
      noteParams.push(cutoffIso);
    }

    let tagJoin = '';
    if (filters.tagId) {
      tagJoin = 'INNER JOIN note_tags nt ON nt.note_id = n.id';
      noteConditions.push('nt.tag_id = ?');
      noteParams.push(filters.tagId);
    }

    const ftsNoteRows = await db.getAllAsync<{
      id: string;
      title: string;
      note_type: string;
      collection_name: string | null;
      updated_at: string;
      snippet: string;
      rank: number;
    }>(
      `SELECT n.id, n.title, n.note_type, c.name AS collection_name, n.updated_at,
         snippet(notes_fts, 2, '[[', ']]', '…', 18) AS snippet,
         bm25(notes_fts) AS rank
       FROM notes_fts
       INNER JOIN notes n ON n.id = notes_fts.note_id
       LEFT JOIN collections c ON c.id = n.collection_id AND c.deleted_at IS NULL
       ${tagJoin}
       WHERE ${noteConditions.join(' AND ')}
       ORDER BY rank ASC
       LIMIT 40`,
      noteParams
    );

    const seenNoteIds = new Set<string>();
    for (const row of ftsNoteRows) {
      seenNoteIds.add(row.id);
      results.push({
        id: row.id,
        entityType: 'note',
        title: row.title,
        snippet: row.snippet || '',
        noteType: row.note_type as NoteType,
        collectionName: row.collection_name,
        updatedAt: row.updated_at,
        rank: row.rank,
      });
    }

    // 2. Also match notes by tag name if not already in FTS results
    const tagLike = `%${trimmed.toLowerCase()}%`;
    const tagNoteConditions = ['n.deleted_at IS NULL', 'LOWER(t.name) LIKE ?'];
    const tagNoteParams: (string | number)[] = [tagLike];
    if (filters.collectionId) {
      tagNoteConditions.push('n.collection_id = ?');
      tagNoteParams.push(filters.collectionId);
    }
    if (filters.noteType) {
      tagNoteConditions.push('n.note_type = ?');
      tagNoteParams.push(filters.noteType);
    }
    if (cutoffIso) {
      tagNoteConditions.push('n.updated_at >= ?');
      tagNoteParams.push(cutoffIso);
    }

    const tagMatchedNotes = await db.getAllAsync<{
      id: string;
      title: string;
      note_type: string;
      collection_name: string | null;
      updated_at: string;
      tag_name: string;
    }>(
      `SELECT DISTINCT n.id, n.title, n.note_type, c.name AS collection_name, n.updated_at, t.name AS tag_name
       FROM tags t
       INNER JOIN note_tags nt ON nt.tag_id = t.id
       INNER JOIN notes n ON n.id = nt.note_id
       LEFT JOIN collections c ON c.id = n.collection_id AND c.deleted_at IS NULL
       WHERE ${tagNoteConditions.join(' AND ')}
       LIMIT 20`,
      tagNoteParams
    );

    for (const row of tagMatchedNotes) {
      if (seenNoteIds.has(row.id)) continue;
      seenNoteIds.add(row.id);
      results.push({
        id: row.id,
        entityType: 'note',
        title: row.title,
        snippet: `Tagged #[[${row.tag_name}]]`,
        noteType: row.note_type as NoteType,
        collectionName: row.collection_name,
        updatedAt: row.updated_at,
        rank: 5,
      });
    }

    // 3. Search collections when no note-specific filters are active
    if (!filters.noteType && !filters.tagId && !filters.collectionId) {
      const colRows = await db.getAllAsync<{
        id: string;
        name: string;
        description: string | null;
        updated_at: string;
      }>(
        `SELECT id, name, description, updated_at
         FROM collections
         WHERE deleted_at IS NULL AND (LOWER(name) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ?)
         ORDER BY name ASC
         LIMIT 10`,
        [tagLike, tagLike]
      );

      for (const col of colRows) {
        results.push({
          id: col.id,
          entityType: 'collection',
          title: col.name,
          snippet: col.description || 'Collection',
          updatedAt: col.updated_at,
          rank: 10,
        });
      }
    }

    // 4. Search resources / attachments via FTS5
    if (filters.includeResources !== false && !filters.noteType && !filters.tagId) {
      const attConditions = ['attachments_fts MATCH ?', 'a.deleted_at IS NULL'];
      const attParams: (string | number)[] = [ftsQuery];
      if (cutoffIso) {
        attConditions.push('a.updated_at >= ?');
        attParams.push(cutoffIso);
      }

      const attRows = await db.getAllAsync<{
        id: string;
        title: string;
        file_type: string;
        updated_at: string;
        snippet: string;
        rank: number;
      }>(
        `SELECT a.id, a.title, a.file_type, a.updated_at,
           snippet(attachments_fts, 1, '[[', ']]', '…', 14) AS snippet,
           bm25(attachments_fts) AS rank
         FROM attachments_fts
         INNER JOIN attachments a ON a.id = attachments_fts.attachment_id
         WHERE ${attConditions.join(' AND ')}
         ORDER BY rank ASC
         LIMIT 20`,
        attParams
      );

      for (const att of attRows) {
        results.push({
          id: att.id,
          entityType: 'resource',
          title: att.title,
          snippet: att.snippet || att.file_type,
          fileType: att.file_type as AttachmentType,
          updatedAt: att.updated_at,
          rank: att.rank,
        });
      }
    }

    return results.sort((a, b) => a.rank - b.rank);
  }
}

export class UniversalSearchService {
  private readonly providers: SearchProvider[];

  constructor(providers: SearchProvider[] = [new Fts5SearchProvider()]) {
    this.providers = providers;
  }

  async search(
    db: DatabaseAdapter,
    query: string,
    filters: SearchFilters = {}
  ): Promise<SearchResultItem[]> {
    const allResults: SearchResultItem[] = [];
    for (const provider of this.providers) {
      const items = await provider.search(db, query, filters);
      allResults.push(...items);
    }

    // Deduplicate by entityType + id keeping best rank
    const best = new Map<string, SearchResultItem>();
    for (const item of allResults) {
      const key = `${item.entityType}:${item.id}`;
      const existing = best.get(key);
      if (!existing || item.rank < existing.rank) {
        best.set(key, item);
      }
    }
    return Array.from(best.values()).sort((a, b) => a.rank - b.rank);
  }

  async getSuggestions(db: DatabaseAdapter, prefix: string): Promise<string[]> {
    const clean = prefix.trim();
    if (clean.length < 2) return [];
    const like = `%${clean.toLowerCase()}%`;

    const [notes, tags, cols] = await Promise.all([
      db.getAllAsync<{ label: string }>(
        'SELECT title AS label FROM notes WHERE deleted_at IS NULL AND LOWER(title) LIKE ? ORDER BY updated_at DESC LIMIT 5',
        [like]
      ),
      db.getAllAsync<{ label: string }>(
        'SELECT name AS label FROM tags WHERE LOWER(name) LIKE ? ORDER BY name ASC LIMIT 4',
        [like]
      ),
      db.getAllAsync<{ label: string }>(
        'SELECT name AS label FROM collections WHERE deleted_at IS NULL AND LOWER(name) LIKE ? ORDER BY name ASC LIMIT 3',
        [like]
      ),
    ]);

    return Array.from(new Set([...notes, ...tags, ...cols].map((r) => r.label))).slice(0, 8);
  }

  async recordRecentSearch(db: DatabaseAdapter, query: string): Promise<void> {
    const clean = query.trim();
    if (clean.length < 2) return;
    await db.runAsync(
      `INSERT INTO recent_searches (id, query, searched_at)
       VALUES (?, ?, ?)
       ON CONFLICT(query) DO UPDATE SET searched_at = excluded.searched_at`,
      [generateId(), clean, nowIso()]
    );
    await db.runAsync(
      `DELETE FROM recent_searches
       WHERE id NOT IN (SELECT id FROM recent_searches ORDER BY searched_at DESC LIMIT 12)`
    );
  }

  async getRecentSearches(db: DatabaseAdapter): Promise<string[]> {
    const rows = await db.getAllAsync<{ query: string }>(
      'SELECT query FROM recent_searches ORDER BY searched_at DESC LIMIT 10'
    );
    return rows.map((r) => r.query);
  }

  async clearRecentSearches(db: DatabaseAdapter): Promise<void> {
    await db.runAsync('DELETE FROM recent_searches');
  }
}

export const searchService = new UniversalSearchService();

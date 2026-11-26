import type { DatabaseAdapter } from '../adapter';
import type { Tag, UUID } from '../../types/models';
import { generateId, nowIso } from '../../utils/id';

interface TagRow {
  id: string;
  name: string;
  created_at: string;
  note_count?: number;
}

function mapTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    noteCount: row.note_count ?? 0,
  };
}

export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase();
}

export async function listTags(db: DatabaseAdapter): Promise<Tag[]> {
  const rows = await db.getAllAsync<TagRow>(
    `SELECT t.*,
       (SELECT COUNT(*)
        FROM note_tags nt
        INNER JOIN notes n ON n.id = nt.note_id
        WHERE nt.tag_id = t.id AND n.deleted_at IS NULL) AS note_count
     FROM tags t
     ORDER BY note_count DESC, t.name ASC`
  );
  return rows.map(mapTag);
}

export async function getOrCreateTag(db: DatabaseAdapter, rawName: string): Promise<Tag> {
  const name = normalizeTagName(rawName);
  if (!name) throw new Error('Tag name cannot be empty.');

  const existing = await db.getFirstAsync<TagRow>(
    'SELECT * FROM tags WHERE name = ? COLLATE NOCASE',
    [name]
  );
  if (existing) return mapTag(existing);

  const id = generateId();
  const ts = nowIso();
  await db.runAsync('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)', [id, name, ts]);
  return { id, name, createdAt: ts, noteCount: 0 };
}

export async function getTagsForNote(db: DatabaseAdapter, noteId: UUID): Promise<Tag[]> {
  const rows = await db.getAllAsync<TagRow>(
    `SELECT t.*
     FROM tags t
     INNER JOIN note_tags nt ON nt.tag_id = t.id
     WHERE nt.note_id = ?
     ORDER BY t.name ASC`,
    [noteId]
  );
  return rows.map(mapTag);
}

export async function setTagsForNote(
  db: DatabaseAdapter,
  noteId: UUID,
  tagNames: string[]
): Promise<Tag[]> {
  const normalized = Array.from(
    new Set(tagNames.map(normalizeTagName).filter((n) => n.length > 0))
  );

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM note_tags WHERE note_id = ?', [noteId]);
    for (const name of normalized) {
      const tag = await getOrCreateTag(db, name);
      await db.runAsync(
        'INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)',
        [noteId, tag.id]
      );
    }
  });

  return getTagsForNote(db, noteId);
}

export async function deleteUnusedTags(db: DatabaseAdapter): Promise<number> {
  const res = await db.runAsync(
    'DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)'
  );
  return res.changes;
}

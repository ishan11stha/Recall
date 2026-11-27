import type { DatabaseAdapter } from '../adapter';
import type { Note, NoteRevision, NoteTemplate, NoteType, UUID } from '../../types/models';
import {
  computeReadingTimeMinutes,
  computeWordCount,
  generateId,
  nowIso,
} from '../../utils/id';
import { getTagsForNote, setTagsForNote } from './tagsRepo';
import { recordOutboxMutation } from './syncHelpers';

interface NoteRow {
  id: string;
  title: string;
  content: string;
  note_type: string;
  collection_id: string | null;
  is_inbox: number;
  is_pinned: number;
  is_favorite: number;
  is_archived: number;
  source_url: string | null;
  word_count: number;
  reading_time_min: number;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  deleted_at: string | null;
  collection_name?: string | null;
}

function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    noteType: row.note_type as NoteType,
    collectionId: row.collection_id,
    isInbox: Boolean(row.is_inbox),
    isPinned: Boolean(row.is_pinned),
    isFavorite: Boolean(row.is_favorite),
    isArchived: Boolean(row.is_archived),
    sourceUrl: row.source_url,
    wordCount: row.word_count,
    readingTimeMin: row.reading_time_min,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at,
    deletedAt: row.deleted_at,
    collectionName: row.collection_name ?? null,
  };
}

export interface ListNotesOptions {
  scope?: 'all' | 'inbox' | 'pinned' | 'favorites' | 'archived' | 'trash';
  collectionId?: UUID | null;
  noteType?: NoteType | null;
  tagId?: UUID | null;
  sortBy?: 'updated_desc' | 'created_desc' | 'title_asc';
  limit?: number;
  offset?: number;
}

async function attachTagsToNotes(db: DatabaseAdapter, notes: Note[]): Promise<Note[]> {
  if (notes.length === 0) return notes;
  const placeholders = notes.map(() => '?').join(', ');
  const rows = await db.getAllAsync<{
    note_id: string;
    id: string;
    name: string;
    created_at: string;
  }>(
    `SELECT nt.note_id, t.id, t.name, t.created_at
     FROM note_tags nt
     INNER JOIN tags t ON t.id = nt.tag_id
     WHERE nt.note_id IN (${placeholders})
     ORDER BY t.name ASC`,
    notes.map((n) => n.id)
  );

  const byNote = new Map<string, Note['tags']>();
  for (const row of rows) {
    const list = byNote.get(row.note_id) ?? [];
    list.push({ id: row.id, name: row.name, createdAt: row.created_at });
    byNote.set(row.note_id, list);
  }

  for (const note of notes) {
    note.tags = byNote.get(note.id) ?? [];
  }
  return notes;
}

export async function listNotesByIds(db: DatabaseAdapter, ids: UUID[]): Promise<Note[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.getAllAsync<NoteRow>(
    `SELECT n.*, c.name AS collection_name
     FROM notes n
     LEFT JOIN collections c ON c.id = n.collection_id AND c.deleted_at IS NULL
     WHERE n.deleted_at IS NULL AND n.id IN (${placeholders})`,
    ids
  );
  const byId = new Map(rows.map((r) => [r.id, mapNote(r)]));
  const ordered = ids.map((id) => byId.get(id)).filter((n): n is Note => Boolean(n));
  return attachTagsToNotes(db, ordered);
}

export async function listNotes(
  db: DatabaseAdapter,
  options: ListNotesOptions = {}
): Promise<Note[]> {
  const {
    scope = 'all',
    collectionId,
    noteType,
    tagId,
    sortBy = 'updated_desc',
    limit = 100,
    offset = 0,
  } = options;

  const conditions: string[] = [];
  const params: (string | number | null)[] = [];

  if (scope === 'trash') {
    conditions.push('n.deleted_at IS NOT NULL');
  } else {
    conditions.push('n.deleted_at IS NULL');
    if (scope === 'archived') {
      conditions.push('n.is_archived = 1');
    } else {
      conditions.push('n.is_archived = 0');
    }
    if (scope === 'inbox') {
      conditions.push('n.is_inbox = 1');
    } else if (scope === 'pinned') {
      conditions.push('n.is_pinned = 1');
    } else if (scope === 'favorites') {
      conditions.push('n.is_favorite = 1');
    }
  }

  if (collectionId !== undefined) {
    if (collectionId === null) {
      conditions.push('n.collection_id IS NULL');
    } else {
      conditions.push('n.collection_id = ?');
      params.push(collectionId);
    }
  }

  if (noteType) {
    conditions.push('n.note_type = ?');
    params.push(noteType);
  }

  let joinTag = '';
  if (tagId) {
    joinTag = 'INNER JOIN note_tags nt ON nt.note_id = n.id';
    conditions.push('nt.tag_id = ?');
    params.push(tagId);
  }

  const orderBy =
    sortBy === 'title_asc'
      ? 'n.is_pinned DESC, n.title COLLATE NOCASE ASC'
      : sortBy === 'created_desc'
      ? 'n.is_pinned DESC, n.created_at DESC'
      : 'n.is_pinned DESC, n.updated_at DESC';

  params.push(limit, offset);

  const rows = await db.getAllAsync<NoteRow>(
    `SELECT n.*, c.name AS collection_name
     FROM notes n
     LEFT JOIN collections c ON c.id = n.collection_id AND c.deleted_at IS NULL
     ${joinTag}
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    params
  );

  const notes = rows.map(mapNote);
  return attachTagsToNotes(db, notes);
}

export async function getNoteById(db: DatabaseAdapter, id: UUID): Promise<Note | null> {
  const row = await db.getFirstAsync<NoteRow>(
    `SELECT n.*, c.name AS collection_name
     FROM notes n
     LEFT JOIN collections c ON c.id = n.collection_id AND c.deleted_at IS NULL
     WHERE n.id = ?`,
    [id]
  );
  if (!row) return null;
  const note = mapNote(row);
  note.tags = await getTagsForNote(db, note.id);
  return note;
}

export interface CreateNoteInput {
  title: string;
  content?: string;
  noteType?: NoteType;
  collectionId?: UUID | null;
  isInbox?: boolean;
  isPinned?: boolean;
  isFavorite?: boolean;
  sourceUrl?: string | null;
  tags?: string[];
}

export async function createNote(db: DatabaseAdapter, input: CreateNoteInput): Promise<Note> {
  const id = generateId();
  const ts = nowIso();
  const title = input.title.trim() || 'Untitled Note';
  const content = input.content ?? '';
  const wordCount = computeWordCount(`${title} ${content}`);
  const readingTimeMin = computeReadingTimeMinutes(wordCount);
  const noteType: NoteType = input.noteType ?? 'general';
  const collectionId = input.collectionId ?? null;
  const isInbox = input.isInbox ?? (collectionId === null);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO notes (
         id, title, content, note_type, collection_id,
         is_inbox, is_pinned, is_favorite, is_archived,
         source_url, word_count, reading_time_min,
         created_at, updated_at, last_accessed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        content,
        noteType,
        collectionId,
        isInbox ? 1 : 0,
        input.isPinned ? 1 : 0,
        input.isFavorite ? 1 : 0,
        input.sourceUrl?.trim() || null,
        wordCount,
        readingTimeMin,
        ts,
        ts,
        ts,
      ]
    );

    if (input.tags && input.tags.length > 0) {
      await setTagsForNote(db, id, input.tags);
    }

    await recordOutboxMutation(db, 'note', id, 'upsert', { id, title, updatedAt: ts });
  });

  const created = await getNoteById(db, id);
  if (!created) throw new Error('Failed to create note');
  return created;
}

export interface UpdateNotePatch {
  title?: string;
  content?: string;
  noteType?: NoteType;
  collectionId?: UUID | null;
  isInbox?: boolean;
  isPinned?: boolean;
  isFavorite?: boolean;
  isArchived?: boolean;
  sourceUrl?: string | null;
  tags?: string[];
  saveRevision?: boolean;
}

export async function updateNote(
  db: DatabaseAdapter,
  id: UUID,
  patch: UpdateNotePatch
): Promise<Note | null> {
  const existing = await getNoteById(db, id);
  if (!existing) return null;

  const title = patch.title !== undefined ? patch.title.trim() || 'Untitled Note' : existing.title;
  const content = patch.content !== undefined ? patch.content : existing.content;
  const noteType = patch.noteType ?? existing.noteType;
  const collectionId = patch.collectionId !== undefined ? patch.collectionId : existing.collectionId;
  const isInbox =
    patch.isInbox !== undefined
      ? patch.isInbox
      : patch.collectionId !== undefined && patch.collectionId !== null
      ? false
      : existing.isInbox;
  const isPinned = patch.isPinned ?? existing.isPinned;
  const isFavorite = patch.isFavorite ?? existing.isFavorite;
  const isArchived = patch.isArchived ?? existing.isArchived;
  const sourceUrl =
    patch.sourceUrl !== undefined ? patch.sourceUrl?.trim() || null : existing.sourceUrl;

  const wordCount = computeWordCount(`${title} ${content}`);
  const readingTimeMin = computeReadingTimeMinutes(wordCount);
  const ts = nowIso();

  const contentChangedSignificantly =
    patch.saveRevision &&
    (existing.title !== title || Math.abs(existing.content.length - content.length) >= 12 || existing.content !== content);

  await db.withTransactionAsync(async () => {
    if (contentChangedSignificantly) {
      await db.runAsync(
        `INSERT INTO note_revisions (id, note_id, title, content, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [generateId(), id, existing.title, existing.content, ts]
      );
      // Keep last 25 revisions per note
      await db.runAsync(
        `DELETE FROM note_revisions
         WHERE note_id = ? AND id NOT IN (
           SELECT id FROM note_revisions WHERE note_id = ? ORDER BY created_at DESC LIMIT 25
         )`,
        [id, id]
      );
    }

    await db.runAsync(
      `UPDATE notes
       SET title = ?, content = ?, note_type = ?, collection_id = ?,
           is_inbox = ?, is_pinned = ?, is_favorite = ?, is_archived = ?,
           source_url = ?, word_count = ?, reading_time_min = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        title,
        content,
        noteType,
        collectionId,
        isInbox ? 1 : 0,
        isPinned ? 1 : 0,
        isFavorite ? 1 : 0,
        isArchived ? 1 : 0,
        sourceUrl,
        wordCount,
        readingTimeMin,
        ts,
        id,
      ]
    );

    if (patch.tags !== undefined) {
      await setTagsForNote(db, id, patch.tags);
    }

    await recordOutboxMutation(db, 'note', id, 'upsert', { id, title, updatedAt: ts });
  });

  return getNoteById(db, id);
}

export async function touchNoteAccess(db: DatabaseAdapter, id: UUID): Promise<void> {
  await db.runAsync('UPDATE notes SET last_accessed_at = ? WHERE id = ?', [nowIso(), id]);
}

export async function softDeleteNote(db: DatabaseAdapter, id: UUID): Promise<void> {
  const ts = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE notes SET deleted_at = ?, is_pinned = 0, updated_at = ? WHERE id = ?',
      [ts, ts, id]
    );
    await recordOutboxMutation(db, 'note', id, 'delete', { id });
  });
}

export async function restoreNote(db: DatabaseAdapter, id: UUID): Promise<void> {
  const ts = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id = ?',
      [ts, id]
    );
    await recordOutboxMutation(db, 'note', id, 'upsert', { id, restoredAt: ts });
  });
}

export async function permanentlyDeleteNote(db: DatabaseAdapter, id: UUID): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM notes WHERE id = ?', [id]);
    await recordOutboxMutation(db, 'note', id, 'delete', { id, permanent: true });
  });
}

export async function listNoteRevisions(
  db: DatabaseAdapter,
  noteId: UUID
): Promise<NoteRevision[]> {
  const rows = await db.getAllAsync<{
    id: string;
    note_id: string;
    title: string;
    content: string;
    created_at: string;
  }>(
    'SELECT * FROM note_revisions WHERE note_id = ? ORDER BY created_at DESC LIMIT 25',
    [noteId]
  );
  return rows.map((r) => ({
    id: r.id,
    noteId: r.note_id,
    title: r.title,
    content: r.content,
    createdAt: r.created_at,
  }));
}

export async function restoreNoteRevision(
  db: DatabaseAdapter,
  noteId: UUID,
  revisionId: UUID
): Promise<Note | null> {
  const rev = await db.getFirstAsync<{ title: string; content: string }>(
    'SELECT title, content FROM note_revisions WHERE id = ? AND note_id = ?',
    [revisionId, noteId]
  );
  if (!rev) return null;
  return updateNote(db, noteId, {
    title: rev.title,
    content: rev.content,
    saveRevision: true,
  });
}

// --- Note Templates ---

export async function listNoteTemplates(db: DatabaseAdapter): Promise<NoteTemplate[]> {
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    note_type: string;
    content_template: string;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM note_templates ORDER BY name COLLATE NOCASE ASC');

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    noteType: r.note_type as NoteType,
    contentTemplate: r.content_template,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function createNoteTemplate(
  db: DatabaseAdapter,
  input: { name: string; noteType: NoteType; contentTemplate: string }
): Promise<NoteTemplate> {
  const id = generateId();
  const ts = nowIso();
  const name = input.name.trim();
  if (!name) throw new Error('Template name is required.');

  await db.runAsync(
    `INSERT INTO note_templates (id, name, note_type, content_template, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, input.noteType, input.contentTemplate, ts, ts]
  );

  return {
    id,
    name,
    noteType: input.noteType,
    contentTemplate: input.contentTemplate,
    createdAt: ts,
    updatedAt: ts,
  };
}

export async function deleteNoteTemplate(db: DatabaseAdapter, id: UUID): Promise<void> {
  await db.runAsync('DELETE FROM note_templates WHERE id = ?', [id]);
}

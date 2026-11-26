import type { DatabaseAdapter } from '../adapter';
import type { Attachment, AttachmentType, Note, NoteType, UUID } from '../../types/models';
import { generateId, nowIso } from '../../utils/id';
import { recordOutboxMutation } from './syncHelpers';

interface AttachmentRow {
  id: string;
  title: string;
  file_type: string;
  mime_type: string | null;
  local_uri: string | null;
  source_url: string | null;
  file_size_bytes: number;
  notes_metadata: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  linked_note_count?: number;
}

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    title: row.title,
    fileType: row.file_type as AttachmentType,
    mimeType: row.mime_type,
    localUri: row.local_uri,
    sourceUrl: row.source_url,
    fileSizeBytes: row.file_size_bytes,
    notesMetadata: row.notes_metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    linkedNoteCount: row.linked_note_count ?? 0,
  };
}

export async function listAttachments(
  db: DatabaseAdapter,
  options: { fileType?: AttachmentType | null; noteId?: UUID | null } = {}
): Promise<Attachment[]> {
  const conditions = ['a.deleted_at IS NULL'];
  const params: string[] = [];
  let join = '';

  if (options.fileType) {
    conditions.push('a.file_type = ?');
    params.push(options.fileType);
  }

  if (options.noteId) {
    join = 'INNER JOIN attachment_notes an ON an.attachment_id = a.id';
    conditions.push('an.note_id = ?');
    params.push(options.noteId);
  }

  const rows = await db.getAllAsync<AttachmentRow>(
    `SELECT a.*,
       (SELECT COUNT(*) FROM attachment_notes an2
        INNER JOIN notes n ON n.id = an2.note_id AND n.deleted_at IS NULL
        WHERE an2.attachment_id = a.id) AS linked_note_count
     FROM attachments a
     ${join}
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.updated_at DESC`,
    params
  );

  return rows.map(mapAttachment);
}

export async function getAttachmentById(
  db: DatabaseAdapter,
  id: UUID
): Promise<Attachment | null> {
  const row = await db.getFirstAsync<AttachmentRow>(
    `SELECT a.*,
       (SELECT COUNT(*) FROM attachment_notes an2
        INNER JOIN notes n ON n.id = an2.note_id AND n.deleted_at IS NULL
        WHERE an2.attachment_id = a.id) AS linked_note_count
     FROM attachments a
     WHERE a.id = ? AND a.deleted_at IS NULL`,
    [id]
  );
  return row ? mapAttachment(row) : null;
}

export async function createAttachment(
  db: DatabaseAdapter,
  input: {
    title: string;
    fileType: AttachmentType;
    mimeType?: string | null;
    localUri?: string | null;
    sourceUrl?: string | null;
    fileSizeBytes?: number;
    notesMetadata?: string | null;
    linkedNoteIds?: UUID[];
  }
): Promise<Attachment> {
  const id = generateId();
  const ts = nowIso();
  const title = input.title.trim() || 'Untitled Resource';

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO attachments (
         id, title, file_type, mime_type, local_uri, source_url,
         file_size_bytes, notes_metadata, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        input.fileType,
        input.mimeType ?? null,
        input.localUri ?? null,
        input.sourceUrl?.trim() || null,
        input.fileSizeBytes ?? 0,
        input.notesMetadata?.trim() || null,
        ts,
        ts,
      ]
    );

    if (input.linkedNoteIds && input.linkedNoteIds.length > 0) {
      for (const noteId of input.linkedNoteIds) {
        await db.runAsync(
          `INSERT OR IGNORE INTO attachment_notes (attachment_id, note_id, created_at)
           VALUES (?, ?, ?)`,
          [id, noteId, ts]
        );
      }
    }

    await recordOutboxMutation(db, 'attachment', id, 'upsert', { id, title });
  });

  const created = await getAttachmentById(db, id);
  if (!created) throw new Error('Failed to create resource');
  return created;
}

export async function linkAttachmentToNote(
  db: DatabaseAdapter,
  attachmentId: UUID,
  noteId: UUID
): Promise<void> {
  await db.runAsync(
    'INSERT OR IGNORE INTO attachment_notes (attachment_id, note_id, created_at) VALUES (?, ?, ?)',
    [attachmentId, noteId, nowIso()]
  );
}

export async function unlinkAttachmentFromNote(
  db: DatabaseAdapter,
  attachmentId: UUID,
  noteId: UUID
): Promise<void> {
  await db.runAsync(
    'DELETE FROM attachment_notes WHERE attachment_id = ? AND note_id = ?',
    [attachmentId, noteId]
  );
}

export async function getNotesLinkedToAttachment(
  db: DatabaseAdapter,
  attachmentId: UUID
): Promise<Pick<Note, 'id' | 'title' | 'noteType' | 'updatedAt'>[]> {
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    note_type: string;
    updated_at: string;
  }>(
    `SELECT n.id, n.title, n.note_type, n.updated_at
     FROM notes n
     INNER JOIN attachment_notes an ON an.note_id = n.id
     WHERE an.attachment_id = ? AND n.deleted_at IS NULL
     ORDER BY n.updated_at DESC`,
    [attachmentId]
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    noteType: r.note_type as NoteType,
    updatedAt: r.updated_at,
  }));
}

export async function deleteAttachment(db: DatabaseAdapter, id: UUID): Promise<Attachment | null> {
  const existing = await getAttachmentById(db, id);
  if (!existing) return null;

  const ts = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM attachment_notes WHERE attachment_id = ?', [id]);
    await db.runAsync(
      'UPDATE attachments SET deleted_at = ?, updated_at = ? WHERE id = ?',
      [ts, ts, id]
    );
    await recordOutboxMutation(db, 'attachment', id, 'delete', { id });
  });

  return existing;
}

export async function getStorageSummary(
  db: DatabaseAdapter
): Promise<{ attachmentCount: number; totalAttachmentBytes: number }> {
  const row = await db.getFirstAsync<{ count: number; total_bytes: number | null }>(
    'SELECT COUNT(*) AS count, SUM(file_size_bytes) AS total_bytes FROM attachments WHERE deleted_at IS NULL'
  );
  return {
    attachmentCount: row?.count ?? 0,
    totalAttachmentBytes: row?.total_bytes ?? 0,
  };
}

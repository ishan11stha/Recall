import JSZip from 'jszip';
import type { DatabaseAdapter } from '../../database/adapter';
import {
  checkDatabaseIntegrity,
  getCurrentSchemaVersion,
  rebuildSearchIndexes,
} from '../../database/migrations/runner';
import type { BackupManifest } from '../../types/models';
import { nowIso } from '../../utils/id';

export const BACKUP_FORMAT_VERSION = 1;

export interface BackupPayload {
  manifest: BackupManifest;
  tables: {
    collections: Record<string, unknown>[];
    notes: Record<string, unknown>[];
    note_templates: Record<string, unknown>[];
    tags: Record<string, unknown>[];
    note_tags: Record<string, unknown>[];
    note_links: Record<string, unknown>[];
    note_revisions: Record<string, unknown>[];
    attachments: Record<string, unknown>[];
    attachment_notes: Record<string, unknown>[];
    flashcards: Record<string, unknown>[];
    review_states: Record<string, unknown>[];
    review_logs: Record<string, unknown>[];
    settings: Record<string, unknown>[];
  };
}

export interface AttachmentFileIO {
  readFileBase64(uri: string): Promise<string | null>;
  writeFileBase64(filename: string, base64: string): Promise<string>;
}

const TABLE_NAMES = [
  'collections',
  'notes',
  'note_templates',
  'tags',
  'note_tags',
  'note_links',
  'note_revisions',
  'attachments',
  'attachment_notes',
  'flashcards',
  'review_states',
  'review_logs',
  'settings',
] as const;

export async function exportDatabasePayload(db: DatabaseAdapter): Promise<BackupPayload> {
  const schemaVersion = await getCurrentSchemaVersion(db);

  const tables = {} as BackupPayload['tables'];
  for (const name of TABLE_NAMES) {
    tables[name] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${name}`);
  }

  const manifest: BackupManifest = {
    app: 'RECALL',
    backupFormatVersion: 1,
    schemaVersion,
    exportedAt: nowIso(),
    counts: {
      collections: tables.collections.length,
      notes: tables.notes.length,
      tags: tables.tags.length,
      noteLinks: tables.note_links.length,
      flashcards: tables.flashcards.length,
      reviewLogs: tables.review_logs.length,
      attachments: tables.attachments.length,
    },
  };

  return { manifest, tables };
}

export async function createBackupZipBase64(
  db: DatabaseAdapter,
  fileIO?: AttachmentFileIO
): Promise<{ base64: string; manifest: BackupManifest }> {
  const payload = await exportDatabasePayload(db);
  const zip = new JSZip();

  zip.file('manifest.json', JSON.stringify(payload.manifest, null, 2));

  // Include attachment files when fileIO is provided
  const attachmentFileMap: Record<string, string> = {};
  if (fileIO) {
    for (const row of payload.tables.attachments) {
      const id = String(row.id);
      const localUri = typeof row.local_uri === 'string' ? row.local_uri : null;
      if (!localUri) continue;

      const data = await fileIO.readFileBase64(localUri);
      if (data) {
        const ext = localUri.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
        const archivePath = `attachments/${id}.${ext}`;
        zip.file(archivePath, data, { base64: true });
        attachmentFileMap[id] = archivePath;
      }
    }
  }

  zip.file(
    'database.json',
    JSON.stringify({ ...payload, attachmentFiles: attachmentFileMap }, null, 2)
  );

  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  return { base64, manifest: payload.manifest };
}

async function insertTableRows(
  db: DatabaseAdapter,
  tableName: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (!rows || rows.length === 0) return;

  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length === 0) continue;
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((k) => {
      const val = row[k];
      if (val === undefined) return null;
      return val as string | number | null;
    });
    await db.runAsync(
      `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`,
      values
    );
  }
}

export async function restoreFromBackupZipBase64(
  db: DatabaseAdapter,
  zipBase64: string,
  fileIO?: AttachmentFileIO
): Promise<{ manifest: BackupManifest; integrityOk: boolean }> {
  const zip = await JSZip.loadAsync(zipBase64, { base64: true });
  const dbEntry = zip.file('database.json');
  if (!dbEntry) {
    throw new Error('Invalid backup archive: missing database.json');
  }

  const parsed = JSON.parse(await dbEntry.async('string')) as BackupPayload & {
    attachmentFiles?: Record<string, string>;
  };

  if (
    !parsed.manifest ||
    parsed.manifest.app !== 'RECALL' ||
    parsed.manifest.backupFormatVersion !== BACKUP_FORMAT_VERSION
  ) {
    throw new Error('Unsupported or corrupted RECALL backup format.');
  }

  // Restore attachment files first if available
  const restoredUris = new Map<string, string>();
  if (fileIO && parsed.attachmentFiles) {
    for (const [attId, archivePath] of Object.entries(parsed.attachmentFiles)) {
      const file = zip.file(archivePath);
      if (!file) continue;
      const b64 = await file.async('base64');
      const filename = archivePath.split('/').pop() || `${attId}.bin`;
      const newUri = await fileIO.writeFileBase64(filename, b64);
      restoredUris.set(attId, newUri);
    }
  }

  const attachmentsWithUpdatedUris = (parsed.tables.attachments ?? []).map((row) => {
    const id = String(row.id);
    const restoredUri = restoredUris.get(id);
    return restoredUri ? { ...row, local_uri: restoredUri } : row;
  });

  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      // Clear tables in reverse dependency order
      const deleteOrder = [...TABLE_NAMES].reverse();
      for (const table of deleteOrder) {
        await db.runAsync(`DELETE FROM ${table}`);
      }

      // Insert in parent-first dependency order
      await insertTableRows(db, 'collections', parsed.tables.collections ?? []);
      await insertTableRows(db, 'notes', parsed.tables.notes ?? []);
      await insertTableRows(db, 'note_templates', parsed.tables.note_templates ?? []);
      await insertTableRows(db, 'tags', parsed.tables.tags ?? []);
      await insertTableRows(db, 'note_tags', parsed.tables.note_tags ?? []);
      await insertTableRows(db, 'note_links', parsed.tables.note_links ?? []);
      await insertTableRows(db, 'note_revisions', parsed.tables.note_revisions ?? []);
      await insertTableRows(db, 'attachments', attachmentsWithUpdatedUris);
      await insertTableRows(db, 'attachment_notes', parsed.tables.attachment_notes ?? []);
      await insertTableRows(db, 'flashcards', parsed.tables.flashcards ?? []);
      await insertTableRows(db, 'review_states', parsed.tables.review_states ?? []);
      await insertTableRows(db, 'review_logs', parsed.tables.review_logs ?? []);
      await insertTableRows(db, 'settings', parsed.tables.settings ?? []);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }

  await rebuildSearchIndexes(db);
  const integrity = await checkDatabaseIntegrity(db);

  return {
    manifest: parsed.manifest,
    integrityOk: integrity.ok,
  };
}

export async function exportLibraryAsMarkdown(db: DatabaseAdapter): Promise<string> {
  const notes = await db.getAllAsync<{
    id: string;
    title: string;
    content: string;
    note_type: string;
    created_at: string;
    updated_at: string;
    collection_name: string | null;
  }>(
    `SELECT n.id, n.title, n.content, n.note_type, n.created_at, n.updated_at, c.name AS collection_name
     FROM notes n
     LEFT JOIN collections c ON c.id = n.collection_id AND c.deleted_at IS NULL
     WHERE n.deleted_at IS NULL
     ORDER BY n.updated_at DESC`
  );

  const sections = notes.map((n) => {
    const meta = [
      `Type: ${n.note_type}`,
      n.collection_name ? `Collection: ${n.collection_name}` : 'Collection: Inbox',
      `Updated: ${n.updated_at}`,
    ].join(' | ');
    return `# ${n.title}\n\n> ${meta}\n\n${n.content}\n`;
  });

  return `# RECALL Knowledge Export\nExported: ${nowIso()}\nNotes: ${notes.length}\n\n---\n\n${sections.join('\n---\n\n')}`;
}

export async function exportLibraryAsJson(db: DatabaseAdapter): Promise<string> {
  const payload = await exportDatabasePayload(db);
  return JSON.stringify(payload, null, 2);
}

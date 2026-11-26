import type { DatabaseAdapter } from '../adapter';
import { ALL_MIGRATIONS, type Migration } from './001_initial_schema';
import { nowIso } from '../../utils/id';

export async function runMigrations(
  db: DatabaseAdapter,
  migrations: Migration[] = ALL_MIGRATIONS
): Promise<number> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC'
  );
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  let currentVersion = appliedRows.length > 0 ? appliedRows[appliedRows.length - 1].version : 0;

  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  for (const migration of sorted) {
    if (appliedSet.has(migration.version)) {
      continue;
    }

    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.upSql);
      await db.runAsync(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        [migration.version, migration.name, nowIso()]
      );
    });

    currentVersion = migration.version;
  }

  return currentVersion;
}

export async function getCurrentSchemaVersion(db: DatabaseAdapter): Promise<number> {
  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT MAX(version) as version FROM schema_migrations'
  );
  return row?.version ?? 0;
}

export async function rebuildSearchIndexes(db: DatabaseAdapter): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM notes_fts;');
    await db.execAsync(`
      INSERT INTO notes_fts(note_id, title, content)
      SELECT id, title, content FROM notes WHERE deleted_at IS NULL;
    `);
    await db.execAsync('DELETE FROM attachments_fts;');
    await db.execAsync(`
      INSERT INTO attachments_fts(attachment_id, title, notes_metadata, source_url)
      SELECT id, title, COALESCE(notes_metadata, ''), COALESCE(source_url, '')
      FROM attachments WHERE deleted_at IS NULL;
    `);
  });
}

export async function checkDatabaseIntegrity(
  db: DatabaseAdapter
): Promise<{ ok: boolean; details: string[] }> {
  const rows = await db.getAllAsync<{ integrity_check: string }>('PRAGMA integrity_check;');
  const details = rows.map((r) => r.integrity_check);
  const ok = details.length === 1 && details[0].toLowerCase() === 'ok';
  return { ok, details };
}

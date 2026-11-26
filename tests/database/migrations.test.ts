import {
  checkDatabaseIntegrity,
  getCurrentSchemaVersion,
  runMigrations,
} from '../../src/database/migrations/runner';
import { NodeSQLiteAdapter } from '../helpers/nodeSqliteAdapter';

describe('Database migrations and integrity', () => {
  it('applies initial schema idempotently and passes integrity check', async () => {
    const db = new NodeSQLiteAdapter(':memory:');
    try {
      const v1 = await runMigrations(db);
      expect(v1).toBe(1);

      // Re-running migrations should be idempotent
      const v2 = await runMigrations(db);
      expect(v2).toBe(1);
      expect(await getCurrentSchemaVersion(db)).toBe(1);

      const integrity = await checkDatabaseIntegrity(db);
      expect(integrity.ok).toBe(true);
    } finally {
      await db.closeAsync();
    }
  });

  it('enforces foreign-key constraints', async () => {
    const db = new NodeSQLiteAdapter(':memory:');
    try {
      await runMigrations(db);
      await expect(
        db.runAsync(
          `INSERT INTO note_links (id, source_note_id, target_note_id, relationship_type, created_at)
           VALUES ('l1', 'missing-a', 'missing-b', 'related_to', '2026-01-01T00:00:00.000Z')`
        )
      ).rejects.toThrow();
    } finally {
      await db.closeAsync();
    }
  });
});

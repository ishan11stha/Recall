import { DatabaseSync } from 'node:sqlite';
import type {
  DatabaseAdapter,
  SQLBindValue,
  SQLRunResult,
} from '../../src/database/adapter';
import { runMigrations } from '../../src/database/migrations/runner';

export class NodeSQLiteAdapter implements DatabaseAdapter {
  private readonly db: DatabaseSync;
  private txDepth = 0;

  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, params: SQLBindValue[] = []): Promise<SQLRunResult> {
    const stmt = this.db.prepare(sql);
    const res = stmt.run(...params);
    return {
      changes: Number(res.changes ?? 0),
      lastInsertRowId: Number(res.lastInsertRowid ?? 0),
    };
  }

  async getFirstAsync<T = Record<string, unknown>>(
    sql: string,
    params: SQLBindValue[] = []
  ): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params);
    return (row as T | undefined) ?? null;
  }

  async getAllAsync<T = Record<string, unknown>>(
    sql: string,
    params: SQLBindValue[] = []
  ): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  async withTransactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    const isOuter = this.txDepth === 0;
    const sp = `sp_${this.txDepth + 1}`;
    this.txDepth += 1;
    try {
      this.db.exec(isOuter ? 'BEGIN IMMEDIATE;' : `SAVEPOINT ${sp};`);
      const result = await fn();
      this.db.exec(isOuter ? 'COMMIT;' : `RELEASE SAVEPOINT ${sp};`);
      return result;
    } catch (err) {
      if (isOuter) {
        this.db.exec('ROLLBACK;');
      } else {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${sp}; RELEASE SAVEPOINT ${sp};`);
      }
      throw err;
    } finally {
      this.txDepth -= 1;
    }
  }

  async closeAsync(): Promise<void> {
    this.db.close();
  }
}

export async function createTestDb(): Promise<NodeSQLiteAdapter> {
  const db = new NodeSQLiteAdapter(':memory:');
  await runMigrations(db);
  return db;
}

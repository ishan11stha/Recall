import * as SQLite from 'expo-sqlite';
import type { DatabaseAdapter, SQLBindValue, SQLRunResult } from './adapter';
import { runMigrations } from './migrations/runner';

const DB_NAME = 'recall_pkm.db';

class ExpoSQLiteAdapter implements DatabaseAdapter {
  private txDepth = 0;

  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  async execAsync(sql: string): Promise<void> {
    await this.db.execAsync(sql);
  }

  async runAsync(sql: string, params: SQLBindValue[] = []): Promise<SQLRunResult> {
    const result = await this.db.runAsync(sql, params);
    return {
      changes: result.changes,
      lastInsertRowId: result.lastInsertRowId,
    };
  }

  async getFirstAsync<T = Record<string, unknown>>(
    sql: string,
    params: SQLBindValue[] = []
  ): Promise<T | null> {
    return (await this.db.getFirstAsync<T>(sql, params)) ?? null;
  }

  async getAllAsync<T = Record<string, unknown>>(
    sql: string,
    params: SQLBindValue[] = []
  ): Promise<T[]> {
    return await this.db.getAllAsync<T>(sql, params);
  }

  async withTransactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    const isOuter = this.txDepth === 0;
    const savepoint = `sp_${this.txDepth + 1}`;
    this.txDepth += 1;

    try {
      if (isOuter) {
        await this.db.execAsync('BEGIN IMMEDIATE;');
      } else {
        await this.db.execAsync(`SAVEPOINT ${savepoint};`);
      }

      const result = await fn();

      if (isOuter) {
        await this.db.execAsync('COMMIT;');
      } else {
        await this.db.execAsync(`RELEASE SAVEPOINT ${savepoint};`);
      }

      return result;
    } catch (error) {
      if (isOuter) {
        await this.db.execAsync('ROLLBACK;');
      } else {
        await this.db.execAsync(`ROLLBACK TO SAVEPOINT ${savepoint};`);
        await this.db.execAsync(`RELEASE SAVEPOINT ${savepoint};`);
      }
      throw error;
    } finally {
      this.txDepth -= 1;
    }
  }

  async closeAsync(): Promise<void> {
    await this.db.closeAsync();
  }
}

let activeAdapter: DatabaseAdapter | null = null;
let initPromise: Promise<DatabaseAdapter> | null = null;

export async function getDatabase(): Promise<DatabaseAdapter> {
  if (activeAdapter) return activeAdapter;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const rawDb = await SQLite.openDatabaseAsync(DB_NAME);
    await rawDb.execAsync('PRAGMA journal_mode = WAL;');
    await rawDb.execAsync('PRAGMA foreign_keys = ON;');
    const adapter = new ExpoSQLiteAdapter(rawDb);
    await runMigrations(adapter);
    activeAdapter = adapter;
    return adapter;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

export function setDatabaseAdapterForTesting(adapter: DatabaseAdapter | null): void {
  activeAdapter = adapter;
  initPromise = null;
}

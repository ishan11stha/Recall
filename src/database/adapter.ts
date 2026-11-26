export type SQLBindValue = string | number | null | Uint8Array;

export interface SQLRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface DatabaseAdapter {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SQLBindValue[]): Promise<SQLRunResult>;
  getFirstAsync<T = Record<string, unknown>>(
    sql: string,
    params?: SQLBindValue[]
  ): Promise<T | null>;
  getAllAsync<T = Record<string, unknown>>(
    sql: string,
    params?: SQLBindValue[]
  ): Promise<T[]>;
  withTransactionAsync<T>(fn: () => Promise<T>): Promise<T>;
  closeAsync(): Promise<void>;
}

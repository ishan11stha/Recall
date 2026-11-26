import type { DatabaseAdapter } from '../adapter';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../types/models';
import { nowIso } from '../../utils/id';

const SETTINGS_KEYS = Object.keys(DEFAULT_APP_SETTINGS) as (keyof AppSettings)[];

export async function getSettingValue(
  db: DatabaseAdapter,
  key: string
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export async function setSettingValue(
  db: DatabaseAdapter,
  key: string,
  value: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowIso()]
  );
}

export async function deleteSettingValue(
  db: DatabaseAdapter,
  key: string
): Promise<void> {
  await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
}

export async function loadAppSettings(db: DatabaseAdapter): Promise<AppSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings'
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const merged: AppSettings = { ...DEFAULT_APP_SETTINGS };

  for (const key of SETTINGS_KEYS) {
    const raw = map.get(key);
    if (raw === undefined) continue;
    try {
      (merged as unknown as Record<string, unknown>)[key] = JSON.parse(raw);
    } catch {
      (merged as unknown as Record<string, unknown>)[key] = raw;
    }
  }

  return merged;
}

export async function saveAppSettings(
  db: DatabaseAdapter,
  patch: Partial<AppSettings>
): Promise<AppSettings> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  await db.withTransactionAsync(async () => {
    for (const [key, value] of entries) {
      await setSettingValue(db, key, JSON.stringify(value));
    }
  });
  return loadAppSettings(db);
}

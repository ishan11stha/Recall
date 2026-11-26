import type { DatabaseAdapter } from '../adapter';
import { generateId, nowIso } from '../../utils/id';

export async function recordOutboxMutation(
  db: DatabaseAdapter,
  entityType: string,
  entityId: string,
  operation: 'upsert' | 'delete',
  payload: Record<string, unknown>
): Promise<void> {
  const ts = nowIso();
  await db.runAsync(
    `INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [generateId(), entityType, entityId, operation, JSON.stringify(payload), ts]
  );

  if (operation === 'delete') {
    await db.runAsync(
      `INSERT INTO deletion_tombstones (id, entity_type, entity_id, deleted_at)
       VALUES (?, ?, ?, ?)`,
      [generateId(), entityType, entityId, ts]
    );
  }
}

import type { DatabaseAdapter } from '../adapter';
import type { Collection, UUID } from '../../types/models';
import { generateId, nowIso } from '../../utils/id';
import { recordOutboxMutation } from './syncHelpers';

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  deleted_at: string | null;
  note_count?: number;
  child_count?: number;
}

function mapCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    parentId: row.parent_id,
    icon: row.icon,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at,
    deletedAt: row.deleted_at,
    noteCount: row.note_count ?? 0,
    childCount: row.child_count ?? 0,
  };
}

export async function listCollections(
  db: DatabaseAdapter,
  parentId?: UUID | null
): Promise<Collection[]> {
  const hasParentFilter = parentId !== undefined;
  const whereClause = hasParentFilter
    ? parentId === null
      ? 'c.deleted_at IS NULL AND c.parent_id IS NULL'
      : 'c.deleted_at IS NULL AND c.parent_id = ?'
    : 'c.deleted_at IS NULL';
  const params = hasParentFilter && parentId !== null ? [parentId] : [];

  const rows = await db.getAllAsync<CollectionRow>(
    `SELECT c.*,
       (SELECT COUNT(*) FROM notes n WHERE n.collection_id = c.id AND n.deleted_at IS NULL AND n.is_archived = 0) AS note_count,
       (SELECT COUNT(*) FROM collections ch WHERE ch.parent_id = c.id AND ch.deleted_at IS NULL) AS child_count
     FROM collections c
     WHERE ${whereClause}
     ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC`,
    params
  );

  return rows.map(mapCollection);
}

export async function getCollectionById(
  db: DatabaseAdapter,
  id: UUID
): Promise<Collection | null> {
  const row = await db.getFirstAsync<CollectionRow>(
    `SELECT c.*,
       (SELECT COUNT(*) FROM notes n WHERE n.collection_id = c.id AND n.deleted_at IS NULL AND n.is_archived = 0) AS note_count,
       (SELECT COUNT(*) FROM collections ch WHERE ch.parent_id = c.id AND ch.deleted_at IS NULL) AS child_count
     FROM collections c
     WHERE c.id = ? AND c.deleted_at IS NULL`,
    [id]
  );
  return row ? mapCollection(row) : null;
}

export async function createCollection(
  db: DatabaseAdapter,
  input: { name: string; description?: string | null; parentId?: UUID | null; icon?: string | null }
): Promise<Collection> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('Collection name is required.');
  }

  const id = generateId();
  const ts = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO collections (id, name, description, parent_id, icon, sort_order, created_at, updated_at, last_accessed_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [id, trimmedName, input.description ?? null, input.parentId ?? null, input.icon ?? null, ts, ts, ts]
    );
    await recordOutboxMutation(db, 'collection', id, 'upsert', {
      id,
      name: trimmedName,
      parentId: input.parentId ?? null,
    });
  });

  const created = await getCollectionById(db, id);
  if (!created) throw new Error('Failed to create collection');
  return created;
}

export async function updateCollection(
  db: DatabaseAdapter,
  id: UUID,
  patch: { name?: string; description?: string | null; parentId?: UUID | null; icon?: string | null }
): Promise<Collection | null> {
  const existing = await getCollectionById(db, id);
  if (!existing) return null;

  if (patch.parentId === id) {
    throw new Error('A collection cannot be its own parent.');
  }

  const name = patch.name !== undefined ? patch.name.trim() : existing.name;
  if (!name) throw new Error('Collection name cannot be empty.');

  const description = patch.description !== undefined ? patch.description : existing.description;
  const parentId = patch.parentId !== undefined ? patch.parentId : existing.parentId;
  const icon = patch.icon !== undefined ? patch.icon : existing.icon;
  const ts = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE collections
       SET name = ?, description = ?, parent_id = ?, icon = ?, updated_at = ?
       WHERE id = ?`,
      [name, description, parentId, icon, ts, id]
    );
    await recordOutboxMutation(db, 'collection', id, 'upsert', { id, name, parentId });
  });

  return getCollectionById(db, id);
}

export async function touchCollectionAccess(db: DatabaseAdapter, id: UUID): Promise<void> {
  await db.runAsync(
    'UPDATE collections SET last_accessed_at = ? WHERE id = ? AND deleted_at IS NULL',
    [nowIso(), id]
  );
}

/**
 * Safely deletes a collection:
 * - Reassigns its notes to the parent collection (or Inbox if top-level) so no notes are lost.
 * - Re-parents child collections to the deleted collection's parent.
 * - Soft-deletes the collection and logs a deletion tombstone.
 */
export async function deleteCollectionSafely(
  db: DatabaseAdapter,
  id: UUID,
  moveNotesToCollectionId?: UUID | null
): Promise<void> {
  const existing = await getCollectionById(db, id);
  if (!existing) return;

  const targetCollectionId =
    moveNotesToCollectionId !== undefined ? moveNotesToCollectionId : existing.parentId;
  const ts = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE notes
       SET collection_id = ?,
           is_inbox = CASE WHEN ? IS NULL THEN 1 ELSE is_inbox END,
           updated_at = ?
       WHERE collection_id = ? AND deleted_at IS NULL`,
      [targetCollectionId, targetCollectionId, ts, id]
    );

    await db.runAsync(
      `UPDATE collections
       SET parent_id = ?, updated_at = ?
       WHERE parent_id = ? AND deleted_at IS NULL`,
      [existing.parentId, ts, id]
    );

    await db.runAsync(
      `UPDATE flashcards
       SET collection_id = ?, updated_at = ?
       WHERE collection_id = ? AND deleted_at IS NULL`,
      [targetCollectionId, ts, id]
    );

    await db.runAsync(
      'UPDATE collections SET deleted_at = ?, updated_at = ? WHERE id = ?',
      [ts, ts, id]
    );

    await recordOutboxMutation(db, 'collection', id, 'delete', { id });
  });
}

export async function getCollectionBreadcrumbs(
  db: DatabaseAdapter,
  id: UUID
): Promise<Collection[]> {
  const trail: Collection[] = [];
  let currentId: UUID | null = id;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const col = await getCollectionById(db, currentId);
    if (!col) break;
    trail.unshift(col);
    currentId = col.parentId;
  }

  return trail;
}

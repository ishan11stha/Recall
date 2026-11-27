import type { DatabaseAdapter } from '../adapter';
import type {
  NoteLink,
  NoteLinkDetail,
  NoteType,
  RelationshipType,
  UUID,
} from '../../types/models';
import { generateId, nowIso } from '../../utils/id';
import { recordOutboxMutation } from './syncHelpers';

export async function createNoteLink(
  db: DatabaseAdapter,
  input: {
    sourceNoteId: UUID;
    targetNoteId: UUID;
    relationshipType: RelationshipType;
    description?: string | null;
  }
): Promise<NoteLink> {
  if (input.sourceNoteId === input.targetNoteId) {
    throw new Error('Cannot link a note to itself.');
  }

  const existing = await db.getFirstAsync<{
    id: string;
    source_note_id: string;
    target_note_id: string;
    relationship_type: string;
    description: string | null;
    created_at: string;
  }>(
    `SELECT * FROM note_links
     WHERE source_note_id = ? AND target_note_id = ? AND relationship_type = ?`,
    [input.sourceNoteId, input.targetNoteId, input.relationshipType]
  );

  if (existing) {
    return {
      id: existing.id,
      sourceNoteId: existing.source_note_id,
      targetNoteId: existing.target_note_id,
      relationshipType: existing.relationship_type as RelationshipType,
      description: existing.description,
      createdAt: existing.created_at,
    };
  }

  const id = generateId();
  const ts = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO note_links (id, source_note_id, target_note_id, relationship_type, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.sourceNoteId,
        input.targetNoteId,
        input.relationshipType,
        input.description?.trim() || null,
        ts,
      ]
    );
    await recordOutboxMutation(db, 'note_link', id, 'upsert', {
      id,
      sourceNoteId: input.sourceNoteId,
      targetNoteId: input.targetNoteId,
      relationshipType: input.relationshipType,
    });
  });

  return {
    id,
    sourceNoteId: input.sourceNoteId,
    targetNoteId: input.targetNoteId,
    relationshipType: input.relationshipType,
    description: input.description?.trim() || null,
    createdAt: ts,
  };
}

export async function deleteNoteLink(db: DatabaseAdapter, linkId: UUID): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM note_links WHERE id = ?', [linkId]);
    await recordOutboxMutation(db, 'note_link', linkId, 'delete', { id: linkId });
  });
}

export interface NoteLinkWithDegree extends NoteLinkDetail {
  linkedDegree: number;
}

export async function getConnectionsForNote(
  db: DatabaseAdapter,
  noteId: UUID
): Promise<{ outgoing: NoteLinkWithDegree[]; backlinks: NoteLinkWithDegree[] }> {
  const outgoingRows = await db.getAllAsync<{
    id: string;
    source_note_id: string;
    target_note_id: string;
    relationship_type: string;
    description: string | null;
    created_at: string;
    linked_title: string;
    linked_type: string;
    linked_degree: number;
  }>(
    `SELECT l.*, n.title AS linked_title, n.note_type AS linked_type,
       (SELECT COUNT(*) FROM note_links l2
        WHERE (l2.source_note_id = n.id OR l2.target_note_id = n.id)
          AND l2.source_note_id != ? AND l2.target_note_id != ?) AS linked_degree
     FROM note_links l
     INNER JOIN notes n ON n.id = l.target_note_id AND n.deleted_at IS NULL
     WHERE l.source_note_id = ?
     ORDER BY l.created_at DESC`,
    [noteId, noteId, noteId]
  );

  const incomingRows = await db.getAllAsync<{
    id: string;
    source_note_id: string;
    target_note_id: string;
    relationship_type: string;
    description: string | null;
    created_at: string;
    linked_title: string;
    linked_type: string;
    linked_degree: number;
  }>(
    `SELECT l.*, n.title AS linked_title, n.note_type AS linked_type,
       (SELECT COUNT(*) FROM note_links l2
        WHERE (l2.source_note_id = n.id OR l2.target_note_id = n.id)
          AND l2.source_note_id != ? AND l2.target_note_id != ?) AS linked_degree
     FROM note_links l
     INNER JOIN notes n ON n.id = l.source_note_id AND n.deleted_at IS NULL
     WHERE l.target_note_id = ?
     ORDER BY l.created_at DESC`,
    [noteId, noteId, noteId]
  );

  return {
    outgoing: outgoingRows.map((r) => ({
      id: r.id,
      sourceNoteId: r.source_note_id,
      targetNoteId: r.target_note_id,
      relationshipType: r.relationship_type as RelationshipType,
      description: r.description,
      createdAt: r.created_at,
      direction: 'outgoing',
      linkedNoteId: r.target_note_id,
      linkedNoteTitle: r.linked_title,
      linkedNoteType: r.linked_type as NoteType,
      linkedDegree: r.linked_degree ?? 0,
    })),
    backlinks: incomingRows.map((r) => ({
      id: r.id,
      sourceNoteId: r.source_note_id,
      targetNoteId: r.target_note_id,
      relationshipType: r.relationship_type as RelationshipType,
      description: r.description,
      createdAt: r.created_at,
      direction: 'incoming',
      linkedNoteId: r.source_note_id,
      linkedNoteTitle: r.linked_title,
      linkedNoteType: r.linked_type as NoteType,
      linkedDegree: r.linked_degree ?? 0,
    })),
  };
}

export interface GraphNode {
  id: UUID;
  title: string;
  noteType: NoteType;
  collectionId: UUID | null;
  degree: number;
}

export interface GraphEdge {
  id: UUID;
  source: UUID;
  target: UUID;
  relationshipType: RelationshipType;
}

export async function getKnowledgeGraphData(
  db: DatabaseAdapter,
  options: { collectionId?: UUID | null; maxNodes?: number } = {}
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const maxNodes = options.maxNodes ?? 80;
  const params: (string | number)[] = [];
  let whereCol = '';
  if (options.collectionId) {
    whereCol = 'AND n.collection_id = ?';
    params.push(options.collectionId);
  }
  params.push(maxNodes);

  const noteRows = await db.getAllAsync<{
    id: string;
    title: string;
    note_type: string;
    collection_id: string | null;
    degree: number;
  }>(
    `SELECT n.id, n.title, n.note_type, n.collection_id,
       (SELECT COUNT(*) FROM note_links l WHERE l.source_note_id = n.id OR l.target_note_id = n.id) AS degree
     FROM notes n
     WHERE n.deleted_at IS NULL AND n.is_archived = 0 ${whereCol}
     ORDER BY degree DESC, n.updated_at DESC
     LIMIT ?`,
    params
  );

  const nodeIds = new Set(noteRows.map((n) => n.id));
  const linkRows = await db.getAllAsync<{
    id: string;
    source_note_id: string;
    target_note_id: string;
    relationship_type: string;
  }>('SELECT id, source_note_id, target_note_id, relationship_type FROM note_links');

  const edges: GraphEdge[] = linkRows
    .filter((l) => nodeIds.has(l.source_note_id) && nodeIds.has(l.target_note_id))
    .map((l) => ({
      id: l.id,
      source: l.source_note_id,
      target: l.target_note_id,
      relationshipType: l.relationship_type as RelationshipType,
    }));

  const nodes: GraphNode[] = noteRows.map((n) => ({
    id: n.id,
    title: n.title,
    noteType: n.note_type as NoteType,
    collectionId: n.collection_id,
    degree: n.degree,
  }));

  return { nodes, edges };
}

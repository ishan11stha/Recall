import type { DatabaseAdapter } from '../../database/adapter';
import { createNoteLink } from '../../database/repositories/linksRepo';
import { setTagsForNote } from '../../database/repositories/tagsRepo';
import type { UUID } from '../../types/models';

function stripCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
}

/**
 * Extracts unique [[Note Title]] or [[Note Title|Alias]] wikilink targets.
 */
export function extractWikilinks(markdown: string): string[] {
  const cleaned = stripCodeBlocks(markdown);
  const regex = /\[\[([^[\]|]+)(?:\|[^[\]]+)?\]\]/g;
  const seen = new Set<string>();
  const results: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleaned)) !== null) {
    const target = match[1].trim();
    if (!target) continue;
    const key = target.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push(target);
    }
  }
  return results;
}

/**
 * Extracts unique inline #tags (ignoring Markdown headings like "# Heading").
 */
export function extractInlineTags(markdown: string): string[] {
  const cleaned = stripCodeBlocks(markdown);
  const regex = /(?:^|[\s(])#([a-zA-Z][a-zA-Z0-9_-]{0,39})\b/g;
  const seen = new Set<string>();
  const results: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleaned)) !== null) {
    const tag = match[1].toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      results.push(tag);
    }
  }
  return results;
}

/**
 * Synchronizes inline [[Wikilinks]] -> SQLite note_links (so Mind Map stays live)
 * and inline #tags -> SQLite note_tags.
 */
export async function syncNoteWikilinksAndTags(
  db: DatabaseAdapter,
  noteId: UUID,
  content: string
): Promise<void> {
  const wikilinks = extractWikilinks(content);
  for (const title of wikilinks) {
    const target = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM notes WHERE deleted_at IS NULL AND LOWER(title) = LOWER(?) LIMIT 1',
      [title]
    );
    if (target && target.id !== noteId) {
      await createNoteLink(db, {
        sourceNoteId: noteId,
        targetNoteId: target.id,
        relationshipType: 'related_to',
      });
    }
  }

  const tags = extractInlineTags(content);
  if (tags.length > 0) {
    await setTagsForNote(db, noteId, tags);
  }
}

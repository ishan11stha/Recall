export interface Migration {
  version: number;
  name: string;
  upSql: string;
}

export const INITIAL_SCHEMA_MIGRATION: Migration = {
  version: 1,
  name: '001_initial_schema',
  upSql: `
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      parent_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
      icon TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_accessed_at TEXT,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id);
    CREATE INDEX IF NOT EXISTS idx_collections_deleted ON collections(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_collections_accessed ON collections(last_accessed_at);

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      note_type TEXT NOT NULL DEFAULT 'general',
      collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
      is_inbox INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      source_url TEXT,
      word_count INTEGER NOT NULL DEFAULT 0,
      reading_time_min INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_accessed_at TEXT,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_notes_collection ON notes(collection_id);
    CREATE INDEX IF NOT EXISTS idx_notes_inbox ON notes(is_inbox, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes(is_archived, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type);

    CREATE TABLE IF NOT EXISTS note_templates (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      note_type TEXT NOT NULL DEFAULT 'general',
      content_template TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (note_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);

    CREATE TABLE IF NOT EXISTS note_links (
      id TEXT PRIMARY KEY NOT NULL,
      source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      target_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      relationship_type TEXT NOT NULL DEFAULT 'related_to',
      description TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(source_note_id, target_note_id, relationship_type)
    );

    CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_note_id);
    CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_note_id);

    CREATE TABLE IF NOT EXISTS note_revisions (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_note_revisions_note ON note_revisions(note_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      file_type TEXT NOT NULL,
      mime_type TEXT,
      local_uri TEXT,
      source_url TEXT,
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      notes_metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_type ON attachments(file_type, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_attachments_updated ON attachments(updated_at DESC);

    CREATE TABLE IF NOT EXISTS attachment_notes (
      attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (attachment_id, note_id)
    );

    CREATE INDEX IF NOT EXISTS idx_attachment_notes_note ON attachment_notes(note_id);

    CREATE TABLE IF NOT EXISTS flashcards (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
      collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
      card_type TEXT NOT NULL DEFAULT 'basic',
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      extra TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_flashcards_note ON flashcards(note_id);
    CREATE INDEX IF NOT EXISTS idx_flashcards_collection ON flashcards(collection_id);
    CREATE INDEX IF NOT EXISTS idx_flashcards_deleted ON flashcards(deleted_at);

    CREATE TABLE IF NOT EXISTS review_states (
      card_id TEXT PRIMARY KEY NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
      due_at TEXT NOT NULL,
      stability REAL NOT NULL DEFAULT 0,
      difficulty REAL NOT NULL DEFAULT 0,
      elapsed_days REAL NOT NULL DEFAULT 0,
      scheduled_days REAL NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'new',
      last_review_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_review_states_due ON review_states(due_at);

    CREATE TABLE IF NOT EXISTS review_logs (
      id TEXT PRIMARY KEY NOT NULL,
      card_id TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL,
      state_before TEXT NOT NULL,
      state_after TEXT NOT NULL,
      scheduled_days REAL NOT NULL DEFAULT 0,
      elapsed_days REAL NOT NULL DEFAULT 0,
      stability REAL NOT NULL DEFAULT 0,
      difficulty REAL NOT NULL DEFAULT 0,
      review_duration_ms INTEGER NOT NULL DEFAULT 0,
      reviewed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_review_logs_card ON review_logs(card_id, reviewed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_review_logs_date ON review_logs(reviewed_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recent_searches (
      id TEXT PRIMARY KEY NOT NULL,
      query TEXT NOT NULL UNIQUE,
      searched_at TEXT NOT NULL
    );

    -- Future synchronization tables
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(synced_at, created_at);

    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deletion_tombstones (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tombstones_entity ON deletion_tombstones(entity_type, entity_id);

    -- FTS5 Full-Text Search tables
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      note_id UNINDEXED,
      title,
      content,
      tokenize = 'unicode61'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS attachments_fts USING fts5(
      attachment_id UNINDEXED,
      title,
      notes_metadata,
      source_url,
      tokenize = 'unicode61'
    );

    -- Triggers to keep notes_fts synchronized automatically
    CREATE TRIGGER IF NOT EXISTS notes_fts_after_insert
    AFTER INSERT ON notes
    WHEN NEW.deleted_at IS NULL
    BEGIN
      INSERT INTO notes_fts(note_id, title, content)
      VALUES (NEW.id, NEW.title, NEW.content);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_fts_after_update
    AFTER UPDATE ON notes
    BEGIN
      DELETE FROM notes_fts WHERE note_id = OLD.id;
      INSERT INTO notes_fts(note_id, title, content)
      SELECT NEW.id, NEW.title, NEW.content
      WHERE NEW.deleted_at IS NULL;
    END;

    CREATE TRIGGER IF NOT EXISTS notes_fts_after_delete
    AFTER DELETE ON notes
    BEGIN
      DELETE FROM notes_fts WHERE note_id = OLD.id;
    END;

    -- Triggers to keep attachments_fts synchronized automatically
    CREATE TRIGGER IF NOT EXISTS attachments_fts_after_insert
    AFTER INSERT ON attachments
    WHEN NEW.deleted_at IS NULL
    BEGIN
      INSERT INTO attachments_fts(attachment_id, title, notes_metadata, source_url)
      VALUES (NEW.id, NEW.title, COALESCE(NEW.notes_metadata, ''), COALESCE(NEW.source_url, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS attachments_fts_after_update
    AFTER UPDATE ON attachments
    BEGIN
      DELETE FROM attachments_fts WHERE attachment_id = OLD.id;
      INSERT INTO attachments_fts(attachment_id, title, notes_metadata, source_url)
      SELECT NEW.id, NEW.title, COALESCE(NEW.notes_metadata, ''), COALESCE(NEW.source_url, '')
      WHERE NEW.deleted_at IS NULL;
    END;

    CREATE TRIGGER IF NOT EXISTS attachments_fts_after_delete
    AFTER DELETE ON attachments
    BEGIN
      DELETE FROM attachments_fts WHERE attachment_id = OLD.id;
    END;
  `,
};

export const ALL_MIGRATIONS: Migration[] = [INITIAL_SCHEMA_MIGRATION];

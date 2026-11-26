# RECALL — Architecture Documentation

## Layered Structure

```text
app/                      # Expo Router screens (presentation & navigation only)
  (tabs)/                 # 5 primary bottom tabs: Today, Library, Capture, Review, Search
  notes/                  # New note, Note details, Markdown editor
  collections/            # Collections manager & nested collection detail
  flashcards/             # Flashcards list, create/edit, FSRS study session
  review/                 # Learning analytics & statistics
  resources/              # Resource library & resource detail/linking
  graph/                  # Interactive SVG knowledge graph
  settings/               # Settings, Backup/Restore, Security/App Lock

src/
  theme/                  # Semantic light/dark/system tokens & ThemeProvider
  components/             # Reusable editorial UI primitives, NoteCard, Markdown editor/renderer
  database/
    adapter.ts            # DatabaseAdapter interface (decouples SQLite runtime)
    client.ts             # ExpoSQLiteAdapter (WAL mode, FK enforcement, nested savepoints)
    migrations/           # Versioned SQL migrations, FTS5 triggers, integrity check
    repositories/         # Pure data-access layer (zero raw SQL in UI screens)
  services/
    scheduler/            # SpacedRepetitionScheduler interface + FSRS-5 implementation
    search/               # UniversalSearchService + Fts5SearchProvider (extensible for semantic search)
    backup/               # Versioned v1 ZIP backup/restore + Markdown/JSON export
    files/                # Persistent attachment storage + native sharing
    notifications/        # Local daily review reminders
    security/             # Biometric + SecureStore PIN lock
  stores/                 # Zustand stores for UI/session state & capture draft
  types/                  # Strict TypeScript domain models
  utils/                  # UUID v4, ISO-8601 UTC dates, word count, FTS query sanitization
```

## Database Design

- **Primary source of truth:** Local SQLite (`recall_pkm.db`) with `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`.
- **Identifiers & Timestamps:** RFC 4122 v4 UUIDs and ISO-8601 UTC strings across all tables.
- **Full-Text Search:** `notes_fts` and `attachments_fts` virtual tables (`tokenize = 'unicode61'`) kept synchronized via SQLite `AFTER INSERT / UPDATE / DELETE` triggers, plus `rebuildSearchIndexes()` for recovery/restore.
- **Safe Deletions:** Notes use soft deletion (`deleted_at`) with Trash restoration; deleting a Collection safely reassigns its notes to the parent collection (or Inbox if top-level) and re-parents child collections.
- **Sync Readiness:** Repository mutations record entries in `sync_outbox` and `deletion_tombstones` so future Supabase synchronization can replay changes without schema rewrites.

## Enabling SQLCipher in Production/Development Builds

Expo SQLite supports SQLCipher in custom development and production builds (not Expo Go). To enable encrypted SQLite storage:
1. Set `"useSQLCipher": true` in `app.json` under the `expo-sqlite` plugin options.
2. Generate and store a random 256-bit passphrase in `expo-secure-store` on first launch.
3. Execute `PRAGMA key = '<passphrase>';` immediately after opening the database in `src/database/client.ts` before running migrations.
4. Rebuild the Android Development/Production build via EAS Build or `npx expo run:android`.

## Testability

`src/database/adapter.ts` abstracts SQLite calls behind `DatabaseAdapter`. In Jest, `tests/helpers/nodeSqliteAdapter.ts` implements `DatabaseAdapter` on top of Node's built-in `node:sqlite`, allowing automated tests to exercise real SQLite foreign keys, triggers, FTS5 search, migrations, FSRS scheduling, and full ZIP backup/restore without requiring an Android emulator.

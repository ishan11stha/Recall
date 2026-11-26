# RECALL — Versioned Backup & Restoration Format (v1)

## Archive Structure

A RECALL full backup is a standard DEFLATE-compressed `.zip` archive (`recall-backup-v1-YYYY-MM-DD.zip`) containing:

```text
recall-backup-v1-YYYY-MM-DD.zip
├── manifest.json          # Backup format version, schema version, timestamp, record counts
├── database.json          # Full relational export + attachmentFiles map
└── attachments/
    ├── <uuid>.pdf         # Copied persistent attachment files
    └── <uuid>.jpg
```

## Preserved Data

The following tables and assets are preserved 100%:
- `collections` (including nested `parent_id` hierarchy)
- `notes` (including Inbox, Pinned, Favorite, Archived, and Trash states)
- `note_templates`
- `tags` and `note_tags`
- `note_links` (all 7 relationship types)
- `note_revisions`
- `attachments` and `attachment_notes` (plus binary files in `attachments/`)
- `flashcards`, `review_states` (FSRS stability/difficulty/due dates), and `review_logs`
- `settings`

## Restoration Process

1. Validate `manifest.app === "RECALL"` and `manifest.backupFormatVersion === 1`.
2. Extract all files under `attachments/` into the app's persistent `recall_attachments/` directory and remap each attachment's `local_uri` to the new device path.
3. Within a single SQLite transaction, clear existing rows in reverse dependency order and re-insert all tables in parent-first dependency order.
4. Re-enable `PRAGMA foreign_keys = ON`.
5. Rebuild `notes_fts` and `attachments_fts` full-text indexes.
6. Run `PRAGMA integrity_check` and report the verification status to the user.

## Testing Restoration on a Fresh Install

1. Open **Settings → Backup, Restore & Export → Create Backup** and save the `.zip` archive to Android storage or Google Drive.
2. Uninstall and reinstall RECALL (or install on a second device).
3. Open **Settings → Backup, Restore & Export → Restore**, select the `.zip` file, and confirm.
4. Verify all notes, collections, connections, flashcards, due dates, attachments, and search results are restored.

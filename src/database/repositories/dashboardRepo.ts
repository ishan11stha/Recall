import type { DatabaseAdapter } from '../adapter';
import type { AnalyticsSummary, Collection, DashboardSummary, Note, NoteType } from '../../types/models';
import { startOfTodayUtcIso } from '../../utils/id';

function isoDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shortDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3);
}

export async function getDashboardSummary(
  db: DatabaseAdapter,
  now: Date = new Date()
): Promise<DashboardSummary> {
  const nowStr = now.toISOString();
  const todayStart = startOfTodayUtcIso();

  const dueRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM flashcards f
     INNER JOIN review_states rs ON rs.card_id = f.id
     WHERE f.deleted_at IS NULL AND rs.due_at <= ?`,
    [nowStr]
  );

  const completedRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM review_logs WHERE reviewed_at >= ?',
    [todayStart]
  );

  const notesCountRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM notes WHERE deleted_at IS NULL AND is_archived = 0'
  );

  const inboxCountRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM notes WHERE deleted_at IS NULL AND is_archived = 0 AND is_inbox = 1'
  );

  const collectionsCountRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM collections WHERE deleted_at IS NULL'
  );

  const flashcardsCountRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM flashcards WHERE deleted_at IS NULL'
  );

  const remainingTodayCount = dueRow?.count ?? 0;
  const completedTodayCount = completedRow?.count ?? 0;
  const dueCardsCount = remainingTodayCount + completedTodayCount;
  const dailyProgressPercent =
    dueCardsCount > 0 ? Math.round((completedTodayCount / dueCardsCount) * 100) : 0;

  const pinnedRows = await db.getAllAsync<{
    id: string;
    title: string;
    content: string;
    note_type: string;
    collection_id: string | null;
    is_inbox: number;
    is_pinned: number;
    is_favorite: number;
    is_archived: number;
    source_url: string | null;
    word_count: number;
    reading_time_min: number;
    created_at: string;
    updated_at: string;
    last_accessed_at: string | null;
    deleted_at: string | null;
    collection_name: string | null;
  }>(
    `SELECT n.*, c.name AS collection_name
     FROM notes n
     LEFT JOIN collections c ON c.id = n.collection_id AND c.deleted_at IS NULL
     WHERE n.deleted_at IS NULL AND n.is_archived = 0 AND n.is_pinned = 1
     ORDER BY n.updated_at DESC
     LIMIT 5`
  );

  const recentRows = await db.getAllAsync<typeof pinnedRows[number]>(
    `SELECT n.*, c.name AS collection_name
     FROM notes n
     LEFT JOIN collections c ON c.id = n.collection_id AND c.deleted_at IS NULL
     WHERE n.deleted_at IS NULL AND n.is_archived = 0
     ORDER BY COALESCE(n.last_accessed_at, n.updated_at) DESC
     LIMIT 6`
  );

  const mapNoteRow = (r: typeof pinnedRows[number]): Note => ({
    id: r.id,
    title: r.title,
    content: r.content,
    noteType: r.note_type as NoteType,
    collectionId: r.collection_id,
    isInbox: Boolean(r.is_inbox),
    isPinned: Boolean(r.is_pinned),
    isFavorite: Boolean(r.is_favorite),
    isArchived: Boolean(r.is_archived),
    sourceUrl: r.source_url,
    wordCount: r.word_count,
    readingTimeMin: r.reading_time_min,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastAccessedAt: r.last_accessed_at,
    deletedAt: r.deleted_at,
    collectionName: r.collection_name,
  });

  const colRows = await db.getAllAsync<{
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
    note_count: number;
  }>(
    `SELECT c.*,
       (SELECT COUNT(*) FROM notes n WHERE n.collection_id = c.id AND n.deleted_at IS NULL AND n.is_archived = 0) AS note_count
     FROM collections c
     WHERE c.deleted_at IS NULL
     ORDER BY COALESCE(c.last_accessed_at, c.updated_at) DESC
     LIMIT 5`
  );

  const recentCollections: Collection[] = colRows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    parentId: c.parent_id,
    icon: c.icon,
    sortOrder: c.sort_order,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    lastAccessedAt: c.last_accessed_at,
    deletedAt: c.deleted_at,
    noteCount: c.note_count,
  }));

  // 7-day learning activity
  const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const sevenDaysIso = new Date(
    Date.UTC(sevenDaysAgo.getUTCFullYear(), sevenDaysAgo.getUTCMonth(), sevenDaysAgo.getUTCDate())
  ).toISOString();

  const reviewDayRows = await db.getAllAsync<{ day: string; count: number }>(
    `SELECT substr(reviewed_at, 1, 10) AS day, COUNT(*) AS count
     FROM review_logs
     WHERE reviewed_at >= ?
     GROUP BY day`,
    [sevenDaysIso]
  );

  const noteDayRows = await db.getAllAsync<{ day: string; count: number }>(
    `SELECT substr(updated_at, 1, 10) AS day, COUNT(*) AS count
     FROM notes
     WHERE deleted_at IS NULL AND updated_at >= ?
     GROUP BY day`,
    [sevenDaysIso]
  );

  const revMap = new Map(reviewDayRows.map((r) => [r.day, r.count]));
  const noteMap = new Map(noteDayRows.map((r) => [r.day, r.count]));

  const weeklyActivity = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = isoDayKey(d);
    weeklyActivity.push({
      date: key,
      label: shortDayLabel(d),
      reviews: revMap.get(key) ?? 0,
      notesEdited: noteMap.get(key) ?? 0,
    });
  }

  return {
    dueCardsCount,
    completedTodayCount,
    remainingTodayCount,
    dailyProgressPercent,
    totalNotesCount: notesCountRow?.count ?? 0,
    inboxCount: inboxCountRow?.count ?? 0,
    totalCollectionsCount: collectionsCountRow?.count ?? 0,
    totalFlashcardsCount: flashcardsCountRow?.count ?? 0,
    weeklyActivity,
    pinnedNotes: pinnedRows.map(mapNoteRow),
    recentNotes: recentRows.map(mapNoteRow),
    recentCollections,
  };
}

export async function getAnalyticsSummary(
  db: DatabaseAdapter,
  now: Date = new Date()
): Promise<AnalyticsSummary> {
  const notesRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM notes WHERE deleted_at IS NULL'
  );
  const colsRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM collections WHERE deleted_at IS NULL'
  );
  const cardsRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM flashcards WHERE deleted_at IS NULL'
  );
  const reviewsRow = await db.getFirstAsync<{
    total: number;
    passed: number;
  }>(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN rating >= 2 THEN 1 ELSE 0 END) AS passed
     FROM review_logs`
  );

  const totalReviews = reviewsRow?.total ?? 0;
  const passedReviews = reviewsRow?.passed ?? 0;
  const accuracyPercent =
    totalReviews > 0 ? Math.round((passedReviews / totalReviews) * 100) : 0;

  // Retention: percentage of reviewed cards currently not lapsed on last review (state = 'review')
  const retentionRow = await db.getFirstAsync<{ reviewed_cards: number; retained_cards: number }>(
    `SELECT COUNT(*) AS reviewed_cards,
       SUM(CASE WHEN rs.state = 'review' AND rs.reps > 0 THEN 1 ELSE 0 END) AS retained_cards
     FROM review_states rs
     INNER JOIN flashcards f ON f.id = rs.card_id AND f.deleted_at IS NULL
     WHERE rs.reps > 0`
  );
  const reviewedCards = retentionRow?.reviewed_cards ?? 0;
  const retentionPercent =
    reviewedCards > 0
      ? Math.round(((retentionRow?.retained_cards ?? 0) / reviewedCards) * 100)
      : 0;

  // Daily reviews (last 7 days)
  const sevenAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dailyRows = await db.getAllAsync<{ day: string; count: number }>(
    `SELECT substr(reviewed_at, 1, 10) AS day, COUNT(*) AS count
     FROM review_logs
     WHERE substr(reviewed_at, 1, 10) >= ?
     GROUP BY day`,
    [sevenAgo]
  );
  const dailyMap = new Map(dailyRows.map((r) => [r.day, r.count]));
  const dailyReviews = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = isoDayKey(d);
    dailyReviews.push({ date: key, label: shortDayLabel(d), count: dailyMap.get(key) ?? 0 });
  }

  // Weekly reviews (last 4 weeks)
  const weeklyReviews = [];
  for (let w = 3; w >= 0; w -= 1) {
    const end = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM review_logs
       WHERE substr(reviewed_at, 1, 10) >= ? AND substr(reviewed_at, 1, 10) <= ?`,
      [isoDayKey(start), isoDayKey(end)]
    );
    weeklyReviews.push({
      label: w === 0 ? 'This wk' : `${w}w ago`,
      count: row?.count ?? 0,
    });
  }

  // Monthly reviews (last 6 months)
  const monthlyReviews = [];
  for (let m = 5; m >= 0; m -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    const ym = d.toISOString().slice(0, 7);
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM review_logs WHERE substr(reviewed_at, 1, 7) = ?`,
      [ym]
    );
    monthlyReviews.push({
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      count: row?.count ?? 0,
    });
  }

  // Most active collections
  const activeCols = await db.getAllAsync<{
    id: string;
    name: string;
    note_count: number;
    card_count: number;
  }>(
    `SELECT c.id, c.name,
       (SELECT COUNT(*) FROM notes n WHERE n.collection_id = c.id AND n.deleted_at IS NULL) AS note_count,
       (SELECT COUNT(*) FROM flashcards f WHERE f.collection_id = c.id AND f.deleted_at IS NULL) AS card_count
     FROM collections c
     WHERE c.deleted_at IS NULL
     ORDER BY (note_count + card_count) DESC, c.name ASC
     LIMIT 6`
  );

  return {
    totalNotes: notesRow?.count ?? 0,
    totalCollections: colsRow?.count ?? 0,
    totalFlashcards: cardsRow?.count ?? 0,
    totalReviews,
    accuracyPercent,
    retentionPercent,
    dailyReviews,
    weeklyReviews,
    monthlyReviews,
    mostActiveCollections: activeCols.map((c) => ({
      id: c.id,
      name: c.name,
      noteCount: c.note_count,
      cardCount: c.card_count,
    })),
  };
}

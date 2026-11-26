export type UUID = string;
export type ISODateString = string;

export type ThemeMode = 'light' | 'dark' | 'system';
export type FontSizePreference = 'small' | 'medium' | 'large';

export type NoteType =
  | 'general'
  | 'concept'
  | 'question'
  | 'idea'
  | 'book_note'
  | 'research_note'
  | 'learning_material'
  | 'reference';

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  general: 'General Note',
  concept: 'Concept',
  question: 'Question',
  idea: 'Idea',
  book_note: 'Book Note',
  research_note: 'Research Note',
  learning_material: 'Learning Material',
  reference: 'Reference',
};

export type CaptureKind =
  | 'text'
  | 'idea'
  | 'question'
  | 'quote'
  | 'web_link'
  | 'image'
  | 'document'
  | 'book_highlight';

export const CAPTURE_KIND_TO_NOTE_TYPE: Record<CaptureKind, NoteType> = {
  text: 'general',
  idea: 'idea',
  question: 'question',
  quote: 'book_note',
  web_link: 'reference',
  image: 'learning_material',
  document: 'research_note',
  book_highlight: 'book_note',
};

export type RelationshipType =
  | 'related_to'
  | 'supports'
  | 'contradicts'
  | 'example_of'
  | 'part_of'
  | 'depends_on'
  | 'further_reading';

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  related_to: 'Related to',
  supports: 'Supports',
  contradicts: 'Contradicts',
  example_of: 'Example of',
  part_of: 'Part of',
  depends_on: 'Depends on',
  further_reading: 'Further reading',
};

export type AttachmentType =
  | 'pdf'
  | 'image'
  | 'web_link'
  | 'book_reference'
  | 'research_document'
  | 'screenshot';

export const ATTACHMENT_TYPE_LABELS: Record<AttachmentType, string> = {
  pdf: 'PDF Document',
  image: 'Image',
  web_link: 'Web Link',
  book_reference: 'Book Reference',
  research_document: 'Research Document',
  screenshot: 'Screenshot',
};

export type FlashcardType =
  | 'basic'
  | 'definition'
  | 'reverse'
  | 'cloze'
  | 'comparison';

export const FLASHCARD_TYPE_LABELS: Record<FlashcardType, string> = {
  basic: 'Basic Q&A',
  definition: 'Definition',
  reverse: 'Reverse',
  cloze: 'Fill in the Blank',
  comparison: 'Concept Comparison',
};

/** 1 = Again, 2 = Hard, 3 = Good, 4 = Easy */
export type ReviewRating = 1 | 2 | 3 | 4;

export const REVIEW_RATING_LABELS: Record<ReviewRating, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

export type CardLearningState = 'new' | 'learning' | 'review' | 'relearning';

export interface Collection {
  id: UUID;
  name: string;
  description: string | null;
  parentId: UUID | null;
  icon: string | null;
  sortOrder: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  lastAccessedAt: ISODateString | null;
  deletedAt: ISODateString | null;
  noteCount?: number;
  childCount?: number;
}

export interface Tag {
  id: UUID;
  name: string;
  createdAt: ISODateString;
  noteCount?: number;
}

export interface Note {
  id: UUID;
  title: string;
  content: string;
  noteType: NoteType;
  collectionId: UUID | null;
  isInbox: boolean;
  isPinned: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  sourceUrl: string | null;
  wordCount: number;
  readingTimeMin: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  lastAccessedAt: ISODateString | null;
  deletedAt: ISODateString | null;
  tags?: Tag[];
  collectionName?: string | null;
}

export interface NoteRevision {
  id: UUID;
  noteId: UUID;
  title: string;
  content: string;
  createdAt: ISODateString;
}

export interface NoteLink {
  id: UUID;
  sourceNoteId: UUID;
  targetNoteId: UUID;
  relationshipType: RelationshipType;
  description: string | null;
  createdAt: ISODateString;
}

export interface NoteLinkDetail extends NoteLink {
  direction: 'outgoing' | 'incoming';
  linkedNoteId: UUID;
  linkedNoteTitle: string;
  linkedNoteType: NoteType;
}

export interface Attachment {
  id: UUID;
  title: string;
  fileType: AttachmentType;
  mimeType: string | null;
  localUri: string | null;
  sourceUrl: string | null;
  fileSizeBytes: number;
  notesMetadata: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt: ISODateString | null;
  linkedNoteCount?: number;
}

export interface Flashcard {
  id: UUID;
  noteId: UUID | null;
  collectionId: UUID | null;
  cardType: FlashcardType;
  front: string;
  back: string;
  extra: string | null;
  tagsJson: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt: ISODateString | null;
  reviewState?: ReviewState;
  collectionName?: string | null;
  noteTitle?: string | null;
}

export interface ReviewState {
  cardId: UUID;
  dueAt: ISODateString;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: CardLearningState;
  lastReviewAt: ISODateString | null;
  updatedAt: ISODateString;
}

export interface ReviewLog {
  id: UUID;
  cardId: UUID;
  rating: ReviewRating;
  stateBefore: CardLearningState;
  stateAfter: CardLearningState;
  scheduledDays: number;
  elapsedDays: number;
  stability: number;
  difficulty: number;
  reviewDurationMs: number;
  reviewedAt: ISODateString;
}

export interface NoteTemplate {
  id: UUID;
  name: string;
  noteType: NoteType;
  contentTemplate: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface SearchFilters {
  collectionId?: UUID | null;
  noteType?: NoteType | null;
  tagId?: UUID | null;
  dateRange?: 'all' | '7d' | '30d' | '90d';
  includeResources?: boolean;
}

export interface SearchResultItem {
  id: UUID;
  entityType: 'note' | 'resource' | 'collection';
  title: string;
  snippet: string;
  noteType?: NoteType;
  fileType?: AttachmentType;
  collectionName?: string | null;
  updatedAt: ISODateString;
  rank: number;
}

export interface DashboardSummary {
  dueCardsCount: number;
  completedTodayCount: number;
  remainingTodayCount: number;
  dailyProgressPercent: number;
  totalNotesCount: number;
  inboxCount: number;
  totalCollectionsCount: number;
  totalFlashcardsCount: number;
  weeklyActivity: { date: string; label: string; reviews: number; notesEdited: number }[];
  pinnedNotes: Note[];
  recentNotes: Note[];
  recentCollections: Collection[];
}

export interface AnalyticsSummary {
  totalNotes: number;
  totalCollections: number;
  totalFlashcards: number;
  totalReviews: number;
  accuracyPercent: number;
  retentionPercent: number;
  dailyReviews: { date: string; label: string; count: number }[];
  weeklyReviews: { label: string; count: number }[];
  monthlyReviews: { label: string; count: number }[];
  mostActiveCollections: { id: UUID; name: string; noteCount: number; cardCount: number }[];
}

export interface AppSettings {
  theme: ThemeMode;
  fontSize: FontSizePreference;
  dailyReminderEnabled: boolean;
  dailyReminderTime: string; // "HH:MM"
  defaultCollectionId: UUID | null;
  editorAutoPreview: boolean;
  appLockEnabled: boolean;
  biometricEnabled: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'system',
  fontSize: 'medium',
  dailyReminderEnabled: false,
  dailyReminderTime: '09:00',
  defaultCollectionId: null,
  editorAutoPreview: false,
  appLockEnabled: false,
  biometricEnabled: false,
};

export interface BackupManifest {
  app: 'RECALL';
  backupFormatVersion: 1;
  schemaVersion: number;
  exportedAt: ISODateString;
  counts: {
    collections: number;
    notes: number;
    tags: number;
    noteLinks: number;
    flashcards: number;
    reviewLogs: number;
    attachments: number;
  };
}

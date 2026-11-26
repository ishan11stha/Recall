import type { ISODateString, UUID } from '../types/models';

/**
 * Generates an RFC 4122 v4 UUID using crypto.getRandomValues when available
 * (Hermes / Node 20+) with a safe fallback.
 */
export function generateId(): UUID {
  const globalCrypto = globalThis.crypto as
    | { randomUUID?: () => string; getRandomValues?: (arr: Uint8Array) => Uint8Array }
    | undefined;

  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (globalCrypto?.getRandomValues) {
    globalCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nowIso(): ISODateString {
  return new Date().toISOString();
}

export function startOfTodayUtcIso(): ISODateString {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  return start.toISOString();
}

export function computeWordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function computeReadingTimeMinutes(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.ceil(wordCount / 220));
}

export function formatRelativeDate(iso: ISODateString | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

export function formatFullDate(date: Date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** idx;
  return `${value >= 10 || idx === 0 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`;
}

export function formatIntervalDays(days: number): string {
  if (days < 1 / 24) {
    const mins = Math.max(1, Math.round(days * 24 * 60));
    return `${mins}m`;
  }
  if (days < 1) {
    const hrs = Math.max(1, Math.round(days * 24));
    return `${hrs}h`;
  }
  if (days < 30) {
    return `${Math.round(days)}d`;
  }
  if (days < 365) {
    return `${(days / 30).toFixed(1)}mo`;
  }
  return `${(days / 365).toFixed(1)}y`;
}

export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function sanitizeFtsQuery(raw: string): string {
  const tokens = raw
    .trim()
    .replace(/["'*^():-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t}"*`).join(' ');
}

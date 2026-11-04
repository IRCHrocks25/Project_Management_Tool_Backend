/** Pure helpers for the Katalyst Hub core (no Nest / TypeORM imports, unit tested). */

export type AttentionLevel = 'critical' | 'warning' | 'info';

export interface Attention {
  level: AttentionLevel;
  message: string;
  tab: string;
}

export interface AttentionInput {
  domains: { domain: string; renewsOn: string | Date | null; sslExpiresOn: string | Date | null }[];
  highPriorityOpen: number;
  lastUpdateAt: Date | string | null;
  /** Used instead of the last update when a product has never had one. */
  productCreatedAt: Date | string;
}

export const EXPIRY_WARNING_DAYS = 30;
export const STALE_UPDATE_DAYS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcDay(value: string | Date): number {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }
  const date = value instanceof Date ? value : new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Whole calendar days from `now` to `date` (negative when in the past). */
export function daysUntil(date: string | Date, now: Date): number {
  return Math.round((toUtcDay(date) - toUtcDay(now)) / DAY_MS);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function expiryPhrase(days: number, future: string, past: string): string {
  if (days < 0) return `${past} ${plural(-days, 'day')} ago`;
  if (days === 0) return `${future} today`;
  return `${future} in ${plural(days, 'day')}`;
}

const LEVEL_ORDER: Record<AttentionLevel, number> = { critical: 0, warning: 1, info: 2 };

/** What on a product needs someone's attention, most urgent first. */
export function computeAttention(input: AttentionInput, now: Date = new Date()): Attention[] {
  const items: (Attention & { sortDays: number })[] = [];

  for (const d of input.domains || []) {
    if (d.renewsOn) {
      const days = daysUntil(d.renewsOn, now);
      if (days <= EXPIRY_WARNING_DAYS) {
        items.push({
          level: 'critical',
          message: `Domain ${d.domain} ${expiryPhrase(days, 'renews', 'expired')}`,
          tab: 'files',
          sortDays: days,
        });
      }
    }
    if (d.sslExpiresOn) {
      const days = daysUntil(d.sslExpiresOn, now);
      if (days <= EXPIRY_WARNING_DAYS) {
        items.push({
          level: 'critical',
          message: `SSL for ${d.domain} ${expiryPhrase(days, 'expires', 'expired')}`,
          tab: 'files',
          sortDays: days,
        });
      }
    }
  }

  if (input.highPriorityOpen > 0) {
    items.push({
      level: 'warning',
      message: `${plural(input.highPriorityOpen, 'open high-priority ticket')}`,
      tab: 'tickets',
      sortDays: 0,
    });
  }

  if (input.lastUpdateAt) {
    const since = -daysUntil(input.lastUpdateAt, now);
    if (since >= STALE_UPDATE_DAYS) {
      items.push({ level: 'info', message: `No update in ${plural(since, 'day')}`, tab: 'updates', sortDays: 0 });
    }
  } else if (input.productCreatedAt && -daysUntil(input.productCreatedAt, now) >= STALE_UPDATE_DAYS) {
    items.push({ level: 'info', message: 'No updates posted yet', tab: 'updates', sortDays: 0 });
  }

  return items
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.sortDays - b.sortDays)
    .map(({ sortDays, ...a }) => a);
}

/** "Project Management Tool" → "project-management-tool". */
export function slugify(name: string): string {
  const slug = (name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');
  return slug || 'product';
}

/** First free slug: base, base-2, base-3… */
export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (s) => s.toLowerCase()));
  const base = slugify(name);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

export const CODE_PATTERN = /^[A-Z0-9]{2,5}$/;

/** Words of a name, splitting camelCase too: "SOPMaster" → ["SOP", "Master"]. */
function nameWords(name: string): string[] {
  return (name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/**
 * Ticket prefix from a name: initials when there are several words ("CourseForge" → "CF",
 * "Project Management Tool" → "PMT"), an all-caps short word as is ("CMS"), otherwise the
 * first letters ("Iceberg" → "IC"). Always 2–5 chars and not in `taken`.
 */
export function generateCode(name: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (c) => c.toUpperCase()));
  const words = nameWords(name);
  const letters = words.join('').toUpperCase() || 'PR';
  const candidates: string[] = [];

  if (words.length >= 2) {
    const initials = words.map((w) => w[0].toUpperCase()).join('').slice(0, 5);
    candidates.push(initials);
    // Grow with the following letters of the last word: CF → CFO → CFOR…
    const last = words[words.length - 1].toUpperCase();
    for (let i = 1; i < last.length && initials.length + i <= 5; i++) {
      candidates.push(initials + last.slice(1, 1 + i));
    }
  } else if (words.length === 1 && /^[A-Z0-9]{2,5}$/.test(words[0])) {
    candidates.push(words[0]);
  }
  for (let len = 2; len <= Math.min(5, letters.length); len++) candidates.push(letters.slice(0, len));

  for (const c of candidates) {
    if (c.length >= 2 && c.length <= 5 && !used.has(c)) return c;
  }

  const stem = (candidates.find((c) => c.length >= 2) || letters.padEnd(2, 'X')).slice(0, 3);
  for (let i = 2; i < 100; i++) {
    const c = `${stem}${i}`.slice(0, 5);
    if (!used.has(c)) return c;
  }
  for (;;) {
    const c = `P${Math.floor(Math.random() * 9000 + 1000)}`;
    if (!used.has(c)) return c;
  }
}

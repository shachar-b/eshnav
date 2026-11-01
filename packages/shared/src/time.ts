/**
 * DST-safe Asia/Jerusalem date/time utilities.
 *
 * Rules (see ARCHITECTURE.md):
 * - Wall-clock → local date/hour always goes through `Intl.DateTimeFormat` pinned to Asia/Jerusalem.
 *   Never `toISOString().slice(0, 10)` (UTC drifts 2–3h from Israel).
 * - Calendar arithmetic on `YYYY-MM-DD` strings uses synthetic UTC-noon anchors, immune to DST.
 */

export const TIMEZONE = 'Asia/Jerusalem';

export const TIME_WINDOWS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];

/** Window display metadata. `startHour` inclusive, `endHour` exclusive (Asia/Jerusalem hours). */
export const TIME_WINDOW_META = {
  MORNING: { emoji: '☀️', labelHe: 'בוקר', startHour: 5, endHour: 12 },
  AFTERNOON: { emoji: '🌤️', labelHe: 'צהריים', startHour: 12, endHour: 17 },
  EVENING: { emoji: '🌙', labelHe: 'ערב', startHour: 17, endHour: 24 },
} as const satisfies Record<TimeWindow, { emoji: string; labelHe: string; startHour: number; endHour: number }>;

/** 0 = Sunday (יום א׳) … 6 = Saturday (שבת). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const jerusalemFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
});

function jerusalemParts(now: number): { date: string; hour: number } {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of jerusalemFormatter.formatToParts(now)) parts[type] = value;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** Today's `YYYY-MM-DD` in Asia/Jerusalem. */
export function getLogicalDateString(now: number = Date.now()): string {
  return jerusalemParts(now).date;
}

/** Current Asia/Jerusalem hour, 0–23. */
export function getJerusalemHour(now: number = Date.now()): number {
  return jerusalemParts(now).hour;
}

const LOGICAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** UTC-noon anchor for a `YYYY-MM-DD` string, or `null` if the string is not a real calendar date. */
function toNoonAnchor(date: string): Date | null {
  const match = LOGICAL_DATE_RE.exec(date);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return anchor.getUTCFullYear() === y && anchor.getUTCMonth() === m - 1 && anchor.getUTCDate() === d ? anchor : null;
}

function requireNoonAnchor(date: string): Date {
  const anchor = toNoonAnchor(date);
  if (!anchor) throw new RangeError(`Invalid logical date: "${date}" (expected YYYY-MM-DD)`);
  return anchor;
}

export function isValidLogicalDate(value: string): boolean {
  return toNoonAnchor(value) !== null;
}

/** Calendar-day shift of a `YYYY-MM-DD` string (negative = past). */
export function shiftLogicalDate(date: string, days: number): string {
  const anchor = requireNoonAnchor(date);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10); // safe: synthetic UTC noon, not a wall-clock instant
}

/** Israeli week day of a `YYYY-MM-DD` string: 0 = Sunday … 6 = Saturday. */
export function getIsraeliDayOfWeek(date: string): DayOfWeek {
  return requireNoonAnchor(date).getUTCDay() as DayOfWeek;
}

/** The window the board auto-focuses on. 00:00–04:59 maps to MORNING (the day's upcoming window). */
export function getCurrentTimeWindow(now: number = Date.now()): TimeWindow {
  const hour = getJerusalemHour(now);
  if (hour < TIME_WINDOW_META.AFTERNOON.startHour) return 'MORNING';
  if (hour < TIME_WINDOW_META.EVENING.startHour) return 'AFTERNOON';
  return 'EVENING';
}

/**
 * Past dates: every window elapsed. Future dates: none. Today: MORNING at 12:00,
 * AFTERNOON at 17:00, EVENING only via the midnight rollover (never today).
 */
export function isTimeWindowElapsed(window: TimeWindow, logicalDate: string, now: number = Date.now()): boolean {
  const { date: today, hour } = jerusalemParts(now);
  if (logicalDate !== today) return logicalDate < today; // YYYY-MM-DD compares lexicographically
  return window !== 'EVENING' && hour >= TIME_WINDOW_META[window].endHour;
}

import { TIMEZONE, shiftLogicalDate, type DayOfWeek } from '@eshnav/shared';

export const ISRAELI_DAYS_SHORT: readonly { day: DayOfWeek; label: string; fullLabel: string }[] = [
  { day: 0, label: 'א׳', fullLabel: 'יום א׳' },
  { day: 1, label: 'ב׳', fullLabel: 'יום ב׳' },
  { day: 2, label: 'ג׳', fullLabel: 'יום ג׳' },
  { day: 3, label: 'ד׳', fullLabel: 'יום ד׳' },
  { day: 4, label: 'ה׳', fullLabel: 'יום ה׳' },
  { day: 5, label: 'ו׳', fullLabel: 'יום ו׳' },
  { day: 6, label: 'ש׳', fullLabel: 'שבת' },
];

const clockFormatter = new Intl.DateTimeFormat('he-IL', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
});

const topBarDateFormatter = new Intl.DateTimeFormat('he-IL', {
  timeZone: TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const utcNoonHebrewFormatter = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Live `HH:mm` clock in Asia/Jerusalem. */
export function formatJerusalemClock(now: number = Date.now()): string {
  return clockFormatter.format(now);
}

/** Formatted Hebrew day & date for the live top bar (e.g. `יום ראשון, 1 בנובמבר`). */
export function formatJerusalemTopDate(now: number = Date.now()): string {
  return topBarDateFormatter.format(now);
}

/** Formats a `YYYY-MM-DD` logical date at synthetic UTC noon into Hebrew (`יום שבת, 31 באוקטובר`). */
export function formatLogicalDateHebrew(logicalDate: string): string {
  const [y, m, d] = logicalDate.split('-').map(Number);
  if (!y || !m || !d) return logicalDate;
  return utcNoonHebrewFormatter.format(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Relative badge (`היום` / `אתמול` / `null`) for the History date stepper. */
export function getRelativeDayLabel(logicalDate: string, todayLogicalDate: string): string | null {
  if (logicalDate === todayLogicalDate) return 'היום';
  if (logicalDate === shiftLogicalDate(todayLogicalDate, -1)) return 'אתמול';
  return null;
}

/** Formats completion timestamp (`HH:mm` in Asia/Jerusalem) for History drill-down rows. */
export function formatCompletionTime(timestampMs: number | null): string | null {
  if (timestampMs === null) return null;
  return clockFormatter.format(timestampMs);
}

import { daysUntilPurge } from '../../entity/format';
import { t } from './index';

/**
 * Locale-aware date and time formatting.
 *
 * Lives in the boundary layer because the output is presentation text; the pure calculations
 * stay in `entity/format.ts`.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Building a formatter costs far more than using one, and a view formats a date for every card. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatDate(
  timestamp: number,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  const key = `${locale} ${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter.format(new Date(timestamp));
}

/**
 * The original's "Edited" line, which names the moment rather than counting back from it: the time
 * for today ("Edited 9:31 PM"), "yesterday" with the time, the day for this year, and the day with
 * its year for anything older — read off the original's editor.
 */
export function formatEditedAt(timestamp: number, locale: string, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY);
  const time = formatDate(timestamp, locale, { hour: 'numeric', minute: '2-digit' });
  if (days <= 0) return t('editor.editedOn', { date: time });
  if (days === 1) return t('editor.editedYesterday', { time });
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  const date = formatDate(
    timestamp,
    locale,
    sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }
  );
  return t('editor.editedOn', { date });
}

/**
 * A reminder as the original writes it: "Today, 8:00 AM", "Tomorrow, 8:00 AM", and the date itself
 * for anything further off. Both halves go through `Intl` in the active locale, and "today" means the
 * calendar day, not twenty-four hours from now — a reminder at 00:30 is tomorrow even if it is only
 * three hours away.
 */
export function formatReminder(timestamp: number, locale: string, now = Date.now()): string {
  const time = formatDate(timestamp, locale, { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((startOfDay(timestamp) - startOfDay(now)) / DAY);
  if (days === 0) return t('reminder.todayAt', { time });
  if (days === 1) return t('reminder.tomorrowAt', { time });
  const date = formatDate(timestamp, locale, { month: 'short', day: 'numeric', year: 'numeric' });
  return t('reminder.onAt', { date, time });
}

/** Midnight of the day [timestamp] falls in, in the reader's own time zone. */
function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function formatDeletedAt(timestamp: number, locale: string): string {
  return t('card.deletedAt', {
    date: formatDate(timestamp, locale, { month: 'short', day: 'numeric', year: 'numeric' })
  });
}

/** [retentionDays] is the instance's own (`NOTKA_TRASH_RETENTION_DAYS`, from `/api/health`). */
export function formatDaysLeft(trashedAt: number, retentionDays: number, now = Date.now()): string {
  return t('card.daysLeft', { count: daysUntilPurge(trashedAt, retentionDays, now) });
}

export function formatFullTimestamp(timestamp: number, locale: string): string {
  return formatDate(timestamp, locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A size in bytes in the largest unit that keeps it above one: "512 B", "3.4 MB", "1.2 GB". */
export function formatBytes(bytes: number, locale: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1
  }).format(value);
}

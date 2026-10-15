/**
 * Pure date/time calculations. Everything the user *reads* is formatted in
 * `boundary/i18n/format.ts`, which knows the active locale.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Trash retention before a note is purged. Mirrors the backend default. */
export const TRASH_RETENTION_DAYS = 30;

/** Whole days left before a trashed note is purged. */
export function daysUntilPurge(
  trashedAt: number,
  retentionDays = TRASH_RETENTION_DAYS,
  now = Date.now()
): number {
  const elapsed = now - trashedAt;
  return Math.max(0, Math.ceil(retentionDays - elapsed / DAY));
}
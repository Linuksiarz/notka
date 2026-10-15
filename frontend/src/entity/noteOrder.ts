import type { Note } from './api/types';

/**
 * The order a view shows its notes in — the server's own (`docs/API.md`), so a list kept up to date
 * in the browser never disagrees with the one a reload brings.
 *
 * Google Keep's order: pinned notes first, then each section by `position`, highest first. A new note
 * and a note whose pin changed are put on top; writing in a note does not move it, which is what
 * makes it safe to keep a list sorted while somebody types in one of its notes.
 */
export function byPlace(a: Note, b: Note): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.position - a.position;
}

/**
 * How the reader asked for a view to be sorted — the original's Android app offers its own order
 * ("Custom", the default) or the date a note was created or last modified, newest first. Pinned
 * notes lead in every order.
 */
export type NoteSort = 'custom' | 'created' | 'modified';

export const NOTE_SORTS: readonly NoteSort[] = ['custom', 'created', 'modified'];

export function bySort(sort: NoteSort): (a: Note, b: Note) => number {
  if (sort === 'custom') return byPlace;
  const key = sort === 'created' ? 'createdAt' : 'updatedAt';
  return (a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b[key] - a[key];
  };
}

/** The reminders view is a time view: soonest first. */
export function byReminder(a: Note, b: Note): number {
  return (a.reminderAt ?? Number.POSITIVE_INFINITY) - (b.reminderAt ?? Number.POSITIVE_INFINITY);
}

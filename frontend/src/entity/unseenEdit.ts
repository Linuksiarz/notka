import type { Note } from './api/types';

/**
 * The note once its reader has seen it as of [seenAt]: an "edited by" marker for an edit at or before
 * that moment goes away, and one for a newer edit — somebody wrote again meanwhile — stays.
 */
export function seenAsOf(note: Note, seenAt: number): Note {
  if (!note.unseenEdit || note.unseenEdit.at > seenAt) return note;
  const { unseenEdit: _seen, ...rest } = note;
  return rest;
}

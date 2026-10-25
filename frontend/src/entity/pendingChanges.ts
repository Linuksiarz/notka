import type { CreateNoteRequest, Label, Note, UpdateNoteRequest, User } from './api/types';
import { createEmptyDocument } from './noteDocument';

/**
 * Changes to a note that could not be sent yet — the server could not be reached — and what the
 * views show while they wait: the note as it will be once they are stored. Pure functions; keeping
 * them and sending them is `control/state/pendingWrites.svelte.ts`'s business.
 */

/** Only these can lose somebody's text, so only these are version-guarded (rule 11). */
export function touchesText(changes: UpdateNoteRequest): boolean {
  return changes.title !== undefined || changes.kind !== undefined || changes.content !== undefined;
}

/** Two waiting writes to one note as one: the later one wins field by field. */
export function mergeChanges(earlier: UpdateNoteRequest, later: UpdateNoteRequest): UpdateNoteRequest {
  const { version: _later, ...rest } = later;
  const { version: _earlier, ...base } = earlier;
  return { ...base, ...rest };
}

/**
 * The note as it will be once [changes] are stored.
 *
 * [top] is the position a note takes when its pin changes (the original puts it at the top of where
 * it lands); the server will assign the real one.
 */
export function withChanges(
  note: Note,
  changes: UpdateNoteRequest,
  labelFor: (id: number) => Label | undefined,
  top: number
): Note {
  const next: Note = { ...note };
  if (changes.kind !== undefined) next.kind = changes.kind;
  if (changes.title !== undefined) next.title = changes.title;
  if (changes.content !== undefined) next.content = changes.content;
  // Writing the note makes the reader its last editor, and their own edit never marks it.
  if (touchesText(changes)) delete next.unseenEdit;
  if (changes.color !== undefined) next.color = changes.color;
  if (changes.background !== undefined) next.background = changes.background;
  if (changes.archived !== undefined) next.archived = changes.archived;
  if (changes.completedCollapsed !== undefined) next.completedCollapsed = changes.completedCollapsed;
  if (changes.pinned !== undefined && changes.pinned !== note.pinned) {
    next.pinned = changes.pinned;
    next.position = top;
  }
  if (changes.reminderAt === 0) {
    delete next.reminderAt;
    delete next.reminderRepeat;
  } else if (changes.reminderAt != null) {
    next.reminderAt = changes.reminderAt;
    if (changes.reminderRepeat !== undefined) {
      if (changes.reminderRepeat === null) delete next.reminderRepeat;
      else next.reminderRepeat = changes.reminderRepeat;
    }
  }
  if (changes.labels !== undefined) {
    next.labels = changes.labels.map(labelFor).filter((label): label is Label => label !== undefined);
  }
  return next;
}

/** A note that exists only on this device until the server can be reached. */
export function draftNote(
  id: number,
  request: CreateNoteRequest,
  owner: User,
  labelFor: (id: number) => Label | undefined,
  top: number,
  now: number
): Note {
  return {
    id,
    kind: request.kind ?? 'TEXT',
    title: request.title ?? '',
    content: request.content ?? createEmptyDocument(),
    color: 'default',
    background: null,
    archived: false,
    pinned: false,
    completedCollapsed: false,
    position: top,
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
    docVersion: 0,
    owner,
    access: 'OWNER',
    canEdit: true,
    canChangeAppearance: true,
    labels: (request.labels ?? []).map(labelFor).filter((label): label is Label => label !== undefined)
  };
}

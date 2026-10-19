import { takeShared } from './api/shareInbox';
import { notes } from './state/notes.svelte';
import { sharedNoteRequest } from '../entity/sharedNote';
import type { Note } from '../entity/api/types';

/** What became of a share: the note it made, and why its pictures are missing from it, if they are. */
export interface ReceivedShare {
  note: Note;
  /** The note was written offline, and pictures are online-only. */
  imagesOffline: boolean;
  /** The server refused a picture (its format, its size, the owner's storage). */
  imagesError: Error | null;
}

/**
 * Turns a waiting share into a new note, through the same calls a note written by hand goes through:
 * `create` (queued with a local id when there is no connection, rule 25), then `add`, then the
 * pictures one by one. Pictures are online-only, so a share received offline keeps its text and
 * says its pictures were left out.
 */
export async function receiveShare(): Promise<ReceivedShare | null> {
  const shared = await takeShared();
  if (shared === null) return null;
  const request = sharedNoteRequest(shared) ?? (shared.images.length > 0 ? { kind: 'TEXT' as const } : null);
  if (request === null) return null;

  const created = await notes.create(request);
  notes.add(created);
  const received: ReceivedShare = { note: created, imagesOffline: false, imagesError: null };
  if (shared.images.length === 0) return received;
  if (created.id < 0) return { ...received, imagesOffline: true };
  try {
    return { ...received, note: (await notes.addImages(created.id, shared.images)) ?? created };
  } catch (error) {
    return { ...received, imagesError: error as Error };
  }
}

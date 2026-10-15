import type { NoteChangedEvent } from '../../entity/api/types';

/**
 * Client for the server's live notification stream (`GET /api/events`).
 *
 * The stream only says "this note moved to version N"; the caller decides whether to re-read the
 * note through the REST endpoint it already uses. `EventSource` is same-origin here, so the session
 * cookie travels with it, and the browser reconnects on its own after a drop — `onReconnect` is how
 * the caller learns that it may have missed something.
 */
export function subscribeToNoteEvents(
  onEvent: (event: NoteChangedEvent) => void,
  onReconnect: () => void
): () => void {
  const source = new EventSource('/api/events');
  // The browser reconnects by itself, but the notifications sent while the stream was down are gone:
  // every `open` after the first is a gap the caller has to catch up on.
  let opened = false;
  source.onopen = () => {
    if (opened) onReconnect();
    opened = true;
  };
  // A connection that comes back is a gap as well, and the browser says so at once — the stream
  // itself may take a while to notice it was cut, and then waits before it reconnects.
  const onOnline = (): void => onReconnect();
  window.addEventListener('online', onOnline);

  source.onmessage = (message: MessageEvent<string>) => {
    const event = parseEvent(message.data);
    if (event) onEvent(event);
  };

  return () => {
    window.removeEventListener('online', onOnline);
    source.close();
  };
}

function parseEvent(raw: string): NoteChangedEvent | null {
  try {
    const value = JSON.parse(raw) as { type?: unknown; noteId?: unknown; version?: unknown };
    if (value.type !== 'note.changed') return null;
    if (typeof value.noteId !== 'number' || typeof value.version !== 'number') return null;
    return { noteId: value.noteId, version: value.version };
  } catch {
    return null;
  }
}

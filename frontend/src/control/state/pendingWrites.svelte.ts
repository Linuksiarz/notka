import { localStore } from '../api/localStore';
import type { Note, UpdateNoteRequest } from '../../entity/api/types';

/** Where this device keeps the writes the server has not taken yet. */
export const PENDING_WRITES_KEY = 'pendingWrites';

/** One note's writes that are waiting for the server. */
export interface PendingWrite {
  /** The note as the views show it meanwhile: the last copy we had, with the changes applied. */
  note: Note;
  /** Written on this device and not on the server yet; its id is a local, negative one. */
  created: boolean;
  /** Everything to send, the later writes merged over the earlier ones. */
  changes: UpdateNoteRequest;
  /** The version the text was edited from, which the server's guard checks (rule 11). */
  baseVersion: number | null;
  /**
   * An editor's unsent steps over the body version it had (`docs/COLLABORATION.md`); `changes`
   * carries the body, title and kind they produce. Absent for a note that exists only here.
   */
  steps?: { docVersion: number; clientId: string; steps: unknown[] };
  /** The title the note had when its renaming was queued; a note renamed meanwhile is not renamed over. */
  baseTitle?: string;
}

interface Stored {
  ownerId: number;
  writes: PendingWrite[];
  nextLocalId: number;
}

/**
 * The writes this device could not send — the server could not be reached — kept until it can, in
 * the order they were made. They survive a reload and an expired session, and they belong to one
 * account: another account signing in on the device never sends them.
 *
 * This is only the queue. Showing the notes as they will be and sending the queue is the notes
 * store's business (`notes.svelte.ts`), because both are part of what a view is.
 */
class PendingWrites {
  writes = $state<PendingWrite[]>([]);
  #ownerId: number | null = null;
  #nextLocalId = -1;
  #loaded: Promise<void>;
  #markLoaded: () => void = () => undefined;

  constructor() {
    this.#loaded = new Promise((resolve) => (this.#markLoaded = resolve));
  }

  /** Reads what this device kept for [ownerId]. */
  async restore(ownerId: number): Promise<void> {
    const stored = await localStore.get<Stored>(PENDING_WRITES_KEY);
    this.#ownerId = ownerId;
    if (stored && stored.ownerId === ownerId) {
      this.writes = stored.writes;
      this.#nextLocalId = stored.nextLocalId;
    } else {
      this.writes = [];
      this.#nextLocalId = -1;
    }
    this.#markLoaded();
  }

  /** Resolves once the queue of the signed-in account is known. */
  ready(): Promise<void> {
    return this.#loaded;
  }

  get(noteId: number): PendingWrite | undefined {
    return this.writes.find((write) => write.note.id === noteId);
  }

  /** An id for a note that exists only on this device until it is sent. */
  localId(): number {
    const id = this.#nextLocalId;
    this.#nextLocalId -= 1;
    return id;
  }

  /** Adds a note's writes, or replaces the ones it already had, keeping its place in the queue. */
  put(write: PendingWrite): void {
    const index = this.writes.findIndex((candidate) => candidate.note.id === write.note.id);
    this.writes = index === -1 ? [...this.writes, write] : this.writes.map((item, at) => (at === index ? write : item));
    this.#persist();
  }

  remove(noteId: number): void {
    this.writes = this.writes.filter((write) => write.note.id !== noteId);
    this.#persist();
  }

  /** Signed out: the in-memory queue goes; what is on the device is the session's to keep or wipe. */
  reset(): void {
    this.writes = [];
    this.#ownerId = null;
    this.#nextLocalId = -1;
    this.#loaded = new Promise((resolve) => (this.#markLoaded = resolve));
  }

  #persist(): void {
    if (this.#ownerId === null) return;
    void localStore.set(PENDING_WRITES_KEY, {
      ownerId: this.#ownerId,
      writes: this.writes,
      nextLocalId: this.#nextLocalId
    } satisfies Stored);
  }
}

export const pendingWrites = new PendingWrites();

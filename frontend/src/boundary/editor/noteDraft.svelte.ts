import type { Note, NoteBackground, NoteColor, NoteDocument, NoteKind } from '../../entity/api/types';
import { createEmptyDocument, createEmptyListDocument } from '../../entity/noteDocument';

/** How long after the last keystroke a draft is written. */
export const AUTOSAVE_DELAY_MS = 500;


/**
 * The note the editor is working on: what has been typed, what the server last confirmed, and whether
 * the two still agree.
 *
 * Reading and writing the server is deliberately **not** here. That orchestration needs the stores,
 * the toasts and the session's identity, so it stays in the component; this is the document and its
 * dirty state, which is the part that can be reasoned about — and tested — on its own.
 */
export class NoteDraft {
  /** The note on the server this draft belongs to; `null` while it does not exist yet. */
  noteId = $state<number | null>(null);
  kind = $state<NoteKind>('TEXT');
  title = $state('');
  content = $state.raw<NoteDocument>(createEmptyDocument());
  color = $state<NoteColor>('default');
  background = $state<NoteBackground | null>(null);
  archived = $state(false);
  pinned = $state(false);
  updatedAt = $state<number | null>(null);
  /** The version of the body in the server's step log when the draft took the note over. */
  docVersion = $state(0);
  saving = $state(false);
  canEdit = $state(true);
  ownerName = $state('');
  labelIds = $state<number[]>([]);

  /** The title and kind the server last confirmed, as text, so "are they unsaved" is one comparison. */
  #stored = '';
  #timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Whether the body holds steps the server has not taken. The body's own bookkeeping lives in the
   * editor's collaboration plugin (`boundary/editor/collabSync.ts`), which tells the draft through
   * this; there is no second copy of it here to disagree with.
   */
  hasUnsentBody: () => boolean = () => false;

  get isNew(): boolean {
    return this.noteId === null;
  }

  /** Whether there is anything worth storing. An empty new note is not written. */
  get hasContent(): boolean {
    return (
      this.title.trim().length > 0 ||
      this.content.blocks.some((block) => block.spans.some((span) => span.text.trim().length > 0))
    );
  }

  /** The title and kind as text: what a write is compared against to decide whether they changed. */
  serialize(): string {
    return JSON.stringify({ kind: this.kind, title: this.title.trim() });
  }

  /** The title or the kind differ from what the server has. */
  get headerChanged(): boolean {
    return this.serialize() !== this.#stored;
  }

  isDirty(): boolean {
    return this.headerChanged || this.hasUnsentBody();
  }

  /**
   * Somebody else's title or kind, taken over unless this draft changed its own since the server
   * last confirmed it — then the reader's stands, and goes out with the next write.
   */
  follow(note: Pick<Note, 'title' | 'kind' | 'updatedAt'>): void {
    this.updatedAt = note.updatedAt;
    if (this.headerChanged) return;
    this.title = note.title;
    this.kind = note.kind;
    this.markStored();
  }

  /** What a write sends. */
  payload(): { kind: NoteKind; title: string; content: NoteDocument } {
    return { kind: this.kind, title: this.title.trim(), content: this.content };
  }

  /** Takes over a note that does not exist on the server yet. */
  startNew(kind: NoteKind): void {
    this.noteId = null;
    this.kind = kind;
    this.title = '';
    this.content = kind === 'LIST' ? createEmptyListDocument() : createEmptyDocument();
    this.color = 'default';
    this.background = null;
    this.archived = false;
    this.pinned = false;
    this.updatedAt = null;
    this.docVersion = 0;
    this.saving = false;
    this.canEdit = true;
    this.ownerName = '';
    this.labelIds = [];
    this.markStored();
  }

  /** Takes over a note that exists on the server. */
  adopt(note: Note): void {
    this.noteId = note.id;
    this.kind = note.kind;
    this.title = note.title;
    this.content = note.content;
    this.color = note.color;
    this.background = note.background;
    this.archived = note.archived;
    this.pinned = note.pinned;
    this.updatedAt = note.updatedAt;
    this.docVersion = note.docVersion;
    this.canEdit = note.canEdit;
    this.ownerName = note.owner.displayName;
    this.labelIds = note.labels.map((label) => label.id);
    this.markStored();
  }

  /**
   * Records what the server has — the text the write actually sent, or what is in the editor now.
   *
   * The distinction matters: a save captured its payload before awaiting, and the writer may have
   * typed on while it was in flight. Marking *that* text as stored is what keeps the later keystrokes
   * dirty, so the next autosave writes them too.
   */
  markStored(text?: string): void {
    this.#stored = text ?? this.serialize();
  }

  /** Writes the draft this long after the last change, unless it cannot be written at all. */
  autosave(write: () => Promise<void>): void {
    if (!this.canEdit) return;
    this.cancelAutosave();
    this.#timer = setTimeout(() => void write(), AUTOSAVE_DELAY_MS);
  }

  cancelAutosave(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }
}

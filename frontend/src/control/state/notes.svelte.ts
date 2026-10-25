import { matchesFilter, type SearchFilter } from '../../entity/search';
import { notesApi, type NoteMoveAnchor } from '../api/notes';
import { ApiError } from '../api/client';
import { localStore } from '../api/localStore';
import type {
  CreateNoteRequest,
  Note,
  NoteBackground,
  NoteColor,
  NoteView,
  StepsRequest,
  UpdateNoteRequest
} from '../../entity/api/types';
import { normalizeDocument } from '../../entity/noteDocument';
import { byReminder, bySort, NOTE_SORTS, type NoteSort } from '../../entity/noteOrder';
import { draftNote, mergeChanges, touchesText, withChanges } from '../../entity/pendingChanges';
import { seenAsOf } from '../../entity/unseenEdit';
import { labels } from './labels.svelte';
import { pendingWrites, type PendingWrite } from './pendingWrites.svelte';
import { session } from './session.svelte';

/** A burst of live events collapses into one list reload this long after the last one. */
const LIST_REFRESH_DEBOUNCE_MS = 250;

/** How long after a change the view's copy on this device is rewritten. */
const REMEMBER_DELAY_MS = 300;

/**
 * The loaded note collection plus every mutation the UI can perform on it.
 *
 * The store keeps a single flat list per view, from the server's answers — and, while the server
 * cannot be reached, from this device: the view's last copy (`localStore`) with the writes that are
 * waiting for the server (`pendingWrites`) shown on top. Writing a note's text, appearance, pin,
 * archive flag, reminder or labels without a connection queues the write instead of failing it; the
 * queue is sent once the server answers again (`flush`). It deliberately produces no user-facing
 * messages: the boundary layer decides what to tell the user.
 */
const SORT_STORAGE_KEY = 'notka.sort';

function readStoredSort(): NoteSort {
  try {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    return NOTE_SORTS.find((sort) => sort === stored) ?? 'custom';
  } catch {
    return 'custom';
  }
}

class NotesState {
  notes = $state<Note[]>([]);
  view = $state<NoteView>('active');
  /**
   * The label the view is filtered by, or `null` for the whole view.
   *
   * It is part of the request (the server filters), and it is also applied to what is already loaded:
   * a note whose label was just taken off it has to leave a filtered view without waiting for a
   * reload — the same reason `visibleNotes` does not sort.
   */
  labelId = $state<number | null>(null);
  /**
   * The archived notes of a label's view.
   *
   * The original shows a label's archived notes in the same view, under an ARCHIVE heading, so that
   * view holds two lists. Every other view leaves this one empty; it is never a substitute for the
   * archive view, which is a view of its own.
   */
  archivedNotes = $state<Note[]>([]);

  /**
   * Whether what is loaded is the **reminders view**: the notes carrying a reminder, soonest first.
   *
   * It is a view rather than a filter over the notes list — the server applies it and orders it — and
   * the grid needs to know, because a list ordered by time must not be given Pinned/Others headings.
   */
  remindersOnly = $state(false);
  /** The reader's order for every view but the reminders one, remembered on this device. */
  sort = $state<NoteSort>(readStoredSort());
  loading = $state(false);
  loaded = $state(false);
  error = $state<string | null>(null);
  searchQuery = $state('');
  /** The search page's type, label or colour filter; only the search view sets it. */
  searchFilter = $state<SearchFilter | null>(null);

  /**
   * Live-channel bookkeeping. The editor watches these to adopt a remote change, or to warn when it
   * would clobber text the user is still typing.
   */
  remoteChange = $state<{ revision: number; noteIds: ReadonlySet<number> }>({
    revision: 0,
    noteIds: new Set()
  });

  /**
   * A note written on this device took its server id when it was sent: local id → server id, so an
   * editor that has it open can follow it.
   */
  renamed = $state<ReadonlyMap<number, number>>(new Map());

  /**
   * Notes whose waiting writes the server refused — somebody changed or removed the note meanwhile —
   * and which were therefore stored as notes of their own. The boundary says so, then clears it.
   */
  keptAsCopies = $state<string[]>([]);

  /**
   * The note the editor has open, and its name in the step log. A step write the offline queue could
   * not deliver because somebody else wrote first is that editor's to rebase — it still holds the
   * same steps — rather than a refusal to keep as a copy.
   */
  editing = $state.raw<{ noteId: number; clientId: string } | null>(null);

  private pendingListRefresh: ReturnType<typeof setTimeout> | null = null;
  private rememberTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  private requestToken = 0;

  /** The view's notes, in the view's own order (`entity/noteOrder.ts`), narrowed by its filters. */
  get visibleNotes(): Note[] {
    return this.narrow(this.notes);
  }

  /** The archived half of a label's view, narrowed the same way. */
  get visibleArchived(): Note[] {
    return this.narrow(this.archivedNotes);
  }

  /** What of `list` this view shows: the label it is filtered by, the search filter, then the query. */
  private narrow(list: Note[]): Note[] {
    const query = this.searchQuery.trim().toLowerCase();
    const labelId = this.labelId;
    const filter = this.searchFilter;
    return list.filter((note) => {
      if (labelId !== null && !note.labels.some((label) => label.id === labelId)) return false;
      if (filter !== null && !matchesFilter(note, filter)) return false;
      return query ? matchesQuery(note, query) : true;
    });
  }

  byId(id: number): Note | undefined {
    return this.notes.find((note) => note.id === id);
  }

  async load(view: NoteView = this.view, labelId: number | null = this.labelId): Promise<void> {
    this.view = view;
    this.labelId = labelId;
    this.remindersOnly = false;
    // A label's view gathers that label's archived notes as well, under their own heading, so the
    // two halves are asked for together: a view that loaded one of them and failed the other would
    // be a half a view — the archived notes would be missing with nothing to say so, and nothing
    // would ask for them again, because the view already counts as loaded.
    const wantsArchived = view === 'active' && labelId !== null;
    await this.fill(viewKey(view, labelId), async () => {
      const [listed, stored] = await Promise.all([
        notesApi.list(view, labelId),
        wantsArchived ? notesApi.list('archived', labelId) : Promise.resolve(null)
      ]);
      return { notes: listed.notes, archived: stored?.notes ?? [] };
    });
  }

  /** Loads the reminders view, which is its own request and its own order. */
  async loadReminders(): Promise<void> {
    this.remindersOnly = true;
    this.labelId = null;
    await this.fill(REMINDERS_KEY, async () => ({ notes: (await notesApi.listReminders()).notes, archived: [] }));
  }

  /**
   * Fills the view from the server — or, when the server cannot be reached, from this device's copy
   * of it — and shows the writes that are still waiting on top.
   */
  private async fill(key: string, fetch: () => Promise<ViewCopy>): Promise<void> {
    const token = ++this.requestToken;
    this.loading = true;
    this.error = null;
    try {
      await pendingWrites.ready();
      // The view's last copy is on screen while the server's answer is on its way, so opening the
      // app does not wait for the network; the answer replaces it.
      if (!this.loaded) {
        const stale = await localStore.get<ViewCopy>(key);
        if (stale && token === this.requestToken) {
          this.notes = this.ordered(stale.notes.map(withNormalizedContent));
          this.archivedNotes = this.ordered(stale.archived.map(withNormalizedContent));
          for (const write of pendingWrites.writes) this.replace(write.note);
          this.loaded = true;
        }
      }
      let copy: ViewCopy;
      try {
        copy = await fetch();
      } catch (error) {
        const kept = error instanceof ApiError && error.transient ? await localStore.get<ViewCopy>(key) : undefined;
        if (!kept) throw error;
        copy = kept;
      }
      if (token !== this.requestToken) return;
      this.notes = copy.notes.map(withNormalizedContent);
      this.archivedNotes = copy.archived.map(withNormalizedContent);
      for (const write of pendingWrites.writes) this.replace(write.note);
      this.notes = this.ordered(this.notes);
      this.archivedNotes = this.ordered(this.archivedNotes);
      this.loaded = true;
      this.remember();
    } catch (error) {
      if (token !== this.requestToken) return;
      this.error = error instanceof Error ? error.message : null;
    } finally {
      if (token === this.requestToken) this.loading = false;
    }
  }

  /** Keeps this device's copy of the view in step with what it shows. */
  private remember(): void {
    if (!this.loaded) return;
    if (this.rememberTimer) clearTimeout(this.rememberTimer);
    const key = this.remindersOnly ? REMINDERS_KEY : viewKey(this.view, this.labelId);
    this.rememberTimer = setTimeout(() => {
      this.rememberTimer = null;
      void localStore.set(key, { notes: this.notes, archived: this.archivedNotes } satisfies ViewCopy);
    }, REMEMBER_DELAY_MS);
  }

  async refresh(): Promise<void> {
    if (this.remindersOnly) {
      await this.loadReminders();
      return;
    }
    await this.load(this.view);
  }

  /** Writes this client has started but not finished, per note. */
  private inFlightWrites = new Map<number, number>();
  /** Highest version seen while our own write was in flight, replayed once it settles. */
  private deferredEvents = new Map<number, number>();

  /**
   * Runs a write, and holds back what the live channel says about that note until the write's own
   * response has landed.
   *
   * Our own save comes back through the same channel as everybody else's, and the two race: the
   * server publishes before it answers, so the notification often arrives while the response is
   * still in flight and the store still holds the previous version. That looked exactly like
   * somebody else editing the note, and warned the author about their own typing.
   *
   * The answer is stored **before** the held-back events are replayed: a replay that ran first still
   * found the previous version in the store, took the author's own echo for a newer note, and warned
   * them all the same.
   */
  private async duringWrite(noteId: number, action: () => Promise<Note>): Promise<Note> {
    this.inFlightWrites.set(noteId, (this.inFlightWrites.get(noteId) ?? 0) + 1);
    try {
      const note = withNormalizedContent(await action());
      this.replace(note);
      return note;
    } finally {
      const left = (this.inFlightWrites.get(noteId) ?? 1) - 1;
      if (left > 0) {
        this.inFlightWrites.set(noteId, left);
      } else {
        this.inFlightWrites.delete(noteId);
        const seen = this.deferredEvents.get(noteId);
        if (seen !== undefined) {
          this.deferredEvents.delete(noteId);
          // Replayed now that our own version is known: still newer than ours means it really was
          // somebody else, and the usual rules below decide.
          void this.applyRemoteChange(noteId, seen);
        }
      }
    }
  }

  /**
   * Handles a change the server announced over the live channel.
   *
   * The event carries only a version, so a note we already know is re-read when the announced
   * version is newer than ours — which also makes our own echoes no-ops, since a successful save
   * already advanced our copy. A note we do not know about (a new share, a view we have not loaded)
   * is handled by refreshing the list instead.
   *
   * @returns true when the stored note was replaced.
   */
  async applyRemoteChange(noteId: number, version: number): Promise<boolean> {
    // Waiting writes of ours are what the view shows; the server's copy meets them when they are sent.
    if (pendingWrites.get(noteId)) return false;
    if ((this.inFlightWrites.get(noteId) ?? 0) > 0) {
      this.deferredEvents.set(noteId, Math.max(this.deferredEvents.get(noteId) ?? 0, version));
      return false;
    }

    const known = this.byId(noteId);
    if (!known) {
      this.scheduleListRefresh();
      return false;
    }
    // A version we already have is usually our own echo. There is one exception: a link's card is
    // fetched *after* the write that contained the link, so the note is unchanged while its previews
    // are not. Re-reading then is what makes the card appear without reloading the page.
    if (known.version >= version && !awaitsPreviews(known)) return false;

    const knownVersion = known.version;
    const fresh = withNormalizedContent(await notesApi.get(noteId));
    this.replace(fresh);
    // Somebody moved it: making room for it moved others up by one on the server, and only a fresh
    // read of the view carries their new places.
    if (fresh.position !== known.position) this.scheduleListRefresh();
    // Only a newer version is somebody's edit. A re-read for the cards alone carries the same note,
    // and announcing it made an open editor warn its author about their own typing whenever the note
    // held a link that has no card (yet, or ever).
    if (fresh.version <= knownVersion) return false;
    this.announce([noteId]);
    return true;
  }

  /** Tells whoever shows these notes that somebody else changed them. */
  private announce(noteIds: Iterable<number>): void {
    const changed = new Set(noteIds);
    if (changed.size === 0) return;
    this.remoteChange = { revision: this.remoteChange.revision + 1, noteIds: changed };
  }

  /**
   * Catches up after the live channel was down — a dropped connection, a laptop that slept, a
   * restarted server. Nothing replays the notifications sent meanwhile, so the view is read again and
   * every note that came back newer is announced the way a notification would have announced it. A
   * note with a write of ours still in flight is left to that write, exactly as its notification
   * would have been (`duringWrite`).
   */
  async resync(): Promise<void> {
    await this.flush();
    const known = new Map([...this.notes, ...this.archivedNotes].map((note) => [note.id, note.version]));
    await this.refresh();
    const newer: number[] = [];
    for (const note of [...this.notes, ...this.archivedNotes]) {
      const before = known.get(note.id);
      if (before === undefined || note.version <= before) continue;
      if ((this.inFlightWrites.get(note.id) ?? 0) > 0) {
        this.deferredEvents.set(note.id, Math.max(this.deferredEvents.get(note.id) ?? 0, note.version));
      } else {
        newer.push(note.id);
      }
    }
    this.announce(newer);
  }

  /** Coalesces a burst of events into one list reload. */
  private scheduleListRefresh(): void {
    if (this.pendingListRefresh) return;
    this.pendingListRefresh = setTimeout(() => {
      this.pendingListRefresh = null;
      void this.refresh();
    }, LIST_REFRESH_DEBOUNCE_MS);
  }

  /**
   * Creates the note on the server. It does **not** join the list yet — the caller claims it with
   * `add()` once it owns it.
   *
   * The order matters. While a note is being composed the grid leaves out the note the open editor
   * owns, and it knows it by id: a draft that joined the list before the editor had its id was drawn
   * as a card for a moment, pushed the notes below it down, faded out again (every card has an exit
   * transition) and let them slide back — a visible shuffle of the whole grid while the author was
   * still writing.
   */
  async create(request: CreateNoteRequest = {}): Promise<Note> {
    await pendingWrites.ready();
    try {
      return withNormalizedContent(await notesApi.create(request));
    } catch (error) {
      const owner = session.user;
      if (!(error instanceof ApiError && error.transient) || owner === null) throw error;
      // Written on this device for now: a local id, and the note goes out with the queue.
      const note = draftNote(pendingWrites.localId(), request, owner, (id) => labels.byId(id), this.top(), Date.now());
      pendingWrites.put({ note, created: true, changes: {}, baseVersion: null });
      return note;
    }
  }

  /**
   * Moves a note the way dragging its card does: directly above or below another, by the server's own
   * rule (`NoteRepository.place`) applied here first, so the grid is already in the new order when
   * the request goes out. The order is the server's to keep: if it says otherwise, or cannot be
   * reached — moving is not queued offline — the view is read again.
   */
  async move(id: number, anchor: NoteMoveAnchor): Promise<void> {
    const lists = [this.notes, this.archivedNotes];
    const anchorNote = lists.flat().find((note) => note.id === ('before' in anchor ? anchor.before : anchor.after));
    if (!anchorNote) return;
    const position = 'before' in anchor ? anchorNote.position + 1 : anchorNote.position;
    const shifted = (list: Note[]) =>
      this.ordered(
        list.map((note) =>
          note.id === id
            ? { ...note, position }
            : note.position >= position
              ? { ...note, position: note.position + 1 }
              : note
        )
      );
    this.notes = shifted(this.notes);
    this.archivedNotes = shifted(this.archivedNotes);
    try {
      const stored = await this.duringWrite(id, () => notesApi.move(id, anchor));
      if (stored.position !== position) this.scheduleListRefresh();
    } catch (error) {
      this.scheduleListRefresh();
      throw error;
    }
  }

  /** Puts a note the caller owns into the list, where the view on screen shows it. */
  add(note: Note): void {
    if (this.view !== 'active') return;
    if (this.notes.some((item) => item.id === note.id)) return;
    this.notes = this.ordered([note, ...this.notes]);
    this.remember();
  }

  /**
   * Attaches pictures one after another, in the order given, and keeps the latest note. Stops at the
   * first refusal and rethrows it, so the caller can say why.
   */
  async addImages(id: number, pictures: readonly Blob[]): Promise<Note | null> {
    let latest: Note | null = null;
    for (const picture of pictures) {
      latest = await this.duringWrite(id, () => notesApi.uploadImage(id, picture));
    }
    return latest;
  }

  async removeImage(id: number, imageId: number): Promise<Note> {
    return this.duringWrite(id, () => notesApi.removeImage(id, imageId));
  }

  async patch(id: number, changes: UpdateNoteRequest): Promise<Note | null> {
    await pendingWrites.ready();
    // Behind writes that are already waiting, a write waits too: they go out in the order made.
    if (pendingWrites.get(id)) return this.queue(id, changes);
    try {
      return await this.duringWrite(id, () => notesApi.update(id, changes));
    } catch (error) {
      if (error instanceof ApiError && error.transient && this.byIdAnywhere(id)) return this.queue(id, changes);
      throw error;
    }
  }

  /**
   * Sends an editor's steps (`docs/COLLABORATION.md`) and answers with the note as stored — or with
   * `null` when they could not be sent and wait in the queue (or the note itself exists only on this
   * device), in which case they are still the editor's unsent steps. A `409 note.steps_behind` is
   * the caller's to answer: it catches up and sends again.
   */
  async sendSteps(id: number, body: StepsRequest): Promise<Note | null> {
    await pendingWrites.ready();
    const text: UpdateNoteRequest = { content: body.content };
    if (body.title !== undefined) text.title = body.title;
    if (body.kind !== undefined) text.kind = body.kind;
    // A note written on this device has no step log yet; its text goes out with its creation.
    if (id < 0) {
      this.queue(id, text);
      return null;
    }
    if (pendingWrites.get(id)) {
      this.queue(id, text, body);
      return null;
    }
    try {
      return await this.duringWrite(id, () => notesApi.sendSteps(id, body));
    } catch (error) {
      if (error instanceof ApiError && error.transient && this.byIdAnywhere(id)) {
        this.queue(id, text, body);
        return null;
      }
      throw error;
    }
  }

  /** Keeps a write for later and shows the note as it will be once it is stored. */
  private queue(id: number, changes: UpdateNoteRequest, steps?: StepsRequest): Note {
    const waiting = pendingWrites.get(id);
    const base = waiting?.note ?? this.byIdAnywhere(id);
    if (!base) throw new Error(`Note ${id} is not loaded`);
    const baseVersion =
      waiting?.baseVersion ?? (touchesText(changes) && !steps ? (changes.version ?? base.version) : null);
    const note = withChanges(base, changes, (labelId) => labels.byId(labelId), this.top());
    pendingWrites.put({
      note,
      created: waiting?.created ?? false,
      changes: mergeChanges(waiting?.changes ?? {}, changes),
      baseVersion,
      // An editor's unsent steps are all of them since its version, so the latest supersede the rest.
      steps: steps
        ? { docVersion: steps.docVersion, clientId: steps.clientId, steps: steps.steps }
        : waiting?.steps,
      baseTitle: waiting?.baseTitle ?? (changes.title !== undefined ? base.title : undefined)
    });
    this.replace(note);
    return note;
  }

  /**
   * Sends the writes that were waiting, oldest first, and stops at the first one the server still
   * cannot take. A write the server refuses — somebody changed the note meanwhile, or removed it, or
   * took it away from us — is never dropped with its text: the text becomes a note of its own.
   */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      await pendingWrites.ready();
      for (const write of [...pendingWrites.writes]) {
        if (!(await this.send(write))) break;
      }
    } finally {
      this.flushing = false;
    }
  }

  /** @returns false when the server still cannot be reached and the queue has to wait. */
  private async send(write: PendingWrite): Promise<boolean> {
    const { note } = write;
    try {
      if (write.created) {
        const created = await notesApi.create({
          kind: note.kind,
          title: note.title,
          content: note.content,
          labels: note.labels.map((label) => label.id)
        });
        const rest = metadataOf(write.changes);
        const stored = Object.keys(rest).length > 0 ? await notesApi.update(created.id, rest) : created;
        pendingWrites.remove(note.id);
        this.renamed = new Map(this.renamed).set(note.id, created.id);
        this.drop(note.id);
        this.replace(withNormalizedContent(stored));
      } else if (write.steps) {
        const { title, kind, content, ...rest } = write.changes;
        let stored = await notesApi.sendSteps(note.id, {
          ...write.steps,
          content: content ?? note.content,
          title,
          kind,
          titleBase: title === undefined ? undefined : write.baseTitle
        });
        if (Object.keys(rest).length > 0) stored = await notesApi.update(note.id, rest);
        pendingWrites.remove(note.id);
        this.replace(withNormalizedContent(stored));
      } else {
        const body: UpdateNoteRequest =
          write.baseVersion !== null && touchesText(write.changes)
            ? { ...write.changes, version: write.baseVersion }
            : write.changes;
        const stored = await notesApi.update(note.id, body);
        pendingWrites.remove(note.id);
        this.replace(withNormalizedContent(stored));
      }
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.transient) return false;
      if (error instanceof ApiError && error.key === 'note.steps_behind' && this.heldByEditor(write)) {
        // The open editor holds these very steps: it takes in what came first and sends them again.
        pendingWrites.remove(note.id);
        this.announce([note.id]);
        return true;
      }
      return this.keepAsCopy(write);
    }
  }

  private heldByEditor(write: PendingWrite): boolean {
    return this.editing?.noteId === write.note.id && this.editing.clientId === write.steps?.clientId;
  }

  /** A refused write's text, stored as a note of its own so that nothing typed is lost. */
  private async keepAsCopy(write: PendingWrite): Promise<boolean> {
    const { note } = write;
    if (write.created || touchesText(write.changes)) {
      try {
        const copy = await notesApi.create({ kind: note.kind, title: note.title, content: note.content });
        this.replace(withNormalizedContent(copy));
      } catch (error) {
        if (error instanceof ApiError && error.transient) return false;
      }
      this.keptAsCopies = [...this.keptAsCopies, note.title];
    }
    pendingWrites.remove(note.id);
    if (write.created) {
      this.drop(note.id);
    } else {
      // Show the note as the server has it now, if it is still there.
      try {
        this.replace(withNormalizedContent(await notesApi.get(note.id)));
      } catch {
        this.drop(note.id);
      }
    }
    return true;
  }

  /** One above every note the view holds: where a new note, or a re-pinned one, goes meanwhile. */
  private top(): number {
    return Math.max(0, ...this.notes.map((note) => note.position), ...this.archivedNotes.map((note) => note.position)) + 1;
  }

  byIdAnywhere(id: number): Note | undefined {
    return this.byId(id) ?? this.archivedNotes.find((note) => note.id === id);
  }

  async setAppearance(
    id: number,
    color: NoteColor,
    background: NoteBackground | null
  ): Promise<Note | null> {
    return this.patch(id, { color, background });
  }

  /**
   * Pinning is metadata: no version is sent, so a collaborator's typing can never block it, and
   * the server archives nothing.
   */
  async setPinned(id: number, pinned: boolean): Promise<Note | null> {
    return this.patch(id, { pinned });
  }

  /**
   * Folds or unfolds a list's completed items for this reader. Shown at once — it is a click on a
   * heading, not a write anybody waits for — and stored like a pin: no version, no history.
   */
  async setCompletedCollapsed(id: number, completedCollapsed: boolean): Promise<void> {
    const folded = (list: Note[]) => list.map((note) => (note.id === id ? { ...note, completedCollapsed } : note));
    this.notes = folded(this.notes);
    this.archivedNotes = folded(this.archivedNotes);
    this.remember();
    await this.patch(id, { completedCollapsed });
  }

  /**
   * The reader opened the note: the card's "edited by" marker goes away at once, and the server is
   * told so for the next read. It is the reader's own business — no version, no queue: a note opened
   * without a connection keeps its marker on the next read and loses it the next time it is opened.
   */
  async markSeen(id: number): Promise<void> {
    const edit = this.byIdAnywhere(id)?.unseenEdit;
    if (!edit || id < 0) return;
    this.clearUnseenEdit(id, edit.at);
    try {
      await notesApi.markSeen(id);
    } catch {
      return;
    }
    // A read that was already on its way when the note was opened can have brought the marker back.
    this.clearUnseenEdit(id, edit.at);
  }

  private clearUnseenEdit(id: number, seenAt: number): void {
    const seen = (list: Note[]) => list.map((note) => (note.id === id ? seenAsOf(note, seenAt) : note));
    this.notes = seen(this.notes);
    this.archivedNotes = seen(this.archivedNotes);
    this.remember();
  }

  async setLabels(id: number, labelIds: number[]): Promise<void> {
    await this.patch(id, { labels: labelIds });
    await labels.load();
  }

  async trash(id: number): Promise<void> {
    // A note that never reached the server is simply let go.
    if (pendingWrites.get(id)?.created) {
      pendingWrites.remove(id);
      this.drop(id);
      return;
    }
    await notesApi.trash(id);
    this.drop(id);
  }

  async restore(id: number): Promise<void> {
    const note = withNormalizedContent(await notesApi.restore(id));
    this.drop(id);
    if (this.view === 'trash') this.notes = this.notes.filter((item) => item.id !== id);
    else this.replace(note);
  }

  async destroy(id: number): Promise<void> {
    await notesApi.destroy(id);
    this.drop(id);
  }

  async emptyTrash(): Promise<void> {
    const trashed = [...this.notes];
    await Promise.all(trashed.map((note) => notesApi.destroy(note.id)));
    this.notes = [];
  }

  async copy(id: number): Promise<Note> {
    const note = withNormalizedContent(await notesApi.copy(id));
    if (this.view === 'active') this.notes = this.ordered([note, ...this.notes]);
    return note;
  }

  /**
   * Puts the latest copy of a note where the view's order puts it, or takes it out when the view no
   * longer shows it. Writing in a note never changes its place, so this only moves a note that was
   * pinned, unpinned or is new to the view.
   */
  replace(server: Note): void {
    // A note with writes still waiting is shown as it will be, not as the server last had it.
    const note = pendingWrites.get(server.id)?.note ?? server;
    this.remember();
    if (this.labelId !== null) {
      this.placeInLabelView(note);
      return;
    }
    const index = this.notes.findIndex((item) => item.id === note.id);
    if (!this.belongsToView(note)) {
      if (index !== -1) this.notes = this.notes.filter((item) => item.id !== note.id);
      return;
    }
    const next = [...this.notes];
    if (index === -1) next.push(note);
    else next[index] = note;
    this.notes = this.ordered(next);
  }

  /** The view's own order: the server's, or the dates the reader sorted by. */
  private ordered(list: Note[]): Note[] {
    return list.sort(this.remindersOnly ? byReminder : bySort(this.sort));
  }

  setSort(sort: NoteSort): void {
    this.sort = sort;
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sort);
    } catch {
      /* private mode: the order simply will not persist */
    }
    this.notes = this.ordered([...this.notes]);
    this.archivedNotes = this.ordered([...this.archivedNotes]);
  }

  /**
   * A label's view holds the live notes and the archived ones, so archiving — or trashing — a note
   * from inside it moves that note between the two lists here rather than waiting for a reload.
   *
   * Both lists keep the view's order, which writing in a note does not change.
   */
  private placeInLabelView(note: Note): void {
    const without = (list: Note[]) => list.filter((item) => item.id !== note.id);
    const withNote = (list: Note[]) => this.ordered([...without(list), note]);

    if (note.trashedAt !== null) {
      this.notes = without(this.notes);
      this.archivedNotes = without(this.archivedNotes);
      return;
    }
    if (note.archived) {
      const stored = withNote(this.archivedNotes);
      this.notes = without(this.notes);
      this.archivedNotes = stored;
      return;
    }
    const live = withNote(this.notes);
    this.archivedNotes = without(this.archivedNotes);
    this.notes = live;
  }

  drop(id: number): void {
    this.notes = this.notes.filter((note) => note.id !== id);
    this.archivedNotes = this.archivedNotes.filter((note) => note.id !== id);
    this.remember();
  }

  reset(): void {
    if (this.rememberTimer) clearTimeout(this.rememberTimer);
    this.rememberTimer = null;
    pendingWrites.reset();
    this.notes = [];
    this.archivedNotes = [];
    this.loaded = false;
    this.error = null;
    this.searchQuery = '';
    this.searchFilter = null;
  }

  private belongsToView(note: Note): boolean {
    switch (this.view) {
      case 'trash':
        return note.trashedAt !== null;
      case 'archived':
        return note.archived && note.trashedAt === null;
      default:
        return !note.archived && note.trashedAt === null;
    }
  }
}

/** A view as this device keeps it. */
interface ViewCopy {
  notes: Note[];
  archived: Note[];
}

const REMINDERS_KEY = 'view:reminders';

function viewKey(view: NoteView, labelId: number | null): string {
  return `view:${view}:${labelId ?? 'all'}`;
}

/** What a waiting write changes besides the text and the labels, which a creation already carries. */
function metadataOf(changes: UpdateNoteRequest): UpdateNoteRequest {
  const { title: _title, kind: _kind, content: _content, labels: _labels, version: _version, ...rest } = changes;
  return rest;
}

function withNormalizedContent(note: Note): Note {
  return { ...note, content: normalizeDocument(note.content) };
}

function matchesQuery(note: Note, query: string): boolean {
  if (note.title.toLowerCase().includes(query)) return true;
  if (note.labels.some((label) => label.name.toLowerCase().includes(query))) return true;
  return note.content.blocks.some((block) =>
    block.spans.some((span) => span.text.toLowerCase().includes(query))
  );
}

export const notes = new NotesState();

/**
 * True while a note links to something the server has not described yet: the note carries a url and
 * no card for it. That is the one change the live channel cannot express as a version.
 */
function awaitsPreviews(note: Note): boolean {
  const urls = new Set<string>();
  for (const block of note.content.blocks) {
    for (const span of block.spans) {
      if (span.link) urls.add(span.link);
      for (const match of span.text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
        urls.add(match[0].replace(/[.,;:!?)\]}"']+$/, ''));
      }
    }
  }
  if (urls.size === 0) return false;
  const covered = new Set((note.linkPreviews ?? []).map((preview) => preview.url));
  return [...urls].some((url) => !covered.has(url));
}

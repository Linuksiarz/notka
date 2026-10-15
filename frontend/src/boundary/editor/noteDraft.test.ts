import { describe, expect, it, vi } from 'vitest';
import type { Note } from '../../entity/api/types';
import { NoteDraft } from './noteDraft.svelte';

/** A note as the API hands it over, with only the fields the draft reads. */
function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 7,
    kind: 'TEXT',
    title: 'Shopping',
    content: { version: 1, blocks: [] },
    color: 'default',
    background: null,
    archived: false,
    pinned: false,
    updatedAt: 1000,
    version: 3,
    docVersion: 12,
    labels: [],
    canEdit: true,
    access: 'OWNER',
    owner: { id: 1, email: 'ada@example.com', displayName: 'Ada' },
    ...overrides
  } as Note;
}

describe('NoteDraft', () => {
  it('starts a new note without claiming anything is unsaved', () => {
    // given: an empty draft
    const draft = new NoteDraft();

    // when: a new checklist is started
    draft.startNew('LIST');

    // then: it is a new, empty, checklist-shaped draft with nothing to write
    expect(draft.isNew).toBe(true);
    expect(draft.kind).toBe('LIST');
    expect(draft.hasContent).toBe(false);
    expect(draft.isDirty()).toBe(false);
  });

  it('is dirty from the first keystroke, and sends the title trimmed', () => {
    // given: a new note with a title typed into it
    const draft = new NoteDraft();
    draft.startNew('TEXT');

    // when: the title is typed
    draft.title = '  Shopping  ';

    // then: there is something to write, and the payload trims what the server stores
    expect(draft.hasContent).toBe(true);
    expect(draft.isDirty()).toBe(true);
    expect(draft.payload().title).toBe('Shopping');
  });

  it('takes a note over from the server without calling it unsaved', () => {
    // given: a draft of nothing in particular and a note the server returned
    const draft = new NoteDraft();

    // when: the draft adopts it
    draft.adopt(note({ title: 'Shopping', pinned: true }));

    // then: everything comes from the note, and the server's text counts as stored
    expect(draft.noteId).toBe(7);
    expect(draft.title).toBe('Shopping');
    expect(draft.pinned).toBe(true);
    expect(draft.isOwner).toBe(true);
    expect(draft.isDirty()).toBe(false);
  });

  it('keeps keystrokes made while a write was in flight unsaved', () => {
    // given: a save that sent "Shopping" while the writer carried on typing "Shopping list"
    const draft = new NoteDraft();
    draft.startNew('TEXT');
    draft.title = 'Shopping';
    const sent = draft.serialize();
    draft.title = 'Shopping list';

    // when: the write replies, recording the text it actually sent
    draft.markStored(sent);

    // then: the text typed after the write is still waiting to be written
    expect(draft.isDirty()).toBe(true);
  });

  it('does not schedule a write for a note that cannot be edited', () => {
    // given: a draft whose note is read-only, and a write to schedule
    vi.useFakeTimers();
    const draft = new NoteDraft();
    draft.startNew('TEXT');
    draft.title = 'Shopping';
    draft.canEdit = false;
    const write = vi.fn();

    // when: an autosave is scheduled
    draft.autosave(write);
    vi.advanceTimersByTime(1000);

    // then: nothing was written
    expect(write).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('is unsaved while the body holds steps the server has not taken', () => {
    // given: a note taken over from the server, at its body version
    const draft = new NoteDraft();
    draft.adopt(note());
    let unsent = false;
    draft.hasUnsentBody = () => unsent;

    // when: the reader types into the body
    unsent = true;

    // then: the draft is unsaved, and it knows the body version it started from
    expect(draft.docVersion).toBe(12);
    expect(draft.isDirty()).toBe(true);
  });

  it("takes somebody else's title over, but not over the reader's own", () => {
    // given: a note whose title the server confirmed
    const draft = new NoteDraft();
    draft.adopt(note({ title: 'Shopping' }));

    // when: somebody renames it
    draft.follow({ title: 'Groceries', kind: 'TEXT', updatedAt: 2000 });

    // then: the draft follows, and has nothing of its own to write
    expect(draft.title).toBe('Groceries');
    expect(draft.isDirty()).toBe(false);

    // when: the reader renames it too, before somebody renames it again
    draft.title = 'Market';
    draft.follow({ title: 'Food', kind: 'TEXT', updatedAt: 3000 });

    // then: the reader's title stands, and is still to be written
    expect(draft.title).toBe('Market');
    expect(draft.isDirty()).toBe(true);
  });

  it('writes once, after the delay, when the note can be edited', () => {
    // given: an editable draft with something unsaved
    vi.useFakeTimers();
    const draft = new NoteDraft();
    draft.startNew('TEXT');
    draft.title = 'Shopping';
    const write = vi.fn();

    // when: two autosaves are scheduled in quick succession
    draft.autosave(write);
    draft.autosave(write);
    vi.advanceTimersByTime(1000);

    // then: the burst collapsed into one write
    expect(write).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

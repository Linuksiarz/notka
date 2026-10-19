import { toast } from 'svelte-sonner';
import { labels } from '../../control/state/labels.svelte';
import { notes } from '../../control/state/notes.svelte';
import { ui } from '../../control/state/ui.svelte';
import type { Label, Note, NoteBackground, NoteColor, ReminderRepeat } from '../../entity/api/types';
import { tError } from '../i18n';

/**
 * What both selection bars — the phone's and the desktop's — do to the picked notes. Every action is
 * the same REST call a single note makes, once per picked note (rule 20): there is no bulk endpoint
 * and no second write path.
 */
export class SelectionActions {
  readonly picked = $derived.by(() => {
    const ids = new Set(ui.selectedNoteIds);
    return [...notes.visibleNotes, ...notes.visibleArchived].filter((note) => ids.has(note.id));
  });

  readonly allPinned = $derived(this.picked.length > 0 && this.picked.every((note) => note.pinned));

  readonly canEdit = $derived(this.picked.every((note) => note.canEdit));

  readonly canChangeAppearance = $derived(this.picked.every((note) => note.canChangeAppearance));

  /** The labels every picked note carries — the ones the picker shows ticked. */
  readonly sharedLabelIds = $derived(
    labels.labels
      .filter(
        (label) =>
          this.picked.length > 0 && this.picked.every((note) => note.labels.some((own) => own.id === label.id))
      )
      .map((label) => label.id)
  );

  /** What the picked notes share — shown in a picker as its current choice. */
  shared<T>(read: (note: Note) => T, otherwise: T): T {
    const first = this.picked[0];
    if (!first) return otherwise;
    const value = read(first);
    return this.picked.every((note) => read(note) === value) ? value : otherwise;
  }

  private async each(action: (note: Note) => Promise<unknown>): Promise<void> {
    try {
      await Promise.all(this.picked.map(action));
    } catch (error) {
      toast.error(tError(error as Error));
    }
  }

  togglePin(): void {
    const pinned = !this.allPinned;
    void this.each((note) => notes.setPinned(note.id, pinned));
  }

  paint(color: NoteColor, background: NoteBackground | null): void {
    void this.each((note) => notes.setAppearance(note.id, color, background));
  }

  remind(at: number | null, repeat: ReminderRepeat | null): void {
    void this.each((note) =>
      notes.patch(note.id, { reminderAt: at === null ? 0 : at, reminderRepeat: at === null ? null : repeat })
    );
  }

  /** The original's label list for a selection: a label every picked note has is taken off them all. */
  toggleLabel(label: Label): void {
    const remove = this.sharedLabelIds.includes(label.id);
    void this.each((note) => {
      const own = note.labels.map((entry) => entry.id).filter((id) => id !== label.id);
      return notes.setLabels(note.id, remove ? own : [...own, label.id]);
    });
  }

  async createLabel(name: string): Promise<void> {
    try {
      this.toggleLabel(await labels.create(name));
    } catch (error) {
      toast.error(tError(error as Error));
    }
  }

  copy(): void {
    void this.each((note) => notes.copy(note.id));
  }
}

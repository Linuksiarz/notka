import type { NoteKind } from '../../entity/api/types';
import { DEFAULT_LOCALE, isLocaleCode, matchLocale, type LocaleCode } from '../../entity/locales';

export type ThemeMode = 'light' | 'dark';

export type NotesLayout = 'grid' | 'list';

import { NARROW_LAYOUT_MAX_WIDTH, PHONE_MAX_WIDTH } from './breakpoints';

const THEME_STORAGE_KEY = 'notka.theme';
const LAYOUT_STORAGE_KEY = 'notka.layout';
const LOCALE_STORAGE_KEY = 'notka.locale';
const MOTION_STORAGE_KEY = 'notka.motion';

/** Chrome-level UI state: theme, language, navigation drawer, dialogs, and the snackbar. */
class UiState {
  theme = $state<ThemeMode>('light');
  layout = $state<NotesLayout>('grid');
  locale = $state<LocaleCode>(DEFAULT_LOCALE);
  sidebarOpen = $state(false);
  /**
   * True while the rail is a **drawer** over the app instead of a column beside it. That is the same
   * breakpoint the stylesheet uses, and it is what decides whether navigating away should dismiss the
   * rail: on a wide screen Google Keep leaves the column open, and only the drawer closes itself.
   */
  narrow = $state(false);
  /**
   * Whether the window is a **phone**, which is where the original changes the app's chrome rather
   * than just its widths: the editor gets a bar of its own with a way back.
   */
  phone = $state(false);

  /**
   * The note the editor owns, once it exists on the server; a draft that has not been saved yet has
   * none. It used to be `0` for "a brand new note", which made `0` mean two things at once and was
   * behind the grid drawing a draft it was told to hide — the note is now told apart by
   * `editorOrigin`, and this field only ever holds a real id.
   */
  editorNoteId = $state<number | null>(null);
  editorKind = $state<NoteKind>('TEXT');
  /**
   * How editing is presented, and whether the editor is open at all: `composer` expands in place of
   * the "Take a note…" box, `note` floats a card over the notes with the app dimmed behind it the way
   * Google Keep presents an existing note, and `null` is closed.
   *
   * It is separate from `editorNoteId` on purpose: a note that began in the composer keeps the
   * composer's own frame after its first autosave claims an id, so "how it is presented" and "does
   * the note exist yet" are two facts, not one.
   */
  editorOrigin = $state<'composer' | 'note' | null>(null);

  /**
   * True while a closing editor is handing its note back to the grid.
   *
   * A note that is still being composed is left out of the grid so its slot does not sit empty under
   * the composer — but that slot is exactly where the editor has to travel when the note is
   * finished, so it is revealed for the length of the flight.
   */
  settling = $state(false);

  /**
   * Notes picked for a bulk action. Google Keep has no separate mode: ticking one card's box shows
   * the selection bar, unticking the last one puts it away.
   */
  selectedNoteIds = $state<number[]>([]);

  /**
   * `null` follows the operating system; `true`/`false` is a decision taken in Settings. Google Keep
   * does not honour the system setting, and a clone asked to look like the original needs a way to
   * animate for somebody whose system asks for less motion without pretending that setting is absent.
   */
  motionOverride = $state<boolean | null>(null);

  shareNoteId = $state<number | null>(null);
  labelsDialogOpen = $state(false);
  settingsOpen = $state(false);
  /** The administrator's server settings, from the gear menu. */
  serverSettingsOpen = $state(false);



  get systemPrefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  get animationsAllowed(): boolean {
    return this.motionOverride ?? !this.systemPrefersReducedMotion;
  }

  setAnimations(allowed: boolean): void {
    this.motionOverride = allowed;
    writeStorage(MOTION_STORAGE_KEY, allowed ? 'on' : 'off');
    this.applyMotion();
  }

  private applyMotion(): void {
    document.documentElement.dataset.motion = this.animationsAllowed ? 'full' : 'reduced';
  }

  get selecting(): boolean {
    return this.selectedNoteIds.length > 0;
  }

  isSelected(noteId: number): boolean {
    return this.selectedNoteIds.includes(noteId);
  }

  toggleSelected(noteId: number): void {
    this.selectedNoteIds = this.isSelected(noteId)
      ? this.selectedNoteIds.filter((id) => id !== noteId)
      : [...this.selectedNoteIds, noteId];
  }

  /** Keep's `Select all` picks everything the view is showing, and nothing else. */
  selectAll(noteIds: number[]): void {
    this.selectedNoteIds = [...new Set(noteIds)];
  }

  /**
   * Drops ids the view no longer shows.
   *
   * A picked note that leaves the list — restored from the trash, archived, deleted, or filtered out
   * by a search — used to keep its tick: the id stayed in the selection and the note came back
   * already picked the next time it was on screen, with the count in the bar quietly including it.
   */
  retainSelection(noteIds: Set<number>): void {
    const kept = this.selectedNoteIds.filter((id) => noteIds.has(id));
    if (kept.length !== this.selectedNoteIds.length) this.selectedNoteIds = kept;
  }

  clearSelection(): void {
    this.selectedNoteIds = [];
  }

  get editorOpen(): boolean {
    return this.editorOrigin !== null;
  }

  /** True while the editor stands in for the "Take a note…" box, rather than floating over notes. */
  get inComposer(): boolean {
    return this.editorOrigin === 'composer';
  }

  /** True while a note is being edited as a card over the notes, with the app dimmed behind it. */
  get floatingEditor(): boolean {
    return this.editorOrigin === 'note';
  }
  init(): void {
    this.theme = readStoredTheme() ?? preferredTheme();
    // The original's default is the **grid** on every screen, and on a phone that means two cards
    // side by side, which is what "Google Keep ma widok dwukolumnowy" is about. The list is a view
    // the reader picks, not the one they are given for having a small screen.
    this.layout = readStoredLayout() ?? 'grid';
    // On a wide screen the rail starts open and the header's menu button folds it away.
    this.sidebarOpen = window.innerWidth > NARROW_LAYOUT_MAX_WIDTH;
    this.watchLayout();
    this.locale = readStoredLocale() ?? matchLocale(navigator.language) ?? DEFAULT_LOCALE;
    this.applyTheme();
    this.applyLocale();
    this.motionOverride = readStoredMotion();
    this.applyMotion();
  }

  setTheme(theme: ThemeMode): void {
    this.theme = theme;
    this.applyTheme();
    writeStorage(THEME_STORAGE_KEY, theme);
  }

  setLayout(layout: NotesLayout): void {
    this.layout = layout;
    writeStorage(LAYOUT_STORAGE_KEY, layout);
  }

  setLocale(locale: LocaleCode): void {
    this.locale = locale;
    this.applyLocale();
    writeStorage(LOCALE_STORAGE_KEY, locale);
  }

  toggleSidebar(open = !this.sidebarOpen): void {
    this.sidebarOpen = open;
  }

  /** Navigating dismisses the drawer, which covers the app; the column beside the notes stays. */
  closeDrawer(): void {
    if (this.narrow) this.sidebarOpen = false;
  }

  /**
   * Keeps [narrow] honest across resizes. Crossing into the narrow layout closes the drawer, so a
   * window that was just narrowed cannot leave it covering the notes; crossing back opens the rail,
   * which is where a wide window starts.
   */
  private watchLayout(): void {
    const query = window.matchMedia(`(max-width: ${NARROW_LAYOUT_MAX_WIDTH}px)`);
    this.narrow = query.matches;
    query.onchange = (event) => {
      this.narrow = event.matches;
      this.sidebarOpen = !event.matches;
    };
    const phone = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`);
    this.phone = phone.matches;
    phone.onchange = (event) => {
      this.phone = event.matches;
    };
  }

  /** Pictures the composer's "New note with image" picked; the editor attaches them once it opens. */
  pendingImages = $state.raw<File[]>([]);

  /**
   * The open editor holds text the server has not taken — a write failed, and the draft is the only
   * copy. Until it is stored or the user lets it go, the editor neither closes nor gives way to
   * another note: replacing the draft is what lost text when the connection dropped or someone else
   * wrote first.
   */
  editorHoldsUnsaved = $state(false);

  openEditor(noteId: number | null, kind: NoteKind = 'TEXT'): void {
    if (this.editorHoldsUnsaved) return;
    // Opening a note is not a bulk action; the bar would sit over the editor.
    this.clearSelection();
    this.editorNoteId = noteId;
    this.editorKind = kind;
    this.editorOrigin = noteId === null ? 'composer' : 'note';
  }

  closeEditor(): void {
    this.editorNoteId = null;
    this.editorOrigin = null;
    this.editorHoldsUnsaved = false;
  }

  openShare(noteId: number): void {
    this.shareNoteId = noteId;
  }

  closeShare(): void {
    this.shareNoteId = null;
  }



  /** The system's bar follows on its own, from what the theme paints (`boundary/systemBar.ts`). */
  private applyTheme(): void {
    document.documentElement.setAttribute('data-theme', this.theme);
  }

  private applyLocale(): void {
    document.documentElement.lang = this.locale;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the preference simply will not persist */
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function preferredTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredMotion(): boolean | null {
  const stored = readStorage(MOTION_STORAGE_KEY);
  if (stored === 'on') return true;
  if (stored === 'off') return false;
  return null;
}

function readStoredTheme(): ThemeMode | null {
  const stored = readStorage(THEME_STORAGE_KEY);
  return stored === 'dark' || stored === 'light' ? stored : null;
}

function readStoredLayout(): NotesLayout | null {
  const stored = readStorage(LAYOUT_STORAGE_KEY);
  return stored === 'grid' || stored === 'list' ? stored : null;
}

function readStoredLocale(): LocaleCode | null {
  const stored = readStorage(LOCALE_STORAGE_KEY);
  return isLocaleCode(stored) ? stored : null;
}

export const ui = new UiState();

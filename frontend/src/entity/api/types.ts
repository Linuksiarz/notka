/**
 * Wire types for the Notka HTTP API.
 *
 * This file is the frontend mirror of `docs/API.md`. Keep the two in sync: any change here must
 * be reflected in the document, and vice versa.
 */

export type NoteKind = 'TEXT' | 'LIST';

type AccessLevel = 'OWNER' | 'VIEW' | 'EDIT';

export type SharePermission = 'VIEW' | 'EDIT';

export type NoteView = 'active' | 'archived' | 'trash';

export type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulleted'
  | 'numbered'
  | 'checklist';

export interface NoteSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  link?: string;
}

export interface NoteBlock {
  id: string;
  type: BlockType;
  /** Only meaningful when `type === 'checklist'`. */
  checked?: boolean;
  /**
   * How deep a list line sits: `0` is the top level, `1` is indented under the line above it.
   * Only meaningful for the list types, and never more than `MAX_BLOCK_DEPTH`.
   */
  depth?: number;
  spans: NoteSpan[];
}

/** Keep indents a few levels; beyond this the lines are too narrow to read. */
/**
 * The deepest a list line may sit: **one level**, the way the original does it.
 *
 * The owner's own rule: "Google Keep only allows one level of nesting". Tab sinks a line under the
 * one above it and stops there; the server refuses anything deeper, so a client cannot invent a
 * third level either.
 */
export const MAX_BLOCK_DEPTH = 1;

export interface NoteDocument {
  version: 1;
  blocks: NoteBlock[];
}

export interface User {
  id: number;
  /** Every account that signed up has one; the administrator created from the environment may not. */
  email: string | null;
  /** Only the administrator created from the environment has one; it signs in with it. */
  username: string | null;
  displayName: string;
  /** The instance's administrator, who sees the server settings. */
  admin: boolean;
}

export interface Label {
  id: number;
  name: string;
}

/**
 * One entry in a note's history list. It carries no document on purpose: a note can keep fifty of
 * these and the bodies would turn the list request into megabytes.
 */
export interface NoteVersionSummary {
  version: number;
  kind: NoteKind;
  title: string;
  createdAt: number;
  author: User;
}

/** One archived state, content included. Appearance is not versioned; it belongs to the note. */
export interface NoteVersion extends NoteVersionSummary {
  content: NoteDocument;
}

export interface NoteVersionsResponse {
  versions: NoteVersionSummary[];
}

interface NoteShare {
  user: User;
  permission: SharePermission;
}

/**
 * The card a link in a note turns into: what the page says about itself, as the server read it.
 *
 * Derived, never written by a client — the note's own text holds the address, and removing the link
 * removes this with it.
 */
/** How a reminder comes back after it fires: the original's own four rules. */
export type ReminderRepeat = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface LinkPreview {
  url: string;
  title: string;
  siteName: string;
  imageUrl?: string | null;
}

/** A picture on a note; its bytes are fetched by id (`control/api/notes.ts`). */
export interface NoteImage {
  id: number;
  width: number;
  height: number;
  contentType: string;
}

export interface Note {
  id: number;
  kind: NoteKind;
  title: string;
  content: NoteDocument;
  /** Appearance belongs to the note: everyone with access sees these same values. */
  color: NoteColor;
  background: NoteBackground | null;
  archived: boolean;
  /** Pinned notes lead their view. Metadata like the archive flag: no version guard, no history. */
  pinned: boolean;
  /** Its place in its section, highest first (`entity/noteOrder.ts`). */
  position: number;
  trashedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /**
   * Bumped by the server on every accepted write. Send it back when saving `title`, `kind` or
   * `content` so a concurrent edit is reported as a conflict instead of silently overwriting the
   * other writer's text.
   */
  version: number;
  /**
   * The version of the body in its step log (`docs/COLLABORATION.md`): the number of ProseMirror steps
   * that brought it here. An editor sends its own steps against it.
   */
  docVersion: number;
  owner: User;
  access: AccessLevel;
  canEdit: boolean;
  /** True for the owner and for `EDIT` collaborators; a change applies to everyone. */
  canChangeAppearance: boolean;
  /** Cards for the links the note contains; absent when it has none. */
  linkPreviews?: LinkPreview[];
  /** Absent when the note carries no reminder; a moment in epoch milliseconds. */
  reminderAt?: number;
  /** Absent when the reminder does not come back. */
  reminderRepeat?: ReminderRepeat;
  /** The note's pictures, in the order they were added; absent when it has none. */
  images?: NoteImage[];
  labels: Label[];
  /** Present only when the requesting user owns the note. */
  shares?: NoteShare[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    /** Stable identifier the UI localizes, e.g. `share.already_shared`. */
    key: string;
    /** English, developer-facing fallback. Never shown when `key` is known. */
    message: string;
    /** Optional placeholders referenced by the `key`, e.g. `{ "email": "bob@example.com" }`. */
    params?: Record<string, string>;
  };
}

/* ------------------------------------------------------------------ appearance constants */

/** The 11 customizable colors, plus the plain default surface. */
export const NOTE_COLORS = [
  'default',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'darkblue',
  'purple',
  'pink',
  'brown',
  'gray'
] as const;

export type NoteColor = (typeof NOTE_COLORS)[number];

/** The 11 colors a user can actively pick; `default` is represented by the "no color" swatch. */
export const PICKABLE_COLORS = NOTE_COLORS.filter((color) => color !== 'default');

/** The backgrounds Google Keep ships; `frontend/public/backgrounds` holds both theme variants. */
export const NOTE_BACKGROUNDS = [
  'groceries',
  'food',
  'music',
  'recipes',
  'notes',
  'places',
  'travel',
  'video',
  'celebration'
] as const;

export type NoteBackground = (typeof NOTE_BACKGROUNDS)[number];

/* ------------------------------------------------------------------------------ requests */

export interface RegisterRequest {
  email: string;
  displayName: string;
  password: string;
}

export interface LoginRequest {
  /** An e-mail address, or the administrator's username. */
  login: string;
  password: string;
}

/** Sets the password a reset e-mail was sent for; the token is the part of its link after `#`. */
export interface PasswordResetRequest {
  token: string;
  password: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface UserResponse {
  user: User;
}

export interface NotesResponse {
  notes: Note[];
}

export interface LabelsResponse {
  labels: Label[];
}

export interface SharesResponse {
  shares: NoteShare[];
}

export interface CreateNoteRequest {
  kind?: NoteKind;
  title?: string;
  content?: NoteDocument;
  labels?: number[];
}

export interface UpdateNoteRequest {
  kind?: NoteKind;
  title?: string;
  content?: NoteDocument;
  archived?: boolean;
  pinned?: boolean;
  trashed?: boolean;
  color?: NoteColor;
  /** `null` clears the background (`notesApi.update` sends it as `""`); omit the field to leave it untouched. */
  background?: NoteBackground | null;
  /** Epoch milliseconds; `0` takes the reminder away, `null`/omitted leaves it alone. */
  reminderAt?: number | null;
  reminderRepeat?: ReminderRepeat | null;
  labels?: number[];
  /**
   * The version the client last read. Only meaningful when writing `title`, `kind` or `content`;
   * leave it off for appearance, label and archive changes, which cannot lose anyone's content.
   */
  version?: number;
}

/**
 * An editor's steps over the body at `docVersion`, with what they produce: the body, and the title
 * and kind when those changed with them. A step is ProseMirror's own JSON; the server keeps it opaque.
 */
export interface StepsRequest {
  docVersion: number;
  clientId: string;
  steps: unknown[];
  content: NoteDocument;
  title?: string;
  kind?: NoteKind;
  /** The title `title` replaces, as a write queued offline last saw it (`docs/API.md`). */
  titleBase?: string;
}

/** The steps after an editor's version, or `reset` when the log no longer reaches back that far. */
export interface StepsResponse {
  docVersion: number;
  steps: Array<{ step: unknown; clientId: string }>;
  reset: boolean;
}

export interface ShareNoteRequest {
  email: string;
  permission: SharePermission;
}

interface UpdateShareRequest {
  permission: SharePermission;
}

/** Payload of the server's live `note.changed` notification. It never carries content. */
export interface NoteChangedEvent {
  noteId: number;
  version: number;
}

export interface HealthResponse {
  status: string;
  version: string;
}

/** One background's pictures in an uploaded theme, as urls the server serves them under. */
export interface ThemeImages {
  light: string;
  dark: string;
  /** The colour under the picture: what shows before it loads, in a swatch, under the editor's bar. */
  tint: string | null;
  tintDark: string | null;
}

/** A background theme the administrator uploaded (`docs/THEMES.md`). */
export interface Theme {
  id: string;
  name: string;
  author: string | null;
  license: string | null;
  backgrounds: Partial<Record<NoteBackground, ThemeImages>>;
}

export interface ThemesResponse {
  themes: Theme[];
  /** The instance's default; the built-in theme's id until the administrator picks another. */
  defaultThemeId: string;
  /** This account's own pick; `null` follows the default. */
  selectedThemeId: string | null;
}

export interface ServerSettings {
  registrationOpen: boolean;
  defaultThemeId: string;
  /** Whether a password reset can be e-mailed: a mail server and a public address are configured. */
  mailConfigured: boolean;
}

export interface UpdateServerSettingsRequest {
  registrationOpen?: boolean;
  defaultThemeId?: string;
}

/** What one account stores, for the administrator. Sizes are bytes. */
export interface AccountUsage {
  user: User;
  createdAt: number;
  lastSeenAt: number | null;
  notes: number;
  noteBytes: number;
  historyBytes: number;
  imageBytes: number;
  totalBytes: number;
}

export interface AccountsResponse {
  accounts: AccountUsage[];
  /** The picture storage each account may use. */
  imageQuotaBytes: number;
  /** The database file: everything the instance stores. */
  databaseBytes: number;
}

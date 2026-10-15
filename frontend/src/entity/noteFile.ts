import { NOTE_BACKGROUNDS, NOTE_COLORS } from './api/types';
import type {
  Note,
  NoteBackground,
  NoteColor,
  NoteDocument,
  NoteKind,
  ReminderRepeat
} from './api/types';
import { documentFromMarkdown, documentToMarkdown } from './markdown';

/**
 * One note as one Markdown file — the format of the export and of the import (`docs/MARKDOWN.md`).
 *
 * ```markdown
 * # Groceries #home #[[weekly shop]]
 *
 * - [ ] Milk
 *
 * <!-- notka: {"kind":"LIST","color":"yellow",…} -->
 * ```
 *
 * The title is the first line's `# `, the labels follow it as tags the way Logseq writes them, the
 * body is Markdown with its headings one level down (the title owns `#`), and what only Notka
 * knows rides in an HTML comment at the end, invisible to any Markdown renderer. A file from
 * elsewhere — no title, no tags, no comment — still reads as a note.
 */

const REPEATS: readonly ReminderRepeat[] = ['daily', 'weekly', 'monthly', 'yearly'];

const METADATA = /<!--\s*notka:\s*(\{[\s\S]*?\})\s*-->\s*$/;

/** A tag as Logseq writes it: `#word`, or `#[[several words]]` when it holds a space or a `#`. */
const TAG = /(?:^|\s)#(?:\[\[([^\]]+)\]\]|([^\s#[\]]+))$/;

/** What a file says about its note beyond title and body; every field is optional when read. */
export interface NoteFileMetadata {
  kind?: NoteKind;
  color?: NoteColor;
  background?: NoteBackground | null;
  pinned?: boolean;
  archived?: boolean;
  /** ISO 8601, with the writer's offset. */
  reminderAt?: string | null;
  reminderRepeat?: ReminderRepeat | null;
  created?: string;
  updated?: string;
}

/** A note read from a file, ready to be created. */
export interface NoteFile {
  title: string;
  tags: string[];
  kind: NoteKind;
  content: NoteDocument;
  color: NoteColor;
  background: NoteBackground | null;
  pinned: boolean;
  archived: boolean;
  reminderAt: number | null;
  reminderRepeat: ReminderRepeat | null;
}

function tagToMarkdown(name: string): string {
  return /^[^\s#[\]]+$/.test(name) ? `#${name}` : `#[[${name.replace(/[[\]]/g, '')}]]`;
}

/** The title can hold any character; only `#` and a leading Markdown marker need escaping. */
function escapeTitle(title: string): string {
  return title.replace(/\\/g, '\\\\').replace(/#/g, '\\#');
}

function unescapeTitle(title: string): string {
  return title.replace(/\\(.)/g, '$1');
}

function isoOffset(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(Math.abs(value)).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  );
}

/**
 * Writes a note as a file. [tags] are the label names the reader sees on it — labels are personal,
 * so a file carries the exporter's own.
 */
export function noteToFile(
  note: Pick<
    Note,
    | 'title'
    | 'content'
    | 'kind'
    | 'color'
    | 'background'
    | 'pinned'
    | 'archived'
    | 'reminderAt'
    | 'reminderRepeat'
    | 'createdAt'
    | 'updatedAt'
  >,
  tags: readonly string[]
): string {
  const heading = [escapeTitle(note.title.trim()), ...tags.map(tagToMarkdown)].filter(Boolean).join(' ');
  const metadata: NoteFileMetadata = {
    kind: note.kind,
    color: note.color,
    background: note.background,
    pinned: note.pinned,
    archived: note.archived,
    reminderAt: note.reminderAt != null ? isoOffset(note.reminderAt) : null,
    reminderRepeat: note.reminderRepeat ?? null,
    created: isoOffset(note.createdAt),
    updated: isoOffset(note.updatedAt)
  };
  const parts = [
    heading ? `# ${heading}` : '',
    documentToMarkdown(note.content, 1),
    `<!-- notka: ${JSON.stringify(metadata)} -->`
  ].filter((part) => part !== '');
  return `${parts.join('\n\n')}\n`;
}

/** A file name for the note: its title, or [fallback] when it has none. */
export function noteFileName(title: string, fallback: string): string {
  const name = title.trim() || fallback;
  return name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60).trim() || fallback;
}

function readMetadata(raw: string | undefined): NoteFileMetadata {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as NoteFileMetadata) : {};
  } catch {
    return {};
  }
}

function readTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** The title and tags of a `# …` line, tags read from its end. */
function readHeading(line: string): { title: string; tags: string[] } {
  let rest = line;
  const tags: string[] = [];
  for (let match = TAG.exec(rest); match; match = TAG.exec(rest)) {
    const name = (match[1] ?? match[2] ?? '').trim();
    if (name) tags.unshift(name);
    rest = rest.slice(0, match.index);
  }
  return { title: unescapeTitle(rest.trim()), tags };
}

/**
 * Reads a file into a note. Whatever the metadata does not say — or says in a way this app does not
 * know — falls back to a plain note: a colour that is not ours is the default colour, not an error.
 */
export function noteFromFile(text: string): NoteFile {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const metadataMatch = METADATA.exec(normalized);
  const metadata = readMetadata(metadataMatch?.[1]);
  let body = metadataMatch ? normalized.slice(0, metadataMatch.index) : normalized;

  let title = '';
  let tags: string[] = [];
  const first = /^\s*# (.*)(?:\n|$)/.exec(body);
  if (first) {
    ({ title, tags } = readHeading(first[1] ?? ''));
    body = body.slice(first[0].length);
  }

  const content = documentFromMarkdown(body.replace(/^\n+/, '').replace(/\n+$/, ''), first ? 1 : 0);
  const filled = content.blocks.filter((block) => block.spans.some((span) => span.text.trim()));
  const looksLikeList = filled.length > 0 && filled.every((block) => block.type === 'checklist');
  const reminderAt = readTimestamp(metadata.reminderAt);

  return {
    title,
    tags: [...new Set(tags)],
    kind: metadata.kind === 'LIST' || metadata.kind === 'TEXT' ? metadata.kind : looksLikeList ? 'LIST' : 'TEXT',
    content,
    color: (NOTE_COLORS as readonly string[]).includes(metadata.color ?? '') ? (metadata.color as NoteColor) : 'default',
    background: (NOTE_BACKGROUNDS as readonly string[]).includes(metadata.background ?? '')
      ? (metadata.background as NoteBackground)
      : null,
    pinned: metadata.pinned === true,
    archived: metadata.archived === true,
    reminderAt,
    reminderRepeat:
      reminderAt !== null && REPEATS.includes(metadata.reminderRepeat as ReminderRepeat)
        ? (metadata.reminderRepeat as ReminderRepeat)
        : null
  };
}

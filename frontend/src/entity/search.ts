import { NOTE_COLORS } from './api/types';
import type { Note, NoteColor } from './api/types';

/**
 * The search page's filters, the original's "Types", "Labels" and "Colors": a note either is the
 * kind of thing asked for, carries the label, or wears the colour. Pure, so the grid and the page
 * that offers the filters agree on what each one means.
 */
export type SearchType = 'reminders' | 'lists' | 'images' | 'urls';

export const SEARCH_TYPES: readonly SearchType[] = ['reminders', 'lists', 'images', 'urls'];

export type SearchFilter =
  | { kind: 'type'; type: SearchType }
  | { kind: 'label'; labelId: number }
  | { kind: 'color'; color: NoteColor };

/** What the notes at hand offer to filter by, in the order the page shows it. */
export interface SearchFacets {
  types: SearchType[];
  labelIds: number[];
  colors: NoteColor[];
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;

function hasLink(note: Note): boolean {
  return note.content.blocks.some((block) =>
    block.spans.some((span) => Boolean(span.link) || URL_IN_TEXT.test(span.text))
  );
}

function isType(note: Note, type: SearchType): boolean {
  switch (type) {
    case 'reminders':
      return note.reminderAt != null;
    case 'lists':
      return note.kind === 'LIST';
    case 'images':
      return (note.images?.length ?? 0) > 0;
    case 'urls':
      return hasLink(note);
  }
}

export function matchesFilter(note: Note, filter: SearchFilter): boolean {
  switch (filter.kind) {
    case 'type':
      return isType(note, filter.type);
    case 'label':
      return note.labels.some((label) => label.id === filter.labelId);
    case 'color':
      return note.color === filter.color;
  }
}

/** Only what some note actually has is offered: a filter that would show nothing is left out. */
export function searchFacets(notes: readonly Note[]): SearchFacets {
  const labelIds: number[] = [];
  for (const note of notes) {
    for (const label of note.labels) {
      if (!labelIds.includes(label.id)) labelIds.push(label.id);
    }
  }
  return {
    types: SEARCH_TYPES.filter((type) => notes.some((note) => isType(note, type))),
    labelIds,
    colors: NOTE_COLORS.filter((color) => notes.some((note) => note.color === color))
  };
}

/** The address a filter lives at, so a filtered search survives a reload and the back button. */
export function searchFilterPath(filter: SearchFilter): string {
  switch (filter.kind) {
    case 'type':
      return `/search/${filter.type}`;
    case 'label':
      return `/search/labels/${filter.labelId}`;
    case 'color':
      return `/search/colors/${filter.color}`;
  }
}

/** The filter a `/search/…` address names, or `null` for the plain search page. */
export function parseSearchFilter(path: string): SearchFilter | null {
  const type = path.match(/^\/search\/(reminders|lists|images|urls)$/)?.[1] as SearchType | undefined;
  if (type) return { kind: 'type', type };
  const labelId = path.match(/^\/search\/labels\/(\d+)$/)?.[1];
  if (labelId) return { kind: 'label', labelId: Number(labelId) };
  const color = path.match(/^\/search\/colors\/([a-z]+)$/)?.[1];
  if (color && (NOTE_COLORS as readonly string[]).includes(color)) {
    return { kind: 'color', color: color as NoteColor };
  }
  return null;
}

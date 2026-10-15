import { MAX_BLOCK_DEPTH } from './api/types';
import type { BlockType, NoteBlock, NoteDocument, NoteSpan } from './api/types';
import { newBlockId } from './noteDocument';

/**
 * Two-way bridge between the internal {@link NoteDocument} format and Markdown.
 *
 * `documentToMarkdown` writes a note's body for the Markdown export; `documentFromMarkdown` reads one
 * back for the import. The two are each other's inverse for everything this app writes — the
 * round-trip tests hold them to that — and the reader is lenient with Markdown written elsewhere.
 * Typing Markdown in the editor is Tiptap's own input rules, not this module.
 */

const HEADING_LEVELS: Partial<Record<BlockType, number>> = {
  heading1: 1,
  heading2: 2,
  heading3: 3
};

const LIST_MARKERS: Partial<Record<BlockType, string>> = {
  bulleted: '- ',
  checklist: '- [ ] '
};

/* ------------------------------------------------------------------------------- export */

/** Escapes the characters that would otherwise be interpreted as Markdown syntax. */
export function escapeMarkdownText(text: string, atLineStart = false): string {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/([`*_[\]~])/g, '\\$1')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (!atLineStart) return escaped;

  // A paragraph that happens to start with something like "1. " or "# " must not turn into a list.
  return escaped.replace(/^(\s*)([#>+\-=]|\d+[.)]|[-*])/, '$1\\$2');
}

function spanToMarkdown(span: NoteSpan, atLineStart = false): string {
  // Inside a code span every character is literal in Markdown, so it is written as it is: escaping
  // it would put the backslashes on screen.
  let text = span.code
    ? `\`${span.text.replace(/`/g, '')}\``
    : escapeMarkdownText(span.text, atLineStart);

  if (span.bold) text = `**${text}**`;
  if (span.italic) text = `*${text}*`;
  if (span.strikethrough) text = `~~${text}~~`;
  if (span.underline) text = `<u>${text}</u>`;
  if (span.link) text = `[${text}](${span.link})`;

  return text;
}

function blockToMarkdown(block: NoteBlock, headingOffset: number): string {
  const headingLevel = HEADING_LEVELS[block.type];
  const isLineStart = headingLevel === undefined && block.type === 'paragraph';
  const body = block.spans.map((span) => spanToMarkdown(span)).join('');

  if (headingLevel !== undefined) {
    const level = Math.min(6, headingLevel + headingOffset);
    return `${'#'.repeat(level)} ${body}`.trimEnd();
  }

  // A nested line is indented far enough for both bullet and ordered parents, which is what
  // CommonMark asks for.
  const indent = '    '.repeat(block.depth ?? 0);

  if (block.type === 'checklist') {
    return `${indent}- [${block.checked ? 'x' : ' '}] ${body}`;
  }

  if (block.type === 'bulleted') {
    return `${indent}${LIST_MARKERS.bulleted}${body}`;
  }

  if (block.type === 'numbered') {
    return `${indent}1. ${body}`;
  }

  return block.spans
    .map((span, index) => spanToMarkdown(span, isLineStart && index === 0))
    .join('');
}

function isListLike(type: BlockType): boolean {
  return type === 'bulleted' || type === 'numbered' || type === 'checklist';
}

/** Consecutive items of the same list type stay adjacent; switching type starts a new list. */
function continuesList(previous: NoteBlock | undefined, current: NoteBlock): boolean {
  return previous !== undefined && previous.type === current.type && isListLike(current.type);
}

/**
 * Renders a note document as Markdown.
 *
 * Each block becomes one line; consecutive list items stay adjacent, while paragraph-like blocks
 * are separated by a blank line so that a Markdown renderer keeps them as distinct paragraphs.
 *
 * @param headingOffset shifts heading levels, used by {@link noteToMarkdown} so the note title can
 *   own `#` without colliding with the document's own headings.
 */
export function documentToMarkdown(document: NoteDocument, headingOffset = 0): string {
  const lines: string[] = [];

  document.blocks.forEach((block, index) => {
    const previous = document.blocks[index - 1];
    if (previous !== undefined && !continuesList(previous, block)) lines.push('');
    lines.push(blockToMarkdown(block, headingOffset));
  });

  return lines.join('\n');
}

/** Renders a whole note, title included, as a standalone Markdown document. */
export function noteToMarkdown(note: { title: string; content: NoteDocument }): string {
  const title = note.title.trim();
  const body = documentToMarkdown(note.content, 1);
  if (!title) return `${body}\n`;
  return `# ${escapeMarkdownText(title, true)}\n\n${body}\n`;
}

/* ------------------------------------------------------------------------------- import */

type SpanFlags = Omit<NoteSpan, 'text'>;

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&' };

/** The inline markers this app writes, longest first so `**` is never read as two `*`. */
const TOGGLES: ReadonlyArray<{ marker: string; flag: 'bold' | 'italic' | 'strikethrough' }> = [
  { marker: '**', flag: 'bold' },
  { marker: '__', flag: 'bold' },
  { marker: '~~', flag: 'strikethrough' },
  { marker: '*', flag: 'italic' },
  { marker: '_', flag: 'italic' }
];

function sameFlags(a: SpanFlags, b: SpanFlags): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.strikethrough === !!b.strikethrough &&
    !!a.code === !!b.code &&
    !!a.underline === !!b.underline &&
    (a.link ?? '') === (b.link ?? '')
  );
}

function withFlags(text: string, flags: SpanFlags): NoteSpan {
  const span: NoteSpan = { text };
  if (flags.bold) span.bold = true;
  if (flags.italic) span.italic = true;
  if (flags.strikethrough) span.strikethrough = true;
  if (flags.code) span.code = true;
  if (flags.underline) span.underline = true;
  if (flags.link) span.link = flags.link;
  return span;
}

/**
 * Reads one line of inline Markdown into styled spans: `**bold**`, `*italic*` / `_italic_`,
 * `~~strike~~`, `` `code` ``, `<u>underline</u>`, `[text](url)` and backslash escapes. A marker
 * opens only when it is closed later on the line, so a stray `*` stays a character.
 */
export function inlineFromMarkdown(line: string, inherited: SpanFlags = {}): NoteSpan[] {
  const spans: NoteSpan[] = [];
  const flags: SpanFlags = { ...inherited };
  let text = '';

  const flush = (): void => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last && sameFlags(last, flags)) last.text += text;
    else spans.push(withFlags(text, flags));
    text = '';
  };
  const append = (more: NoteSpan[]): void => {
    for (const span of more) {
      const last = spans[spans.length - 1];
      if (last && sameFlags(last, span)) last.text += span.text;
      else spans.push(span);
    }
  };

  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    const char = line[i] ?? '';

    if (char === '\\' && i + 1 < line.length) {
      text += line[i + 1];
      i += 2;
      continue;
    }

    const entity = Object.keys(ENTITIES).find((name) => rest.startsWith(name));
    if (entity) {
      text += ENTITIES[entity];
      i += entity.length;
      continue;
    }

    if (char === '`') {
      const end = line.indexOf('`', i + 1);
      if (end > i) {
        flush();
        append([withFlags(line.slice(i + 1, end), { ...flags, code: true })]);
        i = end + 1;
        continue;
      }
    }

    if (char === '[') {
      const link = /^\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)/.exec(rest);
      if (link) {
        flush();
        append(inlineFromMarkdown(link[1] ?? '', { ...flags, link: link[2] }));
        i += link[0].length;
        continue;
      }
    }

    if (rest.startsWith('<u>') && line.indexOf('</u>', i + 3) > i) {
      flush();
      flags.underline = true;
      i += 3;
      continue;
    }
    if (rest.startsWith('</u>') && flags.underline) {
      flush();
      flags.underline = false;
      i += 4;
      continue;
    }

    const toggle = TOGGLES.find(({ marker }) => rest.startsWith(marker));
    if (toggle) {
      const { marker, flag } = toggle;
      const closes = flags[flag] === true;
      if (closes || line.indexOf(marker, i + marker.length) > i) {
        flush();
        flags[flag] = !closes;
        i += marker.length;
        continue;
      }
    }

    text += char;
    i += 1;
  }

  flush();
  return spans;
}

interface ParsedLine {
  type: BlockType;
  depth: number;
  checked?: boolean;
  text: string;
}

/** One line of a note body as a block, or `null` for a blank line. */
function parseLine(raw: string, headingOffset: number): ParsedLine | null {
  if (raw.trim() === '') return null;
  const indent = /^[ \t]*/.exec(raw)?.[0] ?? '';
  const width = indent.replace(/\t/g, '    ').length;
  const depth = width >= 2 ? MAX_BLOCK_DEPTH : 0;
  const line = raw.slice(indent.length);

  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  if (heading) {
    const level = Math.min(3, Math.max(1, (heading[1]?.length ?? 1) - headingOffset));
    return { type: `heading${level}` as BlockType, depth: 0, text: heading[2] ?? '' };
  }
  const task = /^[-*+]\s+\[( |x|X)\]\s?(.*)$/.exec(line);
  if (task) {
    return { type: 'checklist', depth, checked: (task[1] ?? '').toLowerCase() === 'x', text: task[2] ?? '' };
  }
  const bullet = /^[-*+]\s+(.*)$/.exec(line);
  if (bullet) return { type: 'bulleted', depth, text: bullet[1] ?? '' };
  const numbered = /^\d{1,9}[.)]\s+(.*)$/.exec(line);
  if (numbered) return { type: 'numbered', depth, text: numbered[1] ?? '' };
  return { type: 'paragraph', depth: 0, text: line };
}

/**
 * Reads a note body written as Markdown — by {@link documentToMarkdown} or by anything else.
 *
 * Each line is a block, as in the stored format. Between two blocks one blank line is only a
 * separator; every further pair of blank lines is an empty paragraph, which is exactly how
 * {@link documentToMarkdown} writes one, so the empty lines of a note survive the round trip.
 *
 * @param headingOffset how many levels the writer shifted headings by (a note file's title owns `#`).
 */
export function documentFromMarkdown(markdown: string, headingOffset = 0): NoteDocument {
  const blocks: NoteBlock[] = [];
  let blankRun = 0;

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const parsed = parseLine(raw, headingOffset);
    if (parsed === null) {
      blankRun += 1;
      continue;
    }
    if (blocks.length > 0) {
      for (let empty = 0; empty < Math.floor((blankRun - 1) / 2); empty += 1) {
        blocks.push({ id: newBlockId(), type: 'paragraph', spans: [] });
      }
    }
    blankRun = 0;
    const block: NoteBlock = { id: newBlockId(), type: parsed.type, spans: inlineFromMarkdown(parsed.text) };
    if (parsed.type === 'checklist') block.checked = parsed.checked === true;
    if (isListLike(parsed.type)) block.depth = parsed.depth;
    blocks.push(block);
  }

  return { version: 1, blocks: blocks.length > 0 ? blocks : [{ id: newBlockId(), type: 'paragraph', spans: [] }] };
}

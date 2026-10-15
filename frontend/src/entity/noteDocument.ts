import { MAX_BLOCK_DEPTH } from './api/types';
import type { BlockType, NoteBlock, NoteDocument, NoteKind, NoteSpan } from './api/types';

/**
 * Helpers for the structured note document. See `docs/DATA-MODEL.md`.
 *
 * Nothing here touches the DOM or the network, which keeps the format easy to test and easy to
 * reuse for the future Markdown export.
 */

let blockCounter = 0;

/** Block ids only need to be unique inside one document; a counter keeps them readable. */
export function newBlockId(): string {
  blockCounter += 1;
  return `b${blockCounter.toString(36)}${Date.now().toString(36).slice(-4)}`;
}

export function createBlock(type: BlockType = 'paragraph', text = '', depth = 0): NoteBlock {
  const block: NoteBlock = {
    id: newBlockId(),
    type,
    spans: text ? [{ text }] : []
  };
  if (type === 'checklist') block.checked = false;
  if (isListBlock(type)) block.depth = clampDepth(depth);
  return block;
}

/** Whether a line is a list line: only those carry a `depth` (the server refuses it anywhere else). */
export function isListBlock(type: BlockType): boolean {
  return type === 'bulleted' || type === 'numbered' || type === 'checklist';
}

/**
 * The number each numbered line shows, by block id: a list counts from 1, any other line ends it,
 * and an indented run counts on its own under the line above it.
 */
export function listNumbers(blocks: readonly NoteBlock[]): Map<string, number> {
  const numbers = new Map<string, number>();
  let counters: number[] = [];
  for (const block of blocks) {
    if (block.type !== 'numbered') {
      counters = [];
      continue;
    }
    const depth = clampDepth(block.depth);
    counters = counters.slice(0, depth + 1);
    counters[depth] = (counters[depth] ?? 0) + 1;
    numbers.set(block.id, counters[depth]);
  }
  return numbers;
}

export function clampDepth(depth: number | undefined): number {
  if (!Number.isFinite(depth)) return 0;
  return Math.min(Math.max(Math.trunc(depth as number), 0), MAX_BLOCK_DEPTH);
}

export function createEmptyDocument(): NoteDocument {
  return { version: 1, blocks: [createBlock('paragraph')] };
}

export function createEmptyListDocument(): NoteDocument {
  return { version: 1, blocks: [createBlock('checklist')] };
}

/**
 * The same note in the other kind — "Hide checkboxes" and "Show checkboxes".
 *
 * **A line that stops being a list line loses its indent and its tick**, and a paragraph that becomes
 * a list line starts at the top level and unchecked. That is not tidiness: the server refuses a
 * document in which any block other than a list line carries a `depth` (`NoteDocument.validate`,
 * "cannot be indented"), so converting a list note whose row was indented — which is one Tab away —
 * used to fail the write with "the note content is not valid" and change nothing at all.
 *
 * Only the kinds of line that *mean* a checkbox change: a checklist row becomes a paragraph and a
 * paragraph becomes a checklist row. Headings and bulleted or numbered lines are their own
 * constructs and stay what they are, with the indent they are allowed to keep.
 */
export function withKind(document: NoteDocument, kind: NoteKind): NoteDocument {
  const toList = kind === 'LIST';
  return {
    version: 1,
    blocks: document.blocks.map((block) => {
      if (toList && block.type === 'paragraph') {
        return { ...block, type: 'checklist' as const, checked: false };
      }
      if (!toList && block.type === 'checklist') {
        return { ...block, type: 'paragraph' as const, checked: undefined, depth: undefined };
      }
      return { ...block };
    })
  };
}

/** The list note's "Uncheck all items": every row is open again, and stays where it is. */
export function uncheckAll(document: NoteDocument): NoteDocument {
  return {
    version: 1,
    blocks: document.blocks.map((block) =>
      block.type === 'checklist' && block.checked ? { ...block, checked: false } : { ...block }
    )
  };
}

/**
 * The list note's "Delete checked items".
 *
 * A row that was indented under a row now gone keeps its indent only while there is still a list row
 * above it to sit under (rule 4): the first row of a list is at the top level. A note left with
 * nothing gets one empty row, so it is still a list.
 */
export function withoutChecked(document: NoteDocument): NoteDocument {
  const kept = document.blocks.filter((block) => !(block.type === 'checklist' && block.checked));
  const blocks = kept.map((block, index) => {
    const above = kept[index - 1];
    const orphaned = (block.depth ?? 0) > 0 && (!above || !isListBlock(above.type));
    return orphaned ? { ...block, depth: 0 } : { ...block };
  });
  return { version: 1, blocks: blocks.length > 0 ? blocks : [createBlock('checklist')] };
}

/**
 * Defensive normalization for documents coming from the API. The server validates the shape,
 * but a client-side normalize keeps rendering code free of null checks.
 */
export function normalizeDocument(document: NoteDocument | null | undefined): NoteDocument {
  const blocks = document?.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return createEmptyDocument();
  }
  return {
    version: 1,
    blocks: blocks.map((block) => ({
      id: block.id || newBlockId(),
      type: block.type ?? 'paragraph',
      checked: block.type === 'checklist' ? Boolean(block.checked) : undefined,
      depth: isListBlock(block.type) ? clampDepth(block.depth) : undefined,
      spans: Array.isArray(block.spans)
        ? block.spans.filter((span) => typeof span?.text === 'string').map((span) => ({ ...span }))
        : []
    }))
  };
}

export function blockPlainText(block: NoteBlock): string {
  return block.spans.map((span) => span.text).join('');
}

export function documentPlainText(document: NoteDocument): string {
  return document.blocks.map(blockPlainText).join('\n');
}

export function isDocumentEmpty(document: NoteDocument): boolean {
  return document.blocks.every((block) => blockPlainText(block).trim().length === 0);
}

export function spansFromText(text: string): NoteSpan[] {
  return text ? [{ text }] : [];
}

/** Shallow equality for the editor's dirty check. Documents are small, so this is cheap enough. */
export function documentsEqual(a: NoteDocument, b: NoteDocument): boolean {
  if (a.blocks.length !== b.blocks.length) return false;
  for (let index = 0; index < a.blocks.length; index += 1) {
    const left = a.blocks[index];
    const right = b.blocks[index];
    if (!left || !right) return false;
    if (left.type !== right.type) return false;
    if (Boolean(left.checked) !== Boolean(right.checked)) return false;
    if ((left.depth ?? 0) !== (right.depth ?? 0)) return false;
    if (left.spans.length !== right.spans.length) return false;
    for (let spanIndex = 0; spanIndex < left.spans.length; spanIndex += 1) {
      const leftSpan = left.spans[spanIndex];
      const rightSpan = right.spans[spanIndex];
      if (!leftSpan || !rightSpan) return false;
      if (
        leftSpan.text !== rightSpan.text ||
        Boolean(leftSpan.bold) !== Boolean(rightSpan.bold) ||
        Boolean(leftSpan.italic) !== Boolean(rightSpan.italic) ||
        Boolean(leftSpan.underline) !== Boolean(rightSpan.underline) ||
        Boolean(leftSpan.strikethrough) !== Boolean(rightSpan.strikethrough) ||
        Boolean(leftSpan.code) !== Boolean(rightSpan.code) ||
        (leftSpan.link ?? '') !== (rightSpan.link ?? '')
      ) {
        return false;
      }
    }
  }
  return true;
}
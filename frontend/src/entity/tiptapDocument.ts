import type { JSONContent } from '@tiptap/core';
import type { BlockType, NoteBlock, NoteDocument, NoteSpan } from './api/types';
import { clampDepth, newBlockId } from './noteDocument';

/**
 * Translation between the stored `NoteDocument` and the ProseMirror document Tiptap edits.
 *
 * `NoteDocument` stays the only persisted shape (see `docs/DATA-MODEL.md`): it is what the server
 * validates, what the version guard compares, and what a Markdown export will read. Tiptap gets a
 * document built from it and hands one back on every change.
 *
 * A list is **flat on both sides**: one line is one list item, and how far it is indented is the
 * line's own `depth`, not a list nested inside another list. That is the original's own model — its
 * checklist rows are independent items carrying an indent, which is why one row can be moved without
 * dragging a family of rows with it — and it is why `MAX_BLOCK_DEPTH` can be a rule rather than a
 * guard: a flat item has nowhere to put a second level.
 *
 * Block ids are ours alone — ProseMirror has no place for them — so they are regenerated here.
 * Nothing compares them (`documentsEqual` deliberately ignores them), and that keeps a round trip
 * from looking like an edit.
 */

/** Our span flag → the ProseMirror mark that carries it. */
const HIGHLIGHT_MARKS = [
  ['bold', 'bold'],
  ['italic', 'italic'],
  ['underline', 'underline'],
  ['strikethrough', 'strike'],
  ['code', 'code']
] as const satisfies readonly (readonly [keyof NoteSpan, string])[];

type PmMark = { type: string; attrs?: Record<string, unknown> };

/** The list a block type belongs to in ProseMirror, or `null` when it stands on its own. */
function listFor(type: BlockType): 'bulletList' | 'orderedList' | 'taskList' | null {
  if (type === 'bulleted') return 'bulletList';
  if (type === 'numbered') return 'orderedList';
  if (type === 'checklist') return 'taskList';
  return null;
}

function headingLevelFor(type: BlockType): number | null {
  if (type === 'heading1') return 1;
  if (type === 'heading2') return 2;
  if (type === 'heading3') return 3;
  return null;
}

function spansToContent(spans: NoteSpan[]): JSONContent[] {
  const content: JSONContent[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const marks: PmMark[] = [];
    for (const [flag, mark] of HIGHLIGHT_MARKS) {
      if (span[flag]) marks.push({ type: mark });
    }
    if (span.link) marks.push({ type: 'link', attrs: { href: span.link } });
    content.push(marks.length > 0 ? { type: 'text', text: span.text, marks } : { type: 'text', text: span.text });
  }
  return content;
}

function textNode(spans: NoteSpan[]): JSONContent {
  const content = spansToContent(spans);
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

function blockToNode(block: NoteBlock): JSONContent {
  const level = headingLevelFor(block.type);
  if (level === null) return textNode(block.spans);
  const content = spansToContent(block.spans);
  return content.length > 0
    ? { type: 'heading', attrs: { level }, content }
    : { type: 'heading', attrs: { level } };
}

function itemToNode(block: NoteBlock): JSONContent {
  const depth = clampDepth(block.depth);
  if (block.type === 'checklist') {
    return {
      type: 'taskItem',
      attrs: { checked: Boolean(block.checked), depth },
      content: [textNode(block.spans)]
    };
  }
  return { type: 'listItem', attrs: { depth }, content: [textNode(block.spans)] };
}

type ListType = 'bulletList' | 'orderedList' | 'taskList';

export function toProseMirror(document: NoteDocument): JSONContent {
  const nodes: JSONContent[] = [];
  /** The list currently open, so consecutive lines of one kind share it. */
  let open: { type: ListType; node: JSONContent } | null = null;

  for (const block of document.blocks) {
    const type = listFor(block.type);
    if (type === null) {
      open = null;
      nodes.push(blockToNode(block));
      continue;
    }

    if (open === null || open.type !== type) {
      open = { type, node: { type, content: [] } };
      nodes.push(open.node);
    }
    open.node.content = [...(open.node.content ?? []), itemToNode(block)];
  }

  return { type: 'doc', content: nodes.length > 0 ? nodes : [{ type: 'paragraph' }] };
}

/* ------------------------------------------------------------------------- back into our shape */

function spanFromNode(node: JSONContent): NoteSpan | null {
  if (node.type !== 'text' || typeof node.text !== 'string' || node.text.length === 0) return null;
  const span: NoteSpan = { text: node.text };
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') span.bold = true;
    else if (mark.type === 'italic') span.italic = true;
    else if (mark.type === 'underline') span.underline = true;
    else if (mark.type === 'strike') span.strikethrough = true;
    else if (mark.type === 'code') span.code = true;
    else if (mark.type === 'link') {
      const href = mark.attrs?.href;
      if (typeof href === 'string') span.link = href;
    }
  }
  return span;
}

/** Adjacent spans that carry the same styling are one span, which keeps the stored JSON small. */
function sameStyle(a: NoteSpan, b: NoteSpan): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    Boolean(a.strikethrough) === Boolean(b.strikethrough) &&
    Boolean(a.code) === Boolean(b.code) &&
    (a.link ?? '') === (b.link ?? '')
  );
}

function spansFromNodes(nodes: JSONContent[] | undefined): NoteSpan[] {
  const spans: NoteSpan[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      const previous = spans[spans.length - 1];
      if (previous) previous.text += '\n';
      continue;
    }
    const span = spanFromNode(node);
    if (!span) continue;
    const previous = spans[spans.length - 1];
    if (previous && sameStyle(previous, span)) previous.text += span.text;
    else spans.push(span);
  }
  return spans;
}

function blockFromParagraph(node: JSONContent): NoteBlock {
  return { id: newBlockId(), type: 'paragraph', spans: spansFromNodes(node.content) };
}

function listTypeOf(node: JSONContent): BlockType {
  if (node.type === 'bulletList') return 'bulleted';
  if (node.type === 'orderedList') return 'numbered';
  return 'checklist';
}

/** The item's own indent, and — for a document that arrived nested — the level it sits at. */
function itemDepth(item: JSONContent, structural: number): number {
  const own = Number(item.attrs?.depth ?? 0);
  return clampDepth(Math.max(Number.isFinite(own) ? own : 0, structural));
}

function isListNode(type: string | undefined): boolean {
  return type === 'bulletList' || type === 'orderedList' || type === 'taskList';
}

/**
 * One line per item, at that item's own indent. An item with several paragraphs (which the editor
 * allows) becomes several lines on the same level rather than losing any of them; a list nested
 * inside an item — which our schema no longer draws, but a pasted or older document may still carry —
 * is read one level deeper.
 */
function blocksFromList(node: JSONContent, blocks: NoteBlock[], level = 0): void {
  const type = listTypeOf(node);
  for (const item of node.content ?? []) {
    const depth = itemDepth(item, level);
    for (const child of item.content ?? []) {
      if (child.type === 'paragraph') {
        const block: NoteBlock = {
          id: newBlockId(),
          type,
          depth,
          spans: spansFromNodes(child.content)
        };
        if (type === 'checklist') block.checked = Boolean(item.attrs?.checked);
        blocks.push(block);
        continue;
      }
      if (isListNode(child.type)) blocksFromList(child, blocks, depth + 1);
    }
  }
}

/**
 * Walks the document into our flat lines. A node the schema grew later is not dropped: its children
 * are walked the same way, so the words survive even when the shape around them is unknown.
 */
function collect(nodes: JSONContent[], blocks: NoteBlock[]): void {
  for (const node of nodes) {
    if (!node.type) continue;
    if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList') {
      blocksFromList(node, blocks);
      continue;
    }
    if (node.type === 'heading') {
      const level = Number(node.attrs?.level ?? 1);
      const type: BlockType = level === 2 ? 'heading2' : level === 3 ? 'heading3' : 'heading1';
      blocks.push({ id: newBlockId(), type, spans: spansFromNodes(node.content) });
      continue;
    }
    if (node.type === 'paragraph') {
      blocks.push(blockFromParagraph(node));
      continue;
    }
    // Text sitting directly in a leaf we do not model, e.g. a code block.
    if ((node.content ?? []).some((child) => child.type === 'text')) {
      blocks.push({ id: newBlockId(), type: 'paragraph', spans: spansFromNodes(node.content) });
      continue;
    }
    collect(node.content ?? [], blocks);
  }
}

export function fromProseMirror(json: JSONContent | null | undefined): NoteDocument {
  const blocks: NoteBlock[] = [];
  collect(json?.content ?? [], blocks);
  if (blocks.length === 0) blocks.push({ id: newBlockId(), type: 'paragraph', spans: [] });
  return { version: 1, blocks };
}

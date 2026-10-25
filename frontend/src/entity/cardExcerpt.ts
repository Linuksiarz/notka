import type { NoteBlock, NoteDocument, NoteSpan } from './api/types';

/**
 * How much of a long note a card shows: both originals cut a card's text after the last whole word
 * that fits and end it with "…" (docs/METRICS.md, "Long notes"). The web original gives a card's title
 * and text 426px together — 16 lines of text under a one-line title, 15 under a two-line one — and the
 * Android app the text alone 10 lines, whatever the title.
 */
export const CARD_TEXT_ROOM = 426;
export const CARD_TITLE_PADDING = 16;
export const PHONE_CARD_TEXT_LINES = 10;

/** How many lines of text a desktop card has under a title of [titleHeight] px (0 without one). */
export function cardTextLines(titleHeight: number, lineHeight: number): number {
  const title = titleHeight > 0 ? titleHeight + CARD_TITLE_PADDING : 0;
  return Math.max(1, Math.floor((CARD_TEXT_ROOM - title) / lineHeight));
}

export const ELLIPSIS = '…';

/** Every character a card could show, counted the way {@link excerpt} counts them. */
export function excerptLength(document: NoteDocument): number {
  return document.blocks.reduce((sum, block) => sum + blockLength(block), 0);
}

function blockLength(block: NoteBlock): number {
  return block.spans.reduce((sum, span) => sum + span.text.length, 0);
}

/**
 * The first [chars] characters of [document], cut back to the end of the last whole word and ended
 * with "…" — or the document itself when it is no longer than that. Blocks after the cut are left out;
 * the cut block keeps its type, depth and marks, so the card draws it as it draws the rest.
 *
 * A cut that falls between two blocks is where the originals differ: the web one puts the "…" on a
 * line of its own (`ellipsisLine`), the Android app at the end of the last line it shows.
 */
export function excerpt(document: NoteDocument, chars: number, ellipsisLine = true): NoteDocument {
  if (chars >= excerptLength(document)) return document;
  const blocks: NoteBlock[] = [];
  let left = Math.max(0, chars);
  for (const block of document.blocks) {
    const length = blockLength(block);
    if (left >= length && left > 0) {
      blocks.push(block);
      left -= length;
      continue;
    }
    const previous = blocks[blocks.length - 1];
    if (left === 0 && previous && !ellipsisLine) {
      blocks[blocks.length - 1] = { ...previous, spans: cutSpans(previous.spans, blockLength(previous)) };
    } else {
      blocks.push({ ...block, spans: cutSpans(block.spans, left, blocks.length === 0) });
    }
    break;
  }
  return { ...document, blocks };
}

/**
 * The spans of a block cut after [chars] characters, back to a word's end, with "…" after them. Only
 * the note's first block keeps part of a word, when it is one word too long to show whole (an address,
 * say): later, a word that does not fit is left out, as the originals leave it.
 */
function cutSpans(spans: NoteSpan[], chars: number, partialWord = false): NoteSpan[] {
  const text = spans.map((span) => span.text).join('');
  let end = chars;
  // A word cut in two is cut before it instead, as the originals do; a block that is one long word
  // keeps what fits rather than showing nothing.
  if (end > 0 && end < text.length && /\S/.test(text.charAt(end))) {
    const space = text.lastIndexOf(' ', end);
    if (space > 0) end = space;
    else if (!partialWord) end = 0;
  }
  while (end > 0 && /\s/.test(text.charAt(end - 1))) end -= 1;

  const cut: NoteSpan[] = [];
  let left = end;
  for (const span of spans) {
    if (left <= 0) break;
    const kept = span.text.slice(0, left);
    cut.push({ ...span, text: kept });
    left -= kept.length;
  }
  const last = cut[cut.length - 1];
  if (last) cut[cut.length - 1] = { ...last, text: last.text + ELLIPSIS };
  else cut.push({ text: ELLIPSIS });
  return cut;
}

import { describe, expect, it } from 'vitest';
import type { NoteDocument } from './api/types';
import { cardTextLines, excerpt, excerptLength } from './cardExcerpt';

const doc = (...lines: string[]): NoteDocument => ({
  version: 1,
  blocks: lines.map((text, index) => ({ id: `b${index}`, type: 'paragraph', spans: [{ text }] }))
});

const texts = (document: NoteDocument) => document.blocks.map((block) => block.spans.map((span) => span.text).join(''));

describe('cardTextLines', () => {
  it('gives the web original’s 16 lines under a one-line title and 15 under a two-line one', () => {
    // given: a 25px title line and a 24px text line

    // when
    const one = cardTextLines(25, 24);
    const two = cardTextLines(50, 24);
    const none = cardTextLines(0, 24);

    // then
    expect([one, two, none]).toEqual([16, 15, 17]);
  });
});

describe('excerpt', () => {
  it('leaves a note that fits as it is', () => {
    // given
    const note = doc('Milk', 'Bread');

    // when
    const cut = excerpt(note, excerptLength(note));

    // then
    expect(cut).toBe(note);
  });

  it('cuts after the last whole word and ends with an ellipsis, dropping the blocks after it', () => {
    // given
    const note = doc('Line one', 'Line two is longer than that', 'Line three');

    // when: the budget ends inside "longer"
    const cut = excerpt(note, 'Line one'.length + 'Line two is lon'.length);

    // then
    expect(texts(cut)).toEqual(['Line one', 'Line two is…']);
  });

  it('puts the ellipsis on a line of its own between blocks on the web, after the last line on a phone', () => {
    // given
    const note = doc('L01', 'L02', 'L03');

    // when
    const web = excerpt(note, 6);
    const phone = excerpt(note, 6, false);

    // then
    expect(texts(web)).toEqual(['L01', 'L02', '…']);
    expect(texts(phone)).toEqual(['L01', 'L02…']);
  });

  it('leaves out a one-word line that does not fit, but keeps what fits of a first line that is one word', () => {
    // given
    const note = doc('L01', 'L02');
    const address = doc('https://example.com/a/very/long/address');

    // when
    const later = excerpt(note, 5);
    const first = excerpt(address, 8);

    // then
    expect(texts(later)).toEqual(['L01', '…']);
    expect(texts(first)).toEqual(['https://…']);
  });

  it('keeps the marks of the spans it keeps', () => {
    // given
    const note: NoteDocument = {
      version: 1,
      blocks: [{ id: 'a', type: 'bulleted', depth: 1, spans: [{ text: 'bold words ', bold: true }, { text: 'plain tail here' }] }]
    };

    // when
    const cut = excerpt(note, 'bold words plain t'.length);

    // then
    expect(cut.blocks[0]).toEqual({
      id: 'a',
      type: 'bulleted',
      depth: 1,
      spans: [{ text: 'bold words ', bold: true }, { text: 'plain…' }]
    });
  });
});

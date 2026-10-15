import { describe, expect, it } from 'vitest';
import type { NoteDocument } from './api/types';
import {
  listNumbers,
  blockPlainText,
  createBlock,
  createEmptyDocument,
  createEmptyListDocument,
  documentPlainText,
  documentsEqual,
  isDocumentEmpty,
  isListBlock,
  normalizeDocument,
  uncheckAll,
  withKind,
  withoutChecked
} from './noteDocument';

describe('createBlock', () => {
  it('marks checklist blocks as unchecked', () => {
    // given / when
    const block = createBlock('checklist');

    // then
    expect(block.checked).toBe(false);
    expect(block.spans).toEqual([]);
  });

  it('leaves non-checklist blocks without a checked flag', () => {
    // given / when
    const block = createBlock('heading1', 'Title');

    // then
    expect(block.checked).toBeUndefined();
    expect(block.spans).toEqual([{ text: 'Title' }]);
  });
});

describe('empty documents', () => {
  it('starts a text note with one paragraph', () => {
    // given / when
    const document = createEmptyDocument();

    // then
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]?.type).toBe('paragraph');
  });

  it('starts a list note with one checklist item', () => {
    // given / when
    const document = createEmptyListDocument();

    // then
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]?.type).toBe('checklist');
  });
});

describe('normalizeDocument', () => {
  it('replaces a missing document with an empty one', () => {
    // given / when
    const document = normalizeDocument(null);

    // then
    expect(document.blocks).toHaveLength(1);
  });

  it('drops spans that are not text and keeps the rest', () => {
    // given
    const broken = {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          spans: [{ text: 'keep' }, { text: undefined }, { bold: true }]
        }
      ]
    } as unknown as NoteDocument;

    // when
    const document = normalizeDocument(broken);

    // then
    expect(document.blocks[0]?.spans).toEqual([{ text: 'keep' }]);
  });

  it('drops the checked flag from a non-checklist block', () => {
    // given
    const document = normalizeDocument({
      version: 1,
      blocks: [{ id: 'b1', type: 'paragraph', checked: true, spans: [{ text: 'x' }] }]
    });

    // when / then
    expect(document.blocks[0]?.checked).toBeUndefined();
  });
});

describe('plain text helpers', () => {
  it('joins span text', () => {
    // given
    const block = {
      id: 'b1',
      type: 'paragraph' as const,
      spans: [{ text: 'Hello ' }, { text: 'world', bold: true }]
    };

    // when / then
    expect(blockPlainText(block)).toBe('Hello world');
  });

  it('joins blocks with newlines', () => {
    // given
    const document: NoteDocument = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'paragraph', spans: [{ text: 'one' }] },
        { id: 'b2', type: 'paragraph', spans: [{ text: 'two' }] }
      ]
    };

    // when / then
    expect(documentPlainText(document)).toBe('one\ntwo');
  });

  it('treats whitespace-only content as empty', () => {
    // given
    const document: NoteDocument = {
      version: 1,
      blocks: [{ id: 'b1', type: 'paragraph', spans: [{ text: '   ' }] }]
    };

    // when / then
    expect(isDocumentEmpty(document)).toBe(true);
  });
});

describe('documentsEqual', () => {
  it('compares block types, checked flags and span styles', () => {
    // given
    const left: NoteDocument = {
      version: 1,
      blocks: [{ id: 'b1', type: 'paragraph', spans: [{ text: 'a', bold: true }] }]
    };

    // when / then
    expect(documentsEqual(left, structuredClone(left))).toBe(true);

    expect(
      documentsEqual(left, {
        version: 1,
        blocks: [{ id: 'b1', type: 'paragraph', spans: [{ text: 'a' }] }]
      })
    ).toBe(false);

    expect(
      documentsEqual(left, {
        version: 1,
        blocks: [{ id: 'b1', type: 'heading1', spans: [{ text: 'a', bold: true }] }]
      })
    ).toBe(false);
  });
});

describe('withKind', () => {
  /** The server's own rule, mirrored: only list lines may carry a depth (`NoteDocument.validate`). */
  const indentedNonListLines = (document: NoteDocument) =>
    document.blocks.filter((block) => (block.depth ?? 0) > 0 && !isListBlock(block.type));

  it('drops the indent and the tick of a line that stops being a list line', () => {
    // given: a checklist with an indented, ticked row — one Tab and one click away from any note
    const list: NoteDocument = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'checklist', checked: false, depth: 0, spans: [{ text: 'parent' }] },
        { id: 'b2', type: 'checklist', checked: true, depth: 1, spans: [{ text: 'child' }] }
      ]
    };

    // when
    const text = withKind(list, 'TEXT');

    // then: the server would refuse an indented paragraph, so neither the indent nor the tick survives
    expect(text.blocks.map((block) => block.type)).toEqual(['paragraph', 'paragraph']);
    expect(indentedNonListLines(text)).toEqual([]);
    expect(text.blocks.every((block) => block.depth === undefined && block.checked === undefined)).toBe(true);
    expect(documentPlainText(text)).toBe('parent\nchild');
  });

  it('starts every line of a new list at the top level and unchecked', () => {
    // given
    const text: NoteDocument = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'paragraph', spans: [{ text: 'one' }] },
        { id: 'b2', type: 'paragraph', spans: [{ text: 'two' }] }
      ]
    };

    // when
    const list = withKind(text, 'LIST');

    // then
    expect(list.blocks.map((block) => [block.type, block.depth, block.checked])).toEqual([
      ['checklist', undefined, false],
      ['checklist', undefined, false]
    ]);
  });

  it('leaves headings and bulleted lines as they are', () => {
    // given: a note that mixes a heading, a bullet and a checklist row
    const mixed: NoteDocument = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'heading1', spans: [{ text: 'Title' }] },
        { id: 'b2', type: 'bulleted', depth: 1, spans: [{ text: 'bullet' }] },
        { id: 'b3', type: 'checklist', checked: true, depth: 0, spans: [{ text: 'row' }] }
      ]
    };

    // when
    const text = withKind(mixed, 'TEXT');

    // then: a heading is not a checkbox and a bullet is its own construct — only the row changes
    expect(text.blocks.map((block) => block.type)).toEqual(['heading1', 'bulleted', 'paragraph']);
    expect(indentedNonListLines(text)).toEqual([]);
  });

  it('round trips a note through the other kind without leaving an indent behind', () => {
    // given
    const list = createEmptyListDocument();
    list.blocks = [
      { id: 'b1', type: 'checklist', checked: false, depth: 0, spans: [{ text: 'one' }] },
      { id: 'b2', type: 'checklist', checked: true, depth: 1, spans: [{ text: 'two' }] }
    ];

    // when
    const back = withKind(withKind(list, 'TEXT'), 'LIST');

    // then
    expect(indentedNonListLines(back)).toEqual([]);
    expect(back.blocks.every((block) => block.depth === undefined || isListBlock(block.type))).toBe(true);
    expect(back.blocks.some((block) => block.depth === 1)).toBe(false);
  });
});

describe('listNumbers', () => {
  it('counts each list from one, whatever stands above it', () => {
    // given
    const blocks = [
      { id: 'p', type: 'paragraph' as const, spans: [] },
      { id: 'a', type: 'numbered' as const, depth: 0, spans: [] },
      { id: 'b', type: 'numbered' as const, depth: 1, spans: [] },
      { id: 'c', type: 'numbered' as const, depth: 1, spans: [] },
      { id: 'd', type: 'numbered' as const, depth: 0, spans: [] },
      { id: 'q', type: 'paragraph' as const, spans: [] },
      { id: 'e', type: 'numbered' as const, depth: 0, spans: [] }
    ];

    // when
    const numbers = listNumbers(blocks);

    // then
    expect([...numbers.entries()]).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 2],
      ['d', 2],
      ['e', 1]
    ]);
  });
});

describe('list actions', () => {
  const row = (text: string, checked: boolean, depth = 0) => ({ ...createBlock('checklist', text, depth), checked });

  it('unchecks every row and leaves the order alone', () => {
    // given
    const document: NoteDocument = { version: 1, blocks: [row('a', true), row('b', false), row('c', true, 1)] };

    // when
    const result = uncheckAll(document);

    // then
    expect(result.blocks.map((block) => [blockPlainText(block), block.checked, block.depth])).toEqual([
      ['a', false, 0],
      ['b', false, 0],
      ['c', false, 1]
    ]);
  });

  it('deletes the checked rows and lifts a row that has nothing left above it', () => {
    // given
    const document: NoteDocument = {
      version: 1,
      blocks: [row('parent', true), row('child', false, 1), row('other', false), row('nested', false, 1)]
    };

    // when
    const result = withoutChecked(document);

    // then
    expect(result.blocks.map((block) => [blockPlainText(block), block.depth])).toEqual([
      ['child', 0],
      ['other', 0],
      ['nested', 1]
    ]);
  });

  it('leaves one empty row when every row was checked', () => {
    // given
    const document: NoteDocument = { version: 1, blocks: [row('a', true)] };

    // when
    const result = withoutChecked(document);

    // then
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.type).toBe('checklist');
    expect(blockPlainText(result.blocks[0]!)).toBe('');
  });
});

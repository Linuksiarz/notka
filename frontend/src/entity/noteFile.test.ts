import { describe, expect, it } from 'vitest';
import type { NoteBlock, NoteDocument } from './api/types';
import { noteFromFile, noteToFile } from './noteFile';

/** Block ids are generated on import, so a comparison looks at everything else. */
function shape(document: NoteDocument): Omit<NoteBlock, 'id'>[] {
  return document.blocks.map(({ id: _id, ...rest }) => rest);
}

const RICH: NoteDocument = {
  version: 1,
  blocks: [
    { id: 'a', type: 'heading1', spans: [{ text: 'Plan' }] },
    {
      id: 'b',
      type: 'paragraph',
      spans: [
        { text: 'Buy ' },
        { text: 'milk', bold: true },
        { text: ', ' },
        { text: 'eggs', italic: true, strikethrough: true },
        { text: ' and ' },
        { text: 'x*y_[z]', code: true },
        { text: ' — ' },
        { text: 'under', underline: true },
        { text: ' ' },
        { text: 'site', link: 'https://example.com/a?b=c' },
        { text: ' 1 < 2 > 0 \\ * _ ~' }
      ]
    },
    { id: 'c', type: 'paragraph', spans: [] },
    { id: 'd', type: 'paragraph', spans: [{ text: '# not a heading' }] },
    { id: 'e', type: 'checklist', checked: false, depth: 0, spans: [{ text: 'Kitchen' }] },
    { id: 'f', type: 'checklist', checked: true, depth: 1, spans: [{ text: 'Tap' }] },
    { id: 'g', type: 'bulleted', depth: 0, spans: [{ text: 'one' }] },
    { id: 'h', type: 'bulleted', depth: 1, spans: [{ text: 'two' }] },
    { id: 'i', type: 'numbered', depth: 0, spans: [{ text: 'first' }] },
    { id: 'j', type: 'heading3', spans: [{ text: 'End' }] }
  ]
};

const NOTE = {
  title: 'Groceries #1 for C#',
  content: RICH,
  kind: 'TEXT' as const,
  color: 'yellow' as const,
  background: 'food' as const,
  pinned: true,
  archived: false,
  reminderAt: Date.UTC(2026, 9, 14, 6, 0),
  reminderRepeat: 'weekly' as const,
  createdAt: Date.UTC(2026, 0, 1),
  updatedAt: Date.UTC(2026, 9, 13)
};

describe('note files', () => {
  it('reads back exactly the note it wrote', () => {
    // given
    const file = noteToFile(NOTE, ['home', 'weekly shop'], );

    // when
    const read = noteFromFile(file);

    // then
    expect(read.title).toBe(NOTE.title);
    expect(read.tags).toEqual(['home', 'weekly shop']);
    expect(shape(read.content)).toEqual(shape(RICH));
    expect(read).toMatchObject({
      kind: 'TEXT',
      color: 'yellow',
      background: 'food',
      pinned: true,
      archived: false,
      reminderAt: NOTE.reminderAt,
      reminderRepeat: 'weekly'
    });
  });

  it('writes the tags after the title and the metadata in a comment at the end', () => {
    // given / when
    const file = noteToFile({ ...NOTE, title: 'Groceries', content: { version: 1, blocks: [] } }, [
      'home',
      'weekly shop'
    ]);

    // then
    expect(file.startsWith('# Groceries #home #[[weekly shop]]\n')).toBe(true);
    expect(file.trimEnd().endsWith('-->')).toBe(true);
    expect(file).toContain('<!-- notka: {"kind":"TEXT","color":"yellow"');
  });

  it('reads a plain Markdown file from elsewhere as a note', () => {
    // given: Obsidian/Logseq-style, no metadata
    const file = '# Weekend #trip\n\n- [ ] Tickets\n- [x] Hotel\n';

    // when
    const read = noteFromFile(file);

    // then
    expect(read).toMatchObject({ title: 'Weekend', tags: ['trip'], kind: 'LIST', color: 'default', pinned: false });
    expect(shape(read.content)).toEqual([
      { type: 'checklist', checked: false, depth: 0, spans: [{ text: 'Tickets' }] },
      { type: 'checklist', checked: true, depth: 0, spans: [{ text: 'Hotel' }] }
    ]);
  });

  it('takes a file without a title line as a body, headings and all', () => {
    // given
    const file = '## Not a title\nSome text';

    // when
    const read = noteFromFile(file);

    // then
    expect(read.title).toBe('');
    expect(shape(read.content).map((block) => block.type)).toEqual(['heading2', 'paragraph']);
  });

  it('ignores metadata it does not understand', () => {
    // given
    const file = '# A\n\ntext\n\n<!-- notka: {"color":"neon","background":"space","kind":"POEM","reminderRepeat":"hourly"} -->\n';

    // when
    const read = noteFromFile(file);

    // then
    expect(read).toMatchObject({ color: 'default', background: null, kind: 'TEXT', reminderAt: null, reminderRepeat: null });
  });
});

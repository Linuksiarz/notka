import { describe, expect, it } from 'vitest';
import type { NoteDocument } from './api/types';
import {
  documentToMarkdown,
  escapeMarkdownText,
  noteToMarkdown
} from './markdown';

function doc(blocks: NoteDocument['blocks']): NoteDocument {
  return { version: 1, blocks };
}

describe('documentToMarkdown', () => {
  it('renders every block type to its Markdown equivalent', () => {
    // given
    const document = doc([
      { id: '1', type: 'heading1', spans: [{ text: 'Title' }] },
      { id: '2', type: 'heading2', spans: [{ text: 'Subtitle' }] },
      { id: '3', type: 'heading3', spans: [{ text: 'Detail' }] },
      { id: '4', type: 'bulleted', spans: [{ text: 'first' }] },
      { id: '5', type: 'bulleted', spans: [{ text: 'second' }] },
      { id: '6', type: 'numbered', spans: [{ text: 'steps' }] },
      { id: '7', type: 'checklist', checked: true, spans: [{ text: 'done' }] },
      { id: '8', type: 'checklist', checked: false, spans: [{ text: 'todo' }] }
    ]);

    // when
    const markdown = documentToMarkdown(document);

    // then
    expect(markdown).toBe(
      [
        '# Title',
        '',
        '## Subtitle',
        '',
        '### Detail',
        '',
        '- first',
        '- second',
        '',
        '1. steps',
        '',
        '- [x] done',
        '- [ ] todo'
      ].join('\n')
    );
  });

  it('renders inline styles, links and underline', () => {
    // given
    const document = doc([
      {
        id: '1',
        type: 'paragraph',
        spans: [
          { text: 'bold', bold: true },
          { text: ' ' },
          { text: 'italic', italic: true },
          { text: ' ' },
          { text: 'struck', strikethrough: true },
          { text: ' ' },
          { text: 'code', code: true },
          { text: ' ' },
          { text: 'under', underline: true },
          { text: ' ' },
          { text: 'link', link: 'https://example.com' }
        ]
      }
    ]);

    // when
    const markdown = documentToMarkdown(document);

    // then
    expect(markdown).toBe(
      '**bold** *italic* ~~struck~~ `code` <u>under</u> [link](https://example.com)'
    );
  });

  it('shifts heading levels so a note title can own the first level', () => {
    // given
    const note = {
      title: 'Groceries',
      content: doc([{ id: '1', type: 'heading1', spans: [{ text: 'Section' }] }])
    };

    // when
    const markdown = noteToMarkdown(note);

    // then
    expect(markdown).toBe('# Groceries\n\n## Section\n');
  });

  it('escapes text that would otherwise be read as Markdown syntax', () => {
    // given
    const document = doc([{ id: '1', type: 'paragraph', spans: [{ text: '5 * 3 = 15' }] }]);

    // when
    const markdown = documentToMarkdown(document);

    // then
    expect(markdown).toBe('5 \\* 3 = 15');
  });

  it('escapes a paragraph that starts with a list-like prefix', () => {
    // given / when / then
    expect(escapeMarkdownText('1. not a list', true)).toBe('\\1. not a list');
    expect(escapeMarkdownText('1. not a list', false)).toBe('1. not a list');
  });

  it('produces a document with only the title when the body is empty', () => {
    // given
    const note = {
      title: 'Empty note',
      content: doc([{ id: '1', type: 'paragraph', spans: [] }])
    };

    // when
    const markdown = noteToMarkdown(note);

    // then
    expect(markdown).toBe('# Empty note\n\n\n');
  });
});

describe('nested lists', () => {
  it('indents a nested line in the export', () => {
    // given: a checklist with a child line, and a bulleted line one level in - the deepest the original nests
    const document = doc([
      { id: 'a', type: 'checklist', checked: false, depth: 0, spans: [{ text: 'parent' }] },
      { id: 'b', type: 'checklist', checked: true, depth: 1, spans: [{ text: 'child' }] },
      { id: 'c', type: 'bulleted', depth: 0, spans: [{ text: 'outer' }] },
      { id: 'd', type: 'bulleted', depth: 1, spans: [{ text: 'deep' }] }
    ]);

    // when
    const markdown = documentToMarkdown(document);

    // then
    expect(markdown).toContain('- [ ] parent');
    expect(markdown).toContain('    - [x] child');
    expect(markdown).toContain('- outer');
    expect(markdown).toContain('    - deep');
  });
});


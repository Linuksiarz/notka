import { describe, expect, it } from 'vitest';
import { blockPlainText } from './noteDocument';
import { sharedNoteRequest } from './sharedNote';

const bodyLines = (request: ReturnType<typeof sharedNoteRequest>) =>
  request?.content?.blocks.map((block) => blockPlainText(block)) ?? [];

describe('sharedNoteRequest', () => {
  it('turns the subject into the title and every line of the text into a paragraph', () => {
    // given
    const shared = { title: 'Groceries', text: 'milk\r\nbread\nbutter', url: '' };

    // when
    const request = sharedNoteRequest(shared);

    // then
    expect(request?.kind).toBe('TEXT');
    expect(request?.title).toBe('Groceries');
    expect(bodyLines(request)).toEqual(['milk', 'bread', 'butter']);
  });

  it('puts a shared link on a line of its own under the text', () => {
    // given
    const shared = { title: '', text: 'Worth a read', url: 'https://example.org/article' };

    // when
    const request = sharedNoteRequest(shared);

    // then
    expect(bodyLines(request)).toEqual(['Worth a read', 'https://example.org/article']);
  });

  it('does not repeat a link the text already carries', () => {
    // given
    const shared = { title: 'Article', text: 'Look https://example.org/a', url: 'https://example.org/a' };

    // when
    const request = sharedNoteRequest(shared);

    // then
    expect(bodyLines(request)).toEqual(['Look https://example.org/a']);
  });

  it('gives a note with only a title one empty line of body', () => {
    // given
    const shared = { title: 'Just a title', text: '  ', url: '' };

    // when
    const request = sharedNoteRequest(shared);

    // then
    expect(request?.title).toBe('Just a title');
    expect(bodyLines(request)).toEqual(['']);
  });

  it('makes nothing of a share that carries no text', () => {
    // given
    const shared = { title: ' ', text: '\n', url: '' };

    // when
    const request = sharedNoteRequest(shared);

    // then
    expect(request).toBeNull();
  });
});

import { getSchema } from '@tiptap/core';
import { Node } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { keepGroupsApart, removeEmptyRow } from './checklistKeys';
import { noteBodyExtensions } from './noteSchema';

const schema = getSchema(noteBodyExtensions());

function row(text: string, checked = false, depth = 0) {
  return {
    type: 'taskItem',
    attrs: { checked, depth },
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
  };
}

/** A state with one checklist, the caret at the end of the row at [index]. */
function checklist(rows: Array<[string, boolean?, number?]>, index: number, edge: 'start' | 'end' = 'end'): EditorState {
  const doc = Node.fromJSON(schema, {
    type: 'doc',
    content: [{ type: 'taskList', content: rows.map(([text, checked, depth]) => row(text, checked ?? false, depth ?? 0)) }]
  });
  let pos = 1;
  for (let i = 0; i < index; i += 1) pos += doc.child(0).child(i).nodeSize;
  const line = pos + 1;
  const caret = edge === 'start' ? line + 1 : line + 1 + doc.child(0).child(index).textContent.length;
  return EditorState.create({ doc, selection: TextSelection.create(doc, caret) });
}

function apply(state: EditorState, command: (state: EditorState, dispatch?: (tr: import('@tiptap/pm/state').Transaction) => void) => boolean) {
  let next = state;
  const handled = command(state, (tr) => (next = state.apply(tr)));
  return { handled, state: next };
}

function rows(state: EditorState): string[] {
  const out: string[] = [];
  state.doc.forEach((list) => list.forEach((item) => out.push(`${item.attrs.checked ? 'x' : 'o'}:${item.textContent}`)));
  return out;
}

describe('an empty checklist row', () => {
  it('is removed whole, and the list stays one list', () => {
    // given: an empty row between the active rows and a ticked one
    const state = checklist([['a'], ['b'], ['', false], ['done', true]], 2);

    // when
    const result = apply(state, removeEmptyRow);

    // then: the rows are the same without it, in one list, with the caret at the end of the row above it
    expect(result.handled).toBe(true);
    expect(result.state.doc.childCount).toBe(1);
    expect(rows(result.state)).toEqual(['o:a', 'o:b', 'x:done']);
    const caret = result.state.selection.$from;
    expect(caret.parent.textContent).toBe('b');
    expect(caret.parentOffset).toBe(1);
  });

  it('puts the caret in the next row when it was the first', () => {
    // given
    const state = checklist([['', false], ['b']], 0);

    // when
    const result = apply(state, removeEmptyRow);

    // then
    expect(rows(result.state)).toEqual(['o:b']);
    expect(result.state.selection.$from.parent.textContent).toBe('b');
  });

  it('is removed even when the only rows around it are ticked ones', () => {
    // given: the one unticked row is empty, with ticked rows under it
    const state = checklist([['', false], ['done', true]], 0);

    // when
    const result = apply(state, removeEmptyRow);

    // then: the row is gone (the editor gives up the caret rather than moving it into the ticked row)
    expect(result.handled).toBe(true);
    expect(rows(result.state)).toEqual(['x:done']);
  });

  it('puts the caret above, not in the ticked rows below, when it was the last unticked one', () => {
    // given
    const state = checklist([['a'], ['', false], ['done', true]], 1);

    // when
    const result = apply(state, removeEmptyRow);

    // then
    expect(rows(result.state)).toEqual(['o:a', 'x:done']);
    expect(result.state.selection.$from.parent.textContent).toBe('a');
  });

  it('gives the caret to the row drawn above it, not to a ticked row standing between them', () => {
    // given: Chleb with a ticked Mleko under it — drawn in the completed section — and an empty row
    const state = checklist([['Chleb'], ['Mleko', true, 1], ['', false]], 2);

    // when
    const result = apply(state, removeEmptyRow);

    // then
    expect(rows(result.state)).toEqual(['o:Chleb', 'x:Mleko']);
    expect(result.state.selection.$from.parent.textContent).toBe('Chleb');
  });

  it('stays when it is the only row, so the caret never leaves the list', () => {
    // given / when
    const result = apply(checklist([['', false]], 0), removeEmptyRow);

    // then: the key is consumed and the document is as it was
    expect(result.handled).toBe(true);
    expect(rows(result.state)).toEqual(['o:']);
  });

  it('makes the row below a removed first row a top-level row', () => {
    // given: an empty first row with a nested row under it
    const state = checklist([['', false], ['child', false, 1]], 0);

    // when
    const result = apply(state, removeEmptyRow);

    // then
    expect(result.state.doc.child(0).child(0).attrs.depth).toBe(0);
    expect(rows(result.state)).toEqual(['o:child']);
  });

  it('is not removed while it holds text', () => {
    // given / when
    const result = apply(checklist([['a'], ['b']], 1), removeEmptyRow);

    // then
    expect(result.handled).toBe(false);
  });
});

describe('a join across the ticked rows', () => {
  it('is refused for Delete at the end of the last active row', () => {
    // given: the caret at the end of the last unticked row, a ticked one under it
    const state = checklist([['a'], ['b'], ['done', true]], 1);

    // when / then
    expect(keepGroupsApart('forward')(state)).toBe(true);
  });

  it('is refused for Backspace at the start of the first ticked row', () => {
    // given
    const state = checklist([['a'], ['done', true]], 1, 'start');

    // when / then
    expect(keepGroupsApart('backward')(state)).toBe(true);
  });

  it('is left to the editor between two rows of the same group', () => {
    // given
    const active = checklist([['a'], ['b']], 0);
    const ticked = checklist([['a', true], ['b', true]], 1, 'start');

    // when / then
    expect(keepGroupsApart('forward')(active)).toBe(false);
    expect(keepGroupsApart('backward')(ticked)).toBe(false);
  });

  it('is left to the editor inside a row', () => {
    // given: the caret in the middle of the last active row
    const doc = checklist([['abc'], ['done', true]], 0).doc;
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });

    // when / then
    expect(keepGroupsApart('forward')(state)).toBe(false);
  });
});

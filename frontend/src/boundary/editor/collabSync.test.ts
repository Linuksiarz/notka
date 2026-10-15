import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { Plugin } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { CollabSync, collabPlugin, newClientId, type CollabHost } from './collabSync';

const schema = getSchema([StarterKit]);

function doc(...lines: string[]): ProseMirrorNode {
  return schema.node(
    'doc',
    null,
    lines.map((line) => schema.node('paragraph', null, line ? [schema.text(line)] : []))
  );
}

function lines(node: ProseMirrorNode): string[] {
  const found: string[] = [];
  node.forEach((child) => found.push(child.textContent));
  return found;
}

/** An editor without a view: the state, its transactions and the swap of the collab plugin. */
function editor(start: ProseMirrorNode, version = 0, clientId = newClientId()) {
  let current: Plugin | null = collabPlugin(version, clientId);
  let state = EditorState.create({ doc: start, plugins: [current] });
  const host: CollabHost = {
    get state() {
      return state;
    },
    dispatch(transaction) {
      state = state.apply(transaction);
    },
    setCollabPlugin(plugin) {
      // Out, then in: a plugin whose key the state already carries would keep its old state.
      const others = state.plugins.filter((each) => each !== current);
      state = state.reconfigure({ plugins: others }).reconfigure({ plugins: [...others, plugin] });
      current = plugin;
    }
  };
  const sync = new CollabSync(host, clientId);
  /** Types [text] at the start of line [line] (0-based), the way a keystroke does. */
  const type = (line: number, text: string, at = 0) => {
    let pos = 1;
    for (let index = 0; index < line; index += 1) pos += state.doc.child(index).nodeSize;
    host.dispatch(state.tr.insertText(text, pos + at));
  };
  const caret = (line: number, at: number) => {
    let pos = 1;
    for (let index = 0; index < line; index += 1) pos += state.doc.child(index).nodeSize;
    host.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos + at)));
  };
  return { sync, type, caret, get state() { return state; } };
}

/** The server's side: steps in order, accepted only on top of the version they were made for. */
function authority() {
  const log: Array<{ step: unknown; clientId: string }> = [];
  return {
    log,
    send(editorSync: CollabSync): 'ok' | 'behind' | 'nothing' {
      const outgoing = editorSync.outgoing();
      if (!outgoing) return 'nothing';
      if (outgoing.version !== log.length) return 'behind';
      outgoing.steps.forEach((step) => log.push({ step, clientId: editorSync.clientId }));
      editorSync.confirm(outgoing);
      return 'ok';
    },
    catchUp(editorSync: CollabSync): boolean {
      const missed = log.slice(editorSync.version);
      return editorSync.receive(missed.map((entry) => entry.step), missed.map((entry) => entry.clientId));
    }
  };
}

describe('CollabSync', () => {
  it('merges two people typing into different lines at the same time', () => {
    // given: Ada and Bob have the same two-line note open
    const server = authority();
    const ada = editor(doc('milk', 'bread'));
    const bob = editor(doc('milk', 'bread'));

    // when: both type before either has heard of the other, Ada's write lands first and Bob catches up
    ada.type(0, 'oat ');
    bob.type(1, 'rye ');
    expect(server.send(ada.sync)).toBe('ok');
    expect(server.send(bob.sync)).toBe('behind');
    expect(server.catchUp(bob.sync)).toBe(true);
    expect(server.send(bob.sync)).toBe('ok');
    expect(server.catchUp(ada.sync)).toBe(true);

    // then: both hold both edits, and nothing is left to send
    expect(lines(ada.state.doc)).toEqual(['oat milk', 'rye bread']);
    expect(lines(bob.state.doc)).toEqual(['oat milk', 'rye bread']);
    expect(ada.sync.hasUnsent || bob.sync.hasUnsent).toBe(false);
  });

  it('merges two people typing into the same line, and keeps the caret of the one who was behind', () => {
    // given: one line, Bob's caret at its end
    const server = authority();
    const ada = editor(doc('list'));
    const bob = editor(doc('list'));
    bob.caret(0, 4);

    // when: Ada types in front of the word while Bob types after it
    ada.type(0, 'my ');
    bob.type(0, ' done', 4);
    server.send(ada.sync);
    server.send(bob.sync);
    server.catchUp(bob.sync);
    server.send(bob.sync);
    server.catchUp(ada.sync);

    // then: one line with both, and Bob's caret moved along with their own text
    expect(ada.state.doc.textContent).toBe('my list done');
    expect(bob.state.doc.textContent).toBe('my list done');
    expect(bob.state.selection.from).toBe(1 + 'my list done'.length);
  });

  it('takes its own steps back from the server as a confirmation, not as new text', () => {
    // given: an editor whose write was delivered by somebody else on its behalf (the offline queue)
    const server = authority();
    const ada = editor(doc(''), 0, 'ada');
    ada.type(0, 'queued');
    const outgoing = ada.sync.outgoing();
    outgoing?.steps.forEach((step) => server.log.push({ step, clientId: 'ada' }));

    // when: the editor catches up
    const applied = server.catchUp(ada.sync);

    // then: the text is there once, and it counts as sent
    expect(applied).toBe(true);
    expect(ada.state.doc.textContent).toBe('queued');
    expect(ada.sync.hasUnsent).toBe(false);
    expect(ada.sync.version).toBe(server.log.length);
  });

  it('starts again from a body the server wrote as a whole, keeping what was typed and not sent', () => {
    // given: Bob has typed into the second line and not sent it
    const bob = editor(doc('one', 'two'), 3);
    bob.type(1, 'and ');
    bob.caret(1, 4);

    // when: the server says its body was replaced — the first line was rewritten — at version 7
    bob.sync.restart(doc('ONE', 'two'), 7);

    // then: the server's change and Bob's own are both there, Bob's is still to be sent, the caret held
    expect(lines(bob.state.doc)).toEqual(['ONE', 'and two']);
    expect(bob.sync.version).toBe(7);
    expect(bob.sync.hasUnsent).toBe(true);
    expect(bob.state.selection.from).toBe(1 + 'ONE'.length + 2 + 'and '.length);
  });

  it('refuses steps that do not belong to the body it holds', () => {
    // given: an editor on a short line
    const ada = editor(doc('a'));
    const foreign = { stepType: 'replace', from: 40, to: 40, slice: { content: [{ type: 'text', text: 'x' }] } };

    // when
    const applied = ada.sync.receive([foreign], ['someone']);

    // then: nothing changes, and the caller is told to start again
    expect(applied).toBe(false);
    expect(ada.state.doc.textContent).toBe('a');
  });
});

describe('the note body between editors', () => {
  it('comes back from the stored document exactly as it was, so steps land in the same places', async () => {
    // given: a body with every kind of line and mark the editor makes
    const { getSchema } = await import('@tiptap/core');
    const { noteBodyExtensions } = await import('./noteSchema');
    const { fromProseMirror, toProseMirror } = await import('../../entity/tiptapDocument');
    const bodySchema = getSchema(noteBodyExtensions());
    const body = bodySchema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'plain ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }
          ]
        },
        { type: 'paragraph' },
        {
          type: 'taskList',
          content: [
            { type: 'taskItem', attrs: { checked: false, depth: 0 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'row' }] }] },
            { type: 'taskItem', attrs: { checked: true, depth: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }] }
          ]
        },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', attrs: { depth: 0 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'dot' }] }] }]
        }
      ]
    });

    // when: it is stored and read back by another editor
    const readBack = bodySchema.nodeFromJSON(toProseMirror(fromProseMirror(body.toJSON())));

    // then: the same nodes, the same sizes
    expect(readBack.toJSON()).toEqual(body.toJSON());
    expect(readBack.content.size).toBe(body.content.size);
  });
});

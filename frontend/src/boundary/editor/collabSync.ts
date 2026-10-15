import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState, Plugin, Transaction } from '@tiptap/pm/state';
import { Selection } from '@tiptap/pm/state';
import { Step, Transform } from '@tiptap/pm/transform';
import { collab, getVersion, receiveTransaction, sendableSteps } from 'prosemirror-collab';

/**
 * The note body's side of ProseMirror's own collaboration protocol (`prosemirror-collab`, MIT) —
 * `docs/COLLABORATION.md`. The server is the authority: it numbers the steps of a note's body and
 * accepts an editor's only on top of the version that editor has. An editor that is behind takes the
 * steps it missed in first, and the plugin rebases its own unsent steps over them, so two people
 * typing into one note both keep what they typed and the caret stays where it was.
 *
 * Nothing here talks to the network: the editor component sends and fetches, this keeps the body in
 * step. It works on any `CollabHost`, so the protocol is tested without a browser.
 */
export interface CollabHost {
  readonly state: EditorState;
  dispatch(transaction: Transaction): void;
  /**
   * Puts this plugin in place of the collab plugin the state carries (or adds it), **with a fresh
   * state**: `EditorState.reconfigure` keeps the state of a plugin whose key it already has, so the
   * old one has to go out before the new one comes in — which is what Tiptap's `unregisterPlugin` and
   * `registerPlugin` do.
   */
  setCollabPlugin(plugin: Plugin): void;
}

/** What an editor sends: its unsent steps, over the body version they were made against. */
export interface Outgoing {
  version: number;
  steps: unknown[];
  /** The steps themselves, to confirm once the server has taken them. */
  pending: readonly Step[];
}

/** The collab plugin's name, as Tiptap's `unregisterPlugin` takes it (its key is `collab$`). */
export const COLLAB_PLUGIN_NAME = 'collab';

export class CollabSync {
  readonly clientId: string;
  /** The body at the version the server last confirmed: what the server's own steps apply to. */
  #confirmed: ProseMirrorNode;

  /** [host]'s state already carries [collabPlugin] made with the same [clientId]. */
  constructor(
    private readonly host: CollabHost,
    clientId: string
  ) {
    this.clientId = clientId;
    this.#confirmed = host.state.doc;
  }

  get version(): number {
    return getVersion(this.host.state);
  }

  /** Whether anything typed here has not been taken by the server yet. */
  get hasUnsent(): boolean {
    return sendableSteps(this.host.state) !== null;
  }

  outgoing(): Outgoing | null {
    const sendable = sendableSteps(this.host.state);
    if (!sendable) return null;
    return { version: sendable.version, steps: sendable.steps.map((step) => step.toJSON()), pending: sendable.steps };
  }

  /** The server took these steps of ours: they are now part of the body everyone has. */
  confirm(sent: Outgoing): boolean {
    return this.apply(sent.pending, sent.pending.map(() => this.clientId));
  }

  /**
   * Takes in the steps the server has and this editor does not, in the server's order — somebody
   * else's, or our own sent from elsewhere (a write the offline queue delivered).
   *
   * @returns false when they do not apply to the body this editor holds; the caller then starts
   *   again from the server's body ([restart]).
   */
  receive(steps: readonly unknown[], clientIds: readonly string[]): boolean {
    const schema = this.host.state.schema;
    let parsed: Step[];
    try {
      parsed = steps.map((json) => Step.fromJSON(schema, json));
    } catch {
      return false;
    }
    return this.apply(parsed, clientIds);
  }

  /**
   * Starts again from a body the server wrote as a whole (the log no longer reaches back to this
   * editor's version, or its steps did not apply), at that body's [version] — keeping what was typed
   * here and not sent yet: the difference between the server's body and the one this editor last had
   * confirmed is taken in like anybody's steps, and what is typed here is laid over it.
   */
  restart(server: ProseMirrorNode, version: number): void {
    const remote = diffSteps(this.#confirmed, server);
    if (remote.length > 0) {
      try {
        this.host.dispatch(
          receiveTransaction(this.host.state, remote, remote.map(() => 'server'), { mapSelectionBackward: true })
        );
      } catch {
        // The difference is computed from our own copy, so it applies; a failure here would mean the
        // copy itself is wrong, and the server's body is the one to keep.
        this.load(server, version);
        return;
      }
    }
    this.settle(server, version);
  }

  /**
   * The server confirmed a body as a whole at [version] — the offline queue created the note with what
   * this editor had typed — so that body is what is confirmed now, and only what was typed after it
   * remains to be sent.
   */
  settle(server: ProseMirrorNode, version: number): void {
    const merged = this.host.state.doc;
    const selection = this.host.state.selection.toJSON();
    this.load(server, version);
    const local = diffSteps(server, merged);
    if (local.length === 0) return;
    const transaction = this.host.state.tr;
    local.forEach((step) => transaction.step(step));
    transaction.setSelection(Selection.fromJSON(transaction.doc, selection));
    this.host.dispatch(transaction.setMeta('addToHistory', false));
  }

  /** Takes another body over entirely, at [version] — opening a different note. Nothing is unsent after. */
  load(document: ProseMirrorNode, version: number): void {
    const state = this.host.state;
    const transaction = state.tr.replaceWith(0, state.doc.content.size, document.content);
    this.host.dispatch(transaction.setMeta('addToHistory', false));
    this.host.setCollabPlugin(collabPlugin(version, this.clientId));
    this.#confirmed = this.host.state.doc;
  }

  private apply(steps: readonly Step[], clientIds: readonly (string | number)[]): boolean {
    if (steps.length === 0) return true;
    let confirmed = this.#confirmed;
    for (const step of steps) {
      // A step that does not fit can fail or throw (a position outside the body); either way it is
      // not this body's.
      let result;
      try {
        result = step.apply(confirmed);
      } catch {
        return false;
      }
      if (!result.doc) return false;
      confirmed = result.doc;
    }
    try {
      this.host.dispatch(receiveTransaction(this.host.state, steps, clientIds, { mapSelectionBackward: true }));
    } catch {
      return false;
    }
    this.#confirmed = confirmed;
    return true;
  }
}

/** The collaboration plugin for one editor, at the body [version] it starts from. */
export function collabPlugin(version: number, clientId: string): Plugin {
  return collab({ version, clientID: clientId });
}

/** A name for this editor among everybody else's, which its own steps carry back from the server. */
export function newClientId(): string {
  return crypto.randomUUID();
}

/**
 * The steps that turn [from] into [to]: one replacement of the stretch between the first and the last
 * difference, which is ProseMirror's own way of comparing two bodies (`findDiffStart`/`findDiffEnd`).
 */
export function diffSteps(from: ProseMirrorNode, to: ProseMirrorNode): Step[] {
  const start = from.content.findDiffStart(to.content);
  if (start === null) return [];
  const end = from.content.findDiffEnd(to.content);
  if (!end) return [];
  let { a: endA, b: endB } = end;
  // Where the two ends overlap (text repeated around the change), move both ends past the start.
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  return new Transform(from).replace(start, endA, to.slice(start, endB)).steps;
}

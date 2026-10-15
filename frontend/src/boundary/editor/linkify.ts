import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** An address written in the editor's text: the same shape the server reads out of a document. */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

const TRAILING = /[.,;:!?)\]}'"]+$/;

const key = new PluginKey('notka-linkify');

/**
 * Draws the addresses a note already contains as links.
 *
 * It is a **decoration**, not a mark: the stored document is never rewritten, so opening a note
 * cannot change it (which a mark applied on load would, and that would make every open a write). The
 * editor therefore shows the same thing the card does — an address reads as a link — while what is
 * saved stays exactly what was written. Text typed from here on is linkified by Tiptap's own link
 * extension (`autolink`), which is the one case where a mark really is the right answer.
 */
export const Linkify = Extension.create({
  name: 'notkaLinkify',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, position) => {
              if (!node.isText || !node.text) return;
              for (const match of node.text.matchAll(URL_PATTERN)) {
                const start = position + (match.index ?? 0);
                const length = match[0].replace(TRAILING, '').length;
                if (length > 0) {
                  decorations.push(Decoration.inline(start, start + length, { class: 'auto-link' }));
                }
              }
            });
            return DecorationSet.create(state.doc, decorations);
          }
        }
      })
    ];
  }
});

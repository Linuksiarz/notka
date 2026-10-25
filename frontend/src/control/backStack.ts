/**
 * What the system's Back closes — a phone's gesture or button, the browser's own Back, the APK's
 * (`MainActivity` hands Back to the page) and iOS's edge swipe — innermost first: an open dialog, the
 * drawer, the note being edited. Each open surface owns one entry of the browser's history, at the
 * address it was opened on, which exists only to be popped: Back pops it and the surface closes, rather
 * than the whole app leaving the view under it.
 *
 * The entries are interchangeable (the same address, no state of their own), so all that has to stay
 * true is their number: one per open surface. Surfaces open and close freely, and history is brought to
 * that number once the moment is over (`reconcile`). Doing it eagerly — a pop for the drawer that closes
 * and a push for the settings it opens, in the same task — is what lost the app: the browser resolves
 * the pop's target when it is asked, the push lands on top, and the pop then went one entry too far.
 * Reconciled, the settings simply take the drawer's entry over.
 *
 * A navigation from inside a surface (a view picked in the drawer) takes that surface's entry over for
 * the new address instead of piling one on top of it, so Back from the new view returns to the old one.
 */

interface Layer {
  /** `drawn`: the browser has already drawn the way back itself (iOS's edge swipe slides the page). */
  onBack: (drawn: boolean) => void;
}

const MARK = 'notkaBack';
const layers: Layer[] = [];
/** Our entries in the session history, up to the current one. */
let entries = 0;
/** A pop we asked for is on its way; nothing else is done to history until it arrives. */
let popping = false;
let scheduled = false;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (event) => {
    if (popping) {
      popping = false;
      reconcile();
      return;
    }
    if (entries === 0) return;
    entries -= 1;
    const layer = layers.pop();
    layer?.onBack(event.hasUAVisualTransition === true);
    schedule();
  });
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    reconcile();
  });
}

function reconcile(): void {
  if (popping) return;
  while (entries < layers.length) {
    window.history.pushState({ [MARK]: true }, '');
    entries += 1;
  }
  if (entries > layers.length) {
    popping = true;
    window.history.go(layers.length - entries);
    entries = layers.length;
  }
}

/**
 * Gives an open surface a history entry; the system's Back then calls `onBack` (once) instead of leaving
 * the page. The returned function is for closing it any other way, and does nothing after a Back.
 */
export function claimBack(onBack: (drawn: boolean) => void): () => void {
  const layer: Layer = { onBack };
  layers.push(layer);
  schedule();
  return () => {
    const index = layers.indexOf(layer);
    if (index === -1) return;
    layers.splice(index, 1);
    schedule();
  };
}

/**
 * Called by a navigation: when the current entry is a surface's, the new address replaces it, and the
 * surface it belonged to (the innermost) no longer owns one — closing it afterwards pops nothing.
 */
export function takeOverBackEntry(): boolean {
  const state: unknown = window.history.state;
  if (popping || entries === 0 || !(state && typeof state === 'object' && MARK in state)) return false;
  entries -= 1;
  layers.pop();
  return true;
}

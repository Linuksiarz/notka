<script lang="ts">
  import { untrack } from 'svelte';
  import type { Note } from '../../entity/api/types';
  import { ui } from '../../control/state/ui.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../i18n';
  import EmptyState from './EmptyState.svelte';
  import type { IconName } from './Icon.svelte';
  import NoteCard from './NoteCard.svelte';
  import { MOTION } from '../editor/motion';
  import { masonry } from '../../entity/masonry';
  import { toast } from 'svelte-sonner';
  import { notes as notesState } from '../../control/state/notes.svelte';
  import { tError } from '../i18n';

  interface Props {
    notes: Note[];
    /**
     * A label's view also shows that label's archived notes, under an ARCHIVE heading — the original
     * gathers them into the same view rather than sending you to the archive for them.
     */
    archived?: Note[];
    emptyTitle: string;
    emptyDescription?: string;
    emptyIcon?: IconName;
    variant?: 'default' | 'trash';
    /**
     * A view that is ordered by time (the reminders view) is flat: no Pinned/Others headings, no
     * ARCHIVE half — the headings would cut a chronological list into pieces that mean nothing.
     */
    flat?: boolean;
    /** The illustration's size in the empty state. */
    size?: number;
    /**
     * Whether its cards can be dragged into the reader's own order: a view in the custom order, not
     * the trash, the reminders or a search.
     */
    reorderable?: boolean;
  }

  let {
    notes,
    archived = [],
    emptyTitle,
    emptyDescription,
    emptyIcon = 'lightbulb',
    variant = 'default',
    flat = false,
    size,
    reorderable = false
  }: Props = $props();

  const layout = $derived(ui.layout);

  /**
   * A note that is still being composed is not part of the grid yet, so it must not leave a slot
   * waiting for it — that gap used to appear under the composer as soon as the first autosave
   * stored the draft. A note opened *from* the grid is different: it keeps its box on purpose, so
   * the cards around it do not move.
   */
  let gridElement = $state<HTMLElement | null>(null);

  /**
   * The tick box for bulk selection, drawn by the grid rather than by the card.
   *
   * In the original it is centred on the card's corner and hangs outside it, and a card clips what
   * is drawn inside it (its artwork, its rounded corners). So the grid draws one absolutely
   * positioned box per hovered or selected note, placed from that card's rectangle and centred on
   * its corner.
   */
  let hoveredId = $state<number | null>(null);
  let ticks = $state<Array<{ id: number; x: number; y: number; on: boolean }>>([]);

  function measureTicks(): void {
    const container = gridElement;
    if (!container) return;
    const base = container.getBoundingClientRect();
    const wanted = new Set<number>(ui.selectedNoteIds);
    if (hoveredId !== null) wanted.add(hoveredId);
    const next: Array<{ id: number; x: number; y: number; on: boolean }> = [];
    for (const id of wanted) {
      const card = container.querySelector<HTMLElement>(`.card[data-note-id="${id}"]`);
      if (!card) continue;
      const box = card.getBoundingClientRect();
      next.push({
        id,
        x: box.left - base.left,
        y: box.top - base.top,
        on: ui.selectedNoteIds.includes(id)
      });
    }
    ticks = next;
  }

  $effect(() => {
    hoveredId;
    ui.selectedNoteIds.length;
    shown.length;
    const frame = requestAnimationFrame(measureTicks);
    return () => cancelAnimationFrame(frame);
  });

  // Attached in code rather than in the markup: a `mousemove` handler on a plain container is an
  // accessibility warning, and nothing here is an interaction the container itself should carry.
  $effect(() => {
    const container = gridElement;
    if (!container) return;
    const onMove = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) return;
      // The tick box is the target while the pointer is on its way to it; clearing here would take
      // the box out from under the pointer before it can be clicked.
      if (event.target.closest('.card-tick')) return;
      const card = event.target.closest<HTMLElement>('.card');
      hoveredId = card?.dataset.noteId ? Number(card.dataset.noteId) : null;
    };
    const onLeave = (event: MouseEvent): void => {
      // It also hangs a few pixels outside the grid, so leaving the container *for the tick box* is
      // not leaving at all.
      const to = event.relatedTarget;
      if (to instanceof Element && to.closest('.card-tick')) return;
      hoveredId = null;
    };
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
    };
  });

  /** A design token as a number of pixels (`tokens.css` registers the ones that are expressions). */
  function metric(name: string): number {
    const declared = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return Number.isFinite(declared) ? declared : 0;
  }

  /**
   * The room the notes have. The rail's column changes width at once when it folds or unfolds — only
   * its panel animates, over the notes (`Sidebar.svelte`) — so this is simply the container's width.
   */
  let room = $state(0);
  $effect(() => {
    const grid = gridElement;
    if (!grid) return;
    const container = grid.parentElement ?? grid;
    const measure = (): void => {
      const style = getComputedStyle(container);
      room =
        container.clientWidth -
        (Number.parseFloat(style.paddingLeft) || 0) -
        (Number.parseFloat(style.paddingRight) || 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  });

  /**
   * Google Keep's columns are a **fixed width** with the leftover left over: a column fits only with
   * `--keep-grid-margin` free on both sides of the notes, and the list layout is one column of at most
   * `--keep-list-max-width`. `room` is what makes these re-derive; the tokens follow the viewport.
   */
  const columns = $derived.by(() => {
    if (layout === 'list') return 1;
    const stride = metric('--keep-card-min-width') + metric('--keep-grid-gap');
    const usable = room - 2 * metric('--keep-grid-margin') + metric('--keep-grid-gap');
    return stride > 0 ? Math.max(1, Math.floor(usable / stride)) : 1;
  });
  const columnWidth = $derived.by(() => {
    room;
    const card = metric('--keep-card-min-width');
    if (layout !== 'list') return card;
    return Math.max(card, Math.min(metric('--keep-list-max-width'), room - 2 * metric('--keep-grid-margin')));
  });
  const blockWidth = $derived(columns * (columnWidth + metric('--keep-grid-gap')) - metric('--keep-grid-gap'));

  /**
   * The note open in the floating editor, **as it was when it was opened**.
   *
   * Its card stays in the grid, hidden, so the notes around it keep their places (rule 24) — but a
   * card that followed the note's every save changed height while the note was being written, and
   * the notes under the editor were re-dealt on each autosave. The card is the note's place, not its
   * content: it keeps the opening's shape until the editor closes, and only then does the grid take
   * in what was written, in one move.
   */
  let held = $state<Note | null>(null);
  $effect.pre(() => {
    const id = ui.floatingEditor ? ui.editorNoteId : null;
    untrack(() => {
      held = id === null ? null : held?.id === id ? held : (notes.find((note) => note.id === id) ?? null);
    });
  });

  const shown = $derived.by(() => {
    const listed =
      ui.inComposer && ui.editorNoteId !== null && !ui.settling
        ? notes.filter((note) => note.id !== ui.editorNoteId)
        : notes;
    const opened = held;
    return opened === null ? listed : listed.map((note) => (note.id === opened.id ? opened : note));
  });

  /*
   * What the grid shows, in order: each section's heading, then its notes. One list, not one block per
   * section, so a note that changes sections (pinning, unpinning, archiving in a label's view) is the
   * same element moving rather than one fading out while another scales in — the original slides
   * the card. Like Keep, Pinned/Others appear only once something is pinned, and never in the trash
   * or a time-ordered view.
   */
  interface Section {
    key: 'pinned' | 'others' | 'archive';
    heading: string | null;
    notes: Note[];
  }

  const sections = $derived.by<Section[]>(() => {
    const grouped = variant !== 'trash' && !flat;
    const pinned = arranged('pinned', grouped ? shown.filter((note) => note.pinned) : []);
    const rest = arranged('others', grouped ? shown.filter((note) => !note.pinned) : shown);
    const list: Section[] = [];
    if (pinned.length > 0) list.push({ key: 'pinned', heading: t('notes.pinnedSection'), notes: pinned });
    list.push({ key: 'others', heading: pinned.length > 0 && rest.length > 0 ? t('notes.othersSection') : null, notes: rest });
    const kept = arranged('archive', archived);
    if (kept.length > 0) list.push({ key: 'archive', heading: t('notes.headingArchive'), notes: kept });
    return list;
  });

  /* ------------------------------------------------------------ dragging a card into place */

  /*
   * Native drag and drop (`AGENTS.md`, "What the platform does natively"): the card is `draggable`,
   * the browser draws what is in the hand — and on a phone starts the drag with a held finger, without
   * the page scrolling under it — and the grid only decides where the card would land. A card moves
   * within its own section (Pinned, Others, a label's Archive), the original's own rule; while it is in
   * the hand its place is left empty and the cards around it make room, sliding the grid's usual way.
   */
  let dragged = $state<{ id: number; section: Section['key']; from: number[] } | null>(null);
  /** The dragged card's section in the order it would have if it were dropped now. */
  let dragOrder = $state<number[] | null>(null);
  /** The card whose place stands empty, once the browser has taken its picture of it. */
  let lifted = $state<number | null>(null);

  function arranged(section: Section['key'], list: Note[]): Note[] {
    const order = dragged?.section === section ? dragOrder : null;
    if (!order || order.length !== list.length) return list;
    const byId = new Map(list.map((note) => [note.id, note]));
    const sorted = order.map((id) => byId.get(id)).filter((note): note is Note => note !== undefined);
    return sorted.length === list.length ? sorted : list;
  }

  function canDrag(note: Note): boolean {
    return reorderable && variant !== 'trash' && note.canEdit && !ui.selecting && !ui.editorOpen;
  }

  function slotOf(target: EventTarget | null): { id: number; section: Section['key']; element: HTMLElement } | null {
    const element = target instanceof Element ? target.closest<HTMLElement>('.slot') : null;
    const id = Number(element?.dataset.noteId);
    const section = element?.dataset.section as Section['key'] | undefined;
    return element && section && Number.isFinite(id) ? { id, section, element } : null;
  }

  function endDrag(): void {
    dragged = null;
    dragOrder = null;
    lifted = null;
  }

  $effect(() => {
    const container = gridElement;
    if (!container) return;

    const onDragStart = (event: DragEvent): void => {
      const slot = slotOf(event.target);
      const note = slot ? shown.find((candidate) => candidate.id === slot.id) ?? archived.find((candidate) => candidate.id === slot.id) : undefined;
      if (!slot || !note || !canDrag(note)) return;
      // Firefox only starts a drag that carries some data.
      event.dataTransfer?.setData('text/plain', note.title);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      const from = sections.find((section) => section.key === slot.section)?.notes.map((each) => each.id) ?? [];
      dragged = { id: note.id, section: slot.section, from };
      dragOrder = from;
      // After the browser has taken its picture of the card: what stays behind is its empty place.
      requestAnimationFrame(() => {
        if (dragged?.id === note.id) lifted = note.id;
      });
    };

    const onDragOver = (event: DragEvent): void => {
      const current = dragged;
      const order = dragOrder;
      if (!current || !order) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      const over = slotOf(event.target);
      if (!over || over.id === current.id || over.section !== current.section) return;
      // A card still sliding out of the way is not where the hand meant: taking its place again is how
      // the order would swing back and forth under a still pointer.
      if (over.element.getAnimations().length > 0) return;
      const next = order.filter((id) => id !== current.id);
      next.splice(order.indexOf(over.id), 0, current.id);
      dragOrder = next;
    };

    const onDrop = (event: DragEvent): void => {
      const current = dragged;
      const order = dragOrder;
      if (!current || !order) return;
      event.preventDefault();
      const index = order.indexOf(current.id);
      const unchanged = order.every((id, at) => id === current.from[at]);
      const below = order[index + 1];
      const above = order[index - 1];
      if (!unchanged && (below !== undefined || above !== undefined)) {
        // The store takes the new order before it awaits, so the grid never shows the old one again.
        const moving = notesState.move(current.id, below !== undefined ? { before: below } : { after: above as number });
        moving.catch((error: unknown) => toast.error(tError(error as Error)));
      }
      endDrag();
    };

    container.addEventListener('dragstart', onDragStart);
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);
    container.addEventListener('dragend', endDrag);
    return () => {
      container.removeEventListener('dragstart', onDragStart);
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('drop', onDrop);
      container.removeEventListener('dragend', endDrag);
    };
  });

  type Item = { key: string; heading: string } | { key: string; note: Note; section: Section['key'] };

  const items = $derived<Item[]>(
    sections.flatMap((section) => [
      ...(section.heading === null ? [] : [{ key: `heading-${section.key}`, heading: section.heading }]),
      ...section.notes.map((note) => ({ key: `note-${note.id}`, note, section: section.key }))
    ])
  );

  /** Where each item was put last, so a move can be animated from there. */
  let placed = new Map<string, { x: number; y: number }>();

  /**
   * Places every heading and card, Keep's way (`entity/masonry.ts`), and animates the ones that moved.
   *
   * The positions are our own numbers, so a move is animated from the place we last gave the item —
   * nothing is measured off the screen, which is what the multi-column grid had to do with its FLIP.
   * A new item has no earlier place and simply appears there (with its own entrance). The heights are
   * the cards' own; a card whose height changes — a picture loading, a list folding, a link card
   * arriving — is re-laid out by the observer below, and the notes under it slide.
   */
  /**
   * Places every card. [animate] is false when the room changed rather than the notes — the rail
   * folding, the window resized: the original's notes are in their new places in the same frame
   * (measured 2026-10-15: a card at x=129 is at x=357 synchronously after the click, with only the
   * rail's panel animating), and a whole grid sliding at once is what read as less smooth than it.
   */
  function relayout(animate = true): void {
    const grid = gridElement;
    if (!grid) return;
    const gap = metric('--keep-grid-gap');
    const headingHeight = metric('--keep-heading-height');
    const headingGap = metric('--keep-heading-gap');
    const sectionGap = metric('--keep-section-gap');
    const elements = new Map<string, HTMLElement>();
    for (const element of grid.querySelectorAll<HTMLElement>(':scope > [data-place]')) {
      elements.set(element.dataset.place ?? '', element);
    }

    const next = new Map<string, { x: number; y: number }>();
    let y = 0;
    let first = true;
    for (const section of sections) {
      if (section.heading !== null) {
        // The measured gap is between one section's cards and the next one's; the heading sits in it.
        if (!first) y += sectionGap - headingHeight - headingGap;
        next.set(`heading-${section.key}`, { x: 0, y });
        y += headingHeight + headingGap;
      } else if (!first) {
        y += sectionGap;
      }
      const heights = section.notes.map((note) => elements.get(`note-${note.id}`)?.offsetHeight ?? 0);
      const laid = masonry(heights, columns, columnWidth, gap);
      laid.places.forEach((place, index) => {
        const note = section.notes[index];
        if (note) next.set(`note-${note.id}`, { x: place.x, y: y + place.y });
      });
      y += laid.height;
      first = false;
    }

    grid.style.height = `${y}px`;
    for (const [key, to] of next) {
      const element = elements.get(key);
      if (!element) continue;
      const from = placed.has(key) ? getComputedStyle(element).translate : null;
      const target = `${to.x}px ${to.y}px`;
      element.style.translate = target;
      if (!animate) for (const running of element.getAnimations()) running.cancel();
      if (!from || !ui.animationsAllowed || !animate) continue;
      const before = placed.get(key);
      if (before && before.x === to.x && before.y === to.y) continue;
      for (const running of element.getAnimations()) running.cancel();
      // From where it is on screen right now, which is mid-way when a move is interrupted.
      element.animate([{ translate: from === 'none' ? '0px 0px' : from }, { translate: target }], {
        duration: MOTION.regrid,
        easing: MOTION.standard
      });
    }
    placed = next;
  }

  /** A card that changes height moves the notes under it. */
  const resized = new ResizeObserver(() => relayout());
  const observeSize = (element: HTMLElement) => {
    resized.observe(element);
    return () => resized.unobserve(element);
  };

  /** The columns the grid was last laid out in, to tell a change of room from a change of notes. */
  let laidColumns = 0;
  let laidColumnWidth = 0;

  $effect(() => {
    // Everything a layout depends on; the effect runs once the DOM shows them.
    items;
    columns;
    columnWidth;
    untrack(() => {
      const roomChanged = laidColumns !== 0 && (columns !== laidColumns || columnWidth !== laidColumnWidth);
      laidColumns = columns;
      laidColumnWidth = columnWidth;
      relayout(!roomChanged);
    });
  });

  $effect(() => () => resized.disconnect());
</script>

{#if shown.length === 0 && archived.length === 0}
  <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} {size} />
{:else}
  <div class="sections" class:list={layout === 'list'} bind:this={gridElement} style:width="{blockWidth}px">
    {#each items as item (item.key)}
      {#if 'heading' in item}
        <h2 class="section" data-place={item.key}>{item.heading}</h2>
      {:else}
        <div
          class="slot"
          class:lifted={lifted === item.note.id}
          data-place={item.key}
          data-note-id={item.note.id}
          data-section={item.section}
          draggable={canDrag(item.note) ? 'true' : 'false'}
          style:width="{columnWidth}px"
          {@attach observeSize}
        >
          <NoteCard note={item.note} {variant} beingEdited={item.note.id === ui.editorNoteId} />
        </div>
      {/if}
    {/each}

    {#each ticks as tick (tick.id)}
      <button
        type="button"
        class="card-tick"
        class:on={tick.on}
        style="left: {tick.x}px; top: {tick.y}px"
        aria-label={t('selection.selectNote')}
        aria-pressed={tick.on}
        onclick={() => ui.toggleSelected(tick.id)}
      >
        <Icon name="check" size={18} />
      </button>
    {/each}
  </div>
{/if}

<style>
  /*
   * The notes' own block, a whole number of columns wide and centred; the headings, the cards and the
   * tick boxes are all positioned against it, and `relayout` gives it its height.
   */
  .sections {
    position: relative;
    max-width: calc(100% - 2 * var(--keep-grid-margin));
    margin-left: auto;
    margin-right: auto;
  }

  /*
   * Measured off the original: a 20px light disc with a dark tick, its centre on the card's corner.
   * The disc is the *same* whether the pointer is only over the card or the note is picked — picking
   * it turns the disc on permanently and adds the light line to the card itself (see `NoteCard`).
   */
  .card-tick {
    position: absolute;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    /* The card's corner is the circle's centre. */
    transform: translate(-50%, -50%);
    border: 0;
    border-radius: 50%;
    background: var(--keep-select-fill);
    color: var(--keep-select-tick);
    animation: tick-in var(--keep-duration-short) var(--keep-ease-standard);
  }

  .card-tick.on {
    /* Picked: nothing about the disc changes, only how long it stays. */
    background: var(--keep-select-fill);
  }

  @keyframes tick-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* Every heading and card is placed by `relayout`, with `translate`, from the block's top left. */
  .slot,
  .section {
    position: absolute;
    top: 0;
    left: 0;
  }

  /* The dragged card's own place, left empty while the card is in the hand. */
  .slot.lifted {
    opacity: 0;
  }

  /* The heading introduces the cards that follow it, and it is indented from the cards' left edge:
     measured off the original, its ink starts 16px right of the first column. */
  .section {
    right: 0;
    margin: 0;
    padding-left: 16px;
    color: var(--keep-text-secondary);
    font-size: 11px;
    line-height: var(--keep-heading-height);
    font-weight: 500;
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }

</style>

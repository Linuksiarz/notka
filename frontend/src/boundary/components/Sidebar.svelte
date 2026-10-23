<script lang="ts">
  import type { Route } from '../../control/router.svelte';
  import { labels } from '../../control/state/labels.svelte';
  import { session } from '../../control/state/session.svelte';
  import { ui } from '../../control/state/ui.svelte';
  import { claimBack } from '../../control/backStack';
  import { t } from '../i18n';
  import type { IconName } from './Icon.svelte';
  import Icon from './Icon.svelte';

  /** 24px like the desktop's; 26px in a phone's drawer, as the original's Android app draws them. */
  const navIcon = 24;

  interface Props {
    route: Route;
    onNavigate: (path: string) => void;
    onEditLabels: () => void;
    /** On a phone the settings are the drawer's own last entry, as in the original's Android app. */
    onOpenSettings: () => void;
  }

  let { route, onNavigate, onEditLabels, onOpenSettings }: Props = $props();

  interface NavItem {
    key: 'nav.notes' | 'nav.reminders' | 'nav.editLabels' | 'nav.archive' | 'nav.trash';
    icon: IconName;
    path: string;
    match: Route['name'] | null;
  }

  /**
   * The navigation, in the order the original has it: the labels are part of it, directly under
   * Reminders — not a section of their own below a divider, with Edit labels after them.
   */
  const leadingItems: NavItem[] = [
    { key: 'nav.notes', icon: 'lightbulb', path: '/', match: 'notes' },
    { key: 'nav.reminders', icon: 'bell', path: '/reminders', match: 'reminders' }
  ];

  const trailingItems: NavItem[] = [
    { key: 'nav.editLabels', icon: 'pencil', path: '/labels', match: null },
    { key: 'nav.archive', icon: 'archive', path: '/archive', match: 'archive' },
    { key: 'nav.trash', icon: 'trash', path: '/trash', match: 'trash' }
  ];

  /**
   * Keep widens the folded rail while the pointer is over it, so the labels are readable without
   * committing to the full sidebar.
   */
  let peeking = $state(false);

  /** Long enough that the pointer merely crossing the folded rail does not unfold it. */
  const PEEK_DELAY_MS = 350;
  let peekTimer: ReturnType<typeof setTimeout> | null = null;

  function startPeek(): void {
    if (peekTimer !== null) clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      peekTimer = null;
      peeking = true;
    }, PEEK_DELAY_MS);
  }

  function stopPeek(): void {
    if (peekTimer !== null) clearTimeout(peekTimer);
    peekTimer = null;
    peeking = false;
  }

  function isActive(item: NavItem): boolean {
    return item.match !== null && route.name === item.match;
  }

  /**
   * Escape dismisses the drawer, which is an overlay over the notes. It does not touch the column,
   * and it steps aside for whatever is on top: a dialog, or a note being edited.
   */
  function onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !ui.narrow || !ui.sidebarOpen) return;
    if (event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest('[data-overlay]')) return;
    ui.toggleSidebar(false);
  }

  /**
   * Navigating leaves the column alone on a wide screen (rule 14); only the narrow drawer dismisses
   * itself. "Edit labels" is not a route — it opens a dialog over whatever view is showing.
   */
  // The narrow layout's drawer covers the app, so the system's Back closes it; the column beside the
  // notes on a wide screen is not something to go back from.
  $effect(() => {
    if (ui.sidebarOpen && ui.narrow) return claimBack(() => ui.toggleSidebar(false));
  });

  function go(path: string): void {
    onNavigate(path);
    ui.closeDrawer();
  }
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<!-- The handlers sit on the aside rather than on the rail: `mouseleave` only fires once the
     pointer has left the element *and every descendant*, so a rail that grows wider than its
     parent keeps the peek alive while the pointer is over it. -->
<aside
  class="sidebar"
  class:open={ui.sidebarOpen}
  aria-label={t('app.name')}
  onmouseenter={startPeek}
  onmouseleave={stopPeek}
>
  {#snippet navRow(item: NavItem)}
      <button
        type="button"
        class="item"
        class:active={isActive(item)}
        aria-current={isActive(item) ? 'page' : undefined}
        onclick={() =>
          item.key === 'nav.editLabels' ? (onEditLabels(), ui.closeDrawer()) : go(item.path)}
      >
        <Icon name={item.icon} size={navIcon} />
        <span class="text">{t(item.key)}</span>
      </button>

  {/snippet}

  {#snippet labelRows()}
    {#each labels.labels as label (label.id)}
      <button
        type="button"
        class="item"
        class:active={route.name === 'label' && route.labelId === label.id}
        onclick={() => go(`/labels/${label.id}`)}
      >
        <Icon name="label" size={navIcon} />
        <span class="text">{label.name}</span>
      </button>
    {/each}
  {/snippet}

  {#snippet actionRow(icon: IconName, text: string, action: () => void)}
    <button
      type="button"
      class="item"
      onclick={() => {
        ui.closeDrawer();
        action();
      }}
    >
      <Icon name={icon} size={navIcon} />
      <span class="text">{text}</span>
    </button>
  {/snippet}

  <div class="rail" class:peeking>
  {#if ui.phone}
    <!-- The original's Android drawer: the app's name, then the views, the labels as a section of
         their own with its "Edit", and the archive, the trash and the settings below a second rule. -->
    <p class="drawer-name">{t('app.name')}</p>
    <nav class="nav">
      {#each leadingItems as item (item.key)}
        {@render navRow(item)}
      {/each}
      <hr class="drawer-rule" />
      <div class="drawer-labels">
        <span>{t('nav.labels')}</span>
        <button type="button" onclick={() => (onEditLabels(), ui.closeDrawer())}>
          {t('nav.editLabelsShort')}
        </button>
      </div>
      {@render labelRows()}
      {@render actionRow('plus', t('nav.createLabel'), onEditLabels)}
      <hr class="drawer-rule" />
      {#each trailingItems.filter((item) => item.key !== 'nav.editLabels') as item (item.key)}
        {@render navRow(item)}
      {/each}
      {@render actionRow('settings', t('nav.settings'), onOpenSettings)}
      {#if session.user?.admin}
        {@render actionRow('settings', t('topbar.serverSettings'), () => (ui.serverSettingsOpen = true))}
      {/if}
    </nav>
  {:else}
  <nav class="nav">
    {#each leadingItems as item (item.key)}
      {@render navRow(item)}
    {/each}

    {@render labelRows()}

    {#each trailingItems as item (item.key)}
      {@render navRow(item)}
    {/each}
  </nav>
  {/if}

  <footer class="footer">
    <!-- The theme is chosen in Settings, as in the original; the rail ends with the app's version. -->
    <p class="legal">{t('nav.version', { version: __NOTKA_VERSION__ })}</p>
  </footer>
  </div>
</aside>

{#if ui.sidebarOpen}
  <button
    type="button"
    class="scrim"
    aria-label={t('nav.close')}
    onclick={() => ui.toggleSidebar(false)}
  ></button>
{/if}

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    width: var(--keep-sidebar-width);
    flex: 0 0 auto;
    /* Above the notes, below the header it scrolls under: without a stacking context of its own the
       widened rail loses to the positioned cards beside it. */
    z-index: 20;
    height: calc(100vh - var(--keep-topbar-height));
    position: sticky;
    top: var(--keep-topbar-height);
    background: var(--keep-bg);
    overflow-x: hidden;
    overflow-y: auto;
  }

  .rail {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }

  /*
   * Folded to icons on a wide screen; on a narrow one the rail is a drawer instead, so this must not
   * apply there.
   *
   * Measured off the original (2026-10-15, frame by frame): the column beside the notes takes its new
   * width **at once** — the notes are in their new places in the same frame as the click — and only
   * the rail's panel animates, its width over 150ms on the standard curve, over the notes. Animating
   * the column instead re-laid the whole page out on every frame, which is what made ours less smooth.
   */
  @media (min-width: 901px) {
    .sidebar {
      overflow: visible;
    }

    .sidebar:not(.open) {
      width: var(--keep-sidebar-collapsed-width);
    }

    .rail {
      position: absolute;
      top: 0;
      left: 0;
      width: var(--keep-sidebar-width);
      height: 100%;
      overflow-x: hidden;
      overflow-y: auto;
      background: var(--keep-bg);
      transition: width var(--keep-duration-short) var(--keep-ease-standard);
    }

    .sidebar:not(.open) .rail {
      width: var(--keep-sidebar-collapsed-width);
    }

    .sidebar:not(.open) .rail:not(.peeking) .text,
    .sidebar:not(.open) .rail:not(.peeking) .legal {
      display: none;
    }

    /* Keep draws the icon in a circle here, not in a full-width shelf, and the circle sits at the
       same left edge as the icon in the open sidebar so nothing moves when folding. */
    .sidebar:not(.open) .rail:not(.peeking) .item {
      width: var(--keep-rail-item-size);
      height: var(--keep-rail-item-size);
      margin: 0 0 0 calc(var(--keep-icon-column) - var(--keep-rail-item-size) / 2);
      padding: 0;
      gap: 0;
      justify-content: center;
      border-radius: 50%;
    }

    /* Widened on hover only where there is a pointer to hover with. */
    @media (hover: hover) {
      .sidebar:not(.open) .rail.peeking {
        width: var(--keep-sidebar-width);
        z-index: 60;
        box-shadow: var(--keep-shadow-popover);
      }
    }
  }

  .nav {
    display: flex;
    flex-direction: column;
    padding: 8px 0;
    flex: 1 1 auto;
  }

  .item {
    display: flex;
    align-items: center;
    /* Measured off the original: a 48px row whose icon is centred 39px in and whose label starts at
       85px — ours had the icon at 35 and the label at 70. Both offsets are derived from
       `--keep-icon-column`, so they follow the icon and the label rather than being retyped beside
       them. (Measuring the active pill's height off a screenshot overcounts by a pixel at each end:
       its antialiased edge rows read as amber. The rows here are 48px apart, which is the pill.) */
    gap: calc(var(--keep-nav-label-left) - var(--keep-icon-column) - var(--keep-nav-icon-size) / 2);
    width: 100%;
    height: 48px;
    padding: 0 12px 0 calc(var(--keep-icon-column) - var(--keep-nav-icon-size) / 2);
    margin-right: 8px;
    border-radius: 0 var(--keep-radius-pill) var(--keep-radius-pill) 0;
    color: var(--keep-text);
    text-align: left;
    transition: background-color var(--keep-duration) var(--keep-ease);
  }

  /* Measured off the original's DOM (2026-10-22): a resting entry's glyph is the secondary grey
     (`#5f6368`), the active one's the text's ink, and the labels are Google Sans 500 with 0.25px of
     tracking. */
  .item :global(svg) {
    color: var(--keep-icon);
  }

  .item.active :global(svg) {
    color: inherit;
  }

  .item .text {
    flex: 1 1 auto;
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: 0.25px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item:hover {
    background: var(--keep-hover);
  }

  .item.active {
    background: var(--keep-active);
    color: var(--keep-active-fg);
  }

  .footer {
    flex: 0 0 auto;
    padding-bottom: 8px;
  }

  .legal {
    margin: 4px 0 0 24px;
    font-size: 0.6875rem;
    color: var(--keep-text-secondary);
  }

  .scrim {
    display: none;
  }

  @media (max-width: 900px) {
    /* A drawer covers the window from top to bottom; the column's height leaves room for a header
       the drawer stands over. */
    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      height: 100dvh;
      padding: var(--keep-inset-top) 0 var(--keep-inset-bottom);
      z-index: 70;
      transform: translateX(-100%);
      /* The original's drawer, measured: 150ms on the standard curve, in and out alike. */
      transition:
        transform var(--keep-duration-short) var(--keep-ease-standard),
        box-shadow var(--keep-duration-short) var(--keep-ease-standard);
    }

    /* Only an open drawer casts a shadow: a closed one sits just off the screen's edge, and its shadow
       showed there as a grey strip down the left of the notes. */
    .sidebar.open {
      transform: translateX(0);
      box-shadow: var(--keep-shadow-dialog);
    }

    .scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 65;
      background: rgba(0, 0, 0, 0.32);
    }
  }

  /*
   * A phone's drawer, read off the Android app's resources and measured on the emulator at 412dp
   * (2026-10-22, docs/METRICS.md): `drawer_width` is 304dp below 400dp of screen and 320dp from there,
   * rows 55dp, the active row a pill 12dp in from either side, the 24dp icon 28dp in and the label at
   * 68dp. The 326/59/26/73 it replaced came off a phone whose display was scaled up.
   */
  @media (max-width: 600px) {
    /* The Android app's drawer is its card surface, not the page (measured, both themes). */
    .sidebar {
      width: var(--keep-drawer-width);
      background: var(--keep-surface);
    }

    /* The name stands where the search pill stands beside it: centred in the 64px bar, 20dp in, its
       capitals 14.5dp tall on the emulator — a 20px face. */
    .drawer-name {
      display: flex;
      align-items: center;
      flex: 0 0 auto;
      height: var(--keep-topbar-height);
      margin: 0;
      padding-left: 20px;
      font-size: 1.25rem;
      color: var(--keep-text);
    }

    /* The first row's pill starts right under the name's bar. */
    .nav {
      padding-top: 1px;
    }

    /* A rule is a 16dp band with the line in its middle, `drawer_side_padding` (28dp) in from either side. */
    .drawer-rule {
      width: calc(100% - 2 * var(--keep-drawer-side));
      margin: 7.5px var(--keep-drawer-side);
      border: 0;
      border-top: 1px solid var(--keep-divider);
    }

    /* "Labels" and its "Edit": a 48dp header, the heading 28dp in and the button 24dp from the end. */
    .drawer-labels {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 48px;
      padding: 0 24px 0 var(--keep-drawer-side);
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--keep-phone-glyph);
    }

    .drawer-labels button {
      height: 100%;
      padding: 0 12px;
    }

    /* The Android app's drawer draws its glyphs in the text's own ink (`drawer_unselected_color`). */
    .item :global(svg) {
      color: inherit;
    }

    .item {
      height: var(--keep-drawer-row);
      width: calc(100% - 2 * var(--keep-drawer-pill-inset));
      margin: 0 var(--keep-drawer-pill-inset);
      padding: 0 12px 0 calc(var(--keep-drawer-side) - var(--keep-drawer-pill-inset));
      gap: 16px;
      border-radius: var(--keep-radius-pill);
    }

    /* The Android app's drawer veils the page with 60% black, in both themes (measured 2026-10-17:
       the dark page 30 → 12, the light one 238 → 95). */
    .scrim {
      background: rgba(0, 0, 0, 0.6);
    }
  }
</style>

<script lang="ts">
  import type { Route } from '../../control/router.svelte';
  import { labels } from '../../control/state/labels.svelte';
  import { session } from '../../control/state/session.svelte';
  import { ui } from '../../control/state/ui.svelte';
  import { t } from '../i18n';
  import type { IconName } from './Icon.svelte';
  import Icon from './Icon.svelte';

  /** 24px like the desktop's; 26px in a phone's drawer, as the original's Android app draws them. */
  const navIcon = $derived(ui.phone ? 26 : 24);

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

  .item .text {
    flex: 1 1 auto;
    font-size: 0.875rem;
    font-weight: 500;
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

  /*
   * A phone's drawer, measured off the original's Android app at 412px (2026-10-14): 326px wide,
   * 59px rows, the active row a full pill from 13px to 313px, the icon (26px) centred 43px in and the
   * label starting at 73px.
   */
  @media (max-width: 600px) {
    .sidebar {
      width: 326px;
    }

    /* The name stands where the search pill stands beside it: centred in the 64px bar, 21px in, in
       the 28px face the original's capitals measure (20.5px). */
    .drawer-name {
      display: flex;
      align-items: center;
      flex: 0 0 auto;
      height: var(--keep-topbar-height);
      margin: 0;
      padding-left: 21px;
      font-size: 1.75rem;
      color: var(--keep-text);
    }

    /* The first row's pill starts 36px under the name's centre. */
    .nav {
      padding-top: 4px;
    }

    /* The rules run from 30px to 296px, 8px under the row above them and 17px over the next. */
    .drawer-rule {
      width: calc(100% - 60px);
      margin: 8px 30px 17px;
      border: 0;
      border-top: 1px solid var(--keep-divider);
    }

    /* "Labels" and its "Edit", 30px in from either side of the drawer, over the labels themselves. */
    .drawer-labels {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 34px;
      margin-bottom: 4px;
      padding: 0 43px 0 30px;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--keep-text);
    }

    .drawer-labels button {
      color: inherit;
      font: inherit;
    }

    .item {
      height: 59px;
      width: calc(100% - 26px);
      margin: 0 13px;
      padding: 0 12px 0 calc(43px - 13px - 13px);
      gap: calc(73px - 43px - 13px);
      border-radius: var(--keep-radius-pill);
    }
  }

  @media (max-width: 900px) {
    /* A drawer covers the window from top to bottom; the column's height leaves room for a header
       the drawer stands over. */
    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      height: 100dvh;
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
      border: 0;
    }
  }
</style>

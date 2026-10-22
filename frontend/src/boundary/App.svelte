<script lang="ts">
  import { backgroundThemes } from '../control/state/backgroundThemes.svelte';
  import { onMount, type Component } from 'svelte';
  import { Toaster } from 'svelte-sonner';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import { subscribeToNoteEvents } from '../control/api/events';
  import { router } from '../control/router.svelte';
  import { instance } from '../control/state/instance.svelte';
  import { labels } from '../control/state/labels.svelte';
  import { notes } from '../control/state/notes.svelte';
  import { session } from '../control/state/session.svelte';
  import { ui } from '../control/state/ui.svelte';
  import { t, tError } from './i18n';
  import ComposeFab from './components/ComposeFab.svelte';
  import LabelsDialog from './components/LabelsDialog.svelte';
  import NoteComposer from './components/NoteComposer.svelte';
  import SettingsDialog from './components/SettingsDialog.svelte';
  import ShareDialog from './components/ShareDialog.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import TopBar from './components/TopBar.svelte';
  import LoginView from './routes/LoginView.svelte';
  import NotesView from './routes/NotesView.svelte';
  import RegisterView from './routes/RegisterView.svelte';
  import ResetPasswordView from './routes/ResetPasswordView.svelte';
  import ServerSettingsDialog from './components/ServerSettingsDialog.svelte';
  import { serverAdmin } from '../control/state/serverAdmin.svelte';
  import { pendingWrites } from '../control/state/pendingWrites.svelte';
  import { toast } from 'svelte-sonner';
  import { followSystemBar } from './systemBar';
  import { followVisualViewport } from './visualViewport';
  import { receiveShare } from '../control/receiveShare';

  let booted = $state(false);

  /**
   * The editor — Tiptap and ProseMirror, most of the app's script — is a chunk of its own: the notes
   * are on screen without it. It is fetched as soon as the app starts, so opening a note does not
   * wait for it, and the service worker keeps it for offline use like the rest of the app.
   */
  let NoteEditor = $state<Component | null>(null);
  void import('./components/NoteEditor.svelte').then((module) => {
    NoteEditor = module.default;
    // Once the notes are on screen and the main thread is free, not in the way of the first paint.
    const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 200));
    idle(() => void import('./editor/warmUp').then((warm) => warm.warmUpEditor()));
  });

  const route = $derived(router.route);
  /** The label a route points at, for the header's own title. */
  const labelById = (id: number) => labels.byId(id);

  /** The notes view and a label's view: the composer stands above both of them. */
  const notesLikeRoute = $derived(route.name === 'notes' || route.name === 'label');
  const authenticated = $derived(session.isAuthenticated);

  // The status bar of the installed app wears whatever is at the top of the screen, as a native one does.
  onMount(followSystemBar);
  onMount(followVisualViewport);

  onMount(() => {
    ui.init();
    void instance.load();
    const params = new URLSearchParams(window.location.search);
    const wantsList = params.get('compose') === 'list';
    void session.restore().finally(() => {
      booted = true;
      if (wantsList && session.isAuthenticated) ui.openEditor(null, 'LIST');
    });
  });

  $effect(() => {
    if (!booted) return;
    const signedOutRoute = route.name === 'login' || route.name === 'register' || route.name === 'resetPassword';
    if (!authenticated && !signedOutRoute) {
      router.navigate('/login', { replace: true });
      return;
    }
    if (authenticated && signedOutRoute) {
      router.navigate('/', { replace: true });
    }
  });

  $effect(() => {
    if (!authenticated) {
      notes.reset();
      labels.reset();
      backgroundThemes.reset();
      serverAdmin.reset();
      ui.serverSettingsOpen = false;
      return;
    }
    // This account's writes that waited on this device for the server: read them, then send them.
    const owner = session.user;
    if (owner) void pendingWrites.restore(owner.id).then(() => notes.flush());
    if (!labels.loaded) void labels.load().catch(() => undefined);
    // Themes live on the server now, and which one is shown is the account's own choice.
    void backgroundThemes.load();
  });

  /**
   * A share from another app becomes a note and opens, the way the original's share sheet ends in its
   * editor. It waits in the share inbox until somebody is signed in, so a share that had to go
   * through the sign-in screen first is not lost.
   */
  $effect(() => {
    if (!booted || !authenticated) return;
    void acceptShare();
  });

  async function acceptShare(): Promise<void> {
    try {
      const received = await receiveShare();
      if (router.route.name === 'share') router.navigate('/', { replace: true });
      if (received === null) return;
      if (received.imagesOffline) toast(t('shareTarget.imagesOffline'));
      else if (received.imagesError) toast.error(t('shareTarget.imagesFailed', { reason: tError(received.imagesError) }));
      ui.openEditor(received.note.id);
    } catch (error) {
      toast.error(tError(error as Error));
    }
  }

  // A waiting write the server refused was kept as a note of its own; say so, once.
  $effect(() => {
    const kept = notes.keptAsCopies;
    if (kept.length === 0) return;
    for (const title of kept) toast(t('offline.keptAsCopy', { title }), { duration: Number.POSITIVE_INFINITY });
    notes.keptAsCopies = [];
  });

  // The live channel: someone else writing to a note we can see moves our copy to their version.
  $effect(() => {
    if (!authenticated) return;
    return subscribeToNoteEvents(
      (event) => void notes.applyRemoteChange(event.noteId, event.version),
      () => {
        void notes.resync();
        void labels.load();
      }
    );
  });

  /**
   * A picked note that leaves the list takes its tick with it. Restoring a note from the trash was
   * the case that showed it: the note disappeared from the trash while its id stayed picked, so it
   * came back ticked in the notes view and the count in the bar included something invisible.
   */
  $effect(() => {
    ui.retainSelection(new Set(notes.visibleNotes.map((note) => note.id)));
  });

  function navigate(path: string): void {
    // Switching lists drops the selection, as it does in Keep; the bar belongs to the view it was
    // started in, and its actions would otherwise apply to notes that are no longer on screen.
    ui.clearSelection();
    router.navigate(path);
  }

  /** Sends what is waiting, then reads the view again — also the way to try again when offline. */
  function refresh(): void {
    void notes.resync();
  }
</script>

{#if session.status === 'loading' || !booted}
  <div class="boot" role="status" aria-live="polite">
    <span class="spinner" aria-hidden="true"></span>
    <span class="visually-hidden">{t('app.name')}</span>
  </div>
{:else if !authenticated}
  {#if route.name === 'register'}
    <RegisterView onNavigate={navigate} />
  {:else if route.name === 'resetPassword'}
    <ResetPasswordView onNavigate={navigate} />
  {:else}
    <LoginView onNavigate={navigate} />
  {/if}
{:else}
  <div class="shell">
    <TopBar
      onNavigate={navigate}
      onRefresh={refresh}
      onOpenSettings={() => (ui.settingsOpen = true)}
      searchActive={route.name === 'search'}
      heading={route.name === 'label'
        ? (labelById(route.labelId)?.name ?? '')
        : route.name === 'reminders'
          ? t('nav.reminders')
          : route.name === 'archive'
            ? t('nav.archive')
            : route.name === 'trash'
              ? t('nav.trash')
              : ''}
      view={route.name === 'trash' ? 'trash' : route.name === 'archive' ? 'archived' : 'active'}
    />

    <div class="body">
      <Sidebar
        {route}
        onNavigate={navigate}
        onEditLabels={() => {
          ui.closeDrawer();
          ui.labelsDialogOpen = true;
        }}
        onOpenSettings={() => (ui.settingsOpen = true)}
      />

      <div class="main">
        <div class="content">
        <!--
          A label's view is the notes view narrowed to one label, so it keeps the composer: writing
          there makes a note of that label rather than one that would vanish from the view it was
          written in.
        -->
        {#if ui.editorOpen && !notesLikeRoute && NoteEditor}
          <NoteEditor />
        {/if}

        {#if route.name === 'archive'}
          <NotesView view="archived" />
        {:else if route.name === 'trash'}
          <NotesView view="trash" />
        {:else if route.name === 'search'}
          <NotesView view="active" searchMode filter={route.filter} onNavigate={navigate} />
        {:else if route.name === 'reminders'}
          <!-- The reminders view is gathered by the server and ordered by time, so it has no composer:
               a note written here would not carry the reminder the view is about. -->
          <NotesView view="active" reminders />
        {:else}
          <div class="composer-zone">
            {#if !(ui.editorOpen && ui.inComposer)}
              <NoteComposer onCompose={(kind) => ui.openEditor(null, kind)} />
            {/if}
            {#if ui.editorOpen && NoteEditor}
              <NoteEditor />
            {/if}
          </div>
          {#if route.name === 'label'}
            <NotesView view="active" labelId={route.labelId} />
          {:else}
            <NotesView view="active" />
          {/if}
        {/if}
        </div>
      </div>
    </div>
  </div>

  <ComposeFab onCompose={(kind) => ui.openEditor(null, kind)} />
  <ShareDialog noteId={ui.shareNoteId} onClose={() => ui.closeShare()} />
  <LabelsDialog open={ui.labelsDialogOpen} onClose={() => (ui.labelsDialogOpen = false)} />
  <SettingsDialog
    open={ui.settingsOpen || route.name === 'settings'}
    onClose={() => {
      ui.settingsOpen = false;
      if (route.name === 'settings') navigate('/');
    }}
  />
  {#if session.user?.admin}
    <ServerSettingsDialog open={ui.serverSettingsOpen} onClose={() => (ui.serverSettingsOpen = false)} />
  {/if}
  <ConfirmDialog />
  <Toaster position="bottom-left" theme="dark" closeButton />
{/if}

<style>
  .shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--keep-bg);
  }

  /* The header spans the window and the navigation sits below it, the way Keep lays it out. */
  .body {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
  }

  .main {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
  }

  /* Measured off the original's DOM (keep.google.com, 1400x900, 2026-10-22): the first card stands
     **32px** under the composer's box, and a first section heading 16px further down, at 48px — so
     the gap lives here and the heading's extra room is the grid's (`--keep-first-heading-offset`). */
  .composer-zone {
    position: relative;
    margin-bottom: 32px;
  }

  .composer-zone ~ :global(*) {
    --keep-first-heading-offset: 16px;
  }

  /* No maximum width: folding the rail has to hand the notes the room it frees, the way Keep's
     grid keeps growing with the window instead of stopping at a column count. */
  .content {
    flex: 1 1 auto;
    width: 100%;
    padding: 38px 16px 0;
    min-width: 0;
    /* The notes are re-dealt for the room the rail is *about* to give back, so for the first frames
       of the fold they reach past the edge of the window. Clipped rather than scrolled: `clip` does
       not make a scroll container, and it does not turn the vertical axis into one either. */
    overflow-x: clip;
  }

  /* The original leaves ~8px at the sides on a phone; with the cards at 192px that is exactly the
     room two of them and their 10px gutter need (2 x 192 + 10 = 394). */
  @media (max-width: 600px) {
    /* Measured off the original's Android app: the first card is 21px under the search pill. */
    .content {
      /* The last notes scroll clear of a gesture bar drawn over the page (`--keep-inset-bottom`). */
      padding: 20px 8px var(--keep-inset-bottom);
    }

    /* A phone has no composer box (the button in the corner stands in for it), so the room the box
       leaves under itself goes with it. */
    .composer-zone {
      margin-bottom: 0;
    }

    .composer-zone ~ :global(*) {
      --keep-first-heading-offset: 0px;
    }
  }

  @media (min-width: 901px) {
    .content {
      /* Measured off the original: the header leaves 33px before the composer, and the notes are
         **centred** in the room beside the rail rather than pinned to it — which is what puts the
         first column at 369 and the last one 85px from the right edge. No side padding: the leftover
         is what the centring splits. */
      padding: var(--keep-notes-top) 0 0;
    }
  }

  .boot {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--keep-divider);
    border-top-color: var(--keep-accent);
    border-radius: 50%;
    animation: spin 800ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>

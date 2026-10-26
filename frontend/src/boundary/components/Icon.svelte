<script lang="ts" module>
  /**
   * Semantic icon names used across the app, mapped onto Material Symbols.
   *
   * Icons are Google's classic **Material Icons** (`@iconify-icons/ic`, Apache-2.0) — the set the
   * original draws, compared glyph by glyph against its DOM on 2026-10-14 — with Material Symbols
   * (`@iconify-icons/material-symbols`) only where the original uses those (the trash, undo/redo).
   * They are imported one by one, so only the referenced glyphs reach the bundle and nothing is
   * fetched at runtime — the PWA has to work offline.
   */
  import add from '@iconify-icons/ic/baseline-add';
  import arrowBack from '@iconify-icons/ic/baseline-arrow-back';
  import archiveOutline from '@iconify-icons/ic/outline-archive';
  import unarchiveOutline from '@iconify-icons/ic/outline-unarchive';
  import check from '@iconify-icons/ic/baseline-check';
  import checkBox from '@iconify-icons/ic/outline-check-box';
  import close from '@iconify-icons/ic/baseline-close';
  import darkMode from '@iconify-icons/ic/outline-dark-mode';
  import deleteForever from '@iconify-icons/ic/baseline-delete-forever';
  import deleteOutline from '@iconify-icons/material-symbols/delete-outline';
  import download from '@iconify-icons/ic/baseline-download';
  import editOutline from '@iconify-icons/ic/outline-edit';
  import gridView from '@iconify-icons/ic/outline-grid-view';
  import labelOutline from '@iconify-icons/ic/outline-label';
  import lightMode from '@iconify-icons/ic/outline-light-mode';
  import lightbulbOutline from '@iconify-icons/ic/lightbulb-outline';
  import notificationsActive from '@iconify-icons/ic/baseline-notifications-active';
  import schedule from '@iconify-icons/ic/outline-schedule';
  import logout from '@iconify-icons/ic/baseline-logout';
  import menu from '@iconify-icons/ic/baseline-menu';
  import moreVert from '@iconify-icons/ic/baseline-more-vert';
  import notificationsNone from '@iconify-icons/ic/baseline-notifications-none';
  import addAlert from '@iconify-icons/ic/outline-add-alert';
  import paletteOutline from '@iconify-icons/ic/outline-palette';
  import personAdd from '@iconify-icons/ic/outline-person-add-alt';
  import pushPin from '@iconify-icons/ic/baseline-push-pin';
  import pushPinOutline from '@iconify-icons/ic/outline-push-pin';
  import refresh from '@iconify-icons/ic/baseline-refresh';
  import cloudOff from '@iconify-icons/ic/baseline-cloud-off';
  import search from '@iconify-icons/ic/baseline-search';
  import restoreFromTrash from '@iconify-icons/ic/baseline-restore-from-trash';
  import settingsOutline from '@iconify-icons/ic/outline-settings';
  import viewAgenda from '@iconify-icons/ic/outline-view-agenda';
  import chevronRight from '@iconify-icons/ic/baseline-chevron-right';
  import chevronLeft from '@iconify-icons/ic/baseline-chevron-left';
  import imageOutline from '@iconify-icons/ic/outline-image';
  import dragIndicator from '@iconify-icons/ic/baseline-drag-indicator';
  import undo from '@iconify-icons/material-symbols/undo';
  import redo from '@iconify-icons/material-symbols/redo';
  import formatListBulleted from '@iconify-icons/ic/baseline-format-list-bulleted';
  import link from '@iconify-icons/ic/baseline-link';
  import labelFilled from '@iconify-icons/ic/baseline-label';
  import expandMore from '@iconify-icons/ic/baseline-expand-more';
  import visibilityOutline from '@iconify-icons/ic/outline-visibility';
  import formatColorReset from '@iconify-icons/ic/outline-format-color-reset';
  import hideImage from '@iconify-icons/ic/outline-hide-image';
  import openInNew from '@iconify-icons/ic/baseline-open-in-new';
  import contentCopy from '@iconify-icons/ic/outline-content-copy';
  import lockReset from '@iconify-icons/ic/outline-lock-reset';
  import lockOutline from '@iconify-icons/ic/outline-lock';
  import noEncryption from '@iconify-icons/ic/outline-no-encryption';
  import personRemove from '@iconify-icons/ic/outline-person-remove';
  import groupOutline from '@iconify-icons/ic/outline-group';
  import zoomIn from '@iconify-icons/ic/outline-zoom-in';
  import zoomOut from '@iconify-icons/ic/outline-zoom-out';
  import fileUpload from '@iconify-icons/ic/outline-file-upload';
  import swapVert from '@iconify-icons/ic/baseline-swap-vert';
  import addBox from '@iconify-icons/ic/outline-add-box';
  import photoCamera from '@iconify-icons/ic/outline-photo-camera';
  import textFields from '@iconify-icons/ic/baseline-text-fields';
  import checkBoxFilled from '@iconify-icons/ic/baseline-check-box';
  import textFormat from '@iconify-icons/ic/baseline-text-format';
  import formatBold from '@iconify-icons/ic/baseline-format-bold';
  import formatItalic from '@iconify-icons/ic/baseline-format-italic';
  import formatUnderlined from '@iconify-icons/ic/baseline-format-underlined';
  import formatH1 from '@iconify-icons/material-symbols/format-h1';
  import formatH2 from '@iconify-icons/material-symbols/format-h2';
  import matchCase from '@iconify-icons/material-symbols/match-case';

  export const ICONS = {
    menu,
    /* The navigation's and the empty notes view's bulb is the original's outline; the wordmark's is
       the filled one. */
    lightbulb: lightbulbOutline,
    'chevron-right': chevronRight,
    'chevron-left': chevronLeft,
    image: imageOutline,
    'expand-more': expandMore,
    'drag-indicator': dragIndicator,
    undo,
    redo,
    list: formatListBulleted,
    link,
    'label-filled': labelFilled,
    'arrow-back': arrowBack,
    /* The Reminders view is the plain bell; the action that sets a reminder is the bell with a plus,
       and a note that has one wears the bell with its waves — the original's own three. */
    bell: notificationsNone,
    'add-alert': addAlert,
    'notifications-active': notificationsActive,
    schedule,
    pencil: editOutline,
    archive: archiveOutline,
    unarchive: unarchiveOutline,
    trash: deleteOutline,
    'delete-forever': deleteForever,
    download,
    restore: restoreFromTrash,
    search,
    refresh,
    'cloud-off': cloudOff,
    settings: settingsOutline,
    plus: add,
    /* "New list" is the checked box, as in the original's composer. */
    checklist: checkBox,
    palette: paletteOutline,
    'person-add': personAdd,
    pin: pushPinOutline,
    'pin-filled': pushPin,
    label: labelOutline,
    'more-vert': moreVert,
    close,
    check,
    // The two "none" choices in the appearance picker: no colour, no background.
    'no-color': formatColorReset,
    'no-image': hideImage,
    'open-in-new': openInNew,
    'content-copy': contentCopy,
    grid: gridView,
    rows: viewAgenda,
    logout,
    sun: lightMode,
    moon: darkMode,
    eye: visibilityOutline,
    'lock-reset': lockReset,
    lock: lockOutline,
    'no-encryption': noEncryption,
    'person-remove': personRemove,
    /* Friends and groups, and the avatar cropper's zoom. */
    group: groupOutline,
    'zoom-in': zoomIn,
    'zoom-out': zoomOut,
    upload: fileUpload,
    /* The phone's own glyphs, from the original's Android app: its sort button, the editor's "add"
       box, the camera, and the new-note menu's text and (filled) list. */
    sort: swapVert,
    'add-box': addBox,
    camera: photoCamera,
    text: textFields,
    'checklist-filled': checkBoxFilled,
    /* The phone editor's "A" and the formatting bar it opens: H1, H2, plain text ("Aa"), B, I, U. */
    format: textFormat,
    h1: formatH1,
    h2: formatH2,
    'plain-text': matchCase,
    bold: formatBold,
    italic: formatItalic,
    underline: formatUnderlined
  } as const;

  export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
  import IconifyIcon from '@iconify/svelte';

  interface Props {
    name: IconName;
    size?: number;
    class?: string;
  }

  let { name, size = 24, class: className = '' }: Props = $props();
</script>

<span class="icon {className}" style="--icon-size: {size}px" aria-hidden="true">
  <IconifyIcon icon={ICONS[name]} width={size} height={size} />
</span>

<style>
  /* The wrapper keeps the icon a predictable inline box in flex layouts and pins the glyph colour
     to the surrounding text — Material Symbols carry no colour of their own. */
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: var(--icon-size);
    height: var(--icon-size);
  }

  .icon :global(svg) {
    display: block;
    fill: currentColor;
  }
</style>

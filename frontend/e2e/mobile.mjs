/**
 * Development-only mobile end-to-end test against the real backend.
 *
 * The other suites run at 1440x900; the look the owner checks on his phone is a different layout, so
 * it gets its own. Every number here was measured from his screenshots of the original on the same
 * device (412x893 CSS px at 3.375x) and is recorded in `docs/METRICS.md`.
 *
 *   node e2e/mobile.mjs <base-url> [chromium|firefox]
 */
import { chromium, firefox } from 'playwright';
import { openRegistration } from './admin.mjs';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8080';
await openRegistration(baseUrl);
const engine = process.argv[3] === 'firefox' ? firefox : chromium;
const run = Date.now().toString(36);
const USER = { email: `mobile.${run}@example.com`, name: 'Mobile Tester', password: 'correct horse battery' };

/** The owner's phone: 412 CSS px at 3.375x, which is how his screenshots were measured. */
const PHONE = { width: 412, height: 893, deviceScaleFactor: 3.375 };
/** The same phone with a short window, so a note is long enough to scroll under the editor's bar. */
const SHORT = { width: 412, height: 420, deviceScaleFactor: 3.375 };

const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

const browser = await engine.launch();

/** A phone-sized page, signed in, with the notes this suite needs. */
async function phone(size, notes, suffix) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.deviceScaleFactor,
    hasTouch: true,
    locale: 'en-US'
  });
  await context.addInitScript(() => {
    localStorage.setItem('notka.locale', 'en-US');
    localStorage.setItem('notka.browserNotice', 'dismissed');
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/register`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(USER.email.replace('@', `.${suffix}@`));
  await page.getByLabel('Display name').fill(USER.name);
  await page.getByLabel('Password', { exact: true }).fill(USER.password);
  await page.getByLabel('Confirm password').fill(USER.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForSelector('.topbar', { timeout: 20_000 });
  for (const [title, lines] of notes) {
    // a phone has no "Take a note…" box: its one button opens the kinds of note, as the original's does
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await page.waitForSelector('.editor');
    await page.locator('.editor textarea.title').fill(title);
    await page.locator('.editor .note-body').click();
    for (const line of lines) {
      await page.keyboard.type(line);
      await page.keyboard.press('Enter');
    }
    await page.locator('[aria-label="Back to notes"]').click();
    await page.waitForTimeout(700);
  }
  return { context, page };
}

const box = (page, selector) =>
  page.evaluate((css) => {
    const element = document.querySelector(css);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      marginLeft: Math.round(rect.left),
      marginRight: Math.round(window.innerWidth - rect.right),
      overflow: Math.round(Math.max(0, -rect.left) + Math.max(0, rect.right - window.innerWidth)),
      inViewport: rect.top >= -1 && rect.bottom <= window.innerHeight + 1
    };
  }, selector);

const LONG_NOTE = [
  'Phone note',
  ['first line', 'second line', 'third line', 'fourth line', 'fifth line', 'sixth line',
   'seventh line', 'eighth line', 'ninth line', 'tenth line', 'eleventh line', 'twelfth line',
   'thirteenth line', 'fourteenth line', 'fifteenth line', 'sixteenth line']
];

console.log('\nthe phone layout');

const { context, page } = await phone(PHONE, [
  LONG_NOTE,
  ['Second note', ['only one line']],
  ['Third note', ['and another']]
], 'a');

// two columns, 192px cards, and nothing scrolling sideways
const layout = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  const lefts = [...new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left)))].sort((a, b) => a - b);
  const title = document.querySelector('.card .title');
  const content = document.querySelector('.card .note-content');
  const wordmark = document.querySelector('.wordmark');
  return {
    lefts,
    cardWidth: cards[0] ? Math.round(cards[0].getBoundingClientRect().width) : null,
    title: title ? `${getComputedStyle(title).fontSize}/${getComputedStyle(title).lineHeight}` : null,
    content: content ? `${getComputedStyle(content).fontSize}/${getComputedStyle(content).lineHeight}` : null,
    wordmark: wordmark ? getComputedStyle(wordmark).display : null,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
check(
  'a phone shows two columns of 192px cards',
  layout.lefts.length === 2 && layout.lefts[1] - layout.lefts[0] === 202 && Math.abs(layout.cardWidth - 192) <= 2,
  JSON.stringify(layout)
);
check(
  "a phone card carries the Android app's type (16sp title, Body2 text)",
  layout.title === '16px/24px' && layout.content === '14px/20.8px',
  `title ${layout.title}, content ${layout.content}`
);
check(
  "a phone's top bar has no wordmark and does not scroll sideways",
  layout.wordmark === 'none' && layout.overflow === 0,
  `wordmark ${layout.wordmark}, overflow ${layout.overflow}`
);

const chrome = await page.evaluate(() => ({
  pins: document.querySelectorAll('.card .pin-button').length,
  actions: document.querySelectorAll('.card .actions').length,
  searchSwitches: document.querySelectorAll('.search .icon-button').length,
  gear: document.querySelectorAll('.topbar [aria-label="Settings"]').length
}));
// Measured off the original's Android app: its cards carry neither a pin nor an action bar, and its
// search pill holds the view's two switches while the settings live in the drawer.
check(
  "a phone card has no pin and no action bar, and the search pill holds the layout and sort switches",
  chrome.pins === 0 && chrome.actions === 0 && chrome.searchSwitches === 2 && chrome.gear === 0,
  JSON.stringify(chrome)
);

await page.getByRole('button', { name: 'New note', exact: true }).click();
await page.waitForTimeout(400);
const fab = await page.evaluate(() => {
  const button = document.querySelector('.fab')?.getBoundingClientRect();
  return {
    kinds: [...document.querySelectorAll('.fab-kind')].map((kind) => kind.textContent?.trim()),
    size: button ? Math.round(button.width) : null
  };
});
check(
  'the one button opens the kinds of note and turns into a 60px round close button',
  fab.kinds.join(',') === 'Image,List,Text' && fab.size === 60,
  JSON.stringify(fab)
);
await page.getByRole('button', { name: 'Close', exact: true }).last().click();
await page.waitForTimeout(400);

// The third note was written last, so it leads the custom order; sorting by creation keeps it on top,
// and a long press picks a card for the bulk actions.
await page.getByRole('button', { name: 'Sort notes' }).click();
await page.waitForSelector('.ok-sheet');
const sortRows = await page.locator('.ok-sheet [role="radio"]').count();
await page.getByRole('radio', { name: 'Date created' }).click();
await page.waitForTimeout(400);
const firstTitle = await page.locator('.card .title').first().textContent();
check('the sort sheet offers three orders and sorts by the date asked for', sortRows === 3 && firstTitle === 'Third note', `${sortRows} rows, first ${firstTitle}`);
await page.getByRole('button', { name: 'Sort notes' }).click();
await page.getByRole('radio', { name: 'Custom (default)' }).click();
await page.waitForTimeout(300);

// The held card carries a picture, so the ring can be checked where a picture meets the card's edge.
const pictured = await page.locator('.card').last().getAttribute('data-note-id');
await page.evaluate(async (id) => {
  const canvas = Object.assign(document.createElement('canvas'), { width: 200, height: 120 });
  const brush = canvas.getContext('2d');
  brush.fillStyle = '#e07a2f';
  brush.fillRect(0, 0, 200, 120);
  const picture = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  await fetch(`/api/notes/${id}/images`, { method: 'POST', body: picture });
}, pictured);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector(`.card[data-note-id="${pictured}"] img`);
await page.waitForTimeout(500);
const cardPlaces = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.card')].map((card) => {
      const rect = card.getBoundingClientRect();
      return `${card.dataset.noteId}@${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}x${Math.round(rect.height)}`;
    })
  );
const placesBefore = await cardPlaces();
const held = page.locator(`.card[data-note-id="${pictured}"]`);
const heldBox = await held.boundingBox();
const at = { pointerType: 'touch', isPrimary: true, clientX: heldBox.x + 40, clientY: heldBox.y + 40, bubbles: true };
await held.dispatchEvent('pointerdown', at);
await page.waitForTimeout(600);
await held.dispatchEvent('pointerup', at);
const picked = await page.evaluate(() => {
  const bar = document.querySelector('.phone-selection');
  const card = document.querySelector('.card.selected');
  return {
    bar: Boolean(bar),
    height: bar ? Math.round(bar.getBoundingClientRect().height) : null,
    count: bar?.querySelector('.count')?.textContent ?? null,
    actions: bar ? bar.querySelectorAll('button').length : 0,
    ring: card ? getComputedStyle(card, '::after').boxShadow : null,
    tick: document.querySelectorAll('.card-tick').length > 0 && getComputedStyle(document.querySelector('.card-tick')).display !== 'none'
  };
});
// Measured on the Android app (emulator): the header becomes a 72dp bar with ✕, the bare count and five
// actions (pin, reminder, colour, labels, ⋮), and the held card wears a 3dp ring with no tick.
check(
  "holding a finger on a card picks it, with the Android app's selection bar and ring",
  picked.bar && picked.height === 72 && picked.count === '1' && picked.actions === 6 && /3px/.test(picked.ring ?? '') && !picked.tick,
  JSON.stringify(picked)
);
// Rule 20: picking is a state of the view, so not one card moves or changes size when the bar appears.
const placesAfter = await cardPlaces();
check(
  'picking a note leaves every card where it was',
  placesAfter.join(' ') === placesBefore.join(' '),
  `${placesBefore.join(' ')} -> ${placesAfter.join(' ')}`
);
// The bar spans the window from its top edge: an undefined inset left 8px of the page beside it on the
// left and pushed it 4px past the right edge.
const selectionBar = await box(page, '.phone-selection');
check(
  'the selection bar spans the window from edge to edge, from its top',
  selectionBar?.left === 0 && selectionBar.right === 412 && selectionBar.top === 0,
  JSON.stringify(selectionBar)
);
// The ring is a layer above the card's content: an inset shadow on the card itself is painted under its
// children, so a picture covered the ring along its edges.
const ringLayer = await page.evaluate(() => {
  const card = document.querySelector('.card.selected');
  const ring = getComputedStyle(card, '::after');
  const picture = card.querySelector('img');
  const above = (element) => {
    for (let node = element; node && node !== card; node = node.parentElement) {
      if (getComputedStyle(node).zIndex !== 'auto' && Number(getComputedStyle(node).zIndex) >= Number(ring.zIndex)) return true;
    }
    return false;
  };
  return {
    position: ring.position,
    zIndex: ring.zIndex,
    inset: [ring.top, ring.right, ring.bottom, ring.left].join(' '),
    pictureAbove: picture ? above(picture) : null,
    card: getComputedStyle(card).boxShadow
  };
});
check(
  'the selection ring is drawn over the pictures, all the way round the card',
  ringLayer.position === 'absolute' && Number(ringLayer.zIndex) >= 1 && ringLayer.inset === '0px 0px 0px 0px' &&
    ringLayer.pictureAbove === false && ringLayer.card === 'none',
  JSON.stringify(ringLayer)
);
// The dark theme's bar sits straight on the page: a 12px shadow of a lighter grey drew a strip under it.
const darkBar = await page.evaluate(() => {
  const root = document.documentElement;
  const theme = root.dataset.theme;
  root.dataset.theme = 'dark';
  const read = { theme: root.dataset.theme, edge: getComputedStyle(document.querySelector('.phone-selection')).boxShadow };
  root.dataset.theme = theme;
  return read;
});
check('in the dark theme nothing is drawn under the selection bar', darkBar.theme === 'dark' && darkBar.edge === 'none', JSON.stringify(darkBar));
await page.getByRole('button', { name: 'Clear selection' }).click().catch(() => {});
await page.waitForTimeout(300);

await page.getByRole('button', { name: 'Open navigation' }).click();
await page.waitForTimeout(500);
const drawer = await page.evaluate(() => ({
  name: document.querySelector('.drawer-name')?.textContent?.trim(),
  settings: [...document.querySelectorAll('.sidebar .item')].some((item) => item.textContent?.trim() === 'Settings'),
  fullHeight: Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().height ?? 0) === window.innerHeight
}));
check("the drawer is the original's: the app's name, the settings, the window's full height",
  drawer.name === 'Notka' && drawer.settings && drawer.fullHeight, JSON.stringify(drawer));
// The Android app's drawer at 412dp (`drawer_width` and the emulator, docs/METRICS.md): 320dp wide,
// 55dp rows, the pill 12dp in from either side, the icon 28dp in and the label at 68dp.
const drawerGeometry = await page.evaluate(() => {
  const item = document.querySelector('.sidebar .item');
  const rect = (element) => element?.getBoundingClientRect();
  return {
    width: Math.round(rect(document.querySelector('.sidebar'))?.width ?? 0),
    row: Math.round(rect(item)?.height ?? 0),
    pill: [Math.round(rect(item)?.left ?? 0), Math.round(rect(item)?.right ?? 0)],
    icon: Math.round(rect(item?.querySelector('svg'))?.left ?? 0),
    label: Math.round(rect(item?.querySelector('.text'))?.left ?? 0)
  };
});
check("the drawer's geometry is the Android app's",
  drawerGeometry.width === 320 && drawerGeometry.row === 55 && drawerGeometry.pill[0] === 12 &&
    drawerGeometry.pill[1] === 308 && drawerGeometry.icon === 28 && drawerGeometry.label === 68,
  JSON.stringify(drawerGeometry));
// The Android app's own surfaces, measured on an emulator in the light theme (docs/METRICS.md), not
// the web original's white and greys: the drawer and a plain card are the lighter surface on a
// lavender-grey page, and the drawer veils the page with 60% black.
const surfaces = await page.evaluate(() => {
  const background = (selector) => {
    const element = document.querySelector(selector);
    return element ? getComputedStyle(element).backgroundColor : null;
  };
  const plain = document.querySelector('.card[data-color="default"]:not([data-background])');
  return {
    page: getComputedStyle(document.body).backgroundColor,
    pill: background('.search'),
    drawer: background('.sidebar'),
    veil: background('.scrim'),
    card: plain ? getComputedStyle(plain).backgroundColor : null,
    outline: plain ? getComputedStyle(plain).borderTopColor : null
  };
});
check(
  "the phone's surfaces are the Android app's: page, search pill, drawer and its veil, a plain card and its outline",
  surfaces.page === 'rgb(238, 237, 244)' &&
    surfaces.pill === 'rgb(250, 248, 255)' &&
    surfaces.drawer === 'rgb(250, 248, 255)' &&
    surfaces.veil === 'rgba(0, 0, 0, 0.6)' &&
    surfaces.card === 'rgb(250, 248, 255)' &&
    surfaces.outline === 'rgb(197, 198, 208)',
  JSON.stringify(surfaces)
);
// The system's Back closes the drawer, and a panel opened from it, rather than leaving the page.
const addressWithDrawer = page.url();
await page.goBack();
await page.waitForTimeout(400);
const drawerAfterBack = { veil: await page.locator('.scrim').count(), address: page.url() };
check("the system's Back closes the drawer and stays in the app",
  drawerAfterBack.veil === 0 && drawerAfterBack.address === addressWithDrawer, JSON.stringify(drawerAfterBack));
await page.getByRole('button', { name: 'Open navigation' }).click();
await page.waitForTimeout(400);
await page.locator('.sidebar .item').filter({ hasText: 'Settings', hasNotText: 'Server' }).click();
await page.waitForSelector('.ok-dialog[data-state="open"]', { timeout: 5_000 });
await page.goBack();
await page.waitForTimeout(500);
const settingsAfterBack = {
  open: await page.locator('.ok-dialog[data-state="open"]').count(),
  veil: await page.locator('.scrim').count(),
  address: page.url()
};
check("the system's Back closes the settings opened from the drawer and stays in the app",
  settingsAfterBack.open === 0 && settingsAfterBack.veil === 0 && settingsAfterBack.address === addressWithDrawer,
  JSON.stringify(settingsAfterBack));
// Picking a view in the drawer takes the drawer's history entry over: Back returns to the notes.
await page.getByRole('button', { name: 'Open navigation' }).click();
await page.waitForTimeout(400);
await page.locator('.sidebar .item').filter({ hasText: 'Archive' }).click();
await page.waitForTimeout(400);
await page.goBack();
await page.waitForTimeout(400);
check('Back from a view picked in the drawer returns to the view before it', page.url() === addressWithDrawer, page.url());

// A dialog opened from Settings goes on top of it: both used one z-index, and on a phone the picture
// dialog opened invisibly under Settings.
const topmostAt = (selector) =>
  page.evaluate((css) => {
    const target = document.querySelector(css);
    if (!target) return 'missing';
    const rect = target.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 24);
    return hit !== null && target.contains(hit);
  }, selector);
await page.getByRole('button', { name: 'Open navigation' }).click();
await page.waitForTimeout(400);
await page.locator('.sidebar .item').filter({ hasText: 'Settings', hasNotText: 'Server' }).click();
await page.waitForSelector('.ok-dialog[data-state="open"]', { timeout: 5_000 });
await page.getByRole('button', { name: 'Change picture' }).click();
await page.waitForSelector('[data-testid=avatar-dialog]');
await page.waitForTimeout(400);
const pictureOnTop = await topmostAt('[data-testid=avatar-dialog]');
await page.locator('[data-testid=avatar-dialog]').getByRole('button', { name: 'Close', exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Manage friends and groups' }).click();
await page.waitForSelector('[data-testid=friends-dialog]');
await page.waitForTimeout(400);
const friendsOnTop = await topmostAt('[data-testid=friends-dialog]');
check('the picture and friends dialogs open on top of Settings', pictureOnTop === true && friendsOnTop === true,
  JSON.stringify({ pictureOnTop, friendsOnTop }));
await page.goBack();
await page.waitForTimeout(400);
await page.goBack();
await page.waitForTimeout(500);

console.log('\nthe editor on a phone');

// A coloured note, so the system bar has a colour of its own to take. Then everything the opening
// writes to the bar and every property it animates is recorded from the tap on.
const firstCardId = await page.locator('.card').first().getAttribute('data-note-id');
await page.evaluate(async (id) => {
  await fetch(`/api/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color: 'yellow' }) });
}, firstCardId);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.card');
await page.waitForTimeout(500);
await page.evaluate(() => {
  const record = { colors: [], properties: new Set(), corners: [] };
  window.__opening = record;
  // Every colour the bar is given, with where the note's top edge is at that moment.
  window.__barColors = record.colors;
  window.__barStart = document.querySelector('meta[name="theme-color"]')?.content;
  new MutationObserver(() => {
    const color = document.querySelector('meta[name="theme-color"]')?.content;
    const colors = window.__barColors;
    if (color && (colors.at(-1)?.color ?? window.__barStart) !== color) {
      const editor = document.querySelector('.editor');
      colors.push({ color, top: editor ? Math.round(editor.getBoundingClientRect().top) : null });
    }
  }).observe(document.head, { childList: true, subtree: true, attributes: true });
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    for (const frame of Array.isArray(keyframes) ? keyframes : [keyframes]) {
      for (const property of Object.keys(frame)) record.properties.add(property);
      if (frame.clipPath) record.corners.push(Number(/round ([\d.]+)px/.exec(frame.clipPath)?.[1]));
    }
    return animate.call(this, keyframes, options);
  };
});
const pageColor = await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.content);
await page.locator('.card').first().click();
await page.waitForSelector('.editor', { timeout: 10_000 });
await page.waitForTimeout(500);
const opening = await page.evaluate(() => ({
  colors: window.__opening.colors,
  properties: [...window.__opening.properties],
  corners: window.__opening.corners,
  note: getComputedStyle(document.querySelector('.editor')).backgroundColor
}));
const noteColor = `#${(opening.note.match(/\d+/g) ?? []).map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`;
/** Whether the bar travels from one colour to the other without a step back, through at least one between. */
const channels = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
const apart = (one, other) => channels(one).reduce((sum, channel, index) => sum + Math.abs(channel - channels(other)[index]), 0);
/** The colours the bar was given that can be told from where it started (a unit or two is a rounding). */
const visible = (colors, from) => colors.filter((entry) => apart(entry.color, from) > 3);
const fades = (all, from, to) => {
  const colors = visible(all, from);
  const distance = (hex) => apart(hex, to);
  return (
    colors.length >= 3 &&
    colors.at(-1).color === to &&
    distance(colors[0].color) < distance(from) &&
    colors.every((entry, index) => index === 0 || distance(entry.color) <= distance(colors[index - 1].color) + 3)
  );
};
// The original's app draws under a transparent status bar: the note slides in under it as it arrives,
// so the bar turns the note's colour over that last stretch — not at the tap (it looked switched on),
// and not in one step when the note got there (that flickered).
check(
  "the system bar fades to the note's colour as the note slides in under it",
  fades(opening.colors, pageColor, noteColor) &&
    visible(opening.colors, pageColor).every((entry) => entry.top !== null && entry.top < 32),
  JSON.stringify({ pageColor, noteColor, colors: opening.colors })
);
await page.evaluate(() => {
  window.__barColors.length = 0;
  window.__barStart = document.querySelector('meta[name="theme-color"]')?.content;
});
await page.locator('[aria-label="Back to notes"]').click();
await page.waitForTimeout(700);
const closing = await page.evaluate(() => window.__barColors.slice());
check(
  'and back to the page as the note leaves the top again',
  fades(closing, noteColor, pageColor),
  JSON.stringify(closing)
);
await page.locator('.card').first().click();
await page.waitForSelector('.editor', { timeout: 10_000 });
await page.waitForTimeout(500);
// Only what the compositor runs by itself: a clip-path or a width ran on the main thread and stuttered
// whenever the page was busy — and opening a note is when it is busiest.
// The clip-path only rounds the container's corners on the way (`editorFlight.ts`); no edge depends on it.
const composited = new Set(['offset', 'transform', 'transformOrigin', 'opacity', 'visibility', 'clipPath', 'easing', 'composite']);
check(
  'a note grows out of its card on transforms and opacity alone, its corners squaring off as it goes',
  opening.properties.length > 0 &&
    opening.properties.every((property) => composited.has(property)) &&
    // the card's own rounding at the start, square at the screen's edges at the end, never growing
    opening.corners[0] > 0 &&
    opening.corners.at(-1) === 0 &&
    opening.corners.every((radius, index) => index === 0 || radius <= opening.corners[index - 1]),
  JSON.stringify({ properties: opening.properties, corners: opening.corners })
);
const bar = await page.evaluate(() => {
  const barElement = document.querySelector('.editor-bar');
  const back = document.querySelector('[aria-label="Back to notes"]');
  const rect = barElement ? barElement.getBoundingClientRect() : null;
  return {
    height: rect ? Math.round(rect.height) : null,
    back: Boolean(back),
    bell: document.querySelectorAll('.editor-bar [aria-label*="reminder" i]').length,
    archive: document.querySelectorAll('.editor-bar [aria-label*="archive" i]').length,
    headBell: document.querySelectorAll('.head [aria-label*="reminder" i]').length,
    pin: document.querySelectorAll('.editor-bar [aria-label*="pin" i]').length,
    headPin: document.querySelectorAll('.head [aria-label*="pin" i]').length,
    button: (() => {
      const box = document.querySelector('.editor-bar-actions .icon-button')?.getBoundingClientRect();
      return box ? Math.round(box.width) : null;
    })(),
    bottomClose: [...document.querySelectorAll('.toolbar button')].filter((button) => (button.textContent ?? '').trim() === 'Close').length,
    undo: document.querySelector('.toolbar [aria-label="Undo"]')?.hasAttribute('disabled'),
    toolbarFill: (() => {
      const toolbar = document.querySelector('.editor .toolbar');
      return toolbar ? getComputedStyle(toolbar).backgroundColor : null;
    })()
  };
});
// Measured off the original's Android app: the pin, the bell and the archive on 40px buttons in the
// middle of a 64dp bar (`editor_toolbar` on the emulator) — none of them in the title's row.
check(
  "the editor has the original's own bar: back, pin, reminder and archive",
  bar.back &&
    bar.pin === 1 &&
    bar.bell === 1 &&
    bar.archive === 1 &&
    bar.headBell === 0 &&
    bar.headPin === 0 &&
    bar.button === 40 &&
    bar.height === 64,
  JSON.stringify(bar)
);
// The desktop's bar is a strip in the note's colour; the Android app's buttons lie on the picture.
check('the phone editor keeps its bottom bar transparent', bar.toolbarFill === 'rgba(0, 0, 0, 0)', JSON.stringify(bar.toolbarFill));
// Loading the note is not the reader's edit: an Undo enabled here took the note back to empty, and
// the autosave stored that over it.
check('opening a note leaves nothing to undo', bar.undo === true, `undo disabled: ${bar.undo}`);
check(
  'the phone editor drops the bottom bar\'s Close, because the arrow is the way out',
  bar.bottomClose === 0,
  `bottom close buttons: ${bar.bottomClose}`
);

// the pickers must stay inside the window, at every width a phone can be
// The system's Back leaves the note, not the app: the editor owns one history entry while it is open.
// (A phone's Back button and gesture are `history.back()` to the page.)
const addressBefore = page.url();
await page.goBack();
await page.waitForTimeout(700);
const afterBack = { editor: await page.locator('.editor').count(), address: page.url() };
check(
  "the system's Back leaves the note and stays in the app",
  afterBack.editor === 0 && afterBack.address === addressBefore,
  JSON.stringify(afterBack)
);
await page.locator('.card').first().click();
await page.waitForSelector('.editor', { timeout: 10_000 });
await page.waitForTimeout(500);
const entryOpen = await page.evaluate(() => window.history.state?.notkaBack === true);
await page.locator('[aria-label="Back to notes"]').click();
await page.waitForTimeout(900);
const entryAfter = await page.evaluate(() => window.history.state?.notkaBack === true);
check(
  'the note owns one history entry while it is open, and closing it by its own arrow gives that entry back',
  entryOpen && !entryAfter && (await page.locator('.editor').count()) === 0 && page.url() === addressBefore,
  `entry while open: ${entryOpen}, after closing: ${entryAfter}`
);
await page.locator('.card').first().click();
await page.waitForSelector('.editor', { timeout: 10_000 });
await page.waitForTimeout(500);

const pickers = [];
for (const width of [360, 393, 412]) {
  await page.setViewportSize({ width, height: 893 });
  await page.waitForTimeout(300);
  const open = async (pattern) => {
    for (const button of await page.locator('.editor button, .card button').all()) {
      const label = (await button.getAttribute('aria-label')) ?? '';
      if (pattern.test(label)) {
        await button.click({ force: true });
        return true;
      }
    }
    return false;
  };
  const measured = {};
  if (await open(/colou?r/i)) {
    await page.waitForTimeout(500);
    // the colours are a bottom sheet on a phone: the window's full width, down to its bottom edge
    const sheet = await box(page, '.ok-sheet');
    measured.colour = sheet && { ...sheet, marginLeft: sheet.marginLeft + 8, marginRight: sheet.marginRight + 8 };
    measured.sheetBottom = sheet && sheet.bottom === 893 && sheet.width === width;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  if (await open(/reminder/i)) {
    await page.waitForTimeout(400);
    measured.reminder = await box(page, '.reminder-picker');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  pickers.push({ width, measured });
}
check(
  'the colour sheet spans a phone window and the reminder picker stays inside it',
  pickers.every(({ measured }) =>
    measured.sheetBottom &&
    [measured.colour, measured.reminder].every((entry) => entry && entry.overflow === 0 && entry.marginLeft >= 8 && entry.marginRight >= 8)
  ),
  JSON.stringify(pickers)
);
await page.setViewportSize({ width: 412, height: 893 });
await page.locator('[aria-label="Back to notes"]').click();
await page.waitForTimeout(600);

console.log('\nthe checklist on a phone');

// Keep on iOS (docs/METRICS.md), in em of the 16px text: the checkbox 2.1875em past the note's text
// (21 + 35 = 56px), its handle centred 1.3125em left of it, the text 1.375em after the 1.125em box, one
// level 2.375em.
await page.getByRole('button', { name: 'New note', exact: true }).click();
await page.getByRole('button', { name: 'List', exact: true }).click();
await page.waitForSelector('.editor li[data-checked] p');
await page.locator('.editor li[data-checked] p').first().click();
await page.keyboard.type('outer');
await page.keyboard.press('Enter');
await page.keyboard.type('inner');
await page.keyboard.press('Tab');
await page.waitForTimeout(500);
const geometry = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.editor li[data-checked]')];
  const boxOf = (row) => row.querySelector('input')?.getBoundingClientRect();
  const handles = [...document.querySelectorAll('.drag-handle')].map((handle) => {
    const rect = handle.getBoundingClientRect();
    return Math.round(rect.left + rect.width / 2);
  });
  return {
    checkbox: rows.map((row) => Math.round(boxOf(row)?.left ?? 0)),
    text: Math.round(rows[0]?.querySelector('p')?.getBoundingClientRect().left ?? 0),
    handles
  };
});
check(
  "the phone's checklist stands where the Android app's does",
  geometry.checkbox[0] === 56 && geometry.checkbox[1] === 94 && geometry.text === 96 && geometry.handles[0] === 35,
  JSON.stringify(geometry)
);

// The original's "A": the bottom bar gives way to the formatting bar while the body has the caret.
await page.getByRole('button', { name: 'Text formatting' }).click();
await page.waitForTimeout(300);
const formatBar = await page.evaluate(() =>
  [...document.querySelectorAll('.format-bar button')].map((button) => button.getAttribute('aria-label'))
);
await page.getByRole('button', { name: 'Bold' }).click();
await page.keyboard.type(' bold');
await page.waitForTimeout(300);
const boldText = await page.locator('.editor li[data-checked] strong').first().textContent().catch(() => null);
const h1InRow = await page.getByRole('button', { name: 'Heading 1' }).isDisabled();
await page.getByRole('button', { name: 'Close formatting' }).click();
await page.waitForTimeout(300);
check(
  'the "A" opens the formatting bar, bold applies at the caret and a list row cannot become a heading',
  formatBar.join(',') === 'Heading 1,Heading 2,Normal text,Bold,Italic,Underline,Close formatting' &&
    boldText === ' bold' &&
    h1InRow &&
    (await page.locator('.format-bar').count()) === 0,
  JSON.stringify({ formatBar, boldText, h1InRow })
);

// The Android app's nested tick: ticking a nested row leaves its parent where it is and draws the row
// in the completed section under a greyed copy of the parent; the list's own ⋮ then deletes it.
await page.locator('.editor li[data-checked]:has(p:text-is("inner")) input').click();
await page.waitForTimeout(500);
const nestedTick = await page.evaluate(() => {
  const list = document.querySelector('.editor ul[data-type="taskList"]');
  const drawn = [...(list?.children ?? [])]
    .filter((child) => getComputedStyle(child).display !== 'none')
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    .map((child) =>
      child.classList.contains('completed-ghost') ? `ghost:${child.textContent.trim()}` : (child.querySelector('p')?.textContent ?? '').trim() || child.className
    );
  return drawn.filter((entry) => entry.length > 0);
});
check(
  'a ticked nested row is drawn under a greyed copy of its parent, which stays in the list',
  JSON.stringify(
    nestedTick
      .filter((entry) => !entry.startsWith('add-item') && !entry.startsWith('completed-row'))
      .map((entry) => entry.split(' ')[0])
  ) === JSON.stringify(['outer', 'ghost:outer', 'inner']),
  JSON.stringify(nestedTick)
);
await page.getByRole('button', { name: 'List options' }).click();
await page.getByRole('button', { name: 'Delete checked items' }).click();
await page.waitForTimeout(600);
const remaining = await page.locator('.editor li[data-checked]').allTextContents();
check(
  "the list's ⋮ deletes the checked rows and leaves their parent",
  remaining.length === 1 && remaining[0].includes('outer') &&
    (await page.locator('.editor li[data-checked]').first().getAttribute('data-depth')) === '0',
  JSON.stringify(remaining)
);

await page.getByRole('button', { name: 'More options' }).click();
await page.waitForTimeout(500);
const menu = await page.evaluate(() => ({
  items: [...document.querySelectorAll('.ok-sheet .ok-sheet-item')].map((item) => item.textContent?.trim()),
  bottom: Math.round(document.querySelector('.ok-sheet')?.getBoundingClientRect().bottom ?? 0)
}));
check(
  "the ⋮ menu is a bottom sheet carrying the collaborator and the labels",
  menu.bottom === 893 && menu.items.includes('Collaborator') && menu.items.includes('Labels') && menu.items.includes('Make a copy'),
  JSON.stringify(menu)
);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// Ticking is not editing. A phone opens a note to be read, so the keyboard stays down — and a tap on
// a checkbox must leave it down. Only the text of an active row asks for the caret. (Tiptap's task
// item focuses the editor from the checkbox's own handler, which raised the keyboard over the note.)
await page.locator('[aria-label="Back to notes"]').click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'New note', exact: true }).click();
await page.getByRole('button', { name: 'List', exact: true }).click();
await page.waitForSelector('.editor li[data-checked] p');
await page.locator('.editor textarea.title').fill('keys');
await page.locator('.editor li[data-checked] p').first().click();
await page.keyboard.type('tick me');
await page.keyboard.press('Enter');
await page.keyboard.type('edit me');
await page.locator('[aria-label="Back to notes"]').click();
await page.waitForTimeout(800);
await page.locator('.card', { hasText: 'keys' }).first().click();
await page.waitForSelector('.editor', { timeout: 10_000 });
await page.waitForTimeout(500);
const readMode = await page.evaluate(() => document.querySelector('.editor .note-body')?.matches(':focus') ?? null);
await page.locator('.editor li[data-checked]:has(p:text-is("tick me")) input').click();
await page.waitForTimeout(500);
const ticked = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.editor li[data-checked]')].find((li) => li.querySelector('p')?.textContent === 'tick me');
  return {
    focused: document.querySelector('.editor .note-body')?.matches(':focus') ?? null,
    checked: row?.querySelector('input')?.checked ?? null,
    drawn: row?.getAttribute('data-checked') ?? null
  };
});
await page.locator('.editor li[data-checked] p:text-is("edit me")').click();
await page.waitForTimeout(400);
const afterText = await page.evaluate(() => document.querySelector('.editor .note-body')?.matches(':focus') ?? null);
check(
  "ticking a row leaves the keyboard down, and only an active row's text raises it",
  readMode === false && ticked.focused === false && ticked.checked === true && ticked.drawn === 'true' && afterText === true,
  JSON.stringify({ readMode, ticked, afterText })
);
await page.locator('[aria-label="Back to notes"]').click();
await page.waitForTimeout(700);
await context.close();

console.log('\nthe editor bar over a scrolled note');

// a short window on the same phone width: the note is now taller than its scroller
const short = await phone(SHORT, [LONG_NOTE], 'b');
await short.page.waitForSelector('.card', { timeout: 15_000 });
await short.page.locator('.card').first().click();
await short.page.waitForSelector('.editor', { timeout: 10_000 });
await short.page.waitForTimeout(500);
const scrolled = await short.page.evaluate(() => {
  const body = document.querySelector('.editor .body');
  if (body) body.scrollTop = 300;
  return { scrolledTo: body ? body.scrollTop : 0 };
});
await short.page.waitForTimeout(250);
const afterScroll = await box(short.page, '.editor-bar');
const backAfterScroll = await box(short.page, '[aria-label="Back to notes"]');
check(
  'the bar and its arrow stay put while the note scrolls under them',
  scrolled.scrolledTo > 0 && afterScroll && afterScroll.top === 0 && backAfterScroll && backAfterScroll.inViewport,
  `scrolled ${scrolled.scrolledTo}, bar ${JSON.stringify(afterScroll)}, back ${JSON.stringify(backAfterScroll)}`
);
await short.context.close();

console.log('\nsharing into Notka from another app');

// given: the installed app — its service worker in control — and a manifest that names it a share target
const sharing = await phone(PHONE, [], 's');
await sharing.page.evaluate(() => navigator.serviceWorker?.ready);
await sharing.page.reload({ waitUntil: 'networkidle' });
const shareTarget = await sharing.page.evaluate(async () => (await fetch('/manifest.webmanifest').then((r) => r.json())).share_target);
check(
  'the manifest makes the app a share target for text, links and pictures',
  shareTarget?.action === '/share' &&
    shareTarget.method === 'POST' &&
    shareTarget.enctype === 'multipart/form-data' &&
    shareTarget.params.title === 'title' &&
    shareTarget.params.text === 'text' &&
    shareTarget.params.url === 'url' &&
    shareTarget.params.files?.[0]?.accept.includes('image/png'),
  JSON.stringify(shareTarget)
);

/** What the system's share sheet sends: the manifest's `POST /share`, handled by the service worker. */
const share = (page, fields) =>
  page.evaluate(async ({ title, text, url, image }) => {
    const form = new FormData();
    form.set('title', title);
    form.set('text', text);
    form.set('url', url);
    if (image) {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const context2d = canvas.getContext('2d');
      context2d.fillStyle = '#c33';
      context2d.fillRect(0, 0, 8, 8);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      form.append('images', new File([blob], 'shared.png', { type: 'image/png' }));
    }
    const response = await fetch('/share', { method: 'POST', body: form });
    return response.url;
  }, fields);

// when: another app shares a page with its title, a line of text and a picture
const landed = await share(sharing.page, {
  title: 'Shared article',
  text: 'Worth reading',
  url: 'https://example.org/shared',
  image: true
});
await sharing.page.goto(`${baseUrl}/share`, { waitUntil: 'networkidle' });
const sharedEditor = await sharing.page.locator('.editor').waitFor({ timeout: 10_000 }).then(() => true, () => false);
await sharing.page.waitForTimeout(800);
const sharedStored = await sharing.page.evaluate(async () => {
  const body = await fetch('/api/notes', { credentials: 'include' }).then((response) => response.json());
  const note = body.notes.find((candidate) => candidate.title === 'Shared article');
  return note && {
    kind: note.kind,
    lines: note.content.blocks.map((block) => block.spans.map((span) => span.text).join('')),
    images: note.images?.length ?? 0
  };
});

// then: the worker sent the app to /share, and the share became a note of its own that opens
check('a share is answered with the app, not the server', landed.endsWith('/share'), landed);
check(
  'a share becomes a text note with its title, text, link and picture',
  sharedStored?.kind === 'TEXT' &&
    JSON.stringify(sharedStored.lines) === JSON.stringify(['Worth reading', 'https://example.org/shared']) &&
    sharedStored.images === 1,
  JSON.stringify(sharedStored)
);
check(
  'the shared note opens in the editor and the address bar leaves /share',
  sharedEditor && new URL(sharing.page.url()).pathname === '/',
  sharing.page.url()
);
await sharing.page.locator('[aria-label="Back to notes"]').click();
await sharing.page.waitForTimeout(700);

// when: a link is shared with no connection
await sharing.context.setOffline(true);
await share(sharing.page, { title: '', text: 'Offline find https://example.org/offline', url: '', image: true });
await sharing.page.goto(`${baseUrl}/share`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
await sharing.page.waitForTimeout(2500);
const offlineOpened = (await sharing.page.locator('.editor').count()) === 1;
const offlineTold = (await sharing.page.locator('[data-sonner-toast]').filter({ hasText: 'without its pictures' }).count()) > 0;
await sharing.page.locator('[aria-label="Back to notes"]').click().catch(() => undefined);
await sharing.page.waitForTimeout(700);
const offlineCard = (await sharing.page.locator('.card').filter({ hasText: 'Offline find' }).count()) === 1;

// then: the note is written on the device and opens, and the reader is told its picture waits for nobody
check(
  'a share received offline becomes a note on the device, and says its pictures were left out',
  offlineOpened && offlineTold && offlineCard,
  JSON.stringify({ offlineOpened, offlineTold, offlineCard })
);

// when: the connection comes back
await sharing.context.setOffline(false);
await sharing.page.evaluate(() => window.dispatchEvent(new Event('online')));
await sharing.page.waitForTimeout(2500);
const offlineStored = await sharing.page.evaluate(async () => {
  const body = await fetch('/api/notes', { credentials: 'include' }).then((response) => response.json());
  return body.notes.some((note) => note.content.blocks.some((block) => block.spans.some((span) => span.text.includes('Offline find'))));
});

// then: the queue sends it like any note written offline
check('a share received offline reaches the server once it is back', offlineStored);
await sharing.context.close();

await browser.close();

console.log('');
if (failures.length > 0) {
  console.error(`mobile checks FAILED (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('mobile checks passed');

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
  await context.addInitScript(() => localStorage.setItem('notka.locale', 'en-US'));
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
  "a phone card carries the original's smaller type",
  layout.title === '16px/20px' && layout.content === '12px/15px',
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

const held = page.locator('.card').first();
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
    ring: card ? getComputedStyle(card).boxShadow : null,
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
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

console.log('\nthe editor on a phone');

await page.locator('.card').first().click();
await page.waitForSelector('.editor', { timeout: 10_000 });
await page.waitForTimeout(500);
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
    undo: document.querySelector('.toolbar [aria-label="Undo"]')?.hasAttribute('disabled')
  };
});
// Measured off the original's Android app: the pin, the bell and the archive on 40px buttons in the
// bar, 8px above and below them — none of them in the title's row.
check(
  "the editor has the original's own bar: back, pin, reminder and archive",
  bar.back &&
    bar.pin === 1 &&
    bar.bell === 1 &&
    bar.archive === 1 &&
    bar.headBell === 0 &&
    bar.headPin === 0 &&
    bar.button === 40 &&
    bar.height === 56,
  JSON.stringify(bar)
);
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
const entryOpen = await page.evaluate(() => window.history.state?.notkaEditor === true);
await page.locator('[aria-label="Back to notes"]').click();
await page.waitForTimeout(900);
const entryAfter = await page.evaluate(() => window.history.state?.notkaEditor === true);
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

// Measured off the owner's screenshots of the Android app: the checkbox 66px in, its handle centred
// at 32px, the text at 101px, one level 40px.
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
  geometry.checkbox[0] === 66 && geometry.checkbox[1] === 106 && geometry.text === 101 && geometry.handles[0] === 32,
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

await browser.close();

console.log('');
if (failures.length > 0) {
  console.error(`mobile checks FAILED (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('mobile checks passed');

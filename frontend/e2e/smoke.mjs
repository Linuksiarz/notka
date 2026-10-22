/**
 * Development-only interaction smoke test.
 *
 * Exercises the block editor's DOM behaviour (Markdown shortcuts, checklists, inline formatting,
 * appearance changes) against a stubbed API. This covers logic that unit tests cannot reach.
 *
 *   node smoke.mjs <base-url>
 */
import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://localhost:4173';

const OWNER = { id: 1, email: 'ada@example.com', displayName: 'Ada Lovelace' };
const now = Date.now();

/** What the server answers for a note whose links it has already fetched. */
const LINK_PREVIEWS = [
  {
    url: 'https://example.com/docs',
    title: 'Example Domain',
    siteName: 'example.com',
    imageUrl: null
  },
  {
    url: 'https://github.com/',
    title: 'GitHub',
    siteName: 'GitHub',
    imageUrl: null
  }
];

const EMPTY_NOTE = {
  id: 99,
  kind: 'TEXT',
  title: '',
  content: { version: 1, blocks: [{ id: 'n1', type: 'paragraph', spans: [] }] },
  linkPreviews: LINK_PREVIEWS,
  color: 'default',
  background: null,
  archived: false,
  position: 1,
  trashedAt: null,
  createdAt: now,
  updatedAt: now,
  version: 1,
  docVersion: 0,
  owner: OWNER,
  access: 'OWNER',
  canEdit: true,
  canChangeAppearance: true,
  labels: []
};

const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
await context.addInitScript(() => localStorage.setItem('notka.locale', 'en-US'));

await context.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace(/^\/api/, '');
  const json = (body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  if (path === '/auth/me') return json({ user: OWNER });
  if (path === '/labels') return json({ labels: [] });
  if (path === '/notes' && request.method() === 'GET') {
    // Two notes, one of them carrying previews: the grid needs more than one card for its columns to
    // have anything to balance.
    return json({
      notes: [
        EMPTY_NOTE,
        {
          ...EMPTY_NOTE,
          id: 98,
          title: 'Picked note',
          linkPreviews: [],
          content: {
            version: 1,
            blocks: [
              { id: 'p1', type: 'paragraph', spans: [{ text: 'a note with lines of its own' }] },
              { id: 'p2', type: 'paragraph', spans: [{ text: 'and a second line' }] }
            ]
          }
        }
      ]
    });
  }
  if (path === '/notes' && request.method() === 'POST') {
    const body = JSON.parse(request.postData() ?? '{}');
    return json({ ...EMPTY_NOTE, ...body, id: 99 }, 201);
  }
  // The body's step log: every editor here is alone, so its steps are always the next ones.
  if (/^\/notes\/\d+\/steps$/.test(path) && request.method() === 'POST') {
    const body = JSON.parse(request.postData() ?? '{}');
    return json({
      ...EMPTY_NOTE,
      title: body.title ?? '',
      kind: body.kind ?? 'TEXT',
      content: body.content,
      docVersion: body.docVersion + body.steps.length
    });
  }
  if (/^\/notes\/\d+$/.test(path)) {
    const body = request.postData() ? JSON.parse(request.postData()) : {};
    return json({ ...EMPTY_NOTE, ...body });
  }
  return json({ error: { code: 'NOT_FOUND', key: 'request.not_found', message: 'stub' } }, 404);
});

const page = await context.newPage();
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForSelector('.card');

console.log('\nopening a note');

// given: a stored note
// when: it is opened from the grid
await page.locator('.card', { hasText: 'Picked note' }).locator('.title').click();
await page.waitForSelector('.editor .note-body');
await page.waitForTimeout(300);

// then: loading it is not an edit, so there is nothing to undo — an enabled Undo here took the editor
// back to an empty document, and the autosave stored that over the note
check('opening a note leaves nothing to undo', await page.getByRole('button', { name: 'Undo' }).isDisabled());
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// and: once it closes it takes its caret with it — the browser otherwise keeps the selection,
// collapsed onto the left edge of the notes column, and a caret blinked there
const leftBehind = await page.evaluate(() => {
  const s = window.getSelection(); const n = s?.anchorNode;
  return { ranges: s?.rangeCount, type: s?.type, anchor: `${n?.nodeName}.${String(n?.className ?? n?.parentElement?.className ?? '')}`, editors: document.querySelectorAll('.ProseMirror').length };
});
check('a closed note leaves no caret behind', leftBehind.ranges === 0, JSON.stringify(leftBehind));

console.log('\nblock editor');

// given: a brand new note opened from the composer
await page.getByRole('button', { name: 'Take a note…' }).click();
await page.waitForSelector('.editor .note-body p');

// when: the user types a Markdown heading prefix
const first = page.locator('.editor .note-body p').first();
await first.click();
await page.keyboard.type('# Hello world');

// then: the line becomes a level-1 heading without the marker
check(
  'markdown "# " turns a line into a heading',
  (await page.locator('.editor .note-body h1').count()) === 1,
  await page.locator('.editor .note-body').innerHTML()
);
check(
  'the heading marker is removed',
  (await page.locator('.editor .note-body h1').innerText()) === 'Hello world',
  await page.locator('.editor .note-body h1').innerText()
);

// when: the user presses Enter and types a checklist marker
await page.keyboard.press('Enter');
await page.keyboard.type('[ ] buy milk');
await page.waitForTimeout(50);

// then: a checklist item exists and is unchecked
const checklist = page.locator('.editor .note-body li[data-checked]');
check('markdown "[ ] " turns a line into a checklist item', (await checklist.count()) === 1);
check('the new item is unchecked', (await checklist.first().getAttribute('data-checked')) === 'false');

// when: the checkbox is clicked
await checklist.first().locator('input[type="checkbox"]').click();

// then: the item is marked done
check('clicking the checkbox checks the item', (await checklist.first().getAttribute('data-checked')) === 'true');

// when: the user types inline emphasis on a fresh line
await page.keyboard.press('Enter');
await page.keyboard.type('**bold**');
await page.waitForTimeout(50);

// then: the line holds a real inline element, not literal asterisks
const boldLine = page.locator('.editor .note-body p').filter({ hasText: 'bold' }).first();
check('inline "**bold**" becomes a bold run', (await boldLine.locator('strong, b').count()) === 1);
check(
  'the bold delimiters are removed from the text',
  (await boldLine.innerText()) === 'bold',
  await boldLine.innerText()
);

// when: the user types inline code on the next line
await page.keyboard.press('Enter');
await page.keyboard.type('`code`');
await page.waitForTimeout(50);

// then: a <code> element is created
const codeLine = page.locator('.editor .note-body p').filter({ hasText: 'code' }).first();
check('inline backticks become a <code> element', (await codeLine.locator('code').count()) === 1);

// A pair of delimiters closes a run: what is typed afterwards is plain text. Our hand-written
// editor used to keep the formatting sticky here; Tiptap ends it at the closing delimiter, which is
// what every other Markdown-style editor does. Recorded because it is a visible change.
await page.keyboard.type(' plain');
await page.waitForTimeout(50);
check(
  'typing after a closed run is plain text',
  (await codeLine.locator('code').innerText()) === 'code' &&
    (await codeLine.innerText()) === 'code plain',
  await codeLine.innerHTML()
);

console.log('\nappearance');

// when: the user picks a color from the palette
await page.locator('.editor').getByRole('button', { name: 'Change color' }).click();
await page.waitForSelector('.appearance-picker');
await page.locator('.appearance-picker .swatch[data-color="red"]').click();
await page.waitForTimeout(50);

// then: the editor surface carries the chosen color
check(
  'picking a color updates the note surface',
  (await page.locator('.editor').first().getAttribute('data-color')) === 'red'
);

// when: the user picks a background
await page.locator('.editor').getByRole('button', { name: 'Change color' }).click();
await page.waitForSelector('.appearance-picker');
await page.locator('.appearance-picker .swatch[data-background="travel"]').click();
await page.waitForTimeout(50);

// then: the background joins the color the note is already wearing — the two are independent
// choices, the way the original has them
check(
  'picking a background keeps the color the note was wearing',
  (await page.locator('.editor').first().getAttribute('data-background')) === 'travel' &&
    (await page.locator('.editor').first().getAttribute('data-color')) === 'red',
  `background ${await page.locator('.editor').first().getAttribute('data-background')}, color ${await page.locator('.editor').first().getAttribute('data-color')}`
);

// when: another color is picked while the background is on
await page.locator('.editor').getByRole('button', { name: 'Change color' }).click();
await page.waitForSelector('.appearance-picker');
await page.locator('.appearance-picker .swatch[data-color="teal"]').click();
await page.waitForTimeout(50);

// then: the color changes and the background stays with it
check(
  'picking a color keeps the background',
  (await page.locator('.editor').first().getAttribute('data-color')) === 'teal' &&
    (await page.locator('.editor').first().getAttribute('data-background')) === 'travel',
  `color ${await page.locator('.editor').first().getAttribute('data-color')}, background ${await page.locator('.editor').first().getAttribute('data-background')}`
);

// when: the picker is opened again — the panel closes on every pick, so its own state has to be read
// while it is open
await page.locator('.editor').getByRole('button', { name: 'Change color' }).click();
await page.waitForSelector('.appearance-picker');

// then: both rows carry their own tick, and the two groups are separated by the original's own line
const bothPicked = await page.evaluate(() => {
  const picker = document.querySelector('.appearance-picker');
  const pressed = [...(picker?.querySelectorAll('.swatch[aria-pressed="true"]') ?? [])].map(
    (swatch) => swatch.getAttribute('data-color') ?? swatch.getAttribute('data-background')
  );
  const tile = (selector) => {
    const element = picker?.querySelector(selector);
    return element ? Math.round(element.getBoundingClientRect().width) : null;
  };
  return {
    pressed,
    border: getComputedStyle(picker.querySelector('.row.backgrounds')).borderTopWidth,
    noneBackground: tile('[data-none-background]'),
    background: tile('.swatch.background')
  };
});
check(
  'a color and a background are held at the same time, each with its own tick',
  bothPicked.pressed.includes('teal') && bothPicked.pressed.includes('travel'),
  JSON.stringify(bothPicked)
);
check(
  'the two groups of swatches are separated by a line',
  bothPicked.border === '1px',
  JSON.stringify(bothPicked)
);
check(
  "the 'no background' tile is as big as the tiles beside it",
  bothPicked.noneBackground === bothPicked.background && bothPicked.noneBackground === 40,
  JSON.stringify(bothPicked)
);

console.log('\nkeyboard');

// given: a brand new list note, the caret at the end of its only item
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New list' }).click();
await page.waitForSelector('.editor .note-body li[data-checked]');
await page.locator('.editor .note-body p').first().click();
await page.keyboard.type('one');
await page.waitForTimeout(50);
const before = await page.locator('.editor .note-body > *').count();

// when: Enter is pressed twice, so the second press lands on an empty list item
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.waitForTimeout(50);
const after = await page.locator('.editor .note-body > *').count();
const rowsLeft = await page.locator('.editor .note-body li[data-checked]').count();

// then: the empty row stays one row of the list — the caret never ends up under it
check(
  'Enter on an empty list item stays in the list',
  after === before && rowsLeft === 2,
  `${before} -> ${after}, rows left ${rowsLeft}`
);

// when: the "+ List item" row is clicked while the empty row waits at the end
await page.locator('.editor .add-item-row button').click();
await page.waitForTimeout(50);

// then: the caret goes to that row instead of a second empty one being stacked
check(
  '"+ List item" on an empty last row adds no second empty row',
  (await page.locator('.editor .note-body li[data-checked]').count()) === 2,
  `rows ${await page.locator('.editor .note-body li[data-checked]').count()}`
);

// when: Backspace removes the empty row, then the only remaining row is emptied and Backspace pressed
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.waitForTimeout(50);

// then: the last row is never lifted out of the list
check(
  'Backspace in the only, empty row keeps it in the list',
  (await page.locator('.editor .note-body li[data-checked]').count()) === 1 &&
    (await page.locator('.editor .note-body > p').count()) === 0,
  `rows ${await page.locator('.editor .note-body li[data-checked]').count()}`
);

// given: Chleb with a nested, ticked Mleko under it
await page.keyboard.type('Chleb');
await page.keyboard.press('Enter');
await page.keyboard.type('Mleko');
await page.keyboard.press('Tab');
await page.locator('.editor .note-body li:has(p:text-is("Mleko")) input').click();
await page.waitForTimeout(100);

// when: Enter is pressed at the end of Chleb and a row is typed
await page.locator('.editor .note-body li[data-checked]:has(p:text-is("Chleb")) p').click();
await page.waitForTimeout(150);
await page.keyboard.press('End');
await page.keyboard.press('Enter');
await page.keyboard.type('Masło');
await page.waitForTimeout(100);

// then: Mleko is still Chleb's — the new row goes after it, at the top level
const levels = await page.$$eval('.editor .note-body li[data-checked]', (list) =>
  list.map((li) => `${li.querySelector('p').innerText}:${li.dataset.depth}`)
);
check(
  'Enter at the end of a row leaves the rows nested under it with it',
  levels.join() === 'Chleb:0,Mleko:1,Masło:0',
  levels.join()
);

// when: Enter is pressed at the end of the ticked Mleko
await page.locator('.editor .note-body li[data-checked]:has(p:text-is("Mleko")) p').first().click();
await page.waitForTimeout(150);
await page.keyboard.press('End');
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
const ticked = await page.$$eval('.editor .note-body li[data-checked]', (list) =>
  list.map((li) => li.dataset.checked)
);

// then: the new row is ticked too, so the caret stays where it was
check('Enter in a ticked row makes a ticked row', ticked.join() === 'false,true,true,false', ticked.join());

// when: the first row is emptied and removed while a nested row stands under it
await page.locator('.editor .note-body li[data-checked]:has(p:text-is("Chleb")) p').click();
await page.keyboard.press('End');
for (let i = 0; i < 6; i += 1) await page.keyboard.press('Backspace');
await page.waitForTimeout(100);
const topRowDepth = await page.locator('.editor .note-body li[data-checked]').first().getAttribute('data-depth');

// then: the first row of the list is at level 0
check('the first row of a list is at level 0 after the row above it went', topRowDepth === '0', `depth ${topRowDepth}`);

console.log('\ncompleted items and reordering');

// given: a brand new list note with three rows
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New list' }).click();
await page.waitForSelector('.editor .note-body li[data-checked]');
await page.locator('.editor .note-body p').first().click();
await page.keyboard.type('alpha');
await page.keyboard.press('Enter');
await page.keyboard.type('beta');
await page.keyboard.press('Enter');
await page.keyboard.type('gamma');

const rows = () => page.$$eval('.editor .note-body li p', (list) => list.map((p) => p.innerText));

// when: the middle row is ticked
await page.locator('.editor .note-body li:has(p:text-is("beta")) input').click();
await page.waitForTimeout(200);

// then: it is drawn at the end of the list, under a heading that names it — and stays where it was in
// the note, which is the Android app's own model: the section is a drawing, the order is the note's
const drawnRows = () =>
  page.$$eval('.editor .note-body li[data-checked]', (list) =>
    list
      .filter((li) => getComputedStyle(li).display !== 'none')
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .map((li) => li.querySelector('p')?.innerText ?? '')
  );
check(
  'ticking a row draws it at the end of the list',
  (await drawnRows()).join(',') === 'alpha,gamma,beta',
  (await drawnRows()).join(',')
);
check('and leaves it where it was in the note', (await rows()).join(',') === 'alpha,beta,gamma', (await rows()).join(','));
const heading = page.locator('.editor .completed-toggle');
check('the completed rows get a heading', (await heading.count()) === 1);
check(
  'the heading counts the completed rows, in the singular',
  (await heading.innerText()).trim() === '1 completed item',
  await heading.innerText()
);
check(
  'the heading sits above the completed row',
  await page.evaluate(() => {
    const beta = [...document.querySelectorAll('.editor .note-body li')].find((row) => row.innerText.includes('beta'));
    const gamma = [...document.querySelectorAll('.editor .note-body li')].find((row) => row.innerText.includes('gamma'));
    const toggle = document.querySelector('.editor .completed-toggle');
    if (!beta || !gamma || !toggle) return false;
    const at = (element) => element.getBoundingClientRect().top;
    return at(gamma) < at(toggle) && at(toggle) < at(beta);
  })
);

// when: the heading is clicked
await heading.click();
await page.waitForTimeout(150);

// then: the ticked row is folded away without leaving the document
check(
  'clicking the heading folds the completed rows away',
  (await page.locator('.editor .note-body li:has(p:text-is("beta"))').isVisible()) === false
);
check(
  'a folded row is still in the document',
  (await page.locator('.editor .note-body li[data-checked="true"]').count()) === 1
);
check('the heading reports the folded state', (await heading.getAttribute('aria-expanded')) === 'false');

// when: it is clicked again
await heading.click();
await page.waitForTimeout(150);

// then: the rows come back
check(
  'clicking again brings the completed rows back',
  await page.locator('.editor .note-body li:has(p:text-is("beta"))').isVisible()
);

// then: every active row carries a six-dot handle in its margin — always, not on hover — and the
// completed one carries none, the way the original draws them
const gammaRow = page.locator('.editor .note-body li:has(p:text-is("gamma"))');
const dragHandles = page.locator('.drag-handle');
check(
  'each active row has a handle and the completed one has none',
  (await dragHandles.count()) === 2,
  `handles: ${await dragHandles.count()}`
);

const dragHandle = dragHandles.nth(1);
const handleBox = await dragHandle.boundingBox();
const gammaLine = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.editor .note-body li')].find(
    (li) => li.querySelector('p')?.innerText === 'gamma' && li.closest('.drop-shadow') === null
  );
  const line = row?.querySelector('label') ?? row;
  const box = line?.getBoundingClientRect();
  return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
});
check(
  "the handle sits in the margin, level with the row's line",
  Boolean(handleBox && gammaLine) &&
    handleBox.x + handleBox.width <= gammaLine.x + 1 &&
    Math.abs(handleBox.y + handleBox.height / 2 - (gammaLine.y + gammaLine.height / 2)) < 2,
  `${JSON.stringify(handleBox)} vs ${JSON.stringify(gammaLine)}`
);

// when: the pointer travels onto the handle itself
if (handleBox) {
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.waitForTimeout(150);
}

// then: it is still there to be pressed — a handle that vanished under the pointer could never be
// dragged, which is exactly what happened when it followed the hovered row
check(
  'the handle stays put under the pointer',
  (await dragHandles.count()) === 2,
  `handles: ${await dragHandles.count()}`
);

/**
 * The handle that belongs to a row, found by lining its centre up with the row's own line — the
 * handles all stand in one column (rule 21), so the match has to be vertical.
 */
async function handleFor(label) {
  return page.evaluate((text) => {
    const row = [...document.querySelectorAll('.editor .note-body li')].find(
      (li) => li.querySelector('p')?.innerText === text
    );
    if (!row) return null;
    const line = row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
    const centres = [...document.querySelectorAll('.drag-handle')].map((handle) => {
      const box = handle.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    return centres.sort((a, b) => Math.abs(a.y - line) - Math.abs(b.y - line))[0] ?? null;
  }, label);
}

console.log('\ndragging a row');

// given: a fresh list of four active rows — the completed one above has folded to the end of its own
// list, and a drag is about rows that can all be moved
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'New list' }).click();
await page.waitForSelector('.editor .note-body li[data-checked]');
await page.locator('.editor .note-body p').first().click();
await page.keyboard.type('alpha');
for (const text of ['beta', 'gamma', 'delta']) {
  await page.keyboard.press('Enter');
  await page.keyboard.type(text);
}
// The first autosave creates the note, and the link cards the server sends for it change the editor's
// height when they arrive — so let the writing settle before anything is measured.
await page.waitForTimeout(800);

// when: the handle is pressed and the hand barely moves — a few pixels, less than the slop
const holdBox = await handleFor('gamma');
if (holdBox) {
  await page.mouse.move(holdBox.x, holdBox.y);
  await page.mouse.down();
  await page.mouse.move(holdBox.x, holdBox.y + 5, { steps: 2 });
  await page.waitForTimeout(80);
  // then: the row is still part of the list — nothing has come under the band, so a plain click on
  // the handle is harmless
  check(
    'grabbing a handle holds the row until the hand decides',
    (await page.locator('.dragging-row').count()) === 0,
    `carried ${await page.locator('.dragging-row').count()}`
  );
  await page.mouse.up();
  await page.waitForTimeout(120);
}

// given: where everything stands before the hand takes hold of anything
const beforeDrag = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('.editor .note-body li[data-checked]')].map((li) => ({
    text: li.querySelector('p')?.innerText ?? '',
    top: Math.round(li.getBoundingClientRect().top),
    height: Math.round(li.getBoundingClientRect().height)
  })),
  body: Math.round(document.querySelector('.editor .note-body').getBoundingClientRect().height),
  toolbar: Math.round(document.querySelector('.editor .toolbar')?.getBoundingClientRect().top ?? 0),
  parts: [...document.querySelectorAll('.editor > *')].map((part) => ({
    cls: part.className,
    top: Math.round(part.getBoundingClientRect().top),
    height: Math.round(part.getBoundingClientRect().height)
  }))
}));

// when: the row is picked up and the hand has travelled past the slop, but no further than its own row
const carryBox = await handleFor('gamma');
if (carryBox) {
  await page.mouse.move(carryBox.x, carryBox.y);
  await page.mouse.down();
  await page.mouse.move(carryBox.x, carryBox.y - 12, { steps: 4 });
  await page.waitForTimeout(120);

  const picked = await page.evaluate(() => {
    const carried = document.querySelector('.editor .note-body li.dragging-row');
    const style = carried ? getComputedStyle(carried) : null;
    const band = document.querySelector('.rich-text > .drag-band');
    const bandStyle = band ? getComputedStyle(band) : null;
    const bandBox = band?.getBoundingClientRect();
    const carriedBox = carried?.getBoundingClientRect();
    const card = document.querySelector('.editor').getBoundingClientRect();
    const others = [...document.querySelectorAll('.editor .note-body li[data-checked]')]
      .filter((li) => li !== carried)
      .map((li) => ({
        text: li.querySelector('p')?.innerText ?? '',
        top: Math.round(li.getBoundingClientRect().top)
      }));
    return {
      carried: document.querySelectorAll('.dragging-row').length,
      ghosts: document.querySelectorAll('.drop-gap, .drop-shadow, .drag-bar, .drag-cancel').length,
      band: bandStyle?.backgroundColor ?? null,
      ink: style?.color ?? null,
      // The band is the carried row's own box, drawn at the note's own width: measured, its left edge
      // is the card's left edge and its right edge the card's right one, and its height is the row's.
      paintedLeft: bandBox ? Math.round(bandBox.left) : null,
      paintedRight: bandBox ? Math.round(bandBox.right) : null,
      paintedHeight: bandBox ? Math.round(bandBox.height) : null,
      rowHeight: carriedBox ? Math.round(carriedBox.height) : null,
      card: { left: Math.round(card.left), right: Math.round(card.right) },
      body: Math.round(document.querySelector('.editor .note-body').getBoundingClientRect().height),
      toolbar: Math.round(document.querySelector('.editor .toolbar')?.getBoundingClientRect().top ?? 0),
      parts: [...document.querySelectorAll('.editor > *')].map((part) => ({
        cls: part.className,
        top: Math.round(part.getBoundingClientRect().top),
        height: Math.round(part.getBoundingClientRect().height)
      })),
      others
    };
  });

  check(
    "the carried row is marked with the original's own band, and nothing else is drawn",
    picked.carried === 1 &&
      picked.ghosts === 0 &&
      picked.band === 'rgb(31, 33, 37)' &&
      picked.ink === 'rgb(239, 241, 245)',
    JSON.stringify(picked)
  );
  // The band reaches the note's own edges. A shadow that stopped short of them left a strip of the
  // note beside the band, with the handle's dark box poking out of it as a vertical line — which is
  // the artefact the owner saw in the first screenshot of this state.
  check(
    "the band runs from the note's left edge to its right, with no strip beside it",
    picked.paintedLeft !== null &&
      picked.paintedRight !== null &&
      Math.abs(picked.paintedLeft - (picked.card.left + 1)) <= 1 &&
      Math.abs(picked.paintedRight - (picked.card.right - 1)) <= 1,
    `painted ${picked.paintedLeft}..${picked.paintedRight}, card ${picked.card.left}..${picked.card.right}`
  );
  // The band is the row's own box and nothing else: its height is that row's height, so a row of
  // three lines is three lines tall on the band and its neighbours are not a pixel of it.
  check(
    "the band is the carried row's own box, and no taller",
    picked.paintedHeight !== null &&
      picked.rowHeight !== null &&
      picked.paintedHeight === picked.rowHeight,
    `band ${picked.paintedHeight} against a row of ${picked.rowHeight}`
  );
  // A row that has been picked up but not yet moved must not disturb the list: the rows that stay are
  // exactly where they were, and the note around the list has not been re-laid out.
  const stillThere = beforeDrag.rows.filter((row) => row.text !== 'gamma');
  check(
    'picking a row up moves nothing: the rows that stay keep their places',
    stillThere.every((row) =>
      picked.others.some((other) => other.text === row.text && other.top === row.top)
    ) &&
      picked.body === beforeDrag.body &&
      picked.toolbar === beforeDrag.toolbar,
    `${JSON.stringify(picked.others)} vs ${JSON.stringify(stillThere)}, body ${picked.body}/${beforeDrag.body}, parts ${JSON.stringify(picked.parts)} vs ${JSON.stringify(beforeDrag.parts)}`
  );
  // The carried row keeps its own handle, and the handle rides the band rather than staying behind in
  // the list — a handle left without its row is the owner's "the handle flies off to the beginning".
  const heldHandle = await page.evaluate(() => {
    const held = document.querySelector('.drag-handle.held');
    const row = document.querySelector('.editor .note-body li.dragging-row');
    const note = document.querySelector('.editor .note-body').getBoundingClientRect();
    if (!held || !row) return null;
    const h = held.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const centre = h.top + h.height / 2;
    return {
      onBand: getComputedStyle(held).backgroundColor,
      inside: centre >= r.top - 1 && centre <= r.bottom + 1,
      strayed: [...document.querySelectorAll('.drag-handle')].filter((handle) => {
        const box = handle.getBoundingClientRect();
        return box.height === 0 || box.top < note.top;
      }).length
    };
  });
  check(
    'the carried row keeps its own handle, and it rides the band',
    heldHandle !== null &&
      heldHandle.onBand === 'rgb(31, 33, 37)' &&
      heldHandle.inside === true &&
      heldHandle.strayed === 0,
    JSON.stringify(heldHandle)
  );

  // when: the hand carries the row down past the row below it, and then up above the first one
  await page.mouse.move(carryBox.x, carryBox.y + 46, { steps: 8 });
  await page.waitForTimeout(200);
  const down = await page.evaluate(() => ({
    painted: [...document.querySelectorAll('.editor .note-body li[data-checked]')]
      .map((li) => ({ text: li.querySelector('p')?.innerText ?? '', top: li.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top)
      .map((row) => row.text),
    shifts: [...document.querySelectorAll('.editor .note-body li.drag-shift')].map(
      (li) => getComputedStyle(li).transform
    ),
    body: Math.round(document.querySelector('.editor .note-body').getBoundingClientRect().height)
  }));
  await page.mouse.move(carryBox.x, carryBox.y - 90, { steps: 10 });
  await page.waitForTimeout(200);
  const up = await page.evaluate(() => ({
    painted: [...document.querySelectorAll('.editor .note-body li[data-checked]')]
      .map((li) => ({ text: li.querySelector('p')?.innerText ?? '', top: li.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top)
      .map((row) => row.text),
    body: Math.round(document.querySelector('.editor .note-body').getBoundingClientRect().height)
  }));

  // then: the rows part around the row in the hand, and **nothing about the note is re-laid out** —
  // the list keeps the height it had, so what stands below it does not jump as the hand moves
  check(
    'the rows make room for the carried one without the list changing height',
    down.body === beforeDrag.body && up.body === beforeDrag.body && down.shifts.length > 0,
    `body ${down.body}/${up.body}/${beforeDrag.body}, shifts ${JSON.stringify(down.shifts)}`
  );
  check(
    'the drawn order follows the hand',
    down.painted.join(',') === 'alpha,beta,delta,gamma' && up.painted.join(',') === 'gamma,alpha,beta,delta',
    `${down.painted.join(',')} then ${up.painted.join(',')}`
  );

  // when: the row is dropped where the hand left it
  await page.mouse.up();
  await page.waitForTimeout(250);

  // then: it lands exactly where it was drawn — the order written down is the order that was on
  // screen, which is the whole of "you know where it will land"
  check(
    'the row lands where it was drawn, not one place either side of it',
    (await rows()).join(',') === up.painted.join(','),
    `${(await rows()).join(',')} vs ${up.painted.join(',')}`
  );
  check(
    'the drop leaves no drawing behind',
    (await page.locator('.dragging-row').count()) === 0 &&
      (await page.locator('.drag-shift').count()) === 0,
    `carried ${await page.locator('.dragging-row').count()}, shifted ${await page.locator('.drag-shift').count()}`
  );
  // then: it was one change, so one undo puts the list back the way it was
  await page.locator('.editor .note-body p', { hasText: 'beta' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(250);
  check(
    'a whole drag is one change: one undo puts the row back',
    (await rows()).join(',') === 'alpha,beta,gamma,delta',
    (await rows()).join(',')
  );
}

// when: a row is carried and the hand wanders, and then Escape is pressed instead of dropping it
const escapeBox = await handleFor('gamma');
if (escapeBox) {
  await page.mouse.move(escapeBox.x, escapeBox.y);
  await page.mouse.down();
  await page.mouse.move(escapeBox.x, escapeBox.y - 60, { steps: 8 });
  await page.waitForTimeout(150);
  const carried = (await page.locator('.dragging-row').count()) === 1;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // then: the note is untouched — not one place was written while the hand moved, so there is nothing
  // to put back and nothing in the undo history
  check(
    'Escape lets go of the row without writing anything',
    carried &&
      (await page.locator('.dragging-row').count()) === 0 &&
      (await rows()).join(',') === 'alpha,beta,gamma,delta',
    `${(await rows()).join(',')}, carried ${await page.locator('.dragging-row').count()}, editor ${await page.locator('.editor').count()}, composer ${await page.locator('.composer').count()}`
  );
  await page.mouse.up();
  await page.waitForTimeout(150);
}

console.log('\nlevels');

const depthOf = (text) =>
  page.evaluate((label) => {
    const row = [...document.querySelectorAll('.editor .note-body li[data-checked]')].find(
      (li) => li.querySelector('p')?.innerText === label
    );
    return row?.getAttribute('data-depth') ?? null;
  }, text);
const checkboxOffset = (text) =>
  page.evaluate((label) => {
    const row = [...document.querySelectorAll('.editor .note-body li[data-checked]')].find(
      (li) => li.querySelector('p')?.innerText === label
    );
    const checkbox = row?.querySelector('input[type="checkbox"]');
    const note = document.querySelector('.editor .note-body').getBoundingClientRect();
    return checkbox ? Math.round(checkbox.getBoundingClientRect().left - note.left) : null;
  }, text);

// given: the caret in the second row of a list
await page.locator('.editor .note-body p', { hasText: 'beta' }).click();
// The click is the caret's new home, and ProseMirror reads the DOM's own selection on its next
// observer flush — a key pressed in the same tick would still act on the caret it had before.
await page.waitForTimeout(150);
// when: Tab is pressed once, and then again, and again
await page.keyboard.press('Tab');
await page.waitForTimeout(80);
const once = await depthOf('beta');
const onceOffset = await checkboxOffset('beta');
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await page.waitForTimeout(80);
const thrice = await depthOf('beta');
const plainOffset = await checkboxOffset('alpha');

// then: one level exists and only one — the third Tab changes nothing, so a line the server would
// refuse cannot be written here at all
check(
  'Tab indents a row one level, and no further',
  once === '1' && thrice === '1',
  `${once} then ${thrice} — ${JSON.stringify(
    await page.evaluate(() => ({
      focus: document.activeElement?.className ?? null,
      caret: window.getSelection()?.anchorNode?.parentElement?.innerText ?? null,
      depths: [...document.querySelectorAll('.editor .note-body li[data-checked]')].map(
        (li) => `${li.querySelector('p')?.innerText}:${li.getAttribute('data-depth')}`
      )
    }))
  )}`
);
// measured off the original: a nested row's checkbox sits 25px right of the row above it
check(
  'one level is 25px, measured off the original',
  onceOffset !== null && plainOffset !== null && onceOffset - plainOffset === 25,
  `${plainOffset} -> ${onceOffset}`
);

// when: Shift-Tab takes it back out, and Tab is pressed on the first row of the list
await page.keyboard.press('Shift+Tab');
await page.waitForTimeout(80);
const back = await depthOf('beta');
await page.locator('.editor .note-body p', { hasText: 'gamma' }).click();
await page.keyboard.press('Tab');
await page.waitForTimeout(80);
const firstRow = await depthOf('gamma');

check(
  'Shift-Tab takes the row back out, and the first row has nothing to indent under',
  back === '0' && firstRow === '0',
  `${back} then ${firstRow}`
);

// when: a row is carried sideways, which is how the level is chosen by hand, and then back
const sideBox = await handleFor('delta');
if (sideBox) {
  await page.mouse.move(sideBox.x, sideBox.y);
  await page.mouse.down();
  await page.mouse.move(sideBox.x + 40, sideBox.y + 20, { steps: 10 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const pulled = await depthOf('delta');
  const pullBackBox = await handleFor('delta');
  if (pullBackBox) {
    await page.mouse.move(pullBackBox.x, pullBackBox.y);
    await page.mouse.down();
    await page.mouse.move(pullBackBox.x - 40, pullBackBox.y, { steps: 10 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
  const returned = await depthOf('delta');
  // then: half a level of sideways travel is the whole of the rule — a drag stays at the level it
  // started at unless the hand asks for the other one
  check(
    'a sideways pull changes the row’s level, and pulling back changes it again',
    pulled === '1' && returned === '0',
    `${pulled} then ${returned}`
  );
}

// when: a row is dragged hard to the right over the row below it, which is how a second level would
// once have been written
const overBox = await handleFor('delta');
if (overBox) {
  await page.mouse.move(overBox.x, overBox.y);
  await page.mouse.down();
  await page.mouse.move(overBox.x + 120, overBox.y, { steps: 6 });
  await page.mouse.move(overBox.x + 120, overBox.y - 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}
const depths = await page.$$eval('.editor .note-body li[data-checked]', (list) =>
  list.map((li) => Number(li.getAttribute('data-depth') ?? 0))
);
check(
  'no gesture can write a second level: every row is at level 0 or 1',
  depths.every((depth) => depth <= 1),
  JSON.stringify(depths)
);

console.log('\nthe row’s own ✕');

// when: the pointer comes to rest on a row, and that row's own ✕ is clicked
const deleteBox = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.editor .note-body li')].find(
    (li) => li.querySelector('p')?.innerText === 'alpha'
  );
  if (!row) return null;
  const line = row.querySelector('label') ?? row;
  const box = line.getBoundingClientRect();
  return { x: box.left + 60, y: box.top + box.height / 2 };
});
if (deleteBox) {
  await page.mouse.move(deleteBox.x, deleteBox.y);
  await page.waitForTimeout(150);
  const placed = await page.evaluate(() => {
    const button = document.querySelector('.row-delete');
    const wrapper = document.querySelector('.rich-text');
    if (!button || !wrapper) return { shown: false };
    const box = button.getBoundingClientRect();
    const host = wrapper.getBoundingClientRect();
    return {
      shown: true,
      inside: box.left > host.left && box.right < host.right,
      label: button.getAttribute('aria-label')
    };
  });
  // then: the ✕ is on the row the pointer is on, and it is inside the note — half a target hanging
  // off the edge is half a target that is not there
  check(
    "the row's own ✕ belongs to the row under the pointer",
    placed.shown && placed.inside,
    JSON.stringify(placed)
  );
  await page.click('.row-delete');
  await page.waitForTimeout(300);
  // then: that row is gone and its neighbours are not — one transaction, so undo has one step. The
  // row *is* the item, so the whole row goes rather than its text being emptied.
  check(
    "clicking the row's ✕ deletes that row",
    !(await rows()).includes('alpha') &&
      (await rows()).includes('beta') &&
      (await rows()).includes('gamma'),
    (await rows()).join(',')
  );
  // then: one undo brings it back, and the rest of this suite still has the note it expects
  await page.locator('.editor .note-body p', { hasText: 'beta' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(300);
  check(
    "the row's ✕ is one change, so one undo brings the row back",
    (await rows()).includes('alpha'),
    (await rows()).join(',')
  );
}

console.log('\ndemo instance');

// given: an instance that says it is a demo, and nobody signed in yet
const demoContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
await demoContext.addInitScript(() => localStorage.setItem('notka.locale', 'en-US'));
await demoContext.route('**/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
  const json = (body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path === '/health') {
    return json({
      status: 'ok',
      version: 'test',
      demo: true,
      demoAccounts: [
        { email: 'alice@example.com', password: 'alice123' },
        { email: 'bob@example.com', password: 'bob12345' }
      ]
    });
  }
  if (path === '/auth/me') {
    return json({ error: { code: 'UNAUTHORIZED', key: 'request.unauthorized', message: 'stub' } }, 401);
  }
  return json({ error: { code: 'NOT_FOUND', key: 'request.not_found', message: 'stub' } }, 404);
});
const demoPage = await demoContext.newPage();
await demoPage.goto(baseUrl, { waitUntil: 'networkidle' });
await demoPage.waitForSelector('.demo');

// then: the sign-in screen offers the sample accounts rather than sending anyone to the README
check('a demo instance offers its accounts on the sign-in screen', (await demoPage.locator('.demo button').count()) === 2);

// when: one of them is picked
await demoPage.locator('.demo button').first().click();

// then: it fills the form instead of signing in behind the user's back
check(
  'picking a demo account fills the form',
  (await demoPage.getByLabel('Email').inputValue()) === 'alice@example.com' &&
    (await demoPage.getByLabel('Password', { exact: true }).inputValue()) === 'alice123'
);
await demoContext.close();

// when: an address is typed into the note
await page.keyboard.press('Enter');
// The trailing space is what tells the editor the address has ended — autolink fires on the
// boundary, exactly as it does for a person typing a link.
await page.keyboard.type('https://example.com/docs ');
await page.waitForTimeout(400);

// then: it reads as a link, the way the original writes one
check(
  'a typed address becomes a link',
  (await page.locator('.editor .note-body a[href="https://example.com/docs"]').count()) === 1,
  await page.locator('.editor .note-body').innerHTML()
);

// then: every card the server sent sits under the body, at the original's measurements
const cards = await page.evaluate(() => {
  const block = document.querySelector('.editor .links');
  const rows = [...(block?.querySelectorAll('.row') ?? [])];
  const thumb = block?.querySelector('.thumb');
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return { w: Math.round(rect.width), h: Math.round(rect.height) };
  };
  return {
    rows: rows.length,
    height: rows[0] ? box(rows[0]).h : 0,
    thumb: thumb ? box(thumb) : null,
    sites: [...(block?.querySelectorAll('.site') ?? [])].map((node) => node.textContent?.trim()),
    actions: block?.querySelectorAll('.action').length ?? 0,
    // The address in the text is painted in the accent, which the original does and ours did not.
    linkColor: getComputedStyle(document.querySelector('.editor .note-body a')).color,
    bodyColor: getComputedStyle(document.querySelector('.editor .note-body p')).color,
    // The row's text is **lighter than the note it sits on** and its thumbnail's cell is not: the
    // overlay starts where the 56px cell ends (`--keep-link-row`, measured off the owner's
    // screenshots of the original in both themes).
    rowFill: rows[0] ? getComputedStyle(rows[0]).backgroundImage : null,
    overlay: getComputedStyle(document.documentElement).getPropertyValue('--keep-link-row').trim(),
    // In the editor every row is a card of its own: rounded and raised.
    radius: rows[0] ? getComputedStyle(rows[0]).borderTopLeftRadius : null,
    shadow: rows[0] ? getComputedStyle(rows[0]).boxShadow : null
  };
});
check(
  'a link row lightens its text and leaves the thumbnail’s cell to the note',
  /^linear-gradient\(to right, rgba\(0, 0, 0, 0\) 56px, rgba\([^)]+\) 56px\)$/.test(cards.rowFill ?? '') &&
    cards.overlay.length > 0,
  JSON.stringify({ rowFill: cards.rowFill, overlay: cards.overlay })
);
check(
  'in the editor each link row is a raised card of its own',
  cards.radius === '8px' && cards.shadow !== 'none',
  JSON.stringify({ radius: cards.radius, shadow: cards.shadow })
);
check(
  'the editor shows a link card per preview, at the measured size',
  cards.rows === 2 &&
    cards.height === 56 &&
    cards.thumb?.w === 56 &&
    cards.thumb?.h === 56 &&
    cards.actions === 2 &&
    cards.sites.join(',') === 'example.com,github.com' &&
    cards.linkColor !== cards.bodyColor,
  JSON.stringify(cards)
);

console.log('\nthe grid while notes are picked');

// given: the grid, whose first card carries the link previews the server sent
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForSelector('.card');
await page.waitForTimeout(250);
const gridShape = () =>
  page.evaluate(() => {
    const origin = document.querySelector('.sections').getBoundingClientRect();
    return {
      links: document.querySelectorAll('.card .links').length,
      cards: [...document.querySelectorAll('.card')].map((card) => {
        const box = card.getBoundingClientRect();
        return {
          x: Math.round(box.x - origin.x),
          y: Math.round(box.y - origin.y),
          h: Math.round(box.height)
        };
      })
    };
  });
const gridBefore = await gridShape();

// when: that note is picked
await page.locator('.card').first().hover();
await page.waitForTimeout(200);
await page.locator('.card-tick').first().click();
await page.waitForTimeout(350);
const gridPicked = await gridShape();

// then: its link previews are still drawn and not one card has moved or changed height. **A card's
// box must not depend on whether notes are being picked**: the grid is a multi-column layout whose
// columns are balanced by the total height, so one shorter card re-deals all of them — which is how
// the owner's "Books to lend" jumped to another column the moment it was ticked, and came back when
// it was unticked.
check(
  'picking a note leaves every card exactly where it was',
  gridBefore.links > 0 && JSON.stringify(gridBefore) === JSON.stringify(gridPicked),
  `${JSON.stringify(gridBefore)} vs ${JSON.stringify(gridPicked)}`
);

// and: putting it back changes nothing either
await page.locator('.card').first().hover();
await page.waitForTimeout(200);
await page.locator('.card-tick').first().click();
await page.waitForTimeout(350);
check(
  'unpicking it leaves the grid alone too',
  JSON.stringify(await gridShape()) === JSON.stringify(gridBefore),
  JSON.stringify(await gridShape())
);

await browser.close();

console.log('');
if (failures.length > 0) {
  console.error(`smoke test FAILED (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('smoke test passed');

/**
 * Development-only end-to-end test against the real backend.
 *
 * Registers two accounts, exercises the note lifecycle through the UI, and verifies the
 * appearance-sharing rule that distinguishes Notka from Google Keep.
 *
 *   node e2e.mjs <base-url>
 */
import { chromium } from 'playwright';
import { ADMIN, openRegistration } from './admin.mjs';
import { strToU8, zipSync } from 'fflate';
import { deflateSync, crc32 } from 'node:zlib';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8080';
await openRegistration(baseUrl);
const run = Date.now().toString(36);
const ALICE = { email: `alice.${run}@example.com`, name: 'Alice Liddell', password: 'correct horse battery' };
const BOB = { email: `bob.${run}@example.com`, name: 'Bob Kahn', password: 'correct horse battery' };

const failures = [];

/**
 * A card's labels are in its "More" menu, as in the original; the picker then hangs under the card.
 */
async function openCardLabels(card) {
  await card.hover();
  await card.getByRole('button', { name: 'More options' }).click();
  await card.page().getByRole('menuitem', { name: 'Add label' }).click();
}

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

const browser = await chromium.launch();

async function newUser(user, locale = 'en-US') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale });
  await context.addInitScript((value) => {
    localStorage.setItem('notka.locale', value);
    localStorage.setItem('notka.browserNotice', 'dismissed');
  }, locale);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/register`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Display name').fill(user.name);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByLabel('Confirm password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForSelector('.topbar', { timeout: 15_000 });
  return { context, page };
}

console.log('\nregistration and session');

// given: two brand new accounts
const alice = await newUser(ALICE);
const bob = await newUser(BOB);

// then: the app shell is shown and no login form remains
check('registering signs the user straight in', (await alice.page.locator('.auth').count()) === 0);
check(
  'the account menu shows the new user',
  (await alice.page.getByRole('button', { name: 'Account menu' }).count()) === 1
);

// when: the page is reloaded
await alice.page.reload({ waitUntil: 'networkidle' });
await alice.page.waitForSelector('.topbar');

// then: the session survives (cookie based)
check('the session survives a reload', (await alice.page.locator('.auth').count()) === 0);

console.log('\nnote lifecycle');

// when: a note is created through the composer
await alice.page.getByRole('button', { name: 'Take a note…' }).click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor .note-body p').first().click();
await alice.page.keyboard.type('# Trip plan');
await alice.page.keyboard.press('Enter');
await alice.page.keyboard.type('Book the night train');
await alice.page.locator('.editor textarea.title').fill('Kraków');
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await alice.page.waitForSelector('.editor', { state: 'detached' });
await alice.page.waitForTimeout(600);

// then: a real note card appears with the heading rendered as a heading
const card = alice.page.locator('.card').first();
await card.waitFor();
check('the note is saved and listed', (await alice.page.locator('.card').count()) === 1);
check(
  'the title is stored',
  (await card.locator('.title').innerText()) === 'Kraków',
  await card.locator('.title').innerText()
);
check(
  'the markdown heading was stored as a heading block',
  (await card.locator('.line[data-type="heading1"]').count()) === 1
);

// when: the note is archived
await card.hover();
await card.getByRole('button', { name: 'Archive note' }).click();
await alice.page.waitForTimeout(600);

// then: it leaves the notes view and appears in the archive
check('archiving removes the note from the notes view', (await alice.page.locator('.card').count()) === 0);

// when: the snackbar's Undo is pressed
await alice.page.getByRole('button', { name: 'Undo', exact: true }).click();
await alice.page.waitForTimeout(600);

// then: the note is back in the notes view, and archiving it again leaves it archived
check('Undo on the archive snackbar brings the note back', (await alice.page.locator('.card').count()) === 1);
await alice.page.locator('.card').first().hover();
await alice.page.locator('.card').first().getByRole('button', { name: 'Archive note' }).click();
await alice.page.waitForTimeout(600);
await alice.page.goto(`${baseUrl}/archive`, { waitUntil: 'networkidle' });
await alice.page.waitForTimeout(400);
check('the archived note is in the archive', (await alice.page.locator('.card').count()) === 1);

// when: it is restored from the archive
const archived = alice.page.locator('.card').first();
await archived.hover();
await archived.getByRole('button', { name: 'Unarchive note' }).click();
await alice.page.waitForTimeout(600);

// then: the archive is empty again
check('unarchiving empties the archive', (await alice.page.locator('.card').count()) === 0);

console.log('\nversion history');

// when: the note's title is edited, which replaces the state it had
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });
await alice.page.waitForTimeout(400);
await alice.page.locator('.card').first().click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor textarea.title').fill('Kraków (revised)');
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await alice.page.waitForTimeout(800);

// then: the history lists the state that edit replaced
await alice.page.locator('.card').first().click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor').getByRole('button', { name: 'More options' }).click();
await alice.page.getByRole('menuitem', { name: 'Version history' }).click();
await alice.page.waitForSelector('.history');
check('the history dialog opens on top of the editor', (await alice.page.locator('.history').count()) === 1);

// The list is fetched after the dialog renders, so wait for it rather than racing it.
await alice.page.locator('.history .list li').first().waitFor({ timeout: 5000 });
const firstEntry = await alice.page.locator('.history .list li').first().innerText();
check('the replaced states are listed', (await alice.page.locator('.history .list li').count()) >= 1, firstEntry);
check(
  'the archived state is the one the edit replaced, not the current one',
  firstEntry.includes('Kraków') && !firstEntry.includes('revised'),
  firstEntry
);
check('the entry names a version', /Version \d+/.test(firstEntry), firstEntry);

// and: it can be downloaded
const [download] = await Promise.all([
  alice.page.waitForEvent('download'),
  alice.page.locator('.history .list li').first().getByRole('button', { name: 'Download' }).click()
]);
check(
  'the archived version downloads as a file',
  download.suggestedFilename().endsWith('.md'),
  download.suggestedFilename()
);

// and: closing the history leaves the editor open
await alice.page.locator('.history .done').click();
await alice.page.waitForTimeout(300);
check('closing the history keeps the editor open', (await alice.page.locator('.editor').count()) === 1);
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await alice.page.waitForTimeout(400);

console.log('\nsharing and the appearance rule');

// given: the note is back in the notes view and painted yellow
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });
const owned = alice.page.locator('.card').first();
await owned.waitFor();
await owned.hover();
await owned.getByRole('button', { name: 'Change color' }).click();
await alice.page.locator('.appearance-picker .swatch[data-color="yellow"]').first().click();
await alice.page.waitForTimeout(600);
check(
  'the owner sees their own colour',
  (await alice.page.locator('.card').first().getAttribute('data-color')) === 'yellow'
);

// then: the picker offers every background the app has, each with both theme variants on disk
await alice.page.locator('.card').first().hover();
await alice.page.locator('.card').first().getByRole('button', { name: 'Change color' }).click();
await alice.page.waitForSelector('.appearance-picker');
const offered = await alice.page.evaluate(() => {
  const swatches = [...document.querySelectorAll('.appearance-picker .swatch[data-background]')];
  return {
    names: swatches.map((swatch) => swatch.getAttribute('data-background')),
    labelled: swatches.filter((swatch) => (swatch.getAttribute('aria-label') ?? '').length > 0).length
  };
});
const variants = await alice.page.evaluate(async (names) => {
  const found = [];
  for (const name of names) {
    for (const theme of ['light', 'dark']) {
      const response = await fetch(`/backgrounds/${name}-${theme}.svg`);
      if (!response.ok) found.push(`${name}-${theme}`);
    }
  }
  return found;
}, offered.names);
check(
  'every background the picker offers has both theme variants and a name',
  offered.names.length === 9 &&
    offered.labelled === offered.names.length &&
    variants.length === 0,
  JSON.stringify({ ...offered, missing: variants })
);

// then: the picker carries the original's measurements and hangs centred under the card
const anchorBox = await owned.boundingBox();
const pickerMetrics = await alice.page.evaluate((anchor) => {
  const box = document.querySelector('.appearance-picker');
  const rect = (element) => element.getBoundingClientRect();
  const colours = [...box.querySelectorAll('.row:first-child .swatch:not(.background)')];
  const backgrounds = [...box.querySelectorAll('.swatch.background')];
  const rows = [...box.querySelectorAll('.row')].map(rect);
  const boxRect = rect(box);
  return {
    colour: Math.round(rect(colours[1]).width),
    colourPitch: Math.round(rect(colours[2]).left - rect(colours[1]).left),
    background: Math.round(rect(backgrounds[0]).width),
    backgroundPitch: Math.round(rect(backgrounds[1]).left - rect(backgrounds[0]).left),
    rowGap: Math.round(rows[1].top - rows[0].bottom),
    // The "no background" tile is one of the background row's own, so it is that row's size: 32px
    // there was the owner's "wyraźnie mniejsza od pozostałych elementów w tej linii".
    noneBackground: Math.round(rect(box.querySelector('[data-none-background]')).width),
    divider: getComputedStyle(box.querySelector('.row.backgrounds')).borderTopWidth,
    icons:
      (box.querySelector('.row:first-child .swatch.none svg') ? 1 : 0) +
      (box.querySelector('[data-none-background] svg') ? 1 : 0),
    centreOffset:
      Math.round(((boxRect.left + boxRect.right) / 2 - (anchor.x + anchor.width / 2)) * 10) / 10,
    topGap: Math.round((boxRect.top - (anchor.y + anchor.height)) * 10) / 10
  };
}, anchorBox);
check(
  "the appearance picker has the original's measurements",
  pickerMetrics.colour === 32 &&
    pickerMetrics.colourPitch === 36 &&
    pickerMetrics.background === 40 &&
    pickerMetrics.backgroundPitch === 44 &&
    pickerMetrics.noneBackground === 40 &&
    pickerMetrics.divider === '1px' &&
    pickerMetrics.rowGap === 12 &&
    pickerMetrics.icons === 2,
  JSON.stringify(pickerMetrics)
);
check(
  'the appearance picker hangs centred just under the card',
  Math.abs(pickerMetrics.centreOffset) <= 2 &&
    pickerMetrics.topGap >= 0 &&
    pickerMetrics.topGap <= 6,
  JSON.stringify({ centreOffset: pickerMetrics.centreOffset, topGap: pickerMetrics.topGap })
);
await alice.page.keyboard.press('Escape');
await alice.page.waitForTimeout(300);

// when: the owner shares the note as "can edit"
await alice.page.locator('.card').first().hover();
await alice.page.locator('.card').first().getByRole('button', { name: 'Add collaborator' }).click();
await alice.page.waitForSelector('.share');
await alice.page.getByLabel('Collaborator email').fill(BOB.email);
await alice.page.getByLabel('Permission').selectOption('EDIT');
await alice.page.getByRole('button', { name: 'Invite' }).click();
await alice.page.waitForTimeout(600);
check(
  'the collaborator is listed on the note',
  (await alice.page.locator('.share .list li').filter({ hasText: BOB.email }).count()) === 1,
  await alice.page.locator('.share').innerText()
);
await alice.page.locator('.share').getByRole('button', { name: 'Close', exact: true }).click();
await alice.page.waitForTimeout(200);

// then: the collaborator sees the note, with the owner's colour — appearance belongs to the note
await bob.page.reload({ waitUntil: 'networkidle' });
await bob.page.waitForSelector('.card');
check('a shared note reaches the collaborator', (await bob.page.locator('.card').count()) === 1);
check(
  'an EDIT collaborator sees the note’s colour, not one of their own',
  (await bob.page.locator('.card').first().getAttribute('data-color')) === 'yellow',
  await bob.page.locator('.card').first().getAttribute('data-color')
);

// when: the collaborator repaints the shared note
await bob.page.locator('.card').first().hover();
await bob.page.locator('.card').first().getByRole('button', { name: 'Change color' }).click();
await bob.page.locator('.appearance-picker .swatch[data-color="teal"]').first().click();
await bob.page.waitForTimeout(600);
check(
  'the collaborator can change the note’s appearance',
  (await bob.page.locator('.card').first().getAttribute('data-color')) === 'teal'
);

// then: the owner sees the change too, because there is one appearance on one note
await alice.page.reload({ waitUntil: 'networkidle' });
await alice.page.waitForTimeout(600);
check(
  'the owner sees the collaborator’s repaint',
  (await alice.page.locator('.card').first().getAttribute('data-color')) === 'teal',
  await alice.page.locator('.card').first().getAttribute('data-color')
);

// when: the owner puts their own colour back and downgrades the collaborator to view only
await alice.page.locator('.card').first().hover();
await alice.page.locator('.card').first().getByRole('button', { name: 'Change color' }).click();
await alice.page.locator('.appearance-picker .swatch[data-color="yellow"]').first().click();
await alice.page.waitForTimeout(600);
await alice.page.locator('.card').first().hover();
await alice.page.locator('.card').first().getByRole('button', { name: 'Add collaborator' }).click();
await alice.page.waitForSelector('.share');
await alice.page.getByLabel(`Permission for ${BOB.name}`).selectOption('VIEW');
await alice.page.waitForTimeout(600);
await alice.page.locator('.share').getByRole('button', { name: 'Close', exact: true }).click();

// then: the VIEW collaborator still sees the note's appearance — it never depended on permission
await bob.page.reload({ waitUntil: 'networkidle' });
await bob.page.waitForSelector('.card');
check(
  'a VIEW collaborator sees the same colour',
  (await bob.page.locator('.card').first().getAttribute('data-color')) === 'yellow',
  await bob.page.locator('.card').first().getAttribute('data-color')
);

console.log('\nedited by');

// then: a note shared with Bob names the person who wrote it, as Google Keep's cards do, until he opens it
const bobMarker = bob.page.locator('.card').first().locator('.edited-by');
const markerLook = await bobMarker.evaluate((marker) => {
  const ring = marker.querySelector('.edited-by-avatar .avatar');
  const name = marker.querySelector('.edited-by-name');
  return {
    text: marker.innerText,
    ring: ring ? `${getComputedStyle(ring).borderTopWidth} ${getComputedStyle(ring).borderTopColor} ${ring.getBoundingClientRect().width}` : '',
    nameColor: name ? getComputedStyle(name).color : '',
    nameWeight: name ? getComputedStyle(name).fontWeight : '',
    gradient: getComputedStyle(marker, '::before').backgroundImage,
    // The gradient runs on to the card's bottom edge (clipped by the card), not stopping at the marker.
    reachesCardBottom:
      marker.closest('.card').getBoundingClientRect().bottom - marker.getBoundingClientRect().bottom <=
      parseFloat(getComputedStyle(marker).getPropertyValue('--keep-edited-by-reach'))
  };
}).catch(() => null);
check(
  'a shared note’s card names who last edited it, and when',
  markerLook !== null && markerLook.text.includes(ALICE.name) && /Edited/.test(markerLook.text),
  JSON.stringify(markerLook)
);
check(
  'the marker is the original’s: a white-ringed avatar and a bold white name over a gradient that reaches the card’s bottom edge',
  markerLook !== null &&
    markerLook.ring === '2px rgb(255, 255, 255) 30' &&
    markerLook.nameColor === 'rgb(255, 255, 255)' &&
    Number(markerLook.nameWeight) >= 700 &&
    markerLook.gradient.startsWith('linear-gradient') &&
    markerLook.reachesCardBottom,
  JSON.stringify(markerLook)
);
check(
  'the owner’s own edits never mark the note for her',
  (await alice.page.locator('.card').first().locator('.edited-by').count()) === 0
);

// when: the view-only collaborator opens the note
await bob.page.locator('.card').first().click();
await bob.page.waitForSelector('.editor');

// then: the desktop editor's bottom bar is a solid strip in the note's colour, as the original's is:
// the card wears the colour, the bar is see-through to it, and the picture (on the lines above,
// `.canvas`) ends where the bar begins
const barFill = await bob.page.evaluate(() => {
  const editor = document.querySelector('.editor');
  const bar = document.querySelector('.editor .toolbar');
  const canvas = document.querySelector('.editor .canvas');
  if (!editor || !bar || !canvas) return null;
  const probe = document.createElement('span');
  probe.style.color = getComputedStyle(editor).getPropertyValue('--note-color');
  editor.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return {
    card: getComputedStyle(editor).backgroundColor,
    cardPicture: getComputedStyle(editor).backgroundImage,
    bar: getComputedStyle(bar).backgroundColor,
    color,
    pictureEnds: Math.round(canvas.getBoundingClientRect().bottom),
    barStarts: Math.round(bar.getBoundingClientRect().top)
  };
});
check(
  'the desktop editor’s bottom bar wears the note’s colour, opaque, with the picture above it',
  barFill !== null &&
    barFill.card === barFill.color &&
    barFill.card !== 'rgba(0, 0, 0, 0)' &&
    barFill.cardPicture === 'none' &&
    barFill.bar === 'rgba(0, 0, 0, 0)' &&
    barFill.pictureEnds <= barFill.barStarts,
  JSON.stringify(barFill)
);

// then: the editor is read only
check('a VIEW collaborator gets a read-only editor', (await bob.page.locator('.editor .readonly-note').count()) === 1);
// then: the editor shows who else the note is shared with — for Bob, its owner
check(
  'a collaborator sees the owner among the people the note is shared with',
  (await bob.page.locator('.editor .shared-with .avatar').count()) === 1
);
check(
  'the read-only editor has no editing toolbar',
  (await bob.page.locator('.editor').getByRole('button', { name: 'Add label' }).count()) === 0
);
check(
  'the avatars share their line with "Edited", as the original\'s do',
  (await bob.page.locator('.editor .edited-row .shared-with').count()) === 1 &&
    (await bob.page.locator('.editor .edited-row .status').count()) === 1
);

// when: the collaborator opens the collaborators from the avatars
await bob.page.locator('.editor .shared-with').click();
await bob.page.locator('.share .list li').nth(1).waitFor();

// then: everyone with access sees who has it, the owner first, and only an editor may change it
check(
  'a collaborator sees the collaborators, the owner among them',
  (await bob.page.locator('.share .list li').count()) === 2 &&
    (await bob.page.locator('.share .list li').first().innerText()).includes('(Owner)'),
  await bob.page.locator('.share .list').innerText()
);
check(
  'a VIEW collaborator cannot change the collaborators',
  (await bob.page.locator('.share').getByLabel('Collaborator email').count()) === 0 &&
    (await bob.page.locator('.share select').count()) === 0
);
await bob.page.locator('.share').getByRole('button', { name: 'Close', exact: true }).click();
await bob.page.waitForTimeout(300);
await bob.page.keyboard.press('Escape');
await bob.page.waitForTimeout(300);

// then: opening the note took the marker away — and for good, not only on this screen
check('opening the note takes its marker away', (await bobMarker.count()) === 0);
await bob.page.reload({ waitUntil: 'networkidle' });
await bob.page.waitForSelector('.card');
check('the marker stays away after a reload', (await bobMarker.count()) === 0);

// when: the owner writes in the note again, while Bob is looking at his notes
const markedNoteId = Number(await alice.page.locator('.card').first().getAttribute('data-note-id'));
await alice.page.evaluate(async (id) => {
  await fetch(`/api/notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Edited again by the owner' })
  });
}, markedNoteId);

// then: the marker comes back on Bob's card over the live channel, with no reload
const markedLive = await bobMarker
  .waitFor({ timeout: 8000 })
  .then(() => true)
  .catch(() => false);
check(
  'somebody else’s next edit brings the marker back, live',
  markedLive && (await bobMarker.innerText()).includes(ALICE.name)
);
await alice.page.reload({ waitUntil: 'networkidle' });
await alice.page.waitForSelector('.card');
check(
  'the writer’s own card stays unmarked',
  (await alice.page.locator('.card').first().locator('.edited-by').count()) === 0
);

console.log('\ntrash');

// when: the owner moves the note to the trash
await alice.page.locator('.card').first().hover();
await alice.page.locator('.card').first().getByRole('button', { name: 'More options' }).click();
await alice.page.getByRole('menuitem', { name: 'Delete note' }).click();
await alice.page.waitForTimeout(600);

// then: it shows up in the trash with a retention hint
check('the note leaves the notes view', (await alice.page.locator('.card').count()) === 0);
await alice.page.goto(`${baseUrl}/trash`, { waitUntil: 'networkidle' });
await alice.page.waitForTimeout(400);
check('the note is in the trash', (await alice.page.locator('.card').count()) === 1);
check(
  'the trash shows the retention countdown',
  (await alice.page.locator('.purge').innerText()).includes('30 days left'),
  await alice.page.locator('.purge').innerText()
);

// when: it is restored
await alice.page.locator('.card').first().getByRole('button', { name: 'Restore note' }).click();
await alice.page.waitForTimeout(600);

// then: the trash is empty
check('restoring empties the trash', (await alice.page.locator('.card').count()) === 0);

console.log('\nlist notes and labels');

// when: a checklist note is created from the composer
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });
await alice.page.waitForTimeout(400);
await alice.page.getByRole('button', { name: 'New list' }).click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor .note-body p').first().click();
await alice.page.keyboard.type('buy milk');
await alice.page.keyboard.press('Enter');
await alice.page.keyboard.type('buy bread');
await alice.page.locator('.editor .note-body input[type="checkbox"]').first().click();
await alice.page.locator('.editor textarea.title').fill('Shopping');
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await alice.page.waitForTimeout(700);

// then: the list note keeps two items, one of them checked
const listCard = alice.page.locator('.card').filter({ hasText: 'Shopping' }).first();
await listCard.waitFor();
check('a list note is created with both items', (await listCard.locator('.line.checklist').count()) === 2);
check(
  'the checked item survives the round trip',
  (await listCard.locator('.line.checklist.checked').count()) === 1
);

// when: the card's "completed items" heading is clicked
await listCard.locator('.completed-toggle').click();
await alice.page.waitForTimeout(500);

// then: it folds the section right there, as the original's card does, and the note stays shut
check("a click on a card's completed heading leaves the note shut", (await alice.page.locator('.editor').count()) === 0);
check(
  'and folds the completed rows away on the card',
  (await listCard.locator('.line.checklist.checked').count()) === 0 &&
    (await listCard.locator('.completed-toggle').getAttribute('aria-expanded')) === 'false'
);

// when: the page is loaded again and the note is opened
await alice.page.reload({ waitUntil: 'networkidle' });
const foldedCard = alice.page.locator('.card').filter({ hasText: 'Shopping' }).first();
await foldedCard.waitFor();
check('the fold is remembered over a reload', (await foldedCard.locator('.line.checklist.checked').count()) === 0);
await foldedCard.locator('.title').click();
await alice.page.waitForSelector('.editor .completed-toggle');

// then: the editor opens with the same fold
check(
  'the editor opens folded, as the card is',
  (await alice.page.locator('.editor .completed-toggle').getAttribute('aria-expanded')) === 'false'
);

// when: the editor unfolds it and the note is closed
await alice.page.locator('.editor .completed-toggle').click();
await alice.page.keyboard.press('Escape');
await alice.page.waitForTimeout(700);

// then: the card follows the editor
check(
  'unfolding in the editor unfolds the card',
  (await alice.page.locator('.card').filter({ hasText: 'Shopping' }).first().locator('.line.checklist.checked').count()) === 1
);

// when: a list with three active rows and twelve completed ones is shown
await alice.page.evaluate(async () => {
  const row = (text, checked) => ({ id: crypto.randomUUID(), type: 'checklist', checked, depth: 0, spans: [{ text }] });
  const blocks = [...['a1', 'a2', 'a3'].map((text) => row(text, false)), ...Array.from({ length: 12 }, (_, i) => row(`c${i + 1}`, true))];
  await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'LIST', title: 'Long list', content: { blocks } })
  });
});
await alice.page.reload({ waitUntil: 'networkidle' });
const longCard = alice.page.locator('.card').filter({ hasText: 'Long list' }).first();
await longCard.waitFor();

// then: the card draws ten rows in all, the original's limit, and ends the cut section with "…"
check(
  'a card draws at most ten list rows, then "…"',
  (await longCard.locator('.line.checklist').count()) === 10 && (await longCard.locator('.completed-more').count()) === 1,
  `${await longCard.locator('.line.checklist').count()} rows`
);

// when: a new list note is given an indented line with Tab
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });
await alice.page.getByRole('button', { name: 'New list' }).click();
await alice.page.waitForSelector('.editor .note-body');
await alice.page.locator('.editor .note-body li p').first().click();
await alice.page.keyboard.type('parent');
await alice.page.keyboard.press('Enter');
await alice.page.keyboard.type('child');
await alice.page.keyboard.press('Tab');
await alice.page.keyboard.type(' own');
await alice.page.keyboard.press('Enter');
await alice.page.keyboard.press('Tab');
await alice.page.keyboard.press('Shift+Tab');
await alice.page.keyboard.type('top again');
await alice.page.locator('.editor textarea.title').fill('Nested');
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await alice.page.waitForTimeout(800);

// then: one line is indented on the card and the depth survived the round trip
const nestedCard = alice.page.locator('.card').filter({ hasText: 'Nested' }).first();
await nestedCard.waitFor();
const indents = await nestedCard.evaluate((card) =>
  [...card.querySelectorAll('.line')].map((line) => getComputedStyle(line).paddingLeft)
);
const storedDepths = await alice.page.evaluate(async () => {
  const response = await fetch('/api/notes', { credentials: 'include' });
  const body = await response.json();
  const note = body.notes.find((candidate) => candidate.title === 'Nested');
  return note.content.blocks
    .filter((block) => block.type === 'checklist')
    .map((block) => `${block.spans.map((span) => span.text).join('')}#${block.depth}`)
    .join(' ');
});
check(
  'an indented line is offset on the card',
  indents.some((value) => parseFloat(value) > 0),
  `${indents.join(', ')} || ${storedDepths}`
);
check(
  'the stored list keeps one line indented and one at the top level',
  storedDepths.includes('#1') && storedDepths.includes('#0'),
  storedDepths
);

// when: the same note's checkboxes are hidden from the card's own menu
const readNested = () =>
  alice.page.evaluate(async () => {
    const response = await fetch('/api/notes', { credentials: 'include' });
    const body = await response.json();
    const note = body.notes.find((candidate) => candidate.title === 'Nested');
    return {
      kind: note.kind,
      blocks: note.content.blocks.map((block) => `${block.type}#${block.depth}`)
    };
  });
await nestedCard.hover();
await nestedCard.getByRole('button', { name: 'More options' }).click();
await alice.page.getByRole('menuitem', { name: 'Hide checkboxes' }).click();
await alice.page.waitForTimeout(900);
const asText = await readNested();

// then: it is a text note whose lines carry no indent — the server refuses a document in which a
// paragraph is indented, so this write is the one that used to answer "the note content is not valid"
check(
  'hiding the checkboxes turns every line into a paragraph, with no indent left on it',
  asText.kind === 'TEXT' &&
    asText.blocks.length > 0 &&
    asText.blocks.every((block) => block.startsWith('paragraph#0')),
  JSON.stringify(asText)
);

// when: they are shown again
await nestedCard.hover();
await nestedCard.getByRole('button', { name: 'More options' }).click();
await alice.page.getByRole('menuitem', { name: 'Show checkboxes' }).click();
await alice.page.waitForTimeout(900);
const asList = await readNested();

// then: every line is a checklist row at the top level, unchecked
check(
  'showing them again makes every line a checklist row at the top level',
  asList.kind === 'LIST' &&
    asList.blocks.length > 0 &&
    asList.blocks.every((block) => block.startsWith('checklist#0')),
  JSON.stringify(asList)
);

console.log('\nlist actions in the editor menu');

// given: a list note with two ticked rows and one open one
const listActionsNote = await alice.page.evaluate(async () => {
  const row = (text, checked) => ({ id: crypto.randomUUID(), type: 'checklist', depth: 0, checked, spans: [{ text }] });
  const response = await fetch('/api/notes', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Ticked list',
      kind: 'LIST',
      content: { version: 1, blocks: [row('eggs', true), row('flour', false), row('sugar', true)] }
    })
  });
  return (await response.json()).id;
});
const readTickedList = () =>
  alice.page.evaluate(async (id) => {
    const note = await fetch(`/api/notes/${id}`, { credentials: 'include' }).then((response) => response.json());
    return note.content.blocks.map((block) => `${block.spans.map((span) => span.text).join('')}:${block.checked}`);
  }, listActionsNote);
await alice.page.reload({ waitUntil: 'networkidle' });
const tickedCard = alice.page.locator('.card').filter({ hasText: 'Ticked list' }).first();
await tickedCard.locator('.title').click();
await alice.page.waitForSelector('.editor');
await alice.page.waitForTimeout(500);

// when: "Uncheck all items" is picked from the editor's own ⋮ menu on a wide screen
await alice.page.locator('.editor').getByRole('button', { name: 'More options' }).click();
await alice.page.getByRole('menuitem', { name: 'Uncheck all items' }).click();
await alice.page.waitForTimeout(1500);
const unchecked = await readTickedList();

// then: every row is open again, and none is gone
check(
  'the editor menu of a list note unchecks every row',
  JSON.stringify(unchecked) === JSON.stringify(['eggs:false', 'flour:false', 'sugar:false']),
  JSON.stringify(unchecked)
);

// when: one row is ticked again and "Delete checked items" is picked
await alice.page.locator('.editor .note-body li[data-checked] input[type="checkbox"]').first().click();
await alice.page.waitForTimeout(300);
await alice.page.locator('.editor').getByRole('button', { name: 'More options' }).click();
await alice.page.getByRole('menuitem', { name: 'Delete checked items' }).click();
await alice.page.waitForTimeout(1500);
const pruned = await readTickedList();

// then: only the ticked row left the note
check(
  'the editor menu of a list note deletes the checked rows',
  JSON.stringify(pruned) === JSON.stringify(['flour:false', 'sugar:false']),
  JSON.stringify(pruned)
);

// when: the note is closed and deleted, so the run goes on with the view it had
await alice.page.keyboard.press('Escape');
await alice.page.waitForTimeout(600);
await alice.page.evaluate(
  (id) => fetch(`/api/notes/${id}?permanent=true`, { method: 'DELETE', credentials: 'include' }),
  listActionsNote
);
await alice.page.reload({ waitUntil: 'networkidle' });

// when: the newest note is pinned from its card
const newestCard = alice.page.locator('.card').first();
const newestTitle = await newestCard.locator('.title').innerText();
await newestCard.hover();
await newestCard.getByRole('button', { name: 'Pin note' }).click();
await alice.page.waitForTimeout(700);

// then: the grid grows the two Keep sections and the pinned note leads it
check(
  'pinning a note adds the Pinned and Others sections',
  (await alice.page.locator('.section').allInnerTexts()).join('|') === 'PINNED|OTHERS',
  (await alice.page.locator('.section').allInnerTexts()).join('|')
);
check(
  'the pinned note leads the grid',
  (await alice.page.locator('.card .title').first().innerText()) === newestTitle,
  `${newestTitle} vs ${await alice.page.locator('.card .title').first().innerText()}`
);
check(
  'the pin survives the round trip',
  await alice.page.evaluate(async (title) => {
    const response = await fetch('/api/notes', { credentials: 'include' });
    const body = await response.json();
    return body.notes.find((note) => note.title === title)?.pinned === true;
  }, newestTitle)
);
check(
  'pinning from the card does not open the note',
  (await alice.page.locator('.editor').count()) === 0
);

// when: the pinned note and the others are compared
const layout = await alice.page.evaluate(() => {
  const edges = (section, edge) =>
    [...document.querySelectorAll(`.slot[data-section="${section}"] .card`)].map((card) =>
      Math.round(card.getBoundingClientRect()[edge])
    );
  return {
    headings: [...document.querySelectorAll('.section')].map((heading) => heading.textContent.trim()),
    pinnedBottoms: edges('pinned', 'bottom'),
    otherTops: edges('others', 'top')
  };
});

// then: the pinned notes get a row of their own, above the others rather than beside them
check(
  'the pinned notes sit in their own row above the others',
  layout.pinnedBottoms.length > 0 &&
    layout.otherTops.length > 0 &&
    layout.headings.join('|') === 'Pinned|Others' &&
    Math.max(...layout.pinnedBottoms) < Math.min(...layout.otherTops),
  JSON.stringify(layout)
);

// when: a note nobody has given a colour to is measured against the original's card — with nothing
// focused or hovered, since either deepens a card's shadow
await alice.page.mouse.move(1, 1);
await alice.page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
await alice.page.waitForTimeout(400);
const plainCard = await alice.page.evaluate(() => {
  const card = [...document.querySelectorAll('.card')].find(
    (candidate) => candidate.dataset.color === 'default' && !candidate.dataset.background
  );
  if (!card) return null;
  const style = getComputedStyle(card);
  return { border: style.borderTopColor, width: style.borderTopWidth, shadow: style.boxShadow };
});

// then: it is outlined in a light line and casts nothing, the way Keep draws a plain note
check(
  'a plain note is outlined rather than shadowed',
  plainCard !== null &&
    plainCard.width === '1px' &&
    plainCard.border !== 'rgba(0, 0, 0, 0)' &&
    plainCard.shadow === 'none',
  JSON.stringify(plainCard)
);

// when: the distance between two sections is measured
const sectionGap = await alice.page.evaluate(() => {
  const edges = (section, edge) =>
    [...document.querySelectorAll(`.slot[data-section="${section}"] .card`)].map((card) => card.getBoundingClientRect()[edge]);
  const pinned = edges('pinned', 'bottom');
  const others = edges('others', 'top');
  if (pinned.length === 0 || others.length === 0) return null;
  return Math.round(Math.min(...others) - Math.max(...pinned));
});

// then: it matches the original, which leaves 97px there
check(
  'the sections are spaced like the original',
  sectionGap !== null && sectionGap >= 90 && sectionGap <= 104,
  `${sectionGap}px`
);

// when: the header's buttons are compared with the edge of the window
const header = await alice.page.evaluate(() => {
  const actions = document.querySelector('.topbar .actions').getBoundingClientRect();
  const search = document.querySelector('.topbar .search').getBoundingClientRect();
  return { right: Math.round(actions.right), viewport: window.innerWidth, gap: Math.round(actions.left - search.right) };
});

// then: they hug it, instead of queueing up behind the search field
check(
  'the header buttons are pushed to the right edge',
  header.viewport - header.right <= 12 && header.gap > 100,
  JSON.stringify(header)
);

// then: the notes are centred in the room beside the navigation, the way the original lays them out
const gutter = await alice.page.evaluate(() => {
  const rail = document.querySelector('aside').getBoundingClientRect();
  const grid = document.querySelector('.sections').getBoundingClientRect();
  const content = document.querySelector('.content').getBoundingClientRect();
  return {
    left: Math.round(grid.left - rail.right),
    right: Math.round(content.right - grid.right),
    cards: Math.round(grid.width)
  };
});
// when: the navigation rows are measured against each other
const navRows = await alice.page.evaluate(() =>
  [...document.querySelectorAll('.sidebar .item')].slice(0, 5).map((item) => ({
    label: (item.querySelector('.text')?.textContent ?? '').trim().slice(0, 10),
    top: Math.round(item.getBoundingClientRect().top),
    height: Math.round(item.getBoundingClientRect().height)
  }))
);

// then: they sit on the measured 48px pitch the original uses — ours drifted 2px per row, which
// reads as the whole list being pushed down
check(
  'the navigation rows keep the measured 48px pitch',
  navRows.length >= 5 &&
    navRows.every((row) => row.height === 48) &&
    navRows.every((row, index) => index === 0 || row.top - navRows[index - 1].top === 48),
  JSON.stringify(navRows)
);

check(
  'the notes are centred beside the navigation',
  Math.abs(gutter.left - gutter.right) <= 2 && gutter.left > 24,
  JSON.stringify(gutter)
);

// when: alice's notes are scrolled. The window is made short first: whether the page happens to
// overflow at this point in the run depends on how many notes she has by now, and the behaviour under
// test is what happens when it does.
await alice.page.setViewportSize({ width: 1440, height: 420 });
await alice.page.waitForTimeout(200);
await alice.page.evaluate(() => window.scrollTo(0, 240));
await alice.page.waitForTimeout(300);
const headerScrolled = await alice.page.evaluate(() => {
  const bar = document.querySelector('.topbar');
  const style = getComputedStyle(bar);
  return {
    flagged: bar.dataset.scrolled,
    shadow: style.boxShadow,
    scrollY: Math.round(window.scrollY),
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    scrollbar: getComputedStyle(document.documentElement).overflowY
  };
});

// then: the header's line (an inset shadow, as the original draws it) has given way to a lifting
// shadow — and the page reserves its scrollbar from the start rather than growing one when it overflows
check(
  'the scrolled header trades its line for a shadow',
  headerScrolled.flagged === 'true' &&
    !headerScrolled.shadow.includes('inset') &&
    headerScrolled.shadow !== 'none' &&
    headerScrolled.scrollY > 0,
  JSON.stringify(headerScrolled)
);
check(
  'the scrollbar is reserved before anything is scrolled',
  headerScrolled.scrollbar === 'scroll' || headerScrolled.scrollbar === 'auto',
  JSON.stringify(headerScrolled)
);

// and when it is back at the top
await alice.page.evaluate(() => window.scrollTo(0, 0));
await alice.page.waitForTimeout(300);
const headerTop = await alice.page.evaluate(() => {
  const bar = document.querySelector('.topbar');
  const style = getComputedStyle(bar);
  return { flagged: bar.dataset.scrolled, shadow: style.boxShadow };
});
check(
  'an unscrolled header draws its line again',
  headerTop.flagged === 'false' && headerTop.shadow.includes('inset') && headerTop.shadow.includes('-1px'),
  JSON.stringify(headerTop)
);
await alice.page.setViewportSize({ width: 1440, height: 900 });
await alice.page.waitForTimeout(200);

// when: the tick box in the corner of a card is used, the way Keep starts a bulk action
// Two notes of their own, so this cannot take away anything the rest of the run needs.
await alice.page.evaluate(async () => {
  for (const title of ['Bulk one', 'Bulk two']) {
    await fetch('/api/notes', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, kind: 'TEXT' })
    });
  }
});
await alice.page.reload({ waitUntil: 'networkidle' });
const bulkOne = alice.page.locator('.card').filter({ hasText: 'Bulk one' }).first();
const bulkTwo = alice.page.locator('.card').filter({ hasText: 'Bulk two' }).first();
await bulkOne.waitFor();
await bulkOne.hover();
await alice.page.waitForTimeout(250);
// The tick box is drawn by the grid, not by the card: a card cannot paint one outside its own corner
// without breaking the multi-column layout.
const boxShown = await alice.page.locator('.card-tick').first().isVisible();
await alice.page.locator('.card-tick').first().click();
await alice.page.waitForTimeout(300);

// then: the header turns into a selection bar
check(
  'ticking a card starts a selection',
  boxShown && (await alice.page.locator('.selection').innerText()).includes('1 selected'),
  await alice.page.locator('.selection').innerText()
);

// when: a second card is clicked while selecting
await bulkTwo.click();
await alice.page.waitForTimeout(300);

// then: it joins the selection instead of opening the note
check(
  'a second card joins the selection without opening',
  (await alice.page.locator('.selection').innerText()).includes('2 selected') &&
    (await alice.page.locator('.editor').count()) === 0,
  await alice.page.locator('.selection').innerText()
);

// when: the selected notes are archived in one go
const beforeArchive = await alice.page.locator('.card').count();
await alice.page.locator('.selection').getByRole('button', { name: 'Archive' }).click();
await alice.page.waitForTimeout(1400);

// then: both left the view and the bar is gone
check(
  'archiving the selection removes exactly those notes',
  (await alice.page.locator('.card').count()) === beforeArchive - 2 &&
    (await alice.page.locator('.selection').count()) === 0 &&
    (await alice.page.locator('.card').filter({ hasText: 'Bulk one' }).count()) === 0,
  `${beforeArchive} -> ${await alice.page.locator('.card').count()}`
);

console.log('\nbulk pin, colour, labels, reminder and copy');

// given: two notes of their own, picked together
const bulkIds = await alice.page.evaluate(async () => {
  const ids = [];
  for (const title of ['Bulk eight', 'Bulk nine']) {
    const response = await fetch('/api/notes', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, kind: 'TEXT' })
    });
    ids.push((await response.json()).id);
  }
  return ids;
});
const readBulk = () =>
  alice.page.evaluate(async (ids) => {
    const body = await fetch('/api/notes', { credentials: 'include' }).then((response) => response.json());
    return {
      notes: ids.map((id) => {
        const note = body.notes.find((candidate) => candidate.id === id);
        return note && { pinned: note.pinned, color: note.color, labels: note.labels.map((label) => label.name), reminderAt: note.reminderAt ?? null };
      }),
      copies: body.notes.filter((note) => note.title === 'Bulk eight' || note.title === 'Bulk nine').length
    };
  }, bulkIds);
await alice.page.reload({ waitUntil: 'networkidle' });
const pickBulk = async () => {
  for (const title of ['Bulk eight', 'Bulk nine']) {
    const card = alice.page.locator('.card').filter({ hasText: title }).first();
    await card.hover();
    await alice.page.waitForTimeout(200);
    if (!(await alice.page.locator('.selection').count())) {
      await alice.page.locator('.card-tick').first().click();
    } else {
      await card.click();
    }
    await alice.page.waitForTimeout(200);
  }
};
await pickBulk();
const bulkBar = alice.page.locator('.selection');

// when: the bar pins them
await bulkBar.getByRole('button', { name: 'Pin note' }).click();
await alice.page.waitForTimeout(900);

// when: the bar paints them
await bulkBar.getByRole('button', { name: 'Change color' }).click();
await alice.page.locator('[data-overlay="selection-picker"]').getByRole('button', { name: 'Coral' }).click();
await alice.page.waitForTimeout(900);
await alice.page.keyboard.press('Escape');
await alice.page.waitForTimeout(200);

// when: the bar gives them a new label from its overflow menu
if (!(await bulkBar.count())) await pickBulk();
await bulkBar.getByRole('button', { name: 'More actions' }).click();
await alice.page.getByRole('menuitem', { name: 'Add label' }).click();
const bulkLabel = `Bulk ${run}`;
await alice.page.locator('[data-overlay="selection-picker"]').getByLabel('Enter label name').fill(bulkLabel);
await alice.page.keyboard.press('Enter');
await alice.page.waitForTimeout(1200);
await alice.page.keyboard.press('Escape');
await alice.page.waitForTimeout(200);

// when: the bar gives them a reminder
if (!(await bulkBar.count())) await pickBulk();
await bulkBar.getByRole('button', { name: 'Add a reminder' }).click();
await alice.page.locator('[data-overlay="selection-picker"]').getByRole('button', { name: 'Save' }).click();
await alice.page.waitForTimeout(900);
const bulkState = await readBulk();

// then: every picked note took each of them, one note's own call at a time
check(
  'the selection bar pins every picked note',
  bulkState.notes.every((note) => note?.pinned === true),
  JSON.stringify(bulkState)
);
check(
  'the selection bar paints every picked note',
  bulkState.notes.every((note) => note?.color === 'red'),
  JSON.stringify(bulkState)
);
check(
  'the selection bar labels every picked note',
  bulkState.notes.every((note) => note?.labels.includes(bulkLabel)),
  JSON.stringify(bulkState)
);
check(
  'the selection bar gives every picked note a reminder',
  bulkState.notes.every((note) => typeof note?.reminderAt === 'number' && note.reminderAt > Date.now()),
  JSON.stringify(bulkState)
);

// when: the bar makes a copy of them
if (!(await bulkBar.count())) await pickBulk();
await bulkBar.getByRole('button', { name: 'More actions' }).click();
await alice.page.getByRole('menuitem', { name: 'Make a copy' }).click();
await alice.page.waitForTimeout(1200);
const copied = await readBulk();

// then: each picked note has a copy of its own
check('the selection bar copies every picked note', copied.copies === 4, JSON.stringify(copied));

// when: the notes it made are deleted, so the run goes on with the view it had
await alice.page.keyboard.press('Escape');
await alice.page.evaluate(async () => {
  const body = await fetch('/api/notes', { credentials: 'include' }).then((response) => response.json());
  for (const note of body.notes.filter((candidate) => candidate.title === 'Bulk eight' || candidate.title === 'Bulk nine')) {
    await fetch(`/api/notes/${note.id}?permanent=true`, { method: 'DELETE', credentials: 'include' });
  }
  const labels = await fetch('/api/labels', { credentials: 'include' }).then((response) => response.json());
  for (const label of (labels.labels ?? labels).filter((candidate) => candidate.name.startsWith('Bulk '))) {
    await fetch(`/api/labels/${label.id}`, { method: 'DELETE', credentials: 'include' });
  }
});
await alice.page.reload({ waitUntil: 'networkidle' });

console.log('\nbulk restore and select all');

// given: three notes in the trash
await alice.page.evaluate(async () => {
  for (const title of ['Bulk three', 'Bulk four', 'Bulk five']) {
    const created = await fetch('/api/notes', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, kind: 'TEXT' })
    }).then((response) => response.json());
    await fetch(`/api/notes/${created.id}`, { method: 'DELETE', credentials: 'include' });
  }
});
await alice.page.goto(`${baseUrl}/trash`, { waitUntil: 'networkidle' });
await alice.page.waitForTimeout(400);
check(
  'the trash holds the notes',
  (await alice.page.locator('.card').count()) === 3,
  String(await alice.page.locator('.card').count())
);

// when: the pointer rests on a card
await alice.page.locator('.card').first().hover();
await alice.page.waitForTimeout(250);

// then: the tick box is already the disc it will still be once the note is picked
const tickDisc = (page) =>
  page.evaluate(() => {
    const element = document.querySelector('.card-tick');
    if (!element) return null;
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      tick: style.color,
      width: style.width,
      height: style.height,
      glyphs: element.querySelectorAll('svg').length
    };
  });
const hoverTick = await tickDisc(alice.page);
check(
  'hovering a card shows the same disc it shows when picked',
  hoverTick.glyphs === 1 &&
    hoverTick.width === '20px' &&
    hoverTick.height === '20px' &&
    hoverTick.background !== hoverTick.tick,
  JSON.stringify(hoverTick)
);

// when: the card is picked
await alice.page.locator('.card-tick').first().click();
await alice.page.waitForTimeout(250);

// then: the disc stays and the card gains a second light line, without changing its box
const picked = await alice.page.locator('.card.selected').first().evaluate((element) => {
  const style = getComputedStyle(element);
  return { border: style.borderTopColor, width: style.borderTopWidth, ring: style.boxShadow };
});
const pickedTick = await tickDisc(alice.page);
check(
  'a picked card keeps the disc and gains a light ring',
  picked.ring.includes(picked.border) &&
    picked.width === '1px' &&
    pickedTick.background === hoverTick.background &&
    pickedTick.tick === hoverTick.tick,
  JSON.stringify({ picked, pickedTick, hoverTick })
);

// then: the disc's two colours invert with the theme, the way the original's do
// The theme lives in Settings, whose dialog would end the selection; the stylesheet only reads the
// root's attribute, so the check flips that directly.
await alice.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await alice.page.waitForTimeout(350);
const darkTick = await tickDisc(alice.page);
await alice.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await alice.page.waitForTimeout(350);
check(
  'the selection disc inverts with the theme',
  darkTick.background === hoverTick.tick && darkTick.tick === hoverTick.background,
  JSON.stringify({ light: hoverTick, dark: darkTick })
);

// when: the bar's overflow menu is asked for everything the view shows
await alice.page.locator('.selection').getByRole('button', { name: 'More actions' }).click();
await alice.page.getByRole('menuitem', { name: 'Select all' }).click();
await alice.page.waitForTimeout(250);

// then: every note on screen is picked
check(
  'Select all picks every note in the view',
  (await alice.page.locator('.selection').innerText()).includes('3 selected'),
  await alice.page.locator('.selection').innerText()
);

// then: the trash answers a selection with its own two actions, not the notes ones
check(
  'the trash offers restore and delete forever instead of archive',
  (await alice.page.locator('.selection').getByRole('button', { name: 'Restore', exact: true }).count()) === 1 &&
    (await alice.page
      .locator('.selection')
      .getByRole('button', { name: 'Delete forever', exact: true })
      .count()) === 1 &&
    (await alice.page.locator('.selection').getByRole('button', { name: 'Archive', exact: true }).count()) === 0
);

// when: they are restored in one go
await alice.page.locator('.selection').getByRole('button', { name: 'Restore', exact: true }).click();
await alice.page.waitForTimeout(1400);

// then: the trash is empty and the bar is gone
check(
  'restoring the selection empties the trash',
  (await alice.page.locator('.card').count()) === 0 &&
    (await alice.page.locator('.selection').count()) === 0,
  String(await alice.page.locator('.card').count())
);

// given: two more notes in the trash
await alice.page.evaluate(async () => {
  for (const title of ['Bulk six', 'Bulk seven']) {
    const created = await fetch('/api/notes', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, kind: 'TEXT' })
    }).then((response) => response.json());
    await fetch(`/api/notes/${created.id}`, { method: 'DELETE', credentials: 'include' });
  }
});
await alice.page.goto(`${baseUrl}/trash`, { waitUntil: 'networkidle' });
await alice.page.waitForTimeout(400);

// when: one of them is picked and then restored on its own
const bulkSix = alice.page.locator('.card').filter({ hasText: 'Bulk six' }).first();
await bulkSix.hover();
await alice.page.waitForTimeout(250);
await alice.page.locator('.card-tick').first().click();
await alice.page.waitForTimeout(250);
await bulkSix.hover();
await bulkSix.getByRole('button', { name: 'Restore note' }).click();
await alice.page.waitForTimeout(1200);

// then: its tick left the trash with it
check(
  'restoring one picked note drops its tick',
  (await alice.page.locator('.selection').count()) === 0,
  await alice.page.locator('.selection').count()
);

// when: the notes view is opened again
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });
await alice.page.waitForTimeout(500);
const restoredNote = alice.page.locator('.card').filter({ hasText: 'Bulk six' }).first();
await restoredNote.waitFor();
await restoredNote.hover();
await alice.page.waitForTimeout(250);

// then: it is not already picked there
check(
  'a restored note is not already picked in the notes view',
  (await alice.page.locator('.selection').count()) === 0 &&
    !(await restoredNote.evaluate((element) => element.classList.contains('selected'))),
  await alice.page.locator('.selection').count()
);

// when: it is put back in the trash, so the run leaves the notes view as it found it
await alice.page.evaluate(async () => {
  const response = await fetch('/api/notes', { credentials: 'include' });
  const body = await response.json();
  const note = body.notes.find((candidate) => candidate.title === 'Bulk six');
  if (note) {
    await fetch(`/api/notes/${note.id}`, { method: 'DELETE', credentials: 'include' });
  }
});
await alice.page.reload({ waitUntil: 'networkidle' });

// when: it is unpinned again, with every frame of the move recorded
await newestCard.hover();
const cardsBeforeUnpin = await alice.page.locator('.card').count();
await alice.page.evaluate(() => {
  const frames = [];
  const started = performance.now();
  const record = () => {
    const cards = [...document.querySelectorAll('.card')];
    frames.push({
      count: cards.length,
      faded: cards.some((card) => Number(getComputedStyle(card).opacity) < 0.99)
    });
    if (performance.now() - started < 500) requestAnimationFrame(record);
  };
  window.__unpinFrames = frames;
  requestAnimationFrame(record);
});
await newestCard.getByRole('button', { name: 'Unpin note' }).click();
await alice.page.waitForTimeout(700);
const unpinFrames = await alice.page.evaluate(() => window.__unpinFrames);

// then: the note slides to its new section as the same card, the way the original moves it — never
// a second copy scaling in while the first fades out where it was
check(
  'an unpinned note moves as one card, without fading or doubling',
  unpinFrames.length > 5 &&
    unpinFrames.every((frame) => frame.count === cardsBeforeUnpin && !frame.faded),
  JSON.stringify(unpinFrames.filter((frame) => frame.count !== cardsBeforeUnpin || frame.faded).slice(0, 3))
);

// then: the sections go away
check(
  'unpinning removes the sections',
  (await alice.page.locator('.section').count()) === 0
);

// when: the same note is pinned from the editor's own toolbar
await newestCard.click();
await alice.page.waitForSelector('.editor .note-body');
await alice.page.locator('.editor').getByRole('button', { name: 'Pin note' }).click();
await alice.page.waitForTimeout(600);

// then: the toolbar reflects it and the server agrees
check(
  'the editor pins the note',
  (await alice.page.locator('.editor').getByRole('button', { name: 'Unpin note' }).count()) === 1 &&
    (await alice.page.evaluate(async (title) => {
      const response = await fetch('/api/notes', { credentials: 'include' });
      const body = await response.json();
      return body.notes.find((note) => note.title === title)?.pinned === true;
    }, newestTitle))
);
await alice.page.locator('.editor').getByRole('button', { name: 'Unpin note' }).click();
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await alice.page.waitForTimeout(700);

// when: a label is created and attached to the note
await alice.page.getByRole('button', { name: 'Edit labels' }).click();
await alice.page.waitForSelector('.labels');
await alice.page.getByLabel('New label name').fill('errands');
await alice.page.locator('.labels form').getByRole('button', { name: 'Create label' }).click();
await alice.page.waitForTimeout(600);
await alice.page.locator('.labels .done').click();
await alice.page.waitForTimeout(300);

await openCardLabels(listCard);
await alice.page.waitForSelector('.label-picker');
await alice.page.locator('.label-picker .row').filter({ hasText: 'errands' }).click();
await alice.page.waitForTimeout(700);

// then: the label chip is on the card and in the sidebar
check(
  'the label is attached to the note',
  (await listCard.locator('.chip').filter({ hasText: 'errands' }).count()) === 1,
  await listCard.innerHTML()
);
check(
  'the label is listed in the sidebar',
  (await alice.page.locator('.sidebar').innerText()).includes('errands')
);

// when: the label is picked in the sidebar
const noteTitles = () =>
  alice.page.evaluate(() =>
    [...document.querySelectorAll('.card .title')].map((title) => title.textContent?.trim())
  );
const everything = await noteTitles();
await alice.page.locator('.sidebar .item').filter({ hasText: 'errands' }).click();
await alice.page.waitForTimeout(700);
const filtered = await noteTitles();

// then: the view shows that label's notes and nothing else, and the address says which label
const filteredPath = await alice.page.evaluate(() => window.location.pathname);

// then: the header says which label this is, in place of the app's own name
const labelHeader = await alice.page.evaluate(() => ({
  heading: document.querySelector('.topbar .view-heading')?.textContent?.trim() ?? null,
  wordmark: document.querySelector('.topbar .wordmark')?.textContent?.trim() ?? null
}));
check(
  "a label's view names the label in the header",
  labelHeader.heading === 'errands' && labelHeader.wordmark === null,
  JSON.stringify(labelHeader)
);

// and the sidebar keeps the labels with the navigation, directly under Reminders
const sidebarOrder = await alice.page.evaluate(() =>
  [...document.querySelectorAll('.sidebar .item')].map((item) =>
    (item.textContent ?? '').trim().replace(/\s+/g, ' ')
  )
);
check(
  'the sidebar lists the labels directly under Reminders',
  sidebarOrder[0] === 'Notes' &&
    sidebarOrder[1].startsWith('Reminders') &&
    sidebarOrder[2] === 'errands' &&
    sidebarOrder[3] === 'Edit labels',
  JSON.stringify(sidebarOrder.slice(0, 5))
);
check(
  'clicking a label in the sidebar filters the notes',
  filtered.length > 0 &&
    filtered.length < everything.length &&
    filtered.every((title) => title === 'Shopping') &&
    /^\/labels\/\d+$/.test(filteredPath),
  `all ${JSON.stringify(everything)} vs filtered ${JSON.stringify(filtered)} at ${filteredPath}`
);

// when: a note is composed from inside that label's view
await alice.page.getByRole('button', { name: 'Take a note…' }).click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor textarea.title').click();
await alice.page.keyboard.type('pharmacy run');
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await alice.page.waitForTimeout(900);
const composed = await noteTitles();

// then: it is in that view, carrying the label it was written under
check(
  'a note composed in a label view is given that label',
  composed.includes('pharmacy run') &&
    (await alice.page.locator('.card').filter({ hasText: 'pharmacy run' }).locator('.chip').count()) === 1,
  JSON.stringify(composed)
);

// when: it is thrown away again, so the rest of the run sees what it saw before
await alice.page.locator('.card').filter({ hasText: 'pharmacy run' }).first().hover();
await alice.page
  .locator('.card')
  .filter({ hasText: 'pharmacy run' })
  .first()
  .getByRole('button', { name: 'More' })
  .click();
await alice.page.getByRole('menuitem', { name: 'Delete note' }).click();
await alice.page.waitForTimeout(800);
await alice.page.reload({ waitUntil: 'networkidle' });
await alice.page.waitForTimeout(600);

// when: the chip on the card in that view is used
const chip = alice.page.locator('.card .chip button').first();
const chipLabel = (await chip.textContent())?.trim() ?? '';
await chip.click();
await alice.page.waitForTimeout(700);

// then: it goes to that label's view too
check(
  'the chip on a card opens that label',
  (await alice.page.evaluate(() => window.location.pathname)) === filteredPath,
  `${chipLabel} -> ${await alice.page.evaluate(() => window.location.pathname)} (expected ${filteredPath})`
);

// when: the note is archived from inside that label's view
await alice.page.locator('.card').first().hover();
await alice.page.locator('.card').first().getByRole('button', { name: 'Archive note' }).click();
await alice.page.waitForTimeout(800);
const labelSections = await alice.page.evaluate(() =>
  [...document.querySelectorAll('.sections .section')].map((heading) => heading.textContent?.trim())
);

// then: it stays in the view, under an ARCHIVE heading of its own
check(
  "a label's view gathers that label's archived notes",
  labelSections.includes('Archive') &&
    (await alice.page.locator('.card').count()) === 1 &&
    (await alice.page.locator('.card .chip').count()) === 1,
  JSON.stringify(labelSections)
);

// when: it is unarchived again, so the rest of the run sees what it saw before
await alice.page.locator('.card').first().hover();
await alice.page.locator('.card').first().getByRole('button', { name: 'Unarchive note' }).click();
await alice.page.waitForTimeout(800);

// when: the label is taken off the note from inside that filtered view
const toggleLabel = async () => {
  await alice.page.locator('.card').first().hover();
  await openCardLabels(alice.page.locator('.card').first());
  await alice.page.waitForSelector('.label-picker');
  await alice.page.locator('.label-picker .row').filter({ hasText: 'errands' }).click();
  await alice.page.waitForTimeout(700);
};
await toggleLabel();

// then: the note leaves the filtered view without a reload
check(
  'a note that loses the label leaves the filtered view',
  (await noteTitles()).length === 0,
  JSON.stringify(await noteTitles())
);

// when: the label is put back on, and the page reloaded
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });
await alice.page.waitForTimeout(600);
const shopping = alice.page.locator('.card').filter({ hasText: 'Shopping' }).first();
await shopping.hover();
await openCardLabels(shopping);
await alice.page.waitForSelector('.label-picker');
await alice.page.locator('.label-picker .row').filter({ hasText: 'errands' }).click();
await alice.page.waitForTimeout(700);
await alice.page.reload({ waitUntil: 'networkidle' });
await alice.page.waitForTimeout(600);

// then: the label is still attached
check(
  'the label survives a reload',
  (await alice.page.locator('.card').filter({ hasText: 'Shopping' }).first().locator('.chip').filter({ hasText: 'errands' }).count()) === 1
);

console.log('\npolish locale');

// given: the second account switches to Polish
await bob.page.goto(`${baseUrl}/settings`, { waitUntil: 'networkidle' });
await bob.page.waitForSelector('.settings');
await bob.page.getByRole('radio', { name: /pl/ }).click();
await bob.page.waitForTimeout(400);

// then: the interface is translated
const sidebarText = await bob.page.locator('.sidebar').innerText();
check('the sidebar switches to Polish', sidebarText.includes('Notatki') && sidebarText.includes('Kosz'), sidebarText.replace(/\n/g, ' | '));
check(
  'a server-side error is localized to Polish',
  (await bob.page.locator('.settings h3').first().innerText()) === 'WYGLĄD',
  await bob.page.locator('.settings h3').first().innerText()
);

console.log('\na new note keeps its draft when the autosave creates it');

// Regression: the editor used to wipe itself when the first autosave turned a brand new note into a
// real one, and typing into that emptied editor created a second note. A separate account keeps this
// away from the notes the rest of this suite depends on.
const CAROL = { email: `carol.${run}@example.com`, name: 'Carol Shaw', password: 'correct horse battery' };
const carol = await newUser(CAROL);

await carol.page.getByRole('button', { name: 'Take a note…' }).click();
await carol.page.waitForSelector('.editor');
await carol.page.locator('.editor .note-body p').first().click();
await carol.page.keyboard.type('first part');

// when: the pause lets the autosave turn the draft into a stored note
// Every frame is watched, not just the end of the pause: the draft used to appear in the grid for a
// frame and then play its exit transition, which pushed the notes below it down and let them slide
// back — a whole-grid shuffle while the author was still writing.
await carol.page.evaluate(() => {
  window.__grid = [];
  const record = () => {
    window.__grid.push(
      [...document.querySelectorAll('.sections .card')].map((card) => card.dataset.noteId).join(',')
    );
    if (window.__grid.length < 200) requestAnimationFrame(record);
  };
  requestAnimationFrame(record);
});
await carol.page.waitForTimeout(1400);
const gridHistory = await carol.page.evaluate(() => [...new Set(window.__grid)]);
check(
  'the stored draft does not take a place in the grid yet',
  (await carol.page.locator('.card').count()) === 0,
  await carol.page.locator('.editor .note-body p').first().innerText()
);
check(
  'and the grid never flickers while the draft is stored',
  gridHistory.length === 1 && gridHistory[0] === '',
  JSON.stringify(gridHistory.slice(0, 5))
);

// and: typing continues in the same note rather than in an emptied editor
await carol.page.keyboard.type(' and second part');
await carol.page.waitForTimeout(1600);
const draftText = await carol.page.locator('.editor .note-body p').first().innerText();
check('the editor keeps the draft after the note is stored', draftText === 'first part and second part', draftText);
check(
  'continuing to type keeps one unplaced note, not two',
  (await carol.page.locator('.card').count()) === 0
);

// then: closing stores one note, not two
await carol.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await carol.page.waitForSelector('.editor', { state: 'detached' });
await carol.page.waitForTimeout(700);
await carol.page.reload({ waitUntil: 'networkidle' });
await carol.page.waitForSelector('.card');
check('one note exists after the whole flow', (await carol.page.locator('.card').count()) === 1);
check(
  'the stored body is the full text',
  (await carol.page.locator('.card').first().innerText()).includes('first part and second part'),
  await carol.page.locator('.card').first().innerText()
);
await carol.context.close();

console.log('\nediting happens above the grid');

// As in Keep there are two presentations. Composing a new note expands in place of the composer,
// with no dimming. Opening an existing note floats a card over the notes with the app dimmed behind
// it, exactly where the card was clicked from — and not one card underneath is allowed to move.
const DAVE = { email: `dave.${run}@example.com`, name: 'Dave Cutler', password: 'correct horse battery' };
const dave = await newUser(DAVE);

await dave.page.getByRole('button', { name: 'Take a note…' }).click();
await dave.page.waitForSelector('.editor');
await dave.page.locator('.editor textarea.title').fill('Koszty');
await dave.page.locator('.editor .note-body p').first().click();
await dave.page.keyboard.type('paliwo 320');
await dave.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await dave.page.waitForTimeout(700);

// when: another note is opened for editing
await dave.page.getByRole('button', { name: 'Take a note…' }).click();
await dave.page.waitForSelector('.editor');
await dave.page.locator('.editor textarea.title').fill('Sprzęt');
await dave.page.locator('.editor .note-body p').first().click();
await dave.page.keyboard.type('laptop');
await dave.page.waitForTimeout(300);

// then: composing takes the composer's place without dimming anything
const composing = await dave.page.evaluate(() => ({
  scrim: document.querySelectorAll('.editor-scrim').length,
  dialog: document.querySelectorAll('.ok-dialog').length,
  inContent: !!document.querySelector('.content .editor-host'),
  composerHidden: document.querySelectorAll('.composer').length === 0
}));
check(
  'composing a new note does not dim the app',
  composing.scrim === 0 && composing.dialog === 0,
  JSON.stringify(composing)
);
check(
  'composing replaces the composer in the notes area',
  composing.inContent && composing.composerHidden,
  JSON.stringify(composing)
);
check('the notes stay in place while editing', (await dave.page.locator('.card').count()) === 1);

// when: focus is lost by clicking an empty part of the page
await dave.page.mouse.click(1400, 860);
await dave.page.waitForTimeout(900);

// then: the note settles into the grid and the composer returns
check('losing focus closes the editor', (await dave.page.locator('.editor').count()) === 0);
check('the composer comes back', (await dave.page.locator('.composer').count()) === 1);
check('the note took its place in the grid', (await dave.page.locator('.card').count()) === 2);
check(
  'the settled note kept its text',
  (await dave.page.locator('.card').filter({ hasText: 'Sprzęt' }).innerText()).includes('laptop'),
  await dave.page.locator('.card').filter({ hasText: 'Sprzęt' }).innerText()
);

// Absolute page coordinates on purpose: the editor floats over the notes, so opening it must not
// move a single card. A grid-relative comparison would hide exactly the shift that matters.
const gridOffsets = () =>
  dave.page.evaluate(() =>
    [...document.querySelectorAll('.card')].map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        id: card.dataset.noteId,
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        hidden: getComputedStyle(card).visibility === 'hidden'
      };
    })
  );

const positionsBefore = await gridOffsets();

// when: the note is opened from its place in the grid
await dave.page.locator('.card').filter({ hasText: 'Koszty' }).click();

// then: it grows out of that card into the editor, the way Keep does it. Captured immediately, while
// the animation is still running.
const opening = await dave.page
  .waitForFunction(() => (document.querySelector('.editor')?.getAnimations().length ?? 0) > 0, null, {
    timeout: 1500
  })
  .then(() =>
    dave.page.evaluate(() => {
      const animation = document.querySelector('.editor').getAnimations()[0];
      return animation ? animation.effect.getKeyframes().map((frame) => frame.transform).join(' ') : '';
    })
  )
  .catch(() => '');
check(
  'the note grows from its card into the editor',
  opening.includes('scale(') && opening.includes('translate('),
  opening || 'no animation'
);

await dave.page.waitForSelector('.editor');
await dave.page.waitForTimeout(400);

// then: it is the dialog-like presentation Keep uses for an existing note
const opened = await dave.page.evaluate(() => {
  const host = document.querySelector('.editor-host');
  const scrim = document.querySelector('.editor-scrim');
  return {
    scrim: document.querySelectorAll('.editor-scrim').length,
    scrimColor: scrim ? getComputedStyle(scrim).backgroundColor : '',
    floating: !!document.querySelector('.editor-host.floating'),
    composerKept: document.querySelectorAll('.composer').length === 1,
    hostTop: host ? Math.round(host.getBoundingClientRect().top) : -1
  };
});
check('opening an existing note dims the app behind it', opened.scrim === 1, JSON.stringify(opened));
// Measured from the original's DOM (light theme): its veil is rgb(32,33,36) at 60%, so the light page
// greys out under an open note.
check(
  "the light theme's veil is the original's dark grey",
  opened.scrimColor.replace(/\s/g, '') === 'rgba(32,33,36,0.6)',
  opened.scrimColor
);
check('the editor floats over the notes', opened.floating, JSON.stringify(opened));
check(
  'the composer stays visible above the floating editor',
  opened.composerKept && opened.hostTop > 0,
  JSON.stringify(opened)
);

const positionsDuring = await gridOffsets();
const hidden = positionsDuring.filter((card) => card.hidden);
check('the edited note leaves the grid', hidden.length === 1, JSON.stringify(positionsDuring));
check(
  'opening a note moves no other note',
  positionsDuring.every((card) => {
    const was = positionsBefore.find((before) => before.id === card.id);
    return was && was.x === card.x && was.y === card.y;
  }),
  JSON.stringify({ before: positionsBefore, during: positionsDuring })
);

// when: the dimmed notes behind the editor are clicked
// The editor floats over the middle of the window, so the card behind it is dimmed wherever the
// editor does not cover it — and that dimmed part is what gets the click.
const underTheScrim = await dave.page.locator('.card').filter({ hasText: 'Sprzęt' }).boundingBox();
const coversCards = await dave.page.locator('.editor').boundingBox();
const dimmedX =
  underTheScrim.x + 20 < coversCards.x
    ? underTheScrim.x + 20
    : underTheScrim.x + underTheScrim.width - 20;
await dave.page.mouse.click(dimmedX, underTheScrim.y + underTheScrim.height / 2);
await dave.page.waitForTimeout(700);

// then: the note is finished — the dimmed area is outside the editor and does not open what is under it
check(
  'clicking the dimmed notes finishes the note without opening them',
  (await dave.page.locator('.editor').count()) === 0
);

// when: the space beside the editor card is clicked instead
await dave.page.locator('.card').filter({ hasText: 'Koszty' }).click();
await dave.page.waitForSelector('.editor');
await dave.page.waitForTimeout(400);
const editorBox = await dave.page.locator('.editor').boundingBox();
await dave.page.mouse.click(editorBox.x - 60, editorBox.y + 40);
await dave.page.waitForTimeout(700);
check('clicking beside the editor finishes the note', (await dave.page.locator('.editor').count()) === 0);

// when: the editor is dismissed with Escape, the way it works in the original
await dave.page.locator('.card').filter({ hasText: 'Koszty' }).click();
await dave.page.waitForSelector('.editor');
await dave.page.waitForTimeout(400);
await dave.page.keyboard.press('Escape');
await dave.page.waitForTimeout(800);
check('Escape finishes editing', (await dave.page.locator('.editor').count()) === 0);

// then: nothing has shifted and the note is back in its place
const positionsAfter = await gridOffsets();
check(
  'the note comes back and nothing has shifted',
  positionsAfter.every((card) => {
    const was = positionsBefore.find((before) => before.id === card.id);
    return was && was.x === card.x && was.y === card.y && !card.hidden;
  }),
  JSON.stringify(positionsAfter)
);

console.log('\nscrolling under an open note');

// when: the notes are scrolled and a note is opened from what is on screen
await dave.page.evaluate(() => window.scrollTo(0, 260));
await dave.page.waitForTimeout(300);
const scrolled = await dave.page.evaluate(() => window.scrollY);
const visibleCard = await dave.page.evaluate(() => {
  const card = [...document.querySelectorAll('.card')].find((node) => {
    const box = node.getBoundingClientRect();
    return box.top > 80 && box.bottom < window.innerHeight - 40 && !node.classList.contains('being-edited');
  });
  if (!card) return null;
  const box = card.getBoundingClientRect();
  return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
});
await dave.page.mouse.click(visibleCard.x, visibleCard.y);
await dave.page.waitForSelector('.editor-host.floating');
await dave.page.waitForTimeout(500);

// then: it is in the window — the editor hangs from the viewport, not from wherever the page is
const placement = await dave.page.evaluate(() => {
  const box = document.querySelector('.editor').getBoundingClientRect();
  return {
    top: Math.round(box.top),
    bottom: Math.round(box.bottom),
    viewport: window.innerHeight,
    scrollY: window.scrollY
  };
});
check(
  'a note opened from a scrolled list lands inside the window',
  placement.top >= 0 && placement.bottom <= placement.viewport && placement.scrollY === scrolled,
  `${JSON.stringify(placement)} scrolled to ${scrolled}`
);

// when: the wheel is turned with the note open
const beforeWheel = placement.scrollY;
await dave.page.mouse.move(200, 500);
await dave.page.mouse.wheel(0, 300);
await dave.page.waitForTimeout(300);

// then: the notes under the note stay where they are, the way Keep holds them still
check(
  'the page under an open note does not scroll',
  (await dave.page.evaluate(() => window.scrollY)) === beforeWheel,
  `${beforeWheel} -> ${await dave.page.evaluate(() => window.scrollY)}`
);

await dave.page.keyboard.press('Escape');
await dave.page.waitForTimeout(800);

console.log('\nfinishing a new note');

// given: a brand new note, stored by its own autosave
await dave.page.evaluate(() => window.scrollTo(0, 0));
await dave.page.waitForTimeout(200);
await dave.page.getByRole('button', { name: 'Take a note…' }).click();
await dave.page.waitForSelector('.editor');
await dave.page.locator('.editor textarea.title').fill('Flight check');
await dave.page.waitForTimeout(900);
const beforeFlight = await dave.page.locator('.editor').boundingBox();

// when: the note is finished, recording where the editor is on every frame until it is gone
await dave.page.evaluate(() => {
  window.__flight = [];
  const record = () => {
    const editor = document.querySelector('.editor');
    if (!editor) return;
    const box = editor.getBoundingClientRect();
    window.__flight.push({ top: box.top, left: box.left, width: box.width });
    requestAnimationFrame(record);
  };
  requestAnimationFrame(record);
});
await dave.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await dave.page.waitForTimeout(1400);

// then: it travelled to the card it becomes, rather than fading where it stood
const flight = await dave.page.evaluate(() => {
  const card = [...document.querySelectorAll('.card')].find((node) => node.innerText.includes('Flight check'));
  const box = card.getBoundingClientRect();
  return {
    frames: window.__flight.length,
    last: window.__flight[window.__flight.length - 1],
    card: { top: Math.round(box.top), left: Math.round(box.left), width: Math.round(box.width) }
  };
});
// The tolerance is one frame of the flight: the last frame the editor was seen in is the one before
// it hands over, so it is always a little short of the card.
check(
  'finishing a new note flies the editor onto the card it becomes',
  flight.frames > 3 &&
    Math.abs(flight.last.top - flight.card.top) < 24 &&
    Math.abs(flight.last.left - flight.card.left) < 24 &&
    Math.abs(flight.last.width - flight.card.width) < 24,
  JSON.stringify({ beforeFlight, flight })
);

await dave.context.close();

console.log('\ntyping without being interrupted');

// Three things the owner hit while just writing a note. They are kept together because they all
// broke the same promise: that the editor stays out of the way.
const EVE = { email: `eve.${run}@example.com`, name: 'Eve Adams', password: 'correct horse battery' };
const eve = await newUser(EVE);

// when: a note is composed, the title is typed, and Enter is pressed the way anyone would
await eve.page.getByRole('button', { name: 'Take a note…' }).click();
await eve.page.waitForSelector('.editor');
await eve.page.locator('.editor textarea.title').click();
await eve.page.keyboard.type('Zakupy');
await eve.page.keyboard.press('Enter');
await eve.page.keyboard.type('mleko');

// then: the text lands in the note body, not on a second line of the title
check(
  'Enter in the title moves into the note',
  (await eve.page.locator('.editor textarea.title').inputValue()) === 'Zakupy'
);
check(
  'what is typed after Enter is the note body',
  (await eve.page.locator('.editor .note-body p').first().innerText()) === 'mleko',
  await eve.page.locator('.editor .note-body p').first().innerText()
);

// when: the body is clicked on the line rather than exactly on its text
await eve.page.locator('.editor .note-body > *').first().click({ position: { x: 400, y: 8 } });
await eve.page.keyboard.type(' i chleb');

// then: the caret was placed after the text and typing continues there
check(
  'clicking a line puts the caret in it',
  (await eve.page.locator('.editor .note-body p').first().innerText()) === 'mleko i chleb',
  await eve.page.locator('.editor .note-body p').first().innerText()
);
await eve.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await eve.page.waitForTimeout(800);

// when: a brand new note is typed into without clicking anything first
await eve.page.getByRole('button', { name: 'Take a note…' }).click();
await eve.page.waitForSelector('.editor .note-body');
await eve.page.keyboard.type('bez klikania');
await eve.page.waitForTimeout(300);

// then: the body took it — the original's "Take a note…" is its body's placeholder, and clicking it
// leaves the caret there
check(
  'typing right after opening a new note lands in the body',
  (await eve.page.locator('.editor .note-body').innerText()).includes('bez klikania') &&
    (await eve.page.locator('.editor textarea.title').inputValue()) === '',
  await eve.page.locator('.editor .note-body').innerText()
);

// when: the title is clicked, written, and left with Enter
await eve.page.locator('.editor textarea.title').click();
await eve.page.keyboard.type('tytuł');
await eve.page.keyboard.press('Enter');
await eve.page.keyboard.type(' i treść');
await eve.page.waitForTimeout(300);

// then: Enter hands the typing back to the body
check(
  'and Enter in the title hands the typing over to the body',
  (await eve.page.locator('.editor textarea.title').inputValue()) === 'tytuł' &&
    (await eve.page.locator('.editor .note-body').innerText()).includes('i treść'),
  await eve.page.locator('.editor .note-body').innerText()
);
await eve.page.keyboard.press('Escape');
await eve.page.waitForTimeout(700);

// when: a note is opened and the empty space under the text is clicked, the way anyone aims
await eve.page.getByRole('button', { name: 'Take a note…' }).click();
await eve.page.waitForSelector('.editor .note-body');
const emptyArea = await eve.page.locator('.editor .note-body').boundingBox();
const clickedInside = await eve.page.evaluate(
  ([x, y]) => document.elementFromPoint(x, y)?.classList.contains('note-body') ?? false,
  [emptyArea.x + emptyArea.width / 2, emptyArea.y + emptyArea.height - 12]
);
await eve.page.mouse.click(emptyArea.x + emptyArea.width / 2, emptyArea.y + emptyArea.height - 12);
await eve.page.keyboard.type('wpisane w puste miejsce');
await eve.page.waitForTimeout(300);

// then: the whole box is editor, and what is typed there lands in the note
check(
  'clicking the empty part of the body puts the caret in it',
  clickedInside && (await eve.page.locator('.editor .note-body').innerText()).includes('wpisane w puste miejsce'),
  `${clickedInside} / ${await eve.page.locator('.editor .note-body').innerText()}`
);

// then: no focus ring is drawn around the line being typed, which reads as a stray selection
check(
  'the editor draws no focus ring',
  (await eve.page.locator('.editor .note-body').evaluate((el) => getComputedStyle(el).outlineStyle)) === 'none',
  await eve.page.locator('.editor .note-body').evaluate((el) => getComputedStyle(el).outline)
);
await eve.page.keyboard.press('Escape');
await eve.page.waitForTimeout(700);

// when: the pointer is dragged across the app — which anyone does while clicking about
await eve.page.locator('.card').first().click();
await eve.page.waitForSelector('.editor .note-body');
await eve.page.waitForTimeout(600);
const bodyBox = await eve.page.locator('.editor .note-body').boundingBox();
await eve.page.mouse.move(bodyBox.x + 40, bodyBox.y + 8);
await eve.page.mouse.down();
await eve.page.mouse.move(20, 500, { steps: 10 });
await eve.page.mouse.up();
const dragged = await eve.page.evaluate(() => window.getSelection()?.toString() ?? '');

// then: the selection never leaves the editor; the notes around it stay unhighlighted
check(
  'a stray drag cannot paint the notes around the editor',
  !dragged.includes('Archive') && !dragged.includes('Trash') && !dragged.includes('Notes'),
  JSON.stringify(dragged.slice(0, 60))
);
await eve.page.keyboard.press('Escape');
await eve.page.waitForTimeout(600);

// when: a card is double clicked, which selects a word anywhere text is selectable
const cardBox = await eve.page.locator('.card').first().boundingBox();
await eve.page.mouse.dblclick(cardBox.x + 40, cardBox.y + 50);
await eve.page.waitForTimeout(200);
const doubleClicked = await eve.page.evaluate(() => window.getSelection()?.toString() ?? '');

// then: the app's own chrome is not a document
check('double clicking a card selects nothing', doubleClicked === '', JSON.stringify(doubleClicked));

await eve.page.keyboard.press('Escape');
await eve.page.waitForTimeout(700);

// when: a note that is not the first in the grid is edited, and the first save lands
const secondCard = eve.page.locator('.card').nth(1);
const secondTitle = await secondCard.locator('.title').innerText();
const secondBox = await secondCard.boundingBox();
await secondCard.click();
await eve.page.waitForSelector('.editor .note-body');
await eve.page.waitForTimeout(500);
await eve.page.locator('.editor .note-body').click();
await eve.page.keyboard.type(' poprawka');
await eve.page.waitForTimeout(1800);
const keptBox = await eve.page.evaluate(() => {
  const hidden = document.querySelector('.card.being-edited');
  if (!hidden) return null;
  const box = hidden.getBoundingClientRect();
  return { x: Math.round(box.x), y: Math.round(box.y) };
});

// then: the empty place under the editor has not travelled; it is still where the note was
check(
  'the note being edited keeps its place while it saves',
  keptBox !== null &&
    Math.abs(keptBox.x - secondBox.x) <= 1 &&
    Math.abs(keptBox.y - secondBox.y) <= 1 &&
    (await eve.page.evaluate(() => document.querySelector('.card.being-edited')?.querySelector('.title')?.textContent)) ===
      secondTitle,
  `${JSON.stringify(secondBox)} -> ${JSON.stringify(keptBox)} (${secondTitle})`
);
await eve.page.keyboard.press('Escape');
await eve.page.waitForTimeout(800);

// when: the note is reopened and its save response is deliberately slower than the live notification
await eve.page.route('**/api/notes/*', async (route) => {
  if (route.request().method() !== 'PATCH') return route.continue();
  const response = await route.fetch();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await route.fulfill({ response });
});
await eve.page.reload({ waitUntil: 'networkidle' });
await eve.page.waitForSelector('.card');
await eve.page.locator('.card').first().click();
await eve.page.waitForSelector('.editor');
await eve.page.locator('.editor .note-body p').first().click();
for (let i = 0; i < 10; i++) {
  await eve.page.keyboard.type('abc');
  await eve.page.waitForTimeout(180);
}
await eve.page.waitForTimeout(2500);

// then: the author is never told that somebody else changed their own note
check(
  'the author is not warned about their own save',
  (await eve.page.getByText(/changed this note while you were/i).count()) === 0,
  (await eve.page.locator('.editor .note-body p').first().innerText()).slice(0, 40)
);
check(
  'nothing typed during that race was lost',
  (await eve.page.locator('.editor .note-body p').first().innerText()).endsWith('abcabcabc'),
  await eve.page.locator('.editor .note-body p').first().innerText()
);

// when: the menu button in the header is used. The editor is dismissed first: while it is open its
// scrim covers the header, the same way Keep dims the whole app behind a note being edited.
await eve.page.keyboard.press('Escape');
await eve.page.waitForTimeout(600);
// A window wide enough that folding the rail really does fit another whole column: the gutter beside
// the notes is the original's 56px, so at 1440 the folded rail gains no column and there would be no
// re-deal to look at.
// 1700px is where folding the rail really frees a whole extra column: with the notes centred there
// is no fixed gutter, so the numbers moved (was 1560 with a 56px gutter).
// More notes than there are columns: the notes read left to right, so with fewer of them than
// columns they all sit in the first row and a new column has nothing to move.
const railNoteIds = await eve.page.evaluate(async () => {
  const ids = [];
  for (let index = 0; index < 8; index += 1) {
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Rail note ${index}` })
    });
    ids.push((await response.json()).id);
  }
  return ids;
});
await eve.page.reload({ waitUntil: 'networkidle' });
await eve.page.setViewportSize({ width: 1700, height: 900 });
await eve.page.waitForTimeout(800);
const rail = () =>
  eve.page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    const label = document.querySelector('.sidebar .text');
    const active = document.querySelector('.sidebar .item.active');
    const icon = document.querySelector('.sidebar .item .icon');
    const burger = document.querySelector('.menu-button');
    const card = document.querySelector('.card');
    const centre = (element) => {
      const box = element.getBoundingClientRect();
      return Math.round(box.x + box.width / 2);
    };
    return {
      width: Math.round(sidebar.getBoundingClientRect().width),
      panel: Math.round(document.querySelector('.sidebar .rail').getBoundingClientRect().width),
      labels: label ? getComputedStyle(label).display !== 'none' : false,
      icons: [...document.querySelectorAll('.sidebar .icon')].filter((icon) => icon.getBoundingClientRect().width > 0)
        .length,
      activeRadius: active ? getComputedStyle(active).borderRadius : '',
      gridWidth: Math.round(document.querySelector('.sections')?.getBoundingClientRect().width ?? 0),
      iconCentre: icon ? centre(icon) : null,
      burgerCentre: burger ? centre(burger) : null,
      cardX: card ? Math.round(card.getBoundingClientRect().x) : null
    };
  });
const before = await rail();

// when: the menu button is used
// The columns are a fixed width, so folding the rail adds a column instead of stretching the ones
// there are. The rail's panel animates over the notes (150ms), and the notes slide to their new
// places on the grid's own 218ms, as the original's do (measured 2026-10-25).
const gridBox = () =>
  eve.page.evaluate(() => {
    const cards = [...document.querySelectorAll('.sections .card')];
    return {
      width: Math.round(cards[0].getBoundingClientRect().width),
      total: cards.length,
      grid: Math.round(document.querySelector('.sections').getBoundingClientRect().width),
      cardX: Math.round(cards[0].getBoundingClientRect().x),
      moving: [...document.querySelectorAll('.sections .slot')].filter((slot) => slot.getAnimations().length > 0).length
    };
  });

const beforeFold = await gridBox();
await eve.page.locator('.menu-button').click();
await eve.page.waitForTimeout(40);
const midway = await rail();
const atOnce = await gridBox();
await eve.page.waitForTimeout(600);
const afterFold = await gridBox();
const folded = await rail();

// then: the grid gained a whole column at once, the notes kept their width, and they slid into place
check(
  'folding the rail adds a column, and the notes slide to their new places',
  afterFold.grid > beforeFold.grid + 100 &&
    afterFold.width === beforeFold.width &&
    atOnce.grid === afterFold.grid &&
    atOnce.moving > 0 &&
    afterFold.moving === 0,
  JSON.stringify({ beforeFold, atOnce, afterFold })
);
check(
  'the menu button folds the navigation to icons',
  before.labels && !folded.labels && folded.icons > 0 && folded.width < before.width,
  JSON.stringify({ before, folded })
);
check(
  "only the rail's panel narrows gradually; its column takes the new width at once",
  midway.width === folded.width && midway.panel < before.panel && midway.panel > folded.panel,
  JSON.stringify({ before, midway, folded })
);
const gridWidth = () =>
  eve.page.evaluate(() => Math.round(document.querySelector('.sections').getBoundingClientRect().width));
check(
  'the notes take the room the folded rail gives them',
  (await gridWidth()) > before.gridWidth + 100,
  `${before.gridWidth} -> ${await gridWidth()}`
);
check(
  'the folded rail draws the active icon in a circle',
  folded.activeRadius === '50%',
  `${folded.activeRadius} vs ${before.activeRadius}`
);
check(
  'the menu button lines up with the icon column',
  folded.burgerCentre === folded.iconCentre,
  `burger ${folded.burgerCentre} vs icon ${folded.iconCentre}`
);

// when: the pointer is over the folded rail
await eve.page.mouse.move(folded.iconCentre ?? 36, 300);
await eve.page.waitForTimeout(600);
const peeked = await rail();

// then: it widens to show the labels — floating over the notes rather than pushing them
check(
  'hovering the folded rail shows the labels',
  peeked.labels && peeked.width === folded.width && peeked.activeRadius !== '50%',
  JSON.stringify({ folded, peeked })
);
check(
  'the peek leaves the notes where they were',
  peeked.cardX === folded.cardX,
  `${folded.cardX} -> ${peeked.cardX}`
);

// and: the widened rail floats above the notes rather than under them
const overlap = await eve.page.evaluate(() => {
  const rail = document.querySelector('.sidebar .rail').getBoundingClientRect();
  const card = document.querySelector('.card')?.getBoundingClientRect();
  if (!card || card.left >= rail.right) return { overlaps: false };
  const x = Math.max(rail.left, card.left) + 6;
  const y = Math.max(rail.top, card.top) + 12;
  const top = document.elementFromPoint(x, y);
  return { overlaps: true, insideRail: top?.closest('.sidebar') !== null };
});
check(
  'the widened rail paints above the notes',
  !overlap.overlaps || overlap.insideRail,
  JSON.stringify(overlap)
);

// when: the pointer leaves the rail again
await eve.page.mouse.move(1200, 600);
await eve.page.waitForTimeout(600);
const refolded = await rail();

// then: it folds back on its own
check(
  'the rail folds again once the pointer leaves',
  refolded.width === folded.width && !refolded.labels && refolded.activeRadius === '50%',
  JSON.stringify(refolded)
);

await eve.page.locator('.menu-button').click();
await eve.page.waitForTimeout(500);
const unfolded = await rail();
check('the menu button brings the navigation back', unfolded.width === before.width && unfolded.labels, JSON.stringify(unfolded));
// The extra notes were only there to give the fold something to move.
await eve.page.evaluate(async (ids) => {
  for (const id of ids) {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    await fetch(`/api/notes/${id}?permanent=true`, { method: 'DELETE' });
  }
}, railNoteIds);
await eve.page.waitForTimeout(800);
check(
  'the header is separated from the notes by a line',
  (await eve.page.evaluate(() => getComputedStyle(document.querySelector('.topbar')).boxShadow)).includes('inset')
);

// when: the rail is open on a wide screen and a nav item is used
await eve.page.locator('.sidebar').getByRole('button', { name: 'Archive' }).click();
await eve.page.waitForTimeout(600);

// then: the column stays where it is, the way Keep leaves it — only the drawer dismisses itself
check(
  'navigating leaves the open rail open on a wide screen',
  (await eve.page.locator('.sidebar').evaluate((el) => el.classList.contains('open'))) &&
    (await eve.page.locator('.sidebar .text').first().isVisible()),
  await eve.page.locator('.sidebar').getAttribute('class')
);

// when: the same thing happens in the narrow layout, where the rail covers the notes
await eve.page.setViewportSize({ width: 700, height: 900 });
await eve.page.waitForTimeout(400);
await eve.page.locator('.menu-button').click();
await eve.page.waitForTimeout(400);
const drawerOpened = await eve.page.locator('.sidebar').evaluate((el) => el.classList.contains('open'));
await eve.page.locator('.sidebar').getByRole('button', { name: 'Notes' }).click();
await eve.page.waitForTimeout(600);

// then: it closes behind the navigation
check(
  'navigating closes the drawer on a narrow screen',
  drawerOpened && !(await eve.page.locator('.sidebar').evaluate((el) => el.classList.contains('open'))),
  JSON.stringify({ drawerOpened, after: await eve.page.locator('.sidebar').getAttribute('class') })
);

// when: the drawer is opened again and Escape is pressed
await eve.page.locator('.menu-button').click();
await eve.page.waitForTimeout(400);
const reopened = await eve.page.locator('.sidebar').evaluate((el) => el.classList.contains('open'));
await eve.page.keyboard.press('Escape');
await eve.page.waitForTimeout(500);

// then: Escape dismisses it, the way Keep dismisses an overlay
check(
  'Escape closes the drawer on a narrow screen',
  reopened && !(await eve.page.locator('.sidebar').evaluate((el) => el.classList.contains('open'))),
  await eve.page.locator('.sidebar').getAttribute('class')
);

await eve.context.close();

// A system that asks for less motion must not leave the clone without a way to animate: Keep does
// not honour the setting at all, so the app owns the decision and Settings can override it.
const reduced = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'en-US',
  reducedMotion: 'reduce'
});
await reduced.addInitScript(() => localStorage.setItem('notka.browserNotice', 'dismissed'));
const reducedPage = await reduced.newPage();
await reducedPage.goto(baseUrl, { waitUntil: 'networkidle' });
const reducedUser = {
  email: `reduced.${run}@example.com`,
  name: 'Reduced Motion',
  password: 'correct horse battery'
};
await reducedPage.goto(`${baseUrl}/register`, { waitUntil: 'networkidle' });
await reducedPage.getByLabel('Email').fill(reducedUser.email);
await reducedPage.getByLabel('Display name').fill(reducedUser.name);
await reducedPage.getByLabel('Password', { exact: true }).fill(reducedUser.password);
await reducedPage.getByLabel('Confirm password').fill(reducedUser.password);
await reducedPage.getByRole('button', { name: 'Create account' }).click();
await reducedPage.waitForSelector('.composer');
await reducedPage.waitForTimeout(500);

check(
  'a system asking for less motion stops the app animating',
  (await reducedPage.evaluate(() => document.documentElement.dataset.motion)) === 'reduced'
);

// when: the box in Settings is ticked
await reducedPage.getByRole('button', { name: 'Settings' }).click();
await reducedPage.getByRole('menuitem', { name: 'Settings' }).click();
await reducedPage.waitForSelector('.ok-dialog');
const settingsShape = await reducedPage.evaluate(() => {
  const body = document.querySelector('.ok-dialog-body');
  const sections = [...document.querySelectorAll('.settings > section')];
  const heading = (text) =>
    sections.find((section) => section.textContent.includes(text))?.querySelector('h3')?.textContent?.trim();
  const toggle = document.querySelector('.settings .toggle input');
  const box = toggle?.getBoundingClientRect();
  const style = toggle ? getComputedStyle(toggle) : null;
  return {
    animationsUnder: heading('Animations'),
    bodyScrolls: body.scrollHeight > body.clientHeight,
    nestedScrolls: [...document.querySelectorAll('.settings')].some(
      (element) => element.scrollHeight > element.clientHeight
    ),
    checkbox: box
      ? { w: Math.round(box.width), h: Math.round(box.height), border: style.borderTopWidth }
      : null
  };
});
check(
  'Settings keeps its sections reachable and its toggle in Appearance',
  settingsShape.animationsUnder === 'Appearance' &&
    settingsShape.bodyScrolls &&
    !settingsShape.nestedScrolls &&
    settingsShape.checkbox?.w === 18 &&
    settingsShape.checkbox?.h === 18 &&
    settingsShape.checkbox?.border === '0px',
  JSON.stringify(settingsShape)
);
await reducedPage.locator('.ok-dialog input[type="checkbox"]').first().check();
await reducedPage.waitForTimeout(300);
const motionAfter = await reducedPage.evaluate(() => document.documentElement.dataset.motion);
await reducedPage.keyboard.press('Escape');
await reducedPage.waitForTimeout(400);

// then: the app animates again, and remembers the choice
check(
  'Settings can turn the animations back on',
  motionAfter === 'full' &&
    (await reducedPage.evaluate(() => localStorage.getItem('notka.motion'))) === 'on',
  motionAfter
);
await reduced.close();

console.log('\nreminders');

// when: the reminders view is opened, with nothing carrying a reminder yet
await alice.page.goto(`${baseUrl}/reminders`, { waitUntil: 'networkidle' });
await alice.page.waitForTimeout(600);
const reminderEmpty = await alice.page.evaluate(() => ({
  caption: document.querySelector('.empty h2')?.textContent?.trim() ?? null,
  bell: (() => {
    const svg = document.querySelector('.empty svg');
    return svg ? Math.round(svg.getBoundingClientRect().width) : null;
  })(),
  cards: document.querySelectorAll('.card').length
}));
check(
  'the reminders view explains itself when nothing is due',
  alice.page.url().endsWith('/reminders') &&
    reminderEmpty.cards === 0 &&
    reminderEmpty.caption === 'Notes with upcoming reminders appear here' &&
    reminderEmpty.bell === 80,
  JSON.stringify(reminderEmpty)
);

// when: a reminder is set from the editor's own bell
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });
await alice.page.waitForSelector('.card');
await alice.page.waitForTimeout(500);
await alice.page.locator('.card').first().click();
try {
  await alice.page.waitForSelector('.editor', { timeout: 8000 });
} catch {
  // A card that is still animating in can swallow the first click; the title is the reliable target.
  await alice.page.locator('.card').first().locator('.title').first().click();
  await alice.page.waitForSelector('.editor', { timeout: 8000 });
}
await alice.page.waitForTimeout(400);
// By name, not by place: the note's own corner holds its pin, and the reminder is one of the
// bottom bar's actions (rule 21).
await alice.page.locator('.editor').getByRole('button', { name: 'Add a reminder' }).click();
await alice.page.waitForSelector('.reminder-picker');
const reminderPicker = await alice.page.evaluate(() => {
  const picker = document.querySelector('.reminder-picker');
  return {
    title: picker?.querySelector('h2')?.textContent?.trim() ?? null,
    rows: [...(picker?.querySelectorAll('.reminder-row') ?? [])].map((row) =>
      Math.round(row.getBoundingClientRect().height)
    ),
    controls: [...(picker?.querySelectorAll('input, select') ?? [])].map(
      (control) => control.getAttribute('type') ?? control.tagName.toLowerCase()
    ),
    save: picker?.querySelector('.reminder-save')?.textContent?.trim() ?? null
  };
});
check(
  'the picker offers a date, a time and a repeat rule',
  reminderPicker.title === 'Pick date & time' &&
    reminderPicker.rows.join(',') === '56,56,56' &&
    reminderPicker.controls.join(',') === 'date,time,select' &&
    reminderPicker.save === 'Save',
  JSON.stringify(reminderPicker)
);

await alice.page.locator('.reminder-save').click();
await alice.page.waitForTimeout(1200);
check(
  'the reminder shows as the original writes it',
  (await alice.page.locator('.editor .reminder').innerText()).trim() === 'Tomorrow, 8:00 AM',
  await alice.page.locator('.editor .reminder').innerText()
);

// then: it is what the reminders view gathers, on the card as well as in the editor
await alice.page.keyboard.press('Escape');
await alice.page.waitForTimeout(900);
await alice.page.goto(`${baseUrl}/reminders`, { waitUntil: 'networkidle' });
await alice.page.waitForTimeout(700);
check(
  'the note is in the reminders view, with its chip',
  (await alice.page.locator('.card').count()) === 1 &&
    (await alice.page.locator('.card .reminder').innerText()).trim() === 'Tomorrow, 8:00 AM',
  `${await alice.page.locator('.card').count()} cards`
);

// when: the reminder is taken away again
await alice.page.locator('.card').first().click();
await alice.page.waitForSelector('.editor');
// By name, not by place: the note's own corner holds its pin, and the reminder is one of the
// bottom bar's actions (rule 21). The button says what it will do, so once the note has a reminder
// it reads "Delete reminder" — which is also what this step is here to press.
await alice.page.locator('.editor').getByRole('button', { name: 'Delete reminder' }).click();
await alice.page.waitForSelector('.reminder-picker');
await alice.page.locator('.reminder-delete').click();
await alice.page.waitForTimeout(1200);
await alice.page.keyboard.press('Escape');
await alice.page.waitForTimeout(900);
await alice.page.goto(`${baseUrl}/reminders`, { waitUntil: 'networkidle' });
await alice.page.waitForTimeout(700);
check(
  'taking the reminder away empties the view again',
  (await alice.page.locator('.card').count()) === 0,
  `${await alice.page.locator('.card').count()} cards`
);
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });

console.log('\nimages');
/** A solid-colour PNG of the given size, written here so the suite needs no fixture files. */
function png(width, height) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)]);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
// given: a note
await alice.page.evaluate(async () => {
  await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Pictured note' })
  });
});
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });
const picturedCard = alice.page.locator('.card').filter({ hasText: 'Pictured note' }).first();

// when: two pictures are added from the card's own button
await picturedCard.hover();
await picturedCard.locator('input[type=file]').setInputFiles([
  { name: 'wide.png', mimeType: 'image/png', buffer: png(400, 200) },
  { name: 'tall.png', mimeType: 'image/png', buffer: png(100, 200) }
]);
await alice.page.waitForTimeout(1200);
const cardPictures = await picturedCard.locator('.images img').evaluateAll((images) =>
  images.map((image) => image.complete && image.naturalWidth > 0)
);

// then: the card shows both, above its title, in one row
check(
  'pictures added from a card appear on it, above the title',
  cardPictures.length === 2 &&
    cardPictures.every(Boolean) &&
    (await picturedCard.locator('.images .row').count()) === 1,
  JSON.stringify(cardPictures)
);

// when: the note is opened and one picture is taken off
await picturedCard.locator('.title').click();
await alice.page.waitForSelector('.editor .images img');
await alice.page.locator('.editor .images .cell').first().hover();
await alice.page.locator('.editor .images').getByRole('button', { name: 'Delete image' }).first().click();
await alice.page.waitForTimeout(800);
const leftInEditor = await alice.page.locator('.editor .images img').count();
await alice.page.keyboard.press('Escape');
await alice.page.waitForTimeout(800);

// and: something that is not a picture is offered as one
const disguised = await alice.page.evaluate(async () => {
  const notes = (await fetch('/api/notes').then((response) => response.json())).notes;
  const target = notes.find((note) => note.title === 'Pictured note');
  const response = await fetch(`/api/notes/${target.id}/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
  });
  return { status: response.status, key: (await response.json()).error?.key };
});

// then
check(
  'a picture is taken off in the editor, and an SVG posing as a picture is refused',
  leftInEditor === 1 &&
    (await picturedCard.locator('.images img').count()) === 1 &&
    disguised.status === 400 &&
    disguised.key === 'image.unsupported',
  JSON.stringify({ leftInEditor, disguised })
);

console.log('\nserver settings');
// given: Alice, who is not the administrator, and the administrator signing in with a username
await alice.page.locator('.topbar').getByRole('button', { name: 'Settings' }).click();
const aliceSeesServerSettings = await alice.page.getByRole('menuitem', { name: 'Server settings' }).count();
await alice.page.keyboard.press('Escape');
const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
await adminContext.addInitScript(() => {
    localStorage.setItem('notka.locale', 'en-US');
    localStorage.setItem('notka.browserNotice', 'dismissed');
  });
const adminPage = await adminContext.newPage();
await adminPage.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
await adminPage.getByLabel('Email or username').fill(ADMIN.login);
await adminPage.getByLabel('Password').fill(ADMIN.password);
await adminPage.getByRole('button', { name: 'Sign in' }).click();
await adminPage.waitForSelector('.topbar', { timeout: 15_000 });

// when: the administrator opens the server settings from the gear
await adminPage.locator('.topbar').getByRole('button', { name: 'Settings' }).click();
await adminPage.getByRole('menuitem', { name: 'Server settings' }).click();
await adminPage.waitForSelector('.server-settings .account');
const accountsListed = await adminPage.locator('.server-settings .account').allInnerTexts();

// then: only the administrator has the entry, and the accounts come with what they store
check(
  'only the administrator has server settings, and they list every account with its storage',
  aliceSeesServerSettings === 0 &&
    accountsListed.some((text) => text.includes(ALICE.email) && /\d/.test(text)) &&
    accountsListed.some((text) => text.includes('Administrator')),
  JSON.stringify({ aliceSeesServerSettings, accountsListed: accountsListed.length })
);

// when: sign-up is closed
const signUp = adminPage.getByLabel('Anyone who can reach this server may create an account');
await signUp.uncheck();
await adminPage.waitForTimeout(300);
const closedHealth = await adminPage.evaluate(() => fetch('/api/health').then((response) => response.json()));
await signUp.check();
await adminPage.waitForTimeout(300);
const reopenedHealth = await adminPage.evaluate(() => fetch('/api/health').then((response) => response.json()));

// then
check(
  'the administrator closes and opens sign-up',
  closedHealth.registrationOpen === false && reopenedHealth.registrationOpen === true,
  JSON.stringify({ closedHealth, reopenedHealth })
);

console.log('\nbackground themes');
// given: a note of Alice's wearing a background, and a theme that redraws that background in one colour
await alice.page.evaluate(async () => {
  const created = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Themed note' })
  }).then((response) => response.json());
  await fetch(`/api/notes/${created.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ background: 'food' })
  });
});
const themeId = `e2e-${run}`;
const themeZip = zipSync({
  'theme.json': strToU8(
    JSON.stringify({ format: 1, id: themeId, name: `E2E theme ${run}`, backgrounds: { food: { light: 'food.svg', tint: '#123456' } } })
  ),
  'food.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#00ff00"/></svg>')
});
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });
const themedCard = alice.page.locator('.card').filter({ hasText: 'Themed note' }).first();
const builtInArt = await themedCard.evaluate((card) => getComputedStyle(card).backgroundImage);

// when: the administrator uploads it and makes it the instance's default
await adminPage.locator('.server-settings input[type=file][accept^=".zip"]').setInputFiles({
  name: 'e2e-theme.zip',
  mimeType: 'application/zip',
  buffer: Buffer.from(themeZip)
});
const themeRow = adminPage.locator('.server-settings .row').filter({ hasText: `E2E theme ${run}` });
await themeRow.waitFor();
await themeRow.getByRole('button', { name: 'Make default' }).click();
await themeRow.getByText('Default', { exact: true }).waitFor();
await alice.page.reload({ waitUntil: 'networkidle' });
const defaultArt = await themedCard.evaluate((card) => getComputedStyle(card).backgroundImage);

// and: Alice picks the built-in theme for herself
await alice.page.locator('.topbar').getByRole('button', { name: 'Settings' }).click();
await alice.page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
const themeListed = await alice.page.locator('.theme-name').allInnerTexts();
await alice.page.locator('.choice.theme').first().click();
await alice.page.waitForTimeout(300);
const restoredArt = await themedCard.evaluate((card) => getComputedStyle(card).backgroundImage);
await alice.page.keyboard.press('Escape');

// then: the default reaches her note, and her own choice overrides it
check(
  "an uploaded theme becomes everyone's default, and an account's own pick overrides it",
  builtInArt.includes('/backgrounds/food-light.svg') &&
    defaultArt.includes(`/api/themes/${themeId}/files/`) &&
    themeListed.filter((name) => name.startsWith(`E2E theme ${run}`)).length === 1 &&
    themeListed.length === 2 &&
    restoredArt.includes('/backgrounds/food-light.svg'),
  JSON.stringify({ builtInArt, defaultArt, themeListed, restoredArt })
);

// when: the theme is removed again, so the instance is left as it was
await themeRow.getByRole('button', { name: `Remove the theme “E2E theme ${run}”` }).click();
await adminPage.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
await themeRow.waitFor({ state: 'detached' });
const settingsAfter = await adminPage.evaluate(() => fetch('/api/admin/settings').then((response) => response.json()));

// then
check(
  'removing the default theme gives the instance the built-in one back',
  settingsAfter.defaultThemeId === 'notka',
  JSON.stringify(settingsAfter)
);
await adminContext.close();

console.log('\ndragging a note into place');

// given: an account of its own with four notes, newest first — D, C, B, A
const mover = await newUser({ email: `mover.${run}@example.com`, name: 'Mover', password: 'correct horse battery' });
await mover.page.evaluate(async () => {
  for (const title of ['Drag A', 'Drag B', 'Drag C', 'Drag D']) {
    await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
  }
});
await mover.page.reload({ waitUntil: 'networkidle' });
await mover.page.waitForSelector('.card');
const readingOrder = () =>
  mover.page.evaluate(() =>
    [...document.querySelectorAll('.sections .slot')]
      .map((slot) => ({ box: slot.getBoundingClientRect(), title: slot.querySelector('.title')?.textContent }))
      .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
      .map((entry) => entry.title)
  );

// when: A is dragged — the browser's own drag and drop — onto C's place
await mover.page.locator('.slot', { hasText: 'Drag A' }).dragTo(mover.page.locator('.slot', { hasText: 'Drag C' }));
await mover.page.waitForTimeout(800);
const afterDrag = await readingOrder();
await mover.page.reload({ waitUntil: 'networkidle' });
await mover.page.waitForSelector('.card');

// then: it takes that place, the others keep their order, and the server keeps it
check(
  'a card dragged onto another takes its place, and keeps it after a reload',
  JSON.stringify(afterDrag) === JSON.stringify(['Drag D', 'Drag A', 'Drag C', 'Drag B']) &&
    JSON.stringify(await readingOrder()) === JSON.stringify(afterDrag),
  JSON.stringify(afterDrag)
);
const draggableInCustom = await mover.page.locator('.slot[draggable="true"]').count();
await mover.page.evaluate(() => localStorage.setItem('notka.sort', 'created'));
await mover.page.reload({ waitUntil: 'networkidle' });
await mover.page.waitForSelector('.card');
const draggableByDate = await mover.page.locator('.slot[draggable="true"]').count();
check(
  'only the custom order can be dragged: sorted by date, no card is',
  draggableInCustom === 4 && draggableByDate === 0,
  JSON.stringify({ draggableInCustom, draggableByDate })
);

console.log('\nlabel suggestions after #');

// given: a label, and a new note with "#wo" typed into it
await mover.page.evaluate(() =>
  fetch('/api/labels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Workshop' }) })
);
await mover.page.reload({ waitUntil: 'networkidle' });
await mover.page.getByRole('button', { name: 'Take a note…' }).click();
await mover.page.waitForSelector('.editor .note-body p');
await mover.page.keyboard.type('Buy glue #wo');
await mover.page.waitForSelector('.label-suggestions');
const labelChoices = await mover.page.locator('.label-suggestions [role=option]').allTextContents();

// when: the first one is taken with Enter
await mover.page.keyboard.press('Enter');
await mover.page.waitForTimeout(500);

// then: the note carries that label, and the "#wo" is gone from its text
check(
  'typing # offers the matching labels and a new one, and picking one labels the note',
  labelChoices.map((text) => text.trim()).join('|') === 'Workshop|Create “wo”' &&
    (await mover.page.locator('.editor .selected-labels').innerText()).includes('Workshop') &&
    (await mover.page.locator('.editor .note-body').innerText()).trim() === 'Buy glue',
  JSON.stringify(labelChoices)
);
await mover.page.keyboard.press('Escape');
await mover.page.waitForTimeout(600);

await mover.context.close();


console.log('\nprofile picture, friends and groups');
// given: Alice on her notes, with Bob's account existing
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });

// when: she picks a picture from the account menu, keeps the cropper's framing and saves
await alice.page.getByRole('button', { name: 'Account menu' }).click();
await alice.page.getByRole('menuitem', { name: 'Change profile picture' }).click();
await alice.page.waitForSelector('[data-testid=avatar-dialog]');
await alice.page
  .locator('[data-testid=avatar-file]')
  .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(640, 480) });
await alice.page.locator('.svelte-easy-crop-area').waitFor();
await alice.page.waitForTimeout(400);
await alice.page.locator('[data-testid=avatar-dialog]').getByRole('button', { name: 'Save' }).click();
await alice.page.waitForSelector('[data-testid=avatar-dialog]', { state: 'detached', timeout: 20_000 });

// then: the server holds a JPEG XL, and the header shows the picture instead of the initials
const storedAvatar = await alice.page.evaluate(async () => {
  const { user } = await (await fetch('/api/auth/me')).json();
  const response = await fetch(`/api/users/${user.id}/avatar?v=${user.avatarAt}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { type: response.headers.get('content-type'), signature: [bytes[0], bytes[1]], size: bytes.length };
});
check(
  'a chosen picture is stored as JPEG XL',
  storedAvatar.type === 'image/jxl' && storedAvatar.signature[0] === 0xff && storedAvatar.signature[1] === 0x0a,
  JSON.stringify(storedAvatar)
);
// The header shows the picture where the browser draws JPEG XL, and the initials elsewhere — Notka
// carries no decoder of its own (docs/PLATFORMS.md).
const drawsJpegXl = await alice.page.evaluate(
  () =>
    new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve(probe.naturalWidth === 1);
      probe.onerror = () => resolve(false);
      probe.src = 'data:image/jxl;base64,/woAEBAJCAABACgASxiLFcJJQU5/AA==';
    })
);
await alice.page.waitForTimeout(800);
const headerAvatar = await alice.page.locator('.topbar .avatar').evaluate((avatar) => {
  const image = avatar.querySelector('img');
  return { picture: image !== null && image.complete && image.naturalWidth > 0, text: avatar.textContent?.trim() };
});
check(
  drawsJpegXl
    ? 'the header shows the picture'
    : 'a browser without JPEG XL keeps the initials in the header',
  drawsJpegXl ? headerAvatar.picture : !headerAvatar.picture && headerAvatar.text === 'AL',
  JSON.stringify(headerAvatar)
);

// and: a collaborator's card points at it, or keeps the initials where the browser cannot draw it
await bob.page.goto(baseUrl, { waitUntil: 'networkidle' });
await bob.page.waitForTimeout(800);
const ownerOnBobsCard = await bob.page.locator('.card .avatar').evaluateAll((avatars) =>
  avatars.map((avatar) => ({
    picture: Boolean(avatar.querySelector('img')?.naturalWidth),
    text: avatar.textContent?.trim()
  }))
);
check(
  "a collaborator sees the owner's picture where the browser draws it",
  drawsJpegXl ? ownerOnBobsCard.some((avatar) => avatar.picture) : ownerOnBobsCard.some((avatar) => avatar.text === 'AL'),
  JSON.stringify(ownerOnBobsCard)
);

// and: a collaborator's circle on a card wears the original's ring (docs/METRICS.md, "Avatars")
const cardRing = await bob.page.locator('.card .note-avatars .avatar').first().evaluate((avatar) => {
  const style = getComputedStyle(avatar);
  return { size: avatar.getBoundingClientRect().width, border: `${style.borderTopWidth} ${style.borderTopColor}`, shadow: style.boxShadow };
});
check(
  'a card draws its collaborators 24px across with a 2px white ring and a shadow',
  cardRing.size === 24 && cardRing.border === '2px rgb(255, 255, 255)' && cardRing.shadow !== 'none',
  JSON.stringify(cardRing)
);

// when: Alice saves Bob as a friend and puts him in a group
await alice.page.getByRole('button', { name: 'Account menu' }).click();
await alice.page.getByRole('menuitem', { name: 'Friends and groups' }).click();
const friendsDialog = alice.page.locator('[data-testid=friends-dialog]');
await friendsDialog.waitFor();
await friendsDialog.getByLabel('Friend’s email or username').fill(BOB.email);
await friendsDialog.getByRole('button', { name: 'Add', exact: true }).click();
await friendsDialog.locator('[data-testid=friends-list]').getByText(BOB.name).waitFor();
await friendsDialog.getByLabel('Name of the new group').fill('Team');
await friendsDialog.getByRole('button', { name: 'Create', exact: true }).click();
await friendsDialog.locator('[data-testid=groups-list] summary').filter({ hasText: 'Team' }).click();
await friendsDialog.locator('[data-testid=groups-list] label').filter({ hasText: BOB.name }).locator('input').check();
await alice.page.waitForTimeout(500);
check(
  'a friend is put in a group',
  (await friendsDialog.locator('[data-testid=groups-list] summary').filter({ hasText: 'Team' }).innerText()).includes('1 member'),
  await friendsDialog.locator('[data-testid=groups-list]').innerText()
);
await friendsDialog.getByRole('button', { name: 'Close', exact: true }).click();

// and: shares a new note by typing the group's name and picking it
await alice.page.evaluate(async () => {
  await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Team plans' })
  });
});
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });
const teamCard = alice.page.locator('.card').filter({ hasText: 'Team plans' }).first();
await teamCard.hover();
await teamCard.getByRole('button', { name: 'Add collaborator' }).click();
await alice.page.waitForSelector('.share');
await alice.page.getByLabel('Collaborator email').pressSequentially('tea');
await alice.page.locator('.share-suggestion').first().waitFor();
const offeredSuggestions = await alice.page.locator('.share-suggestion').allInnerTexts();
await alice.page.locator('.share-suggestion').filter({ hasText: 'Team' }).click();
await alice.page.locator('.share .list li').filter({ hasText: BOB.email }).waitFor({ timeout: 5_000 });

// then: the group was offered, and picking it added its member
check(
  'typing offers a matching group, and picking it shares the note with its members',
  offeredSuggestions.length === 1 && offeredSuggestions[0].includes('Team') &&
    (await alice.page.locator('.share .list li').filter({ hasText: BOB.email }).count()) === 1,
  JSON.stringify(offeredSuggestions)
);

// and: a friend is offered by name, but not once they already have the note
await alice.page.getByLabel('Collaborator email').pressSequentially(BOB.name.slice(0, 3));
await alice.page.waitForTimeout(300);
check(
  'somebody who already has the note is not suggested again',
  (await alice.page.locator('.share-suggestion').count()) === 0,
  JSON.stringify(await alice.page.locator('.share-suggestion').allInnerTexts())
);
await alice.page.locator('.share').getByRole('button', { name: 'Close', exact: true }).click();


/** Two long notes measured on the originals (docs/METRICS.md, "Long notes"), written through the API. */
async function writeLongNotes(page) {
  await page.evaluate(async () => {
    const doc = (lines) => ({ version: 1, blocks: lines.map((text, i) => ({ id: `l${i}`, type: 'paragraph', spans: [{ text }] })) });
    const mixed = Array.from({ length: 50 }, (_, i) => `Line ${String(i + 1).padStart(2, '0')} — ` + ((i + 1) % 3 ? 'short' : 'a longer line of text that takes more than one line on the card'));
    const short = Array.from({ length: 60 }, (_, i) => `L${String(i + 1).padStart(2, '0')}`);
    for (const [title, lines] of [['Long mixed note', mixed], ['Long note of short lines that wraps', short]]) {
      await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'TEXT', title, content: doc(lines) }) });
    }
  });
}

/** The lines a card's text is drawn on, and how it ends. */
const cardText = (page, title) =>
  page.locator('.card').filter({ hasText: title }).first().evaluate((card) => {
    const tops = new Set();
    const range = document.createRange();
    for (const line of card.querySelectorAll('.card-excerpt .line')) {
      const text = line.querySelector('.text');
      range.selectNodeContents(text);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
      if (rects.length === 0) tops.add(Math.round(line.getBoundingClientRect().top));
      for (const rect of rects) tops.add(Math.round(rect.top));
    }
    const text = card.querySelector('.card-excerpt').innerText.trim();
    return { lines: tops.size, titleLines: Math.round(card.querySelector('.title').offsetHeight / 25), tail: text.slice(-12) };
  });

console.log('\nlong notes');
// given: the two long notes the originals were measured with
await writeLongNotes(alice.page);
await alice.page.goto(baseUrl, { waitUntil: 'networkidle' });
await alice.page.waitForTimeout(800);

// when
const mixedCard = await cardText(alice.page, 'Long mixed note');
const shortCard = await cardText(alice.page, 'Long note of short lines');

// then: the web original's 426px for title and text — 16 lines under one title line, 15 under two —
// cut after a whole word, and between paragraphs with "…" on a line of its own
check(
  'a long note’s card shows 16 lines under a one-line title, cut after a whole word with “…”',
  mixedCard.titleLines === 1 && mixedCard.lines === 16 && mixedCard.tail.endsWith('…'),
  JSON.stringify(mixedCard)
);
check(
  'under a two-line title it shows 15, the “…” on a line of its own when the cut falls between lines',
  shortCard.titleLines === 2 && shortCard.lines === 15 && /L14\n…$/.test(shortCard.tail),
  JSON.stringify(shortCard)
);

// and: a long new note scrolls inside the composer's 600px, its bar under it
await alice.page.getByRole('button', { name: 'Take a note…' }).click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor .note-body p').first().click();
await alice.page.keyboard.type(Array.from({ length: 40 }, (_, i) => `Row ${i + 1}`).join('\n'));
const composerBox = await alice.page.evaluate(() => {
  const body = document.querySelector('.editor .body');
  return { height: Math.round(body.getBoundingClientRect().height), scrolls: body.scrollHeight > body.clientHeight + 1 };
});
check('a long new note scrolls inside the composer’s 600px', composerBox.height === 600 && composerBox.scrolls, JSON.stringify(composerBox));
await alice.page.keyboard.press('Escape');
await alice.page.waitForTimeout(800);

console.log('\nthe browser notice');
// given: a browser nobody told Notka to stay quiet in
const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pl-PL' });
await fresh.addInitScript(() => localStorage.setItem('notka.locale', 'pl'));
const freshPage = await fresh.newPage();

// when: the app starts
await freshPage.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
await freshPage.waitForTimeout(600);

// then: a browser without JPEG XL hears which ones Notka is made for, on the sign-in screen already
const notice = freshPage.locator('[data-testid=browser-notice]');
const noticeShown = (await notice.count()) === 1;
check(
  drawsJpegXl ? 'a browser that draws JPEG XL is not told anything' : 'a browser without JPEG XL is shown the notice at start',
  noticeShown === !drawsJpegXl
);
if (noticeShown) {
  const listed = await notice.locator('li a').allInnerTexts();
  check(
    'the notice lists the tested browsers with their minimum versions, Chromium and Chrome in one row',
    listed.join('|') === 'Waterfox|Firefox|Chromium|Chrome|Safari' &&
      (await notice.locator('li').count()) === 4 &&
      (await notice.innerText()).includes('wersja 155 lub nowsza') &&
      (await notice.innerText()).includes('w szczególności te związane z obrazami, mogą nie działać poprawnie'),
    await notice.innerText()
  );
  // when: the reader closes it and asks for it not to come back
  await notice.getByLabel('Nie pokazuj ponownie na tym urządzeniu').check();
  await notice.getByRole('button', { name: 'Rozumiem' }).click();
  await freshPage.reload({ waitUntil: 'networkidle' });
  await freshPage.waitForTimeout(600);
  check('the notice stays away on that device once dismissed for good', (await notice.count()) === 0);
}
await fresh.close();

await alice.context.close();
await bob.context.close();
await browser.close();

console.log('');
if (failures.length > 0) {
  console.error(`end-to-end FAILED (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('end-to-end passed');

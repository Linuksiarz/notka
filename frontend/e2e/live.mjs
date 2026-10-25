/**
 * Development-only end-to-end test for the live channel.
 *
 * Proves what the original does and the project owner asked for: a collaborator's view picks up
 * someone else's edit on its own, with no manual refresh and no page reload.
 *
 *   node live.mjs <base-url>
 */
import { chromium } from 'playwright';
import { openRegistration } from './admin.mjs';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8080';
await openRegistration(baseUrl);
const run = Date.now().toString(36);
const ALICE = { email: `la.${run}@example.com`, name: 'Alice', password: 'correct horse battery' };
const BOB = { email: `lb.${run}@example.com`, name: 'Bob', password: 'correct horse battery' };

const failures = [];
function check(name, condition, detail = '') {
  if (condition) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

const browser = await chromium.launch();

async function register(user) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('notka.locale', 'en-US');
    localStorage.setItem('notka.browserNotice', 'dismissed');
  });
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

/** Waits until the predicate holds, so the test asserts on the push rather than on a sleep. */
async function until(page, predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

console.log('\nsetup');
const alice = await register(ALICE);
const bob = await register(BOB);

await alice.page.getByRole('button', { name: 'Take a note…' }).click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor .note-body p').first().click();
await alice.page.keyboard.type('first line');
await alice.page.locator('.editor textarea.title').fill('Live note');
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await alice.page.waitForTimeout(700);
await alice.page.locator('.card').first().hover();
await alice.page.locator('.card').first().getByRole('button', { name: 'Add collaborator' }).click();
await alice.page.waitForSelector('.share');
await alice.page.getByLabel('Collaborator email').fill(BOB.email);
await alice.page.getByLabel('Permission').selectOption('EDIT');
await alice.page.getByRole('button', { name: 'Invite' }).click();
await alice.page.waitForTimeout(700);
await alice.page.locator('.share').getByRole('button', { name: 'Close', exact: true }).click();
await alice.page.waitForTimeout(300);

// Bob loads his list once and then never touches the refresh button or reloads the page.
await bob.page.goto(baseUrl, { waitUntil: 'networkidle' });
await bob.page.waitForSelector('.card');
check('the note reaches the collaborator', (await bob.page.locator('.card').count()) === 1);

console.log('\nthe list picks up someone else’s edit on its own');
await alice.page.locator('.card').first().click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor textarea.title').fill('Live note (edited by Alice)');
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();

const listUpdated = await until(bob.page, async () =>
  (await bob.page.locator('.card .title').first().innerText()) === 'Live note (edited by Alice)'
);
check('the card title updates without a refresh', listUpdated, await bob.page.locator('.card .title').first().innerText());

console.log('\nan idle open editor adopts the change on its own');
await bob.page.locator('.card').first().click();
await bob.page.waitForSelector('.editor');
check(
  'the editor opens with the current text',
  (await bob.page.locator('.editor .note-body p').first().innerText()) === 'first line'
);

await alice.page.locator('.card').first().click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor .note-body p').first().click();
await alice.page.keyboard.press('ControlOrMeta+A');
await alice.page.keyboard.type('ALICE REWROTE THIS');
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();

const editorUpdated = await until(bob.page, async () =>
  (await bob.page.locator('.editor .note-body p').first().innerText()) === 'ALICE REWROTE THIS'
);
check('the open editor follows along live', editorUpdated, await bob.page.locator('.editor .note-body p').first().innerText());

console.log('\na change made while the live channel was down arrives once it is back');
// given: Bob's list, and then his connection drops
await bob.page.keyboard.press('Escape');
await bob.page.waitForTimeout(700);
await bob.context.setOffline(true);
await bob.page.waitForTimeout(1500);

// when: Alice edits the note while Bob hears nothing, and Bob's connection comes back
await alice.page.locator('.card').first().click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor textarea.title').fill('Edited while Bob was away');
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await alice.page.waitForTimeout(800);
await bob.context.setOffline(false);

// then: the stream reconnects and Bob's list catches up, with no reload
const caughtUp = await until(
  bob.page,
  async () => (await bob.page.locator('.card .title').first().innerText()) === 'Edited while Bob was away',
  15_000
);
check('a missed change is caught up after reconnecting', caughtUp, await bob.page.locator('.card .title').first().innerText());

console.log('\nwhat is written without a connection is kept, and sent once it is back');
// given: Bob's note open, and then his connection drops
await bob.page.locator('.card').first().click();
await bob.page.waitForSelector('.editor');
await bob.context.setOffline(true);

// when: he types and closes the note
await bob.page.locator('.editor .note-body p').first().click();
await bob.page.keyboard.press('End');
await bob.page.keyboard.type(' typed offline');
await bob.page.waitForTimeout(1200);
await bob.page.keyboard.press('Escape');
await bob.page.waitForTimeout(800);

// then: the note closes and its card shows what he wrote, and the header says he is offline
check(
  'a note written offline closes and shows what was written',
  (await bob.page.locator('.editor').count()) === 0 &&
    (await bob.page.locator('.card').first().innerText()).includes('typed offline') &&
    (await bob.page.locator('.topbar [aria-label^="Offline"]').count()) === 1
);

// when: the connection comes back
await bob.context.setOffline(false);

// then: the waiting write reaches the server
const sent = await until(
  bob.page,
  async () =>
    bob.page.evaluate(async () => JSON.stringify(await (await fetch('/api/notes')).json()).includes('typed offline')),
  15_000
);
check('it is sent once the connection is back', sent);

console.log('\nan offline write that meets somebody else\'s is kept as a note of its own');
// given: Bob offline, renaming the note
await bob.context.setOffline(true);
await bob.page.locator('.card').first().click();
await bob.page.waitForSelector('.editor');
await bob.page.locator('.editor textarea.title').fill('Bob renamed it offline');
await bob.page.waitForTimeout(1200);
await bob.page.keyboard.press('Escape');
await bob.page.waitForTimeout(800);

// and: Alice renames the same note meanwhile
await alice.page.reload({ waitUntil: 'networkidle' });
await alice.page.locator('.card').first().click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor textarea.title').fill('Alice renamed it');
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();
await alice.page.waitForTimeout(800);

// when: Bob's connection comes back
await bob.context.setOffline(false);

// then: Alice's text stays on the note, Bob's becomes a note of its own, and Bob is told
const kept = await until(
  bob.page,
  async () => {
    const titles = await bob.page.evaluate(async () =>
      (await (await fetch('/api/notes')).json()).notes.map((note) => note.title)
    );
    return titles.includes('Alice renamed it') && titles.includes('Bob renamed it offline');
  },
  15_000
);
check('the other writer’s text stays and the offline text is kept beside it', kept);
check(
  'the offline writer is told',
  (await bob.page.locator('[data-sonner-toast]').filter({ hasText: 'separate note' }).count()) > 0
);

console.log('\nthe installed app opens without a connection');
// given: the app as installed — its service worker in control — and then no connection
await bob.page.evaluate(() => navigator.serviceWorker?.ready);
await bob.page.reload({ waitUntil: 'networkidle' });
await bob.context.setOffline(true);

// when: it is opened again
await bob.page.reload({ waitUntil: 'domcontentloaded' });
await bob.page.waitForTimeout(2500);

// then: the notes this device saw are there
check('the notes open offline', (await bob.page.locator('.card').count()) >= 2, String(await bob.page.locator('.card').count()));

// when: a note is opened there — the editor is a chunk of its own, loaded after the start
await bob.page.locator('.card').first().click();

// then: it opens, from what the service worker kept
check('a note opens offline', await bob.page.locator('.editor').waitFor({ timeout: 5000 }).then(() => true, () => false));
await bob.page.keyboard.press('Escape');
await bob.context.setOffline(false);

await alice.context.close();
await bob.context.close();
await browser.close();

console.log('');
if (failures.length > 0) {
  console.error(`live test FAILED (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('live test passed');

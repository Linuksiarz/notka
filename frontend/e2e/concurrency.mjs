/**
 * Development-only end-to-end test: two people typing into one note at the same moment.
 *
 * The body is written as ProseMirror steps against the version the server numbered it at
 * (`docs/COLLABORATION.md`). A writer whose steps arrive second takes the first writer's in, rebases
 * their own over them and sends again — so both keep what they typed, nobody is warned, and the caret
 * of the one still typing stays where it was. This test forces the window deterministically by
 * keeping one writer's autosave timer permanently reset (typing faster than the 500 ms debounce).
 *
 *   node concurrency.mjs <base-url>
 */
import { chromium } from 'playwright';
import { openRegistration } from './admin.mjs';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8080';
await openRegistration(baseUrl);
const run = Date.now().toString(36);
const ALICE = { email: `ca.${run}@example.com`, name: 'Alice', password: 'correct horse battery' };
const BOB = { email: `cb.${run}@example.com`, name: 'Bob', password: 'correct horse battery' };

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
  await context.addInitScript(() => localStorage.setItem('notka.locale', 'en-US'));
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

async function until(page, predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

async function serverBody(page, title) {
  return page.evaluate(async (wanted) => {
    const response = await fetch('/api/notes?view=active', { credentials: 'same-origin' });
    const payload = await response.json();
    const note = payload.notes.find((candidate) => candidate.title === wanted);
    if (!note) return null;
    return note.content.blocks.map((block) => block.spans.map((s) => s.text).join('')).join('\n');
  }, title);
}

console.log('\nsetup');
const alice = await register(ALICE);
const bob = await register(BOB);

await alice.page.getByRole('button', { name: 'Take a note…' }).click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor .note-body p').first().click();
await alice.page.keyboard.type('first line');
await alice.page.keyboard.press('Enter');
await alice.page.keyboard.type('second line');
await alice.page.locator('.editor textarea.title').fill('Shared note');
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
await bob.page.goto(baseUrl, { waitUntil: 'networkidle' });
await bob.page.waitForSelector('.card');
check('the note is shared with the collaborator', (await bob.page.locator('.card').count()) === 1);

const lines = (page) =>
  page.locator('.editor .note-body p').evaluateAll((paragraphs) => paragraphs.map((p) => p.textContent));

console.log('\ntwo lines, two writers, at the same moment');
// given: both have the note open; Bob's caret at the end of the second line, Alice's at the start of
// the first
await bob.page.locator('.card').first().click();
await bob.page.waitForSelector('.editor');
await bob.page.locator('.editor .note-body p').nth(1).click();
await bob.page.keyboard.press('End');
await alice.page.locator('.card').first().click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor .note-body p').first().click();
await alice.page.keyboard.press('Home');

// when: Bob types without pause — their autosave never settles — while Alice types and finishes
const typing = (async () => {
  await bob.page.keyboard.type(' BOB');
  for (let index = 0; index < 24; index += 1) {
    await bob.page.keyboard.type('!');
    await bob.page.waitForTimeout(120);
  }
})();
await alice.page.waitForTimeout(300);
await alice.page.keyboard.type('ALICE ');
await alice.page.locator('.editor').getByRole('button', { name: 'Close', exact: true }).click();

// then: Alice's words reach Bob's screen while Bob is still typing
const arrived = await until(bob.page, async () => (await lines(bob.page))[0]?.startsWith('ALICE '));
await typing;
const BOB_TEXT = ' BOB' + '!'.repeat(24);
const bobLines = await lines(bob.page);
check("the other writer's words arrive while one is typing", arrived, JSON.stringify(bobLines));
check(
  "every keystroke of the one typing landed where their caret was, after the other's text arrived",
  bobLines[0] === 'ALICE first line' && bobLines[1] === `second line${BOB_TEXT}`,
  JSON.stringify(bobLines)
);
check(
  'nobody is warned about a conflict',
  (await bob.page.getByText(/changed this note/i).count()) === 0 &&
    (await alice.page.getByText(/changed this note/i).count()) === 0
);

// and: once Bob stops, the server holds both, and Alice's card shows both
const merged = `ALICE first line\nsecond line${BOB_TEXT}`;
const stored = await until(alice.page, async () => (await serverBody(alice.page, 'Shared note')) === merged);
check('the server holds both writers\' text', stored, String(await serverBody(alice.page, 'Shared note')));
const aliceCard = await until(alice.page, async () =>
  (await alice.page.locator('.card').first().innerText()).includes('BOB!!!')
);
check("the first writer's card follows with the other's text", aliceCard);

console.log('\none line, two writers');
// given: both in the first line, Alice at its end and Bob at its start
await alice.page.locator('.card').first().click();
await alice.page.waitForSelector('.editor');
await alice.page.locator('.editor .note-body p').first().click();
await alice.page.keyboard.press('End');
await bob.page.locator('.editor .note-body p').first().click();
await bob.page.keyboard.press('Home');

// when: both type into it before either has heard of the other
await Promise.all([alice.page.keyboard.type(' (alice)'), bob.page.keyboard.type('[bob] ')]);

// then: both editors settle on one line that carries both
const SAME = '[bob] ALICE first line (alice)';
const converged = await until(alice.page, async () =>
  (await lines(alice.page))[0] === SAME && (await lines(bob.page))[0] === SAME
);
check(
  'both editors settle on one line carrying both',
  converged,
  JSON.stringify({ alice: await lines(alice.page), bob: await lines(bob.page) })
);

await alice.context.close();
await bob.context.close();
await browser.close();

console.log('');
if (failures.length > 0) {
  console.error(`concurrency test FAILED (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('concurrency test passed');

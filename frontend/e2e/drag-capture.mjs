/**
 * Writes `docs/images/notka-drag-carrying.jxl`: our own editor carrying a checklist row, staged to
 * match the original's `keep-drag-3-move.webp` — the same kind of note, the same row (a nested one of
 * three lines) carried up above the first row — so the two can be put side by side.
 *
 *   node e2e/drag-capture.mjs <base-url> <output.jxl>
 */
import { chromium } from 'playwright';
import { writeLosslessJxl } from './jxl.mjs';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = process.argv[3] ?? '../docs/images/notka-drag-carrying.jxl';
const OWNER = { id: 1, email: 'ada@example.com', displayName: 'Ada Lovelace' };
const now = Date.now();
const NOTE = {
  id: 99,
  kind: 'LIST',
  title: 'TODO',
  content: { version: 1, blocks: [{ id: 'n1', type: 'checklist', checked: false, depth: 0, spans: [] }] },
  linkPreviews: [],
  color: 'brown',
  background: null,
  archived: false,
  position: 1,
  trashedAt: null,
  createdAt: now,
  updatedAt: now,
  owner: OWNER,
  access: 'OWNER',
  canEdit: true,
  canChangeAppearance: true,
  labels: []
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'en-US',
  deviceScaleFactor: 1
});
await context.addInitScript(() => {
  localStorage.setItem('notka.locale', 'en-US');
  localStorage.setItem('notka.theme', 'dark');
});
await context.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace(/^\/api/, '');
  const json = (body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path === '/auth/me') return json({ user: OWNER });
  if (path === '/labels') return json({ labels: [] });
  if (path === '/notes' && request.method() === 'GET') return json({ notes: [NOTE] });
  if (path === '/notes' && request.method() === 'POST') {
    return json({ ...NOTE, ...JSON.parse(request.postData() ?? '{}') }, 201);
  }
  if (/^\/notes\/\d+$/.test(path)) {
    return json({ ...NOTE, ...(request.postData() ? JSON.parse(request.postData()) : {}) });
  }
  return json({ error: { code: 'NOT_FOUND', key: 'request.not_found', message: 'stub' } }, 404);
});

const page = await context.newPage();
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.locator('.card').first().click();
await page.waitForSelector('.editor .note-body p');
await page.locator('.editor .note-body p').first().click();

/**
 * The original's own note (`keep-drag-1-resting.webp`): four top-level rows, three nested ones — the
 * last of them three lines long — and a top-level row after them.
 */
const type = (text) => page.keyboard.type(text);
const enter = () => page.keyboard.press('Enter');

await type('element 1');
await enter();
await type('element 2');
await enter();
await type('element 3');
await enter();
await type('element 4');
await enter();
await page.keyboard.press('Tab');
await type('element 5');
await enter();
await type('awdwadawdwdaddwa');
await enter();
await page.keyboard.down('Shift');
await type('dadwadwadwadd');
await page.keyboard.press('Enter');
await type('dadwadwadwdad');
await page.keyboard.press('Enter');
await type('awdwadawdawdad');
await page.keyboard.up('Shift');
await enter();
await page.keyboard.press('Shift+Tab');
await type('awdwadawdawdaad');
await page.waitForTimeout(1200);

console.log(
  'rows',
  JSON.stringify(
    await page.$$eval('.editor .note-body li', (list) =>
      list.map((li) => ({
        text: (li.querySelector('p')?.innerText ?? '').replace(/\n/g, '|'),
        depth: li.getAttribute('data-depth'),
        height: Math.round(li.getBoundingClientRect().height)
      }))
    )
  )
);

// when: the three-line row is carried up above the first one
const handle = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.editor .note-body li')].find((li) =>
    (li.querySelector('p')?.innerText ?? '').startsWith('dadwadwadwadd')
  );
  if (!row) return null;
  const line = row.getBoundingClientRect().top + 12;
  return (
    [...document.querySelectorAll('.drag-handle')]
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      })
      .sort((a, b) => Math.abs(a.y - line) - Math.abs(b.y - line))[0] ?? null
  );
});
const firstTop = await page.evaluate(
  () => document.querySelector('.editor .note-body li').getBoundingClientRect().top
);

await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x, handle.y - 20, { steps: 5 });
await page.mouse.move(handle.x, firstTop - 40, { steps: 12 });
await page.waitForTimeout(400);

const card = await page.locator('.editor').boundingBox();
writeLosslessJxl(await page.screenshot({ clip: card }), out);
console.log('wrote', out, card);

await page.mouse.up();
await browser.close();

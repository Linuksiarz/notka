/**
 * Writes `docs/images/notka-appearance-picker.jxl`: our appearance picker with a colour **and** a
 * background chosen, to sit beside the original's own picker
 * (`keep-appearance-picker.png`) in `docs/METRICS.md`. Lossless JPEG XL, see `jxl.mjs`.
 *
 * It stubs the API, so it needs `frontend/dist` served — `pnpm run build && pnpm run preview`.
 *
 *   node e2e/appearance-capture.mjs <base-url> [output.jxl]
 */
import { chromium } from 'playwright';
import { writeLosslessJxl } from './jxl.mjs';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = process.argv[3] ?? '../docs/images/notka-appearance-picker.jxl';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
await context.addInitScript(() => {
  localStorage.setItem('notka.locale', 'en-US');
  localStorage.setItem('notka.theme', 'dark');
});

const owner = { id: 1, email: 'ada@example.com', displayName: 'Ada Lovelace' };
const note = {
  id: 1,
  kind: 'TEXT',
  title: 'Appearance',
  content: { version: 1, blocks: [{ id: 'b1', type: 'paragraph', spans: [{ text: 'a note' }] }] },
  linkPreviews: [],
  // Both at once, which is what the picker has to be able to show.
  color: 'yellow',
  background: 'travel',
  archived: false,
  position: 1,
  trashedAt: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  owner,
  access: 'OWNER',
  canEdit: true,
  canChangeAppearance: true,
  labels: []
};

await context.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace(/^\/api/, '');
  const json = (body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path === '/auth/me') return json({ user: owner });
  if (path === '/labels') return json({ labels: [] });
  if (path === '/notes' && request.method() === 'GET') return json({ notes: [note] });
  if (/^\/notes\/\d+$/.test(path)) return json(note);
  return json({}, 404);
});

const page = await context.newPage();
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.locator('.card').first().click();
await page.waitForSelector('.editor');
await page.locator('.editor').getByRole('button', { name: 'Change color' }).click();
await page.waitForSelector('.appearance-picker');
await page.waitForTimeout(300);

const box = await page.locator('.appearance-picker').boundingBox();
writeLosslessJxl(
  await page.screenshot({
    clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 }
  }),
  out
);
console.log('wrote', out, box);
await browser.close();

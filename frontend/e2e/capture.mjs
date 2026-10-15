/**
 * Development-only screenshot harness.
 *
 * Renders the built SPA against a stubbed API so the visual design can be reviewed without a
 * running backend. Not part of the shipped application.
 *
 *   node capture.mjs <base-url> <output-dir>
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = process.argv[2] ?? 'http://localhost:4173';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[3] ?? resolve(scriptDir, '../../docs/images');

const OWNER = { id: 1, email: 'ada@example.com', displayName: 'Ada Lovelace' };
const BOB = { id: 2, email: 'bob@example.com', displayName: 'Bob Kahn' };

const now = Date.now();

function doc(blocks) {
  return { version: 1, blocks };
}

const NOTES = [
  {
    id: 1,
    kind: 'TEXT',
    title: 'Welcome to Notka',
    content: doc([
      { id: 'a1', type: 'paragraph', spans: [{ text: 'A free, self-hosted place for ' }, { text: 'notes', bold: true }, { text: ' and ' }, { text: 'lists', italic: true }, { text: '.' }] },
      { id: 'a2', type: 'heading2', spans: [{ text: 'Markdown shortcuts' }] },
      { id: 'a3', type: 'bulleted', spans: [{ text: 'Type ' }, { text: '# ', code: true }, { text: 'for a heading' }] },
      { id: 'a4', type: 'bulleted', spans: [{ text: 'Type ' }, { text: '- ', code: true }, { text: 'for a bullet' }] },
      { id: 'a5', type: 'bulleted', spans: [{ text: 'Type ' }, { text: '**bold**', code: true }, { text: ' for emphasis' }] }
    ]),
    color: 'default',
    background: null,
    archived: false,
    trashedAt: null,
    createdAt: now - 86_400_000,
    updatedAt: now - 3_600_000,
    owner: OWNER,
    access: 'OWNER',
    canEdit: true,
    canChangeAppearance: true,
    labels: [{ id: 1, name: 'work' }],
    shares: [{ user: BOB, permission: 'EDIT' }]
  },
  {
    id: 2,
    kind: 'LIST',
    title: 'Groceries',
    content: doc([
      { id: 'b1', type: 'checklist', checked: true, spans: [{ text: 'Sourdough bread' }] },
      { id: 'b2', type: 'checklist', checked: true, spans: [{ text: 'Espresso beans' }] },
      { id: 'b3', type: 'checklist', checked: false, spans: [{ text: 'Oat milk' }] },
      { id: 'b4', type: 'checklist', checked: false, spans: [{ text: 'Blueberries' }] }
    ]),
    color: 'green',
    background: null,
    archived: false,
    trashedAt: null,
    createdAt: now - 172_800_000,
    updatedAt: now - 7_200_000,
    owner: OWNER,
    access: 'OWNER',
    canEdit: true,
    canChangeAppearance: true,
    labels: [{ id: 1, name: 'work' }]
  },
  {
    id: 3,
    kind: 'TEXT',
    title: 'Trip to Kraków',
    content: doc([
      { id: 'c1', type: 'paragraph', spans: [{ text: 'Book the ' }, { text: 'night train', underline: true }, { text: ' and check the ' }, { text: 'Wawel', link: 'https://example.com/wawel' }, { text: ' opening hours.' }] },
      { id: 'c2', type: 'numbered', spans: [{ text: 'Buy tickets' }] },
      { id: 'c3', type: 'numbered', spans: [{ text: 'Pack light' }] }
    ]),
    color: 'teal',
    background: null,
    archived: false,
    trashedAt: null,
    createdAt: now - 259_200_000,
    updatedAt: now - 86_400_000,
    owner: BOB,
    access: 'EDIT',
    canEdit: true,
    canChangeAppearance: true,
    labels: []
  },
  {
    id: 4,
    kind: 'TEXT',
    title: 'Sourdough starter',
    content: doc([
      { id: 'd1', type: 'paragraph', spans: [{ text: 'Feed every 12 hours. ' }, { text: 'Keep it warm.', code: true }] },
      { id: 'd2', type: 'paragraph', spans: [{ text: 'Day 4: ', bold: true }, { text: 'it finally doubled.' }] }
    ]),
    color: 'default',
    background: 'food',
    archived: false,
    trashedAt: null,
    createdAt: now - 400_000_000,
    updatedAt: now - 100_800_000,
    owner: OWNER,
    access: 'OWNER',
    canEdit: true,
    canChangeAppearance: true,
    labels: []
  },
  {
    id: 5,
    kind: 'TEXT',
    title: 'Playlist ideas',
    content: doc([
      { id: 'e1', type: 'bulleted', spans: [{ text: 'Ambient for deep work' }] },
      { id: 'e2', type: 'bulleted', spans: [{ text: 'Bebop for cooking' }] }
    ]),
    color: 'default',
    background: 'celebration',
    archived: false,
    trashedAt: null,
    createdAt: now - 500_000_000,
    updatedAt: now - 200_800_000,
    owner: OWNER,
    access: 'OWNER',
    canEdit: true,
    canChangeAppearance: true,
    labels: [{ id: 2, name: 'personal' }]
  },
  {
    id: 6,
    kind: 'TEXT',
    title: 'Standup notes',
    content: doc([
      { id: 'f1', type: 'paragraph', spans: [{ text: 'Shipped the ' }, { text: 'trash retention', bold: true, italic: true }, { text: ' job.' }] },
      { id: 'f2', type: 'paragraph', spans: [{ text: 'Blocked on review.' }] }
    ]),
    color: 'pink',
    background: null,
    archived: false,
    trashedAt: null,
    createdAt: now - 600_000_000,
    updatedAt: now - 300_800_000,
    owner: OWNER,
    access: 'OWNER',
    canEdit: true,
    canChangeAppearance: true,
    labels: []
  },
  {
    id: 7,
    kind: 'TEXT',
    title: 'Old grocery list',
    content: doc([{ id: 'g1', type: 'paragraph', spans: [{ text: 'Milk, eggs' }] }]),
    color: 'yellow',
    background: null,
    archived: false,
    trashedAt: now - 5 * 86_400_000,
    createdAt: now - 700_000_000,
    updatedAt: now - 5 * 86_400_000,
    owner: OWNER,
    access: 'OWNER',
    canEdit: true,
    canChangeAppearance: true,
    labels: []
  },
  {
    id: 8,
    kind: 'TEXT',
    title: 'Conference talk',
    content: doc([{ id: 'h1', type: 'paragraph', spans: [{ text: 'Outline is done.' }] }]),
    color: 'purple',
    background: null,
    archived: true,
    trashedAt: null,
    createdAt: now - 800_000_000,
    updatedAt: now - 400_000_000,
    owner: OWNER,
    access: 'OWNER',
    canEdit: true,
    canChangeAppearance: true,
    labels: []
  }
];

// The server's own order: the first note listed is the one on top.
NOTES.forEach((note, index) => {
  note.position = NOTES.length - index;
});

const LABELS = [
  { id: 1, name: 'work' },
  { id: 2, name: 'personal' },
  { id: 3, name: 'recipes' }
];

function notesFor(view) {
  if (view === 'trash') return NOTES.filter((note) => note.trashedAt !== null);
  if (view === 'archived') return NOTES.filter((note) => note.archived && note.trashedAt === null);
  return NOTES.filter((note) => !note.archived && note.trashedAt === null);
}

async function installStubs(context) {
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path === '/auth/me') return json({ user: OWNER });
    if (path === '/labels') return json({ labels: LABELS });
    if (path === '/notes') return json({ notes: notesFor(url.searchParams.get('view') ?? 'active') });
    if (/^\/notes\/\d+\/shares$/.test(path)) {
      return json({ shares: [{ user: BOB, permission: 'EDIT' }] });
    }
    if (/^\/notes\/\d+$/.test(path)) {
      const id = Number(path.split('/')[2]);
      return json(NOTES.find((note) => note.id === id) ?? NOTES[0]);
    }
    return json({ error: { code: 'NOT_FOUND', key: 'request.not_found', message: 'stub' } }, 404);
  });
}

async function newPage(browser, { locale, viewport, theme }) {
  const context = await browser.newContext({
    viewport,
    locale: locale === 'pl' ? 'pl-PL' : locale === 'en-GB' ? 'en-GB' : 'en-US'
  });
  await context.addInitScript(
    ([localeValue, themeValue]) => {
      localStorage.setItem('notka.locale', localeValue);
      if (themeValue) localStorage.setItem('notka.theme', themeValue);
    },
    [locale ?? 'en-US', theme ?? '']
  );
  await installStubs(context);
  const page = await context.newPage();
  return { context, page };
}

async function shot(page, name) {
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: false });
  console.log(`captured ${name}`);
}

const browser = await chromium.launch();
await mkdir(outDir, { recursive: true });

/* ---------------------------------------------------------------- desktop, light, English */
{
  const { context, page } = await newPage(browser, {
    locale: 'en-US',
    viewport: { width: 1440, height: 900 }
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card');
  await shot(page, 'notes-light');

  await page.locator('.card').first().click();
  await page.waitForSelector('.editor');

  await page.locator('.editor').getByRole('button', { name: 'Change color' }).click();
  await page.waitForSelector('.appearance-picker');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card');
  const gridCard = page.locator('.card').nth(1);
  await gridCard.hover();
  await gridCard.getByRole('button', { name: 'Change color' }).click();
  await page.waitForSelector('.appearance-picker');
  // The actions row fades in; wait for the transition so the panel is fully opaque.
  await page.waitForTimeout(500);
  await shot(page, 'card-appearance');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await page.goto(`${baseUrl}/archive`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  await page.goto(`${baseUrl}/trash`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('.topbar').getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page.waitForSelector('.settings');
  await context.close();
}

/* ------------------------------------------------------------------------- desktop, dark */
{
  const { context, page } = await newPage(browser, {
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
    theme: 'dark'
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card');
  await shot(page, 'notes-dark');
  await context.close();
}

/* ------------------------------------------------------------------------- desktop, Polish */
{
  const { context, page } = await newPage(browser, {
    locale: 'pl',
    viewport: { width: 1440, height: 900 }
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card');
  // The title, not the card's middle: that can be a list's "completed items" toggle.
  await page.locator('.card').nth(1).locator('.title').click();
  await page.waitForSelector('.editor');
  await shot(page, 'polish');
  await context.close();
}

/* ------------------------------------------------- editing an existing note, over the notes */
{
  const { context, page } = await newPage(browser, {
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
    theme: 'light'
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card');
  await page.locator('.card').first().click();
  await page.waitForSelector('.editor');
  await page.waitForTimeout(700);
  await shot(page, 'editing');
  await context.close();
}

/* ----------------------------------------------------------------------------- mobile */
{
  const { context, page } = await newPage(browser, {
    locale: 'en-US',
    viewport: { width: 390, height: 844 },
    theme: 'light'
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card');
  await shot(page, 'mobile');

  await page.locator('.card').first().click();
  await page.waitForSelector('.editor');
  await context.close();
}

/* ------------------------------------------------------------------------- signed out */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('notka.locale', 'en-US'));
  await context.route('**/api/**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAUTHORIZED', key: 'request.unauthorized', message: 'no session' }
      })
    })
  );
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.auth');
  await context.close();
}

await browser.close();
console.log(`screenshots written to ${outDir}`);
